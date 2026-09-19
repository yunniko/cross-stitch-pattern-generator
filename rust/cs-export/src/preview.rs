//! Port of the realistic preview (`renderStitchPreviewPng`, `stitchPreviewPixels` in `render.ts`, and the tinted tiles
//! of `stitch-texture.ts`): each stitch is its colour's tinted texture, on a transparent background, streamed a strip
//! of rows at a time from per-colour tiles, never assembled (D173).

use crate::model::{Pattern, EMPTY_CELL};
use crate::png::PixelSource;
use tiny_skia::{FilterQuality, IntSize, Pixmap, PixmapPaint, Transform};

const TEXTURE_PNG: &[u8] = include_bytes!("../../../public/stitch-texture.png");
const TEXTURE_SAMPLE_SIZE: u32 = 64;

/// The texture, decoded to 8-bit premultiplied RGBA; 16-bit channels are rounded to 8 bits.
fn texture() -> Pixmap {
    let decoder = png::Decoder::new(std::io::Cursor::new(TEXTURE_PNG));
    let mut reader = decoder.read_info().expect("texture header");
    let mut buf = vec![0; reader.output_buffer_size().expect("texture size")];
    let info = reader.next_frame(&mut buf).expect("texture pixels");
    let (w, h) = (info.width, info.height);
    let channels = info.color_type.samples();
    let sixteen = info.bit_depth == png::BitDepth::Sixteen;
    let mut rgba = Vec::with_capacity((w * h * 4) as usize);
    for i in 0..(w * h) as usize {
        let sample = |k: usize| -> u8 {
            if sixteen {
                let v = u16::from_be_bytes([
                    buf[(i * channels + k) * 2],
                    buf[(i * channels + k) * 2 + 1],
                ]) as u32;
                ((v * 255 + 32767) / 65535) as u8
            } else {
                buf[i * channels + k]
            }
        };
        let (r, g, b, a) = match channels {
            4 => (sample(0), sample(1), sample(2), sample(3)),
            3 => (sample(0), sample(1), sample(2), 255),
            2 => (sample(0), sample(0), sample(0), sample(1)),
            _ => (sample(0), sample(0), sample(0), 255),
        };
        let premul = |c: u8| ((c as u32 * a as u32 + 127) / 255) as u8;
        rgba.extend_from_slice(&[premul(r), premul(g), premul(b), a]);
    }
    Pixmap::from_vec(rgba, IntSize::from_wh(w, h).expect("size")).expect("texture pixmap")
}

/// `drawImage(image, 0, 0, size, size)` onto a clear canvas, with the canvas's default linear sampling.
fn scaled(src: &Pixmap, size: u32) -> Pixmap {
    let mut out = Pixmap::new(size, size).expect("tile");
    let sx = size as f32 / src.width() as f32;
    let sy = size as f32 / src.height() as f32;
    let paint = PixmapPaint {
        quality: FilterQuality::Bilinear,
        ..PixmapPaint::default()
    };
    out.draw_pixmap(
        0,
        0,
        src.as_ref(),
        &paint,
        Transform::from_scale(sx, sy),
        None,
    );
    out
}

fn unpremultiply(p: &[u8]) -> [u8; 4] {
    let a = p[3];
    if a == 0 {
        return [0, 0, 0, 0];
    }
    if a == 255 {
        return [p[0], p[1], p[2], 255];
    }
    let u = |c: u8| ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8;
    [u(p[0]), u(p[1]), u(p[2]), a]
}

/// A `Uint8ClampedArray` store: clamped, and rounded half to even.
fn clamped(v: f64) -> u8 {
    v.clamp(0.0, 255.0).round_ties_even() as u8
}

/// `tintTexture`: each channel scaled by the source pixel's luminance, alpha copied through.
fn tint(sample: &Pixmap, rgb: [u8; 3]) -> Pixmap {
    let mut data = Vec::with_capacity(sample.data().len());
    for p in sample.data().chunks_exact(4) {
        let [r, g, b, a] = unpremultiply(p);
        let t = crate::format::luminance([r, g, b]) / 255.0;
        let (tr, tg, tb) = (
            clamped(rgb[0] as f64 * t),
            clamped(rgb[1] as f64 * t),
            clamped(rgb[2] as f64 * t),
        );
        // putImageData stores premultiplied pixels.
        let premul = |c: u8| ((c as u32 * a as u32 + 127) / 255) as u8;
        data.extend_from_slice(&[premul(tr), premul(tg), premul(tb), a]);
    }
    Pixmap::from_vec(
        data,
        IntSize::from_wh(sample.width(), sample.height()).unwrap(),
    )
    .unwrap()
}

/// `buildStitchTiles`: every colour's tinted texture at `cell_size`, as unpremultiplied RGBA.
pub fn stitch_tiles(p: &Pattern, cell_size: u32) -> Vec<Vec<u8>> {
    let sample = scaled(&texture(), TEXTURE_SAMPLE_SIZE);
    p.palette
        .iter()
        .map(|color| {
            let tile = scaled(&tint(&sample, color.rgb), cell_size);
            tile.data()
                .chunks_exact(4)
                .flat_map(unpremultiply)
                .collect()
        })
        .collect()
}

/// `stitchPreviewPixels`.
pub struct Preview<'a> {
    pub pattern: &'a Pattern,
    pub tiles: Vec<Vec<u8>>,
    pub cell_size: u32,
}

impl PixelSource for Preview<'_> {
    fn rgba_rows(&self, y0: u32, rows: u32, out: &mut Vec<u8>) {
        let cs = self.cell_size as usize;
        let stitches_x = self.pattern.width;
        let row_bytes = stitches_x * cs * 4;
        let tile_row = cs * 4;
        out.clear();
        out.resize(row_bytes * rows as usize, 0);
        for r in 0..rows as usize {
            let y = y0 as usize + r;
            let stitch_row = y / cs;
            let tile_offset = (y % cs) * tile_row;
            for sx in 0..stitches_x {
                let v = self.pattern.cells[stitch_row * stitches_x + sx];
                if v == EMPTY_CELL {
                    continue;
                }
                let start = r * row_bytes + sx * tile_row;
                out[start..start + tile_row]
                    .copy_from_slice(&self.tiles[v as usize][tile_offset..tile_offset + tile_row]);
            }
        }
    }
}

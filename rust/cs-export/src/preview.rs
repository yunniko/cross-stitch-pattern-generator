//! Port of the realistic preview (`renderStitchPreviewPng`, `stitchPreviewPixels` in `render.ts`, and the tinted tiles
//! of `stitch-texture.ts`): each stitch is its colour's tinted texture, on a transparent background, streamed a strip
//! of rows at a time from per-colour tiles, never assembled (D173).

use crate::model::{Canvas, Pattern, EMPTY_CELL};
use crate::png::PixelSource;
use tiny_skia::{FilterQuality, IntSize, Pixmap, PixmapPaint, Transform};

/// The catalog of `lib/export/stitch-texture-catalog.ts`: an id and its PNG. The first is the default, and the fallback
/// for an id this table does not hold (the processor validates ids, so that is only a stale client).
const TEXTURES: [(&str, &[u8]); 2] = [
    (
        "classic",
        include_bytes!("../../../public/stitch-texture.png"),
    ),
    (
        "pixel",
        include_bytes!("../../../public/stitch-texture-pixel.png"),
    ),
];
const TEXTURE_SAMPLE_SIZE: u32 = 64;

/// The canvas cloths of `lib/export/canvas-texture-catalog.ts`: id, PNG and the number of cells one tile spans. The
/// three must agree with that catalog (`scripts/rust-canvas.ts` checks it).
const CANVAS_TEXTURES: [(&str, &[u8], u32); 3] = [
    (
        "aida",
        include_bytes!("../../../public/canvas-texture-aida.png"),
        1,
    ),
    (
        "linen",
        include_bytes!("../../../public/canvas-texture-linen.png"),
        1,
    ),
    (
        "natural",
        include_bytes!("../../../public/canvas-texture-natural.png"),
        66,
    ),
];

/// The stitch texture `id` (the classic one for an id this table does not hold), decoded.
fn texture(id: &str) -> Pixmap {
    decode(
        TEXTURES
            .iter()
            .find(|(name, _)| *name == id)
            .unwrap_or(&TEXTURES[0])
            .1,
    )
}

/// A PNG decoded to 8-bit premultiplied RGBA; 16-bit channels are rounded to 8 bits.
fn decode(bytes: &[u8]) -> Pixmap {
    let decoder = png::Decoder::new(std::io::Cursor::new(bytes));
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
pub fn stitch_tiles(p: &Pattern, cell_size: u32, texture_id: &str) -> Vec<Vec<u8>> {
    let sample = scaled(&texture(texture_id), TEXTURE_SAMPLE_SIZE);
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

/// The canvas the preview sits on: an opaque `size` × `size` RGBA tile, repeated from the chart's corner.
pub struct Ground {
    size: usize,
    rgba: Vec<u8>,
}

/// `src` (square, opaque for this purpose) at `size` × `size` by averaging the source pixels each one covers, for a
/// tile that shrinks a great deal; a growing tile is left to the bilinear `scaled`.
fn box_down(src: &Pixmap, size: u32) -> Pixmap {
    let (sw, sh) = (src.width() as usize, src.height() as usize);
    let size = size as usize;
    let mut data = vec![255u8; size * size * 4];
    for y in 0..size {
        let (y0, y1) = (y * sh / size, ((y + 1) * sh / size).max(y * sh / size + 1));
        for x in 0..size {
            let (x0, x1) = (x * sw / size, ((x + 1) * sw / size).max(x * sw / size + 1));
            let mut sum = [0u32; 3];
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let i = (sy * sw + sx) * 4;
                    for (k, s) in sum.iter_mut().enumerate() {
                        *s += src.data()[i + k] as u32;
                    }
                }
            }
            let n = ((y1 - y0) * (x1 - x0)) as u32;
            for (k, s) in sum.iter().enumerate() {
                data[(y * size + x) * 4 + k] = ((s + n / 2) / n) as u8;
            }
        }
    }
    Pixmap::from_vec(data, IntSize::from_wh(size as u32, size as u32).unwrap()).unwrap()
}

/// `canvas`'s cloth at `cell_size` per cell, multiplied with its colour -- the tile the viewer's CSS shows
/// (`lib/editor/canvas-cloth.ts`). No cloth ("off", or an id this table does not hold) is the plain colour.
pub fn ground(canvas: &Canvas, cell_size: u32) -> Ground {
    let [r, g, b] = canvas.color;
    let Some((_, bytes, cells)) = CANVAS_TEXTURES
        .iter()
        .find(|(id, _, _)| *id == canvas.texture)
    else {
        return Ground {
            size: 1,
            rgba: vec![r, g, b, 255],
        };
    };
    let size = cells * cell_size;
    let source = decode(bytes);
    let tile = if size < source.width() {
        box_down(&source, size)
    } else {
        scaled(&source, size)
    };
    let multiply = |c: u8, t: u8| ((c as u32 * t as u32 + 127) / 255) as u8;
    let mut rgba = Vec::with_capacity(tile.data().len());
    for p in tile.data().chunks_exact(4) {
        rgba.extend_from_slice(&[multiply(r, p[0]), multiply(g, p[1]), multiply(b, p[2]), 255]);
    }
    Ground {
        size: size as usize,
        rgba,
    }
}

/// `stitchPreviewPixels`.
pub struct Preview<'a> {
    pub pattern: &'a Pattern,
    pub tiles: Vec<Vec<u8>>,
    pub cell_size: u32,
    /// The canvas under the stitches; absent leaves empty stitches transparent.
    pub ground: Option<Ground>,
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
            if let Some(g) = &self.ground {
                let gy = (y % g.size) * g.size;
                let row = &mut out[r * row_bytes..(r + 1) * row_bytes];
                for (x, pixel) in row.chunks_exact_mut(4).enumerate() {
                    let i = (gy + x % g.size) * 4;
                    pixel.copy_from_slice(&g.rgba[i..i + 4]);
                }
            }
            for sx in 0..stitches_x {
                let v = self.pattern.cells[stitch_row * stitches_x + sx];
                if v == EMPTY_CELL {
                    continue;
                }
                let start = r * row_bytes + sx * tile_row;
                let stitch = &self.tiles[v as usize][tile_offset..tile_offset + tile_row];
                if self.ground.is_some() {
                    // The stitch's soft edges over the canvas, straight alpha; the result is opaque.
                    for (d, s) in out[start..start + tile_row]
                        .chunks_exact_mut(4)
                        .zip(stitch.chunks_exact(4))
                    {
                        let a = s[3] as u32;
                        for k in 0..3 {
                            d[k] = ((s[k] as u32 * a + d[k] as u32 * (255 - a) + 127) / 255) as u8;
                        }
                        d[3] = 255;
                    }
                } else {
                    out[start..start + tile_row].copy_from_slice(stitch);
                }
            }
        }
    }
}

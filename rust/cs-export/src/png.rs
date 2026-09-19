//! Port of `processor/png-encode.ts` (D171): rows read in strips, the Up filter, zlib level 6, RGB when every pixel is
//! opaque and RGBA otherwise. The compressed bytes differ from Node's zlib; the decoded pixels do not.

use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::io::Write;

const STRIP_ROWS: u32 = 64;
const DEFLATE_LEVEL: u32 = 6;

/// Pixels as unpremultiplied RGBA, a strip of full-width rows at a time.
pub trait PixelSource {
    fn rgba_rows(&self, y0: u32, rows: u32, out: &mut Vec<u8>);
}

impl PixelSource for crate::canvas::Canvas {
    fn rgba_rows(&self, y0: u32, rows: u32, out: &mut Vec<u8>) {
        crate::canvas::Canvas::rgba_rows(self, y0, rows, out)
    }
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let crc = crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

fn crc32(bytes: &[u8]) -> u32 {
    static TABLE: std::sync::OnceLock<[u32; 256]> = std::sync::OnceLock::new();
    let table = TABLE.get_or_init(|| {
        let mut t = [0u32; 256];
        for (n, v) in t.iter_mut().enumerate() {
            let mut c = n as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 {
                    0xedb88320 ^ (c >> 1)
                } else {
                    c >> 1
                };
            }
            *v = c;
        }
        t
    });
    let mut c = 0xffffffffu32;
    for &b in bytes {
        c = table[((c ^ b as u32) & 0xff) as usize] ^ (c >> 8);
    }
    c ^ 0xffffffff
}

/// Deflates filtered rows; `None` from the RGB attempt when a pixel is not opaque.
fn deflate_rows(
    source: &dyn PixelSource,
    width: u32,
    height: u32,
    channels: usize,
) -> Option<Vec<u8>> {
    let stride = width as usize * channels;
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::new(DEFLATE_LEVEL));
    let mut previous = vec![0u8; stride];
    let mut current = vec![0u8; stride];
    let mut rgba = Vec::new();
    let mut filtered = Vec::with_capacity((stride + 1) * STRIP_ROWS as usize);
    let mut y0 = 0;
    while y0 < height {
        let rows = STRIP_ROWS.min(height - y0);
        source.rgba_rows(y0, rows, &mut rgba);
        filtered.clear();
        for r in 0..rows as usize {
            let row = &rgba[r * width as usize * 4..(r + 1) * width as usize * 4];
            if channels == 4 {
                current.copy_from_slice(row);
            } else {
                for (x, p) in row.chunks_exact(4).enumerate() {
                    if p[3] != 255 {
                        return None;
                    }
                    current[x * 3..x * 3 + 3].copy_from_slice(&p[..3]);
                }
            }
            filtered.push(2); // Up
            filtered.extend(
                current
                    .iter()
                    .zip(&previous)
                    .map(|(a, b)| a.wrapping_sub(*b)),
            );
            std::mem::swap(&mut previous, &mut current);
        }
        encoder.write_all(&filtered).expect("deflate");
        y0 += rows;
    }
    Some(encoder.finish().expect("deflate"))
}

/// The PNG file for `source`.
pub fn encode(source: &dyn PixelSource, width: u32, height: u32) -> Vec<u8> {
    let (channels, idat) = match deflate_rows(source, width, height, 3) {
        Some(idat) => (3, idat),
        None => (
            4,
            deflate_rows(source, width, height, 4).expect("RGBA always encodes"),
        ),
    };
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, if channels == 4 { 6 } else { 2 }, 0, 0, 0]);
    let mut out = vec![137, 80, 78, 71, 13, 10, 26, 10];
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &idat);
    chunk(&mut out, b"IEND", &[]);
    out
}

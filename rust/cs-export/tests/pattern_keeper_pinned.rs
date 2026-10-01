//! G-083: the Pattern Keeper PDF is not touched by the export fixes (Owner, 2026-10-01). It shares its page drawing with the
//! A4 pages, so this pins its bytes: whatever is added to the A4 pages must be opt-in and off here.

use cs_export::export;
use cs_export::model::{Pattern, Request};

/// FNV-1a over the bytes: a pin, not a security measure.
fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// A 45 × 35 chart with three threads, a thread brand, half stitches that the PDF must see as whole, and backstitch.
fn chart() -> Pattern {
    let (w, h) = (45usize, 35usize);
    let mut cells = vec![255u8; w * h];
    let mut kinds = vec![0u8; w * h];
    for y in 0..h {
        for x in 0..w {
            if (x + y) % 7 == 0 {
                continue;
            }
            cells[y * w + x] = ((x / 5 + y / 7) % 3) as u8;
            if (x * 3 + y) % 11 == 0 {
                kinds[y * w + x] = 1 + ((x + y) % 2) as u8;
            }
        }
    }
    let list = |v: &[u8]| v.iter().map(u8::to_string).collect::<Vec<_>>().join(",");
    let json = format!(
        "{{\"formatVersion\":7,\"width\":{w},\"height\":{h},\"isLandscape\":true,\"name\":\"Pinned\",\"cellPalette\":[{}],\"cellKind\":[{}],\
         \"palette\":[{{\"rgb\":[200,20,20],\"symbol\":\"A\",\"name\":\"Red\"}},{{\"rgb\":[20,20,200],\"symbol\":\"B\",\"name\":\"Blue\"}},\
         {{\"rgb\":[20,160,20],\"symbol\":\"C\",\"name\":\"Green\"}}],\
         \"backstitch\":[{{\"x1\":2,\"y1\":2,\"x2\":9,\"y2\":2,\"paletteIndex\":0}}]}}",
        list(&cells),
        list(&kinds)
    );
    Pattern::from_editable_json(&json).unwrap()
}

fn request(kind: &str) -> Request {
    Request::from_json(&format!(
        "{{\"kind\":\"{kind}\",\"baseName\":\"pinned\",\"aidaCount\":14,\"sizeUnit\":\"cm\",\"authorName\":\"Pinned\",\"overlapCells\":5}}"
    ))
    .unwrap()
}

#[test]
fn the_pattern_keeper_pdf_is_the_same_bytes_as_before_the_export_fixes() {
    let p = chart();
    let color = export(&p, &request("pdf-color")).unwrap().bytes;
    let bw = export(&p, &request("pdf-bw")).unwrap().bytes;
    // The values below were taken from the exporter as it stood before G-083, which is what this test keeps.
    assert_eq!(fnv(&color), PINNED_COLOR, "color: {}", fnv(&color));
    assert_eq!(fnv(&bw), PINNED_BW, "bw: {}", fnv(&bw));
}

const PINNED_COLOR: u64 = 6928240481011384590;
const PINNED_BW: u64 = 15436744622563401771;

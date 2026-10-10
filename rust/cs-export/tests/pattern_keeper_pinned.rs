//! G-083: the Pattern Keeper PDF changes only on purpose (Owner, 2026-10-01). It shares its page drawing with the A4 pages,
//! so this pins its bytes: whatever is added to the A4 pages must be opt-in and off here, unless the Owner has asked for it
//! in the PDF too. Re-pinned once, for the System and Number columns every key now has (G-131, D396).

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
fn the_pattern_keeper_pdf_is_the_same_bytes_as_when_it_was_last_pinned() {
    let p = chart();
    let color = export(&p, &request("pdf-color")).unwrap().bytes;
    let bw = export(&p, &request("pdf-bw")).unwrap().bytes;
    // The values below were taken from the exporter at G-131 M2 (D396); before it, from the exporter before G-083.
    assert_eq!(fnv(&color), PINNED_COLOR, "color: {}", fnv(&color));
    assert_eq!(fnv(&bw), PINNED_BW, "bw: {}", fnv(&bw));
}

const PINNED_COLOR: u64 = 1310502135608400080;
const PINNED_BW: u64 = 2153418596737238084;

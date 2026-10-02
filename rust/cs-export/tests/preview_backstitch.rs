//! G-086: the realistic preview draws the chart's backstitch over the stitches, a plain coloured line a fifth of a cell wide.

use cs_export::model::Pattern;
use cs_export::png::PixelSource;
use cs_export::preview;

/// A 10 x 6 chart of blue stitches with one red backstitch line along corner row 3, from corner 2 to corner 8, and one
/// green line across a corner of it, from (1, 1) to (4, 5), steep and long enough to cross several cells.
fn chart(with_lines: bool) -> Pattern {
    let cells = vec![0u8; 60]
        .iter()
        .map(u8::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let lines = if with_lines {
        r#","backstitch":[{"x1":2,"y1":3,"x2":8,"y2":3,"paletteIndex":1},{"x1":1,"y1":1,"x2":4,"y2":5,"paletteIndex":2}]"#
    } else {
        ""
    };
    let json = format!(
        r#"{{"formatVersion":7,"width":10,"height":6,"isLandscape":true,"cellPalette":[{cells}],"palette":[{{"rgb":[40,90,160],"symbol":"A","name":"Blue"}},{{"rgb":[220,30,30],"symbol":"B","name":"Red"}},{{"rgb":[30,200,60],"symbol":"C","name":"Green"}}]{lines}}}"#
    );
    Pattern::from_editable_json(&json).unwrap()
}

const CELL: u32 = 20;

fn pixels(p: &Pattern) -> Vec<u8> {
    let preview = preview::Preview {
        tiles: preview::stitch_tiles(p, CELL, "classic"),
        pattern: p,
        cell_size: CELL,
        ground: None,
    };
    let mut out = Vec::new();
    preview.rgba_rows(0, 6 * CELL, &mut out);
    out
}

fn at(rows: &[u8], x: u32, y: u32) -> [u8; 4] {
    let i = ((y * 10 * CELL + x) * 4) as usize;
    [rows[i], rows[i + 1], rows[i + 2], rows[i + 3]]
}

#[test]
fn a_line_is_drawn_over_the_stitches_in_its_threads_colour_and_a_fifth_of_a_cell_wide() {
    let with = pixels(&chart(true));
    // The middle of the red line, on corner row 3 (y = 60): the thread's own colour, opaque.
    assert_eq!(at(&with, 5 * CELL, 3 * CELL), [220, 30, 30, 255]);
    assert_eq!(at(&with, 5 * CELL, 3 * CELL - 1), [220, 30, 30, 255]);
    // Four pixels wide (a fifth of 20), so two pixels off the line it is the stitch again.
    let plain = pixels(&chart(false));
    assert_eq!(
        at(&with, 5 * CELL, 3 * CELL - 3),
        at(&plain, 5 * CELL, 3 * CELL - 3)
    );
    assert_eq!(
        at(&with, 5 * CELL, 3 * CELL + 3),
        at(&plain, 5 * CELL, 3 * CELL + 3)
    );
    // Round ends: a pixel beyond the end of the line along its row is not the line.
    assert_eq!(
        at(&with, 8 * CELL + 6, 3 * CELL),
        at(&plain, 8 * CELL + 6, 3 * CELL)
    );
    // The slanted green line is on its way at its midpoint, (2.5, 3) in corners.
    let mid = at(&with, (2.5 * CELL as f64) as u32, 3 * CELL);
    assert!(mid[1] > 150 && mid[0] < 100, "{mid:?}");
}

#[test]
fn a_chart_without_backstitch_is_the_picture_it_was() {
    // `overlay_backstitch` returns before it touches a pixel when there is none.
    let plain = pixels(&chart(false));
    assert_eq!(at(&plain, 5 * CELL, 3 * CELL)[3], 255);
    assert_eq!(plain.len(), (10 * CELL * 6 * CELL * 4) as usize);
}

#[test]
fn drawing_in_strips_gives_the_same_pixels_as_all_at_once() {
    let p = chart(true);
    let whole = pixels(&p);
    let preview = preview::Preview {
        tiles: preview::stitch_tiles(&p, CELL, "classic"),
        pattern: &p,
        cell_size: CELL,
        ground: None,
    };
    let mut joined = Vec::new();
    let mut strip = Vec::new();
    // Strips that cut the lines at awkward places: 17 rows at a time.
    let mut y = 0u32;
    while y < 6 * CELL {
        let rows = 17.min(6 * CELL - y);
        preview.rgba_rows(y, rows, &mut strip);
        joined.extend_from_slice(&strip);
        y += rows;
    }
    assert_eq!(whole, joined);
}

/// Solid tiles, so the numbers do not depend on a texture and the TypeScript renderer can be held to the same ones
/// (`tests/unit/preview-backstitch.spec.ts`).
fn solid_pixels(p: &Pattern) -> Vec<u8> {
    let tiles: Vec<Vec<u8>> = p
        .palette
        .iter()
        .map(|c| {
            (0..CELL * CELL)
                .flat_map(|_| [c.rgb[0], c.rgb[1], c.rgb[2], 255])
                .collect()
        })
        .collect();
    let preview = preview::Preview {
        tiles,
        pattern: p,
        cell_size: CELL,
        ground: None,
    };
    let mut out = Vec::new();
    preview.rgba_rows(0, 6 * CELL, &mut out);
    out
}

#[test]
fn the_pixels_the_typescript_renderer_is_held_to() {
    let rows = solid_pixels(&chart(true));
    let probes = [
        (5 * CELL, 3 * CELL - 3),
        (5 * CELL, 3 * CELL - 2),
        (5 * CELL, 3 * CELL),
        (2 * CELL + 10, 3 * CELL),
        (2 * CELL + 10, 3 * CELL + 7),
        (3 * CELL, 2 * CELL + 3),
        (8 * CELL + 1, 3 * CELL),
    ];
    let want: [[u8; 4]; 7] = [
        [40, 90, 160, 255],
        [220, 30, 30, 255],
        [220, 30, 30, 255],
        [30, 200, 60, 255],
        [40, 90, 160, 255],
        [40, 90, 160, 255],
        [205, 35, 41, 255],
    ];
    for ((x, y), expected) in probes.into_iter().zip(want) {
        assert_eq!(at(&rows, x, y), expected, "pixel ({x}, {y})");
    }
}

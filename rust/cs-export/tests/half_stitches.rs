//! G-082: half stitches through the exporter. A chart is built from the editable save format, as the processor receives it.

use cs_export::canvas::Canvas;
use cs_export::halfstitch::{BACKSLASH, SLASH, WHOLE};
use cs_export::model::{Pattern, Request};
use cs_export::render::{draw_chart, Mode};
use cs_export::{export, preview};

/// A 10 × 10 chart with two threads; the first row is whole, "/" and "\" stitches in thread 0 and a whole stitch in thread 1.
fn chart_json(kinds: Option<&str>) -> String {
    let mut cells = vec![255u8; 100];
    cells[0] = 0;
    cells[1] = 0;
    cells[2] = 0;
    cells[3] = 1;
    let list = cells
        .iter()
        .map(u8::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let kinds = kinds
        .map(|k| format!(",\"cellKind\":[{k}]"))
        .unwrap_or_default();
    format!(
        "{{\"formatVersion\":7,\"width\":10,\"height\":10,\"isLandscape\":true,\"cellPalette\":[{list}],\"palette\":[\
         {{\"rgb\":[200,20,20],\"symbol\":\"A\",\"name\":\"Red\"}},{{\"rgb\":[20,20,200],\"symbol\":\"B\",\"name\":\"Blue\"}}]{kinds}}}"
    )
}

fn kinds_row(first: [u8; 4]) -> String {
    let mut all = vec![0u8; 100];
    all[..4].copy_from_slice(&first);
    all.iter().map(u8::to_string).collect::<Vec<_>>().join(",")
}

fn halves() -> Pattern {
    Pattern::from_editable_json(&chart_json(Some(&kinds_row([
        WHOLE, SLASH, BACKSLASH, SLASH,
    ]))))
    .unwrap()
}

fn request(kind: &str) -> Request {
    Request::from_json(&format!("{{\"kind\":\"{kind}\",\"baseName\":\"t\"}}")).unwrap()
}

fn pixel(rows: &[u8], width: u32, x: u32, y: u32) -> [u8; 3] {
    let o = ((y * width + x) * 4) as usize;
    [rows[o], rows[o + 1], rows[o + 2]]
}

#[test]
fn a_chart_with_no_kinds_has_none_and_a_row_per_thread() {
    let p = Pattern::from_editable_json(&chart_json(None)).unwrap();
    assert!(!p.has_halves());
    let entries = p.legend_entries();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].count, 3);
    assert_eq!(entries[1].count, 1);
}

#[test]
fn all_whole_kinds_are_dropped_and_an_empty_cell_is_whole() {
    let all_whole =
        Pattern::from_editable_json(&chart_json(Some(&kinds_row([0, 0, 0, 0])))).unwrap();
    assert!(!all_whole.has_halves());
    // A kind under an empty cell (cell 50 is empty) is ignored.
    let mut kinds = vec![0u8; 100];
    kinds[50] = 1;
    let list = kinds
        .iter()
        .map(u8::to_string)
        .collect::<Vec<_>>()
        .join(",");
    assert!(!Pattern::from_editable_json(&chart_json(Some(&list)))
        .unwrap()
        .has_halves());
}

#[test]
fn the_legend_has_a_row_for_every_stitch_type_and_thread_in_use() {
    let p = halves();
    let rows: Vec<(usize, u8, usize)> = p
        .legend_entries()
        .iter()
        .map(|e| (e.color, e.kind, e.count))
        .collect();
    // Red: one whole, one "/", one "\"; blue: one half "/" only.
    assert_eq!(
        rows,
        vec![
            (0, WHOLE, 1),
            (0, SLASH, 1),
            (0, BACKSLASH, 1),
            (1, SLASH, 1)
        ]
    );
    // Thread for buying: a half stitch is half a stitch, rounded up.
    assert_eq!(p.thread_stitches(0), 1 + 1);
    assert_eq!(p.thread_stitches(1), 1);
    assert!(!p.whole_stitches().has_halves());
}

#[test]
fn the_chart_cuts_the_corners_of_a_half_stitch_and_leaves_a_whole_one_square() {
    let p = halves();
    let size = 40.0;
    let mut canvas = Canvas::new(10 * 40, 40);
    draw_chart(&mut canvas, &p, Mode::Color, 40, None, None);
    let mut rows = Vec::new();
    canvas.rgba_rows(0, 40, &mut rows);
    let width = canvas.width();
    let at = |cell: u32, x: u32, y: u32| pixel(&rows, width, cell * 40 + x, y);
    let red = [200, 20, 20];
    let ground = [255, 255, 255];
    assert_eq!(size, 40.0);
    // Whole (cell 0): every corner is red.
    for (x, y) in [(3, 3), (36, 3), (3, 36), (36, 36)] {
        assert_eq!(at(0, x, y), red);
    }
    // "/" (cell 1): top-left and bottom-right cut, the other two kept.
    assert_eq!(at(1, 3, 3), ground);
    assert_eq!(at(1, 36, 36), ground);
    assert_eq!(at(1, 36, 5), red);
    assert_eq!(at(1, 4, 35), red);
    // "\" (cell 2): the other pair.
    assert_eq!(at(2, 36, 4), ground);
    assert_eq!(at(2, 3, 36), ground);
    assert_eq!(at(2, 5, 5), red);
    assert_eq!(at(2, 35, 35), red);
}

#[test]
fn the_realistic_preview_cuts_the_stitch_texture_with_the_same_corners() {
    let p = halves();
    let cell = 24u32;
    let req = request("png-realistic");
    let preview = preview::Preview {
        tiles: preview::stitch_tiles(&p, cell, &req.stitch_texture),
        pattern: &p,
        cell_size: cell,
        ground: None,
    };
    use cs_export::png::PixelSource;
    let mut rows = Vec::new();
    preview.rgba_rows(0, cell, &mut rows);
    let width = 10 * cell;
    let alpha = |x: u32, y: u32| rows[((y * width + x) * 4 + 3) as usize];
    assert_eq!(alpha(cell, 0), 0); // the "/" cell's top-left pixel
    assert_eq!(alpha(cell + cell - 1, cell - 1), 0); // and its bottom-right
    assert!(alpha(cell + cell - 1, 0) > 0); // top-right is kept
    assert!(alpha(cell + 12, 12) > 0);
}

#[test]
fn the_editable_save_keeps_the_kinds_and_none_for_a_whole_chart() {
    let p = halves();
    let text = export(&p, &request("editable")).unwrap();
    let back = String::from_utf8(text.bytes).unwrap();
    assert!(back.contains("\"cellKind\":[0,1,2,1,0"));
    let again = Pattern::from_editable_json(&back).unwrap();
    assert_eq!(again.kinds, p.kinds);
    let whole = Pattern::from_editable_json(&chart_json(None)).unwrap();
    let plain = String::from_utf8(export(&whole, &request("editable")).unwrap().bytes).unwrap();
    assert!(!plain.contains("cellKind"));
}

#[test]
fn every_export_runs_on_a_chart_with_half_stitches_and_pattern_keeper_and_oxs_see_whole_stitches() {
    let p = halves();
    for kind in [
        "png-color",
        "png-bw",
        "png-realistic",
        "a4-color",
        "a4-bw",
        "pdf-color",
        "oxs",
        "all",
    ] {
        let file = export(&p, &request(kind)).unwrap_or_else(|e| panic!("{kind}: {e}"));
        assert!(!file.bytes.is_empty(), "{kind}");
    }
    // The OXS and the Pattern Keeper PDF of a chart with half stitches are those of the same chart with all of them whole.
    let whole = p.whole_stitches();
    assert_eq!(
        export(&p, &request("oxs")).unwrap().bytes,
        export(&whole, &request("oxs")).unwrap().bytes
    );
    assert_eq!(
        export(&p, &request("pdf-color")).unwrap().bytes,
        export(&whole, &request("pdf-color")).unwrap().bytes
    );
}

#[test]
fn the_full_chart_with_no_half_stitches_is_the_same_bytes_as_before() {
    // The kinds array is empty, so nothing here may differ from a chart that never heard of half stitches: the same chart given
    // an all-whole `cellKind` is read as having none, and its image is identical to the one without the field.
    let plain = Pattern::from_editable_json(&chart_json(None)).unwrap();
    let all_whole =
        Pattern::from_editable_json(&chart_json(Some(&kinds_row([0, 0, 0, 0])))).unwrap();
    for kind in ["png-color", "a4-color", "png-realistic"] {
        assert_eq!(
            export(&plain, &request(kind)).unwrap().bytes,
            export(&all_whole, &request(kind)).unwrap().bytes,
            "{kind}"
        );
    }
}

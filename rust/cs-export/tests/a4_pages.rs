//! G-083: the A4 pages of the A4 export: the cell size, the page letters, the map first, the overlap labels, the centre, the
//! skein table. Set `CS_A4_OUT` to a folder to have the pages written there as PNG files for looking at.

use cs_export::a4::{calculate_a4_layout, marks_for, page_letter, PRINT_DPI};
use cs_export::bundle::a4_png_page_count;
use cs_export::export;
use cs_export::model::{Pattern, Request};

fn chart(width: usize, height: usize) -> Pattern {
    let mut cells = vec![255u8; width * height];
    for y in 0..height {
        for x in 0..width {
            if (x + 2 * y) % 5 != 0 {
                cells[y * width + x] = ((x / 7 + y / 9) % 3) as u8;
            }
        }
    }
    let list = cells
        .iter()
        .map(u8::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let json = format!(
        "{{\"formatVersion\":7,\"width\":{width},\"height\":{height},\"isLandscape\":{},\"name\":\"Pages\",\"threadBrand\":\"dmc\",\"cellPalette\":[{list}],\
         \"palette\":[{{\"rgb\":[200,20,20],\"symbol\":\"A\",\"name\":\"310 - Black\",\"source\":{{\"brand\":\"dmc\",\"code\":\"310\"}}}},\
         {{\"rgb\":[20,20,200],\"symbol\":\"B\",\"name\":\"Blue\"}},{{\"rgb\":[20,160,20],\"symbol\":\"C\",\"name\":\"Green\"}}]}}",
        width >= height
    );
    Pattern::from_editable_json(&json).unwrap()
}

fn request(cell_mm: Option<f64>) -> Request {
    let cell = cell_mm
        .map(|c| format!(",\"cellMm\":{c}"))
        .unwrap_or_default();
    Request::from_json(&format!(
        "{{\"kind\":\"a4-color\",\"baseName\":\"pages\",\"aidaCount\":14,\"sizeUnit\":\"cm\",\"authorName\":\"Pages\",\"overlapCells\":5{cell}}}"
    ))
    .unwrap()
}

/// The entries of a ZIP written without compression: their names and bytes, in order.
fn entries(zip: &[u8]) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 30 <= zip.len() && zip[i..i + 4] == [0x50, 0x4b, 0x03, 0x04] {
        let size = u32::from_le_bytes(zip[i + 18..i + 22].try_into().unwrap()) as usize;
        let name_len = u16::from_le_bytes(zip[i + 26..i + 28].try_into().unwrap()) as usize;
        let extra_len = u16::from_le_bytes(zip[i + 28..i + 30].try_into().unwrap()) as usize;
        let name = String::from_utf8(zip[i + 30..i + 30 + name_len].to_vec()).unwrap();
        let start = i + 30 + name_len + extra_len;
        out.push((name, zip[start..start + size].to_vec()));
        i = start + size;
    }
    out
}

#[test]
fn pages_are_lettered_like_a_spreadsheets_columns() {
    let letters: Vec<String> = [0, 1, 25, 26, 27, 51, 52, 701, 702]
        .iter()
        .map(|&i| page_letter(i))
        .collect();
    assert_eq!(
        letters,
        ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]
    );
}

#[test]
fn an_overlap_band_names_the_page_it_repeats() {
    let l = calculate_a4_layout(100, 100, 5, PRINT_DPI, 5.5);
    assert!(l.columns >= 2 && l.rows >= 2);
    let first = marks_for(&l, 0);
    assert!(first.centre);
    assert_eq!(first.letter.as_deref(), Some("A"));
    // The top left page has a right band (the page to its right) and a bottom band (the page below), and no others.
    assert_eq!(first.overlap[0], None);
    assert_eq!(first.overlap[1].as_deref(), Some("B"));
    assert_eq!(
        first.overlap[2].as_deref(),
        Some(page_letter(l.columns).as_str())
    );
    assert_eq!(first.overlap[3], None);
    let last = marks_for(&l, l.pages.len() - 1);
    assert_eq!(last.overlap[1], None);
    assert_eq!(last.overlap[2], None);
    assert_eq!(
        last.overlap[3].as_deref(),
        Some(page_letter(l.pages.len() - 2).as_str())
    );
    // With no overlap there is nothing to name.
    let none = calculate_a4_layout(100, 100, 0, PRINT_DPI, 5.5);
    assert!(marks_for(&none, 0).overlap.iter().all(Option::is_none));
}

#[test]
fn a_bigger_cell_takes_more_pages_and_the_count_the_progress_reports_is_the_pages_written() {
    let p = chart(100, 70);
    let small = a4_png_page_count(&p, &request(Some(2.75)));
    let big = a4_png_page_count(&p, &request(Some(5.5)));
    assert!(
        big > small,
        "{big} pages at 5.5 mm against {small} at 2.75 mm"
    );
    for cell in [None, Some(2.75), Some(5.5), Some(8.0)] {
        let zip = export(&p, &request(cell)).unwrap().bytes;
        let files = entries(&zip);
        assert_eq!(
            files.len(),
            a4_png_page_count(&p, &request(cell)),
            "cell {cell:?}"
        );
    }
    // The default is the Owner's 5.5 mm.
    assert_eq!(a4_png_page_count(&p, &request(None)), big);
}

#[test]
fn the_map_of_the_pages_is_the_first_file_and_every_file_is_a_page() {
    let p = chart(100, 70);
    let files = entries(&export(&p, &request(None)).unwrap().bytes);
    assert!(files[0].0.ends_with("_00_page_map.png"), "{}", files[0].0);
    assert!(files
        .iter()
        .all(|(_, bytes)| bytes.starts_with(&[0x89, b'P', b'N', b'G'])));
    let l = calculate_a4_layout(100, 70, 5, PRINT_DPI, 5.5);
    assert_eq!(
        files.iter().filter(|(n, _)| n.contains("_r")).count(),
        l.pages.len()
    );
    assert!(files.iter().any(|(n, _)| n.contains("_legend")));
    if let Ok(dir) = std::env::var("CS_A4_OUT") {
        std::fs::create_dir_all(&dir).unwrap();
        for (name, bytes) in &files {
            std::fs::write(std::path::Path::new(&dir).join(name), bytes).unwrap();
        }
    }
}

#[test]
fn a_chart_with_many_colours_has_a_skein_table_over_several_pages() {
    // 100 threads: the table runs over pages, each page's rows counted, none lost.
    let (w, h) = (20usize, 20usize);
    let cells: Vec<String> = (0..w * h).map(|i| (i % 100).to_string()).collect();
    let palette: Vec<String> = (0..100)
        .map(|i| {
            format!(
                "{{\"rgb\":[{},{},{}],\"symbol\":\"{}\",\"name\":\"Thread {i}\"}}",
                i * 2,
                255 - i * 2,
                i,
                char::from_u32(0x3b1 + i as u32).unwrap()
            )
        })
        .collect();
    let json = format!(
        "{{\"formatVersion\":7,\"width\":{w},\"height\":{h},\"isLandscape\":true,\"cellPalette\":[{}],\"palette\":[{}]}}",
        cells.join(","),
        palette.join(",")
    );
    let p = Pattern::from_editable_json(&json).unwrap();
    let files = entries(&export(&p, &request(None)).unwrap().bytes);
    let tables = files
        .iter()
        .filter(|(n, _)| n.contains("_legend_") && !n.contains("extended"))
        .count();
    assert!(tables >= 3, "a hundred threads fit on {tables} table pages");
    assert_eq!(files.len(), a4_png_page_count(&p, &request(None)));
}

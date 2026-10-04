//! G-094: the editable save written here is the one `serializePattern` writes, field for field. Until G-094 it dropped the
//! fields no export reads (the photo sliders, the dither mode and texture, Vivid, the chosen palette set), so the editable
//! file inside "Export all" opened as a chart that had forgotten how it was generated.

use cs_export::editable;
use cs_export::model::Pattern;

/// A chart as `serializePattern` writes it, with every optional field present, in its order.
fn full() -> String {
    let cells = vec!["0"; 12].join(",");
    format!(
        concat!(
            r#"{{"formatVersion":7,"width":4,"height":3,"isLandscape":true,"cellPalette":[{cells}],"#,
            r#""palette":[{{"rgb":[40,90,160],"symbol":"A","name":"Blue","source":{{"brand":"dmc","code":"797"}}}}],"#,
            r#""name":"Full","threadBrand":"dmc","edgeMode":"crisp","#,
            r#""photoAdjust":{{"brightness":0.25,"contrast":-0.5,"saturation":0,"vibrance":1}},"#,
            r#""ditherMode":"hand-drawn","ditherTexture":{{"scale":1.5,"angle":30}},"vivid":true,"#,
            r#""generationPalette":{{"mode":"dmc","colors":[{{"code":"797","rgb":[40,90,160]}}],"active":true}},"#,
            r#""symmetry":{{"vertical":true}},"#,
            r#""backstitch":[{{"x1":0,"y1":0,"x2":2,"y2":2,"paletteIndex":0}}],"#,
            r#""fabric":{{"count":16,"unit":"in"}}}}"#
        ),
        cells = cells
    )
}

#[test]
fn every_field_of_the_file_comes_back_as_it_went_in() {
    let text = full();
    let pattern = Pattern::from_editable_json(&text).unwrap();
    assert_eq!(editable::serialize(&pattern), text);
}

#[test]
fn a_chart_without_them_is_written_without_them() {
    let text = r#"{"formatVersion":7,"width":2,"height":1,"isLandscape":true,"cellPalette":[0,0],"palette":[{"rgb":[1,2,3],"symbol":"A","name":"One"}]}"#;
    let pattern = Pattern::from_editable_json(text).unwrap();
    assert_eq!(editable::serialize(&pattern), text);
}

#[test]
fn the_fields_survive_the_copies_the_exports_make_of_a_chart() {
    let pattern = Pattern::from_editable_json(&full()).unwrap();
    let compacted = pattern.compact_unused_colors();
    assert!(editable::serialize(&compacted).contains(r#""fabric":{"count":16,"unit":"in"}"#));
    assert!(editable::serialize(&compacted).contains(r#""vivid":true"#));
}

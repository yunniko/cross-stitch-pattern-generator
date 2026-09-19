//! Port of `serializePattern` (`lib/editor/pattern-serialize.ts`): the editable save, byte for byte as
//! `JSON.stringify` writes it.

use crate::jsfmt::{json_string, number};
use crate::model::Pattern;
use serde_json::Value;

const FORMAT_VERSION: u32 = 7;

/// A parsed JSON value written as `JSON.stringify` writes it (object keys in their stored order).
fn write_value(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&number(n.as_f64().unwrap_or(f64::NAN))),
        Value::String(s) => json_string(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            out.push('{');
            for (i, (key, item)) in map.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json_string(key, out);
                out.push(':');
                write_value(item, out);
            }
            out.push('}');
        }
    }
}

fn optional_string(out: &mut String, key: &str, value: &Option<String>) {
    if let Some(v) = value {
        out.push_str(&format!(",\"{key}\":"));
        json_string(v, out);
    }
}

pub fn serialize(p: &Pattern) -> String {
    let mut out = String::with_capacity(p.cells.len() * 4 + 4096);
    out.push_str(&format!(
        "{{\"formatVersion\":{FORMAT_VERSION},\"width\":{},\"height\":{},\"isLandscape\":{},\"cellPalette\":[",
        p.width, p.height, p.is_landscape
    ));
    for (i, c) in p.cells.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&c.to_string());
    }
    out.push_str("],\"palette\":[");
    for (i, c) in p.palette.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&format!(
            "{{\"rgb\":[{},{},{}],\"symbol\":",
            c.rgb[0], c.rgb[1], c.rgb[2]
        ));
        json_string(&c.symbol, &mut out);
        out.push_str(",\"name\":");
        json_string(&c.name, &mut out);
        if let Some(s) = &c.source {
            out.push_str(",\"source\":{\"brand\":");
            json_string(&s.brand, &mut out);
            out.push_str(",\"code\":");
            json_string(&s.code, &mut out);
            out.push('}');
        }
        out.push('}');
    }
    out.push(']');
    optional_string(&mut out, "name", &p.name);
    if let Some(image) = &p.source_image {
        out.push_str(",\"sourceImage\":");
        write_value(&Value::Object(image.clone()), &mut out);
    }
    optional_string(&mut out, "threadBrand", &p.thread_brand);
    optional_string(&mut out, "edgeMode", &p.edge_mode);
    optional_string(&mut out, "enhancementMode", &p.enhancement_mode);
    if !p.symmetry.is_empty() {
        out.push_str(",\"symmetry\":{");
        for (i, axis) in p.symmetry.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push_str(&format!("\"{axis}\":true"));
        }
        out.push('}');
    }
    out.push('}');
    out
}

//! Port of `serializeOxsParts` (`lib/editor/oxs.ts`): the OXS chart, byte for byte.

use crate::jsfmt::number;
use crate::model::{Pattern, EMPTY_CELL};
use crate::threads::{brand_label, find_thread};

const SOFTWARE_NAME: &str = "Cross-Stitch Pattern Generator";
const DEFAULT_STITCHES_PER_INCH: f64 = 14.0;

/// `escapeXmlAttribute`: drops characters XML 1.0 cannot hold, then escapes.
pub fn escape_xml_attribute(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        let u = c as u32;
        let allowed = matches!(c, '\t' | '\n' | '\r')
            || (0x20..=0xD7FF).contains(&u)
            || (0xE000..=0xFFFD).contains(&u)
            || (0x10000..=0x10FFFF).contains(&u);
        if !allowed {
            continue;
        }
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            '\t' => out.push_str("&#9;"),
            '\n' => out.push_str("&#10;"),
            '\r' => out.push_str("&#13;"),
            c => out.push(c),
        }
    }
    out
}

fn attribute(name: &str, value: &str) -> String {
    format!(" {name}=\"{}\"", escape_xml_attribute(value))
}

fn hex(rgb: [u8; 3]) -> String {
    format!("{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2])
}

/// The whole file, UTF-8. Call with the export-compacted pattern.
pub fn serialize(p: &Pattern, author_name: &str, aida_count: f64) -> Vec<u8> {
    let aida = if aida_count.is_finite() && aida_count > 0.0 {
        aida_count
    } else {
        DEFAULT_STITCHES_PER_INCH
    };
    let aida = number(aida);
    let mut lines: Vec<String> = vec![
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>".into(),
        "<chart>".into(),
    ];
    lines.push(format!(
        "<format{}{}/>",
        attribute("comments01", &format!("Exported by {SOFTWARE_NAME}")),
        attribute(
            "comments02",
            "Palette item 0 is the cloth; stitch coordinates start at 0"
        )
    ));
    lines.push(
        "<properties".to_string()
            + &attribute("oxs", "1.0")
            + &attribute("oxsversion", "1.0")
            + &attribute("software", SOFTWARE_NAME)
            + &attribute("chartwidth", &p.width.to_string())
            + &attribute("chartheight", &p.height.to_string())
            + &attribute("charttitle", p.name.as_deref().unwrap_or(""))
            + &attribute("author", author_name)
            + &attribute("copyright", "")
            + &attribute("instructions", "")
            + &attribute("stitchesperinch", &aida)
            + &attribute("stitchesperinch_y", &aida)
            + &attribute("palettecount", &p.palette.len().to_string())
            + "/>",
    );
    lines.push("<palette>".into());
    lines.push(format!(
        "<palette_item{}{}{}{}{}{}{}/>",
        attribute("index", "0"),
        attribute("number", "cloth"),
        attribute("name", "cloth"),
        attribute("color", "FFFFFF"),
        attribute("printcolor", "FFFFFF"),
        attribute("blendcolor", "nil"),
        attribute("strands", "2")
    ));
    for (i, color) in p.palette.iter().enumerate() {
        let thread = color
            .source
            .as_ref()
            .and_then(|s| find_thread(&s.brand, &s.code).map(|t| (s, t)));
        let h = hex(color.rgb);
        let number_text = match &thread {
            Some((s, t)) => format!("{} {}", brand_label(&s.brand), t.code),
            None => String::new(),
        };
        let name_text = match &thread {
            Some((_, t)) => {
                if t.name.is_empty() {
                    t.code.clone()
                } else {
                    t.name.clone()
                }
            }
            None => color.name.clone(),
        };
        lines.push(
            "<palette_item".to_string()
                + &attribute("index", &(i + 1).to_string())
                + &attribute("number", &number_text)
                + &attribute("name", &name_text)
                + &attribute("color", &h)
                + &attribute("printcolor", &h)
                + &attribute("blendcolor", "nil")
                + &attribute("strands", "2")
                + &attribute("symbol", &color.symbol)
                + "/>",
        );
    }
    lines.push("</palette>".into());
    lines.push("<fullstitches>".into());
    let mut out = lines.join("\n");
    out.push('\n');
    // Each stitch line is the TypeScript's `<stitch x=".." y=".." palindex=".."/>` and a newline (its rows are joined
    // with newlines and each ends with one), assembled from pieces built once per column, row and colour.
    let columns: Vec<String> = (0..p.width)
        .map(|x| format!("<stitch x=\"{x}\" y=\""))
        .collect();
    let colors: Vec<String> = (0..p.palette.len())
        .map(|i| format!("\" palindex=\"{}\"/>\n", i + 1))
        .collect();
    out.reserve(p.cells.len() * 40);
    for y in 0..p.height {
        let row = y.to_string();
        let cells = &p.cells[y * p.width..(y + 1) * p.width];
        for (column, &v) in columns.iter().zip(cells) {
            if v != EMPTY_CELL {
                out.push_str(column);
                out.push_str(&row);
                out.push_str(&colors[v as usize]);
            }
        }
    }
    out.push_str(
        &[
            "</fullstitches>",
            "<partstitches/>",
            "<backstitches/>",
            "<ornaments_inc_knots_and_beads/>",
            "<commentboxes/>",
            "</chart>",
        ]
        .join("\n"),
    );
    out.push('\n');
    out.into_bytes()
}

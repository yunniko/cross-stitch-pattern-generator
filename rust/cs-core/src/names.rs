//! Ports of `lib/color/color-names.ts` (`nameColors`) and `lib/color/symbols.ts`.
//!
//! The name list is color-name-list's "best of" set (MIT; D17), compiled in from `data/color-names-bestof.tsv`, which
//! `scripts/rust-tables.mjs` writes from the same package the TypeScript imports.

use crate::color::{oklab_distance_sq, rgb_to_oklab, Oklab, Rgb};
use std::sync::OnceLock;

struct Entry {
    name: &'static str,
    oklab: Oklab,
}

fn entries() -> &'static [Entry] {
    static ENTRIES: OnceLock<Vec<Entry>> = OnceLock::new();
    ENTRIES.get_or_init(|| {
        include_str!("../data/color-names-bestof.tsv")
            .lines()
            .map(|line| {
                let (hex, name) = line.split_once('\t').expect("hex<TAB>name");
                let n = u32::from_str_radix(hex, 16).expect("hex");
                let rgb = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
                Entry {
                    name,
                    oklab: rgb_to_oklab(rgb),
                }
            })
            .collect()
    })
}

/// `nameColors`: nearest names, claimed closest-first so names are unique; ties keep (colour, name) order.
pub fn name_colors(colors: &[Rgb]) -> Vec<String> {
    let entries = entries();
    let keep = entries.len().min(colors.len() + 1);
    let mut pairs: Vec<(f64, usize, usize)> = Vec::new();
    let mut distances = vec![0f64; entries.len()];
    let mut sorted = vec![0f64; entries.len()];
    for (ci, &rgb) in colors.iter().enumerate() {
        let q = rgb_to_oklab(rgb);
        for (ni, e) in entries.iter().enumerate() {
            distances[ni] = oklab_distance_sq(&q, &e.oklab);
        }
        sorted.copy_from_slice(&distances);
        let (_, threshold, _) = sorted.select_nth_unstable_by(keep - 1, |a, b| a.total_cmp(b));
        let threshold = *threshold;
        for (ni, &d) in distances.iter().enumerate() {
            if d <= threshold {
                pairs.push((d, ci, ni));
            }
        }
    }
    // Stable, as Array.prototype.sort is: equal distances keep push order.
    pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).expect("finite distances"));

    let mut names: Vec<Option<String>> = vec![None; colors.len()];
    let mut used = vec![false; entries.len()];
    let mut assigned = 0;
    for &(_, ci, ni) in &pairs {
        if assigned == colors.len() {
            break;
        }
        if names[ci].is_some() || used[ni] {
            continue;
        }
        names[ci] = Some(entries[ni].name.to_string());
        used[ni] = true;
        assigned += 1;
    }
    names
        .into_iter()
        .map(|n| n.expect("every colour named"))
        .collect()
}

const SHAPES: &[&str] = &[
    "×", "÷", "=", "~", "^", "*", "#", "@", "%", "&", "!", "?", "/", "\\", "|", "●", "○", "■", "□",
    "▲", "△", "▼", "▽", "◆", "◇", "★", "☆", "♥", "§", "¶", "°", "±", "£", "¥", "¤", "µ", "«", "»",
    "♠", "♣", "✓", "◀", "▶", "∞", "√", "≈", "∴", "♪", "♫", "⊕", "⊗", "⊖", "⊘", "⌂", "⚡", "✦",
    "⚓", "←", "→", "↑", "↓", "↔", "↕", "↖", "↗", "↘", "↙",
];
const DIGITS: &str = "0123456789";
const LETTERS_RAW: &str = "ABCDEFGHJKLMNPQRSTUVWYZ";
const LETTERS_ROTATION: usize = 9;

/// `SYMBOL_SET`: round-robin across shapes, digits and rotated letters.
pub fn symbol_set() -> &'static [String] {
    static SET: OnceLock<Vec<String>> = OnceLock::new();
    SET.get_or_init(|| {
        let shapes: Vec<String> = SHAPES.iter().map(|s| s.to_string()).collect();
        let digits: Vec<String> = DIGITS.chars().map(|c| c.to_string()).collect();
        let raw: Vec<String> = LETTERS_RAW.chars().map(|c| c.to_string()).collect();
        let r = LETTERS_ROTATION % raw.len();
        let letters: Vec<String> = raw[r..].iter().chain(raw[..r].iter()).cloned().collect();
        let total = shapes.len() + digits.len() + letters.len();
        let mut out = Vec::with_capacity(total);
        let mut i = 0;
        while out.len() < total {
            for source in [&shapes, &digits, &letters] {
                if i < source.len() {
                    out.push(source[i].clone());
                }
            }
            i += 1;
        }
        out
    })
}

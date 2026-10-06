//! The threshold-matrix patterns (G-052, G-059): screens and scattered matrices. Each is data, a square of ranks from
//! the generated file the TypeScript reads too (D198); a new matrix is a row there and a line in `PATTERNS`.

use super::{by_thresholds, Cells, Pattern};
use crate::color::Rgb;
use crate::settings::Settings;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

struct Ranks {
    size: usize,
    ranks: Vec<u32>,
}

/// The generated patterns, parsed once: `name<TAB>size<TAB>comma-separated ranks in row-major order`.
fn matrices() -> &'static HashMap<String, Ranks> {
    static M: OnceLock<HashMap<String, Ranks>> = OnceLock::new();
    M.get_or_init(|| {
        let mut out = HashMap::new();
        for line in include_str!("../../data/dither-matrices.tsv").lines() {
            let mut parts = line.split('\t');
            let (Some(name), Some(size), Some(ranks)) = (parts.next(), parts.next(), parts.next())
            else {
                continue;
            };
            out.insert(
                name.to_string(),
                Ranks {
                    size: size.parse().expect("matrix size"),
                    ranks: ranks
                        .split(',')
                        .map(|r| r.parse().expect("matrix rank"))
                        .collect(),
                },
            );
        }
        out
    })
}

#[derive(Debug)]
pub struct Matrix {
    id: &'static str,
}

/// A matrix has no settings of its own; its id names its row of the data, which must exist.
pub fn configure(id: &'static str, _settings: &mut Settings) -> Result<Arc<dyn Pattern>, String> {
    if !matrices().contains_key(id) {
        return Err(format!("no dither matrix {id} in dither-matrices.tsv"));
    }
    Ok(Arc::new(Matrix { id }))
}

impl Pattern for Matrix {
    fn id(&self) -> &'static str {
        self.id
    }

    fn dither(&self, cells: &Cells, palette: &[Rgb]) -> Vec<u8> {
        let matrix = &matrices()[self.id];
        let size = matrix.size;
        let scale = (size * size) as f64;
        by_thresholds(cells, palette, |x, y| {
            (matrix.ranks[(y % size) * size + (x % size)] as f64 + 0.5) / scale
        })
    }
}

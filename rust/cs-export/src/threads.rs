//! The thread lists the exports read (`findThread` in `lib/threads/thread-brands.ts`), from the tables
//! `scripts/rust-tables.mjs` writes into `cs-core/data/`.

use std::sync::OnceLock;

pub struct Thread {
    pub code: String,
    pub name: String,
}

fn parse(tsv: &'static str) -> Vec<Thread> {
    tsv.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let mut parts = line.split('\t');
            Thread {
                code: parts.next().unwrap_or("").to_string(),
                name: parts.next().unwrap_or("").to_string(),
            }
        })
        .collect()
}

fn table(brand: &str) -> Option<&'static [Thread]> {
    static DMC: OnceLock<Vec<Thread>> = OnceLock::new();
    static COSMO: OnceLock<Vec<Thread>> = OnceLock::new();
    static ANCHOR: OnceLock<Vec<Thread>> = OnceLock::new();
    match brand {
        "dmc" => {
            Some(DMC.get_or_init(|| parse(include_str!("../../cs-core/data/threads-dmc.tsv"))))
        }
        "cosmo" => {
            Some(COSMO.get_or_init(|| parse(include_str!("../../cs-core/data/threads-cosmo.tsv"))))
        }
        "anchor" => Some(
            ANCHOR.get_or_init(|| parse(include_str!("../../cs-core/data/threads-anchor.tsv"))),
        ),
        _ => None,
    }
}

/// `findThread`: an exact code match, else a case-insensitive one.
pub fn find_thread(brand: &str, code: &str) -> Option<&'static Thread> {
    let colors = table(brand)?;
    colors.iter().find(|t| t.code == code).or_else(|| {
        let wanted = code.to_lowercase();
        colors.iter().find(|t| t.code.to_lowercase() == wanted)
    })
}

/// `THREAD_BRANDS[brand].label`.
pub fn brand_label(brand: &str) -> &'static str {
    match brand {
        "dmc" => "DMC",
        "cosmo" => "Cosmo",
        "anchor" => "Anchor",
        _ => "",
    }
}

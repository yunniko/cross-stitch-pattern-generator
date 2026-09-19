//! JavaScript's text formatting, exactly: `String(number)`, `JSON.stringify` of a string, `Number.prototype.toFixed`
//! and `toLocaleString("en-US")` for integers.

/// `String(n)` (and `JSON.stringify(n)` for a finite number).
pub fn number(n: f64) -> String {
    if n.is_nan() {
        return "NaN".into();
    }
    if n.is_infinite() {
        return if n > 0.0 {
            "Infinity".into()
        } else {
            "-Infinity".into()
        };
    }
    ryu_js::Buffer::new().format(n).to_string()
}

/// `JSON.stringify(s)`: quotes, backslash, the short escapes, other controls as `\u00xx`; everything else as is.
pub fn json_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// `x.toFixed(digits)` for |x| < 1e21: the exact decimal value rounded at `digits`, a tie going to the larger magnitude
/// (Rust's own formatting breaks ties to even).
pub fn to_fixed(x: f64, digits: usize) -> String {
    if !x.is_finite() || x.abs() >= 1e21 {
        return number(x);
    }
    // Enough digits to hold the double's exact decimal expansion, so the rounding below sees the true value.
    let exact = format!("{:.1100}", x.abs());
    let (int_part, frac_part) = exact.split_once('.').unwrap();
    let mut digits_vec: Vec<u8> = int_part
        .bytes()
        .chain(frac_part.bytes().take(digits))
        .map(|b| b - b'0')
        .collect();
    let rest = &frac_part[digits..];
    let round_up = match rest.as_bytes().first() {
        Some(&d) if d > b'5' => true,
        Some(&b'5') => true, // exactly half or more: a tie rounds up, as toFixed does
        _ => false,
    };
    if round_up {
        let mut i = digits_vec.len();
        loop {
            if i == 0 {
                digits_vec.insert(0, 1);
                break;
            }
            i -= 1;
            if digits_vec[i] == 9 {
                digits_vec[i] = 0;
            } else {
                digits_vec[i] += 1;
                break;
            }
        }
    }
    let int_len = digits_vec.len() - digits;
    let mut s = String::new();
    if x < 0.0 {
        // JavaScript keeps the sign whenever x < 0, even when the digits round to zero: (-0.04).toFixed(1) is "-0.0".
        s.push('-');
    }
    for &d in &digits_vec[..int_len] {
        s.push((b'0' + d) as char);
    }
    if digits > 0 {
        s.push('.');
        for &d in &digits_vec[int_len..] {
            s.push((b'0' + d) as char);
        }
    }
    s
}

/// `n.toLocaleString("en-US")` for a non-negative integer: thousands separated by commas.
pub fn locale_int(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_javascript() {
        assert_eq!(number(12.0), "12");
        assert_eq!(number(1.5), "1.5");
        assert_eq!(number(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(number(1e21), "1e+21");
        assert_eq!(to_fixed(0.25, 1), "0.3");
        assert_eq!(to_fixed(1.05, 1), "1.1"); // 1.05 is 1.0500000000000000444
        assert_eq!(to_fixed(1.45, 1), "1.4"); // 1.45 is 1.4499999999999999556
        assert_eq!(to_fixed(9.96, 1), "10.0");
        assert_eq!(to_fixed(-0.04, 1), "-0.0");
        assert_eq!(locale_int(2350), "2,350");
        assert_eq!(locale_int(1500000), "1,500,000");
        let mut s = String::new();
        json_string("a\"b\\c\n\u{1f}é", &mut s);
        assert_eq!(s, "\"a\\\"b\\\\c\\n\\u001fé\"");
    }
}

//! The JavaScript `Math` functions the pipeline uses, with V8's exact results.
//!
//! Byte-identity with the TypeScript pipeline (D107) needs every transcendental function to return the same double as
//! V8, bit for bit. Rust's `f64::cbrt`, `powf` and `exp` call the platform's C library, which may differ in the last
//! bit; V8 uses its own fdlibm-derived routines. `cbrt` and `pow` are line-for-line ports of V8's; `exp` comes from the
//! `libm` crate, whose version is the same fdlibm code. Each is proven equal to V8 on millions of inputs from the
//! domains the pipeline uses
//! (`tests/jsmath_vectors.rs`, vectors written by `scripts/rust-jsmath-vectors.mjs`). See D183.

// The constants are fdlibm's, digit for digit, and the statements keep its shape, so the port can be read against it.
#![allow(
    clippy::excessive_precision,
    clippy::approx_constant,
    clippy::eq_op,
    clippy::assign_op_pattern
)]

/// `Math.cbrt`: V8's `base::ieee754::cbrt` (FreeBSD's `s_cbrt.c`), ported line for line. The `libm` crate's
/// version differs from V8's in the last bit for 8.4% of the recorded vectors, and the platform `std` for 30%
/// (measured 2026-09-24, `docs/reviews/2026-09-24-parity-tax.md`) — so this is not a near-match, and `std` would
/// additionally vary by operating system.
pub fn cbrt(x: f64) -> f64 {
    const B1: u32 = 715094163; // (1023-1023/3-0.03306235651)*2**20
    const B2: u32 = 696219795; // (1023-1023/3-54/3-0.03306235651)*2**20
    const P0: f64 = 1.87595182427177009643;
    const P1: f64 = -1.88497979543377169875;
    const P2: f64 = 1.621429720105354466140;
    const P3: f64 = -0.758397934778766047437;
    const P4: f64 = 0.145996192886612446982;

    let bits = x.to_bits();
    let mut hx = (bits >> 32) as u32;
    let low = bits as u32;
    let sign = hx & 0x8000_0000;
    hx ^= sign;
    if hx >= 0x7FF0_0000 {
        return x + x; // NaN and infinities are themselves
    }
    let mut t: f64;
    if hx < 0x0010_0000 {
        // zero or subnormal
        if (hx | low) == 0 {
            return x;
        }
        t = f64::from_bits(0x4350_0000u64 << 32); // 2**54
        t *= x;
        let high = (t.to_bits() >> 32) as u32;
        t = f64::from_bits(((sign | ((high & 0x7FFF_FFFF) / 3 + B2)) as u64) << 32);
    } else {
        // `hx` is non-negative here, so C's signed division by 3 equals the unsigned one.
        t = f64::from_bits(((sign | (hx / 3 + B1)) as u64) << 32);
    }

    let mut r = (t * t) * (t / x);
    t = t * ((P0 + r * (P1 + r * P2)) + ((r * r) * r) * (P3 + r * P4));

    let rounded = (t.to_bits().wrapping_add(0x8000_0000)) & 0xFFFF_FFFF_C000_0000;
    t = f64::from_bits(rounded);

    let s = t * t;
    r = x / s;
    let w = t + t;
    r = (r - t) / (w + r);
    t + t * r
}

#[inline]
fn hi(d: f64) -> i32 {
    (d.to_bits() >> 32) as u32 as i32
}

#[inline]
fn lo(d: f64) -> u32 {
    d.to_bits() as u32
}

#[inline]
fn with_hi(d: f64, v: i32) -> f64 {
    f64::from_bits((d.to_bits() & 0x0000_0000_FFFF_FFFF) | ((v as u32 as u64) << 32))
}

#[inline]
fn with_lo(d: f64, v: u32) -> f64 {
    f64::from_bits((d.to_bits() & 0xFFFF_FFFF_0000_0000) | v as u64)
}

/// `Math.pow` and the `**` operator: V8's `base::ieee754::pow` (fdlibm's `e_pow.c` with V8's edits), ported line for
/// line; C's `int` arithmetic is `i32` with wrapping. The `libm` crate follows musl's rewrite, which differs from V8's
/// result in the last bit for about 4 % of the pipeline's inputs.
pub fn pow(x: f64, y: f64) -> f64 {
    const BP: [f64; 2] = [1.0, 1.5];
    const DP_H: [f64; 2] = [0.0, 5.84962487220764160156e-01];
    const DP_L: [f64; 2] = [0.0, 1.35003920212974897128e-08];
    const ZERO: f64 = 0.0;
    const ONE: f64 = 1.0;
    const TWO: f64 = 2.0;
    const TWO53: f64 = 9007199254740992.0;
    const HUGE: f64 = 1.0e300;
    const TINY: f64 = 1.0e-300;
    const L1: f64 = 5.99999999999994648725e-01;
    const L2: f64 = 4.28571428578550184252e-01;
    const L3: f64 = 3.33333329818377432918e-01;
    const L4: f64 = 2.72728123808534006489e-01;
    const L5: f64 = 2.30660745775561754067e-01;
    const L6: f64 = 2.06975017800338417784e-01;
    const P1: f64 = 1.66666666666666019037e-01;
    const P2: f64 = -2.77777777770155933842e-03;
    const P3: f64 = 6.61375632143793436117e-05;
    const P4: f64 = -1.65339022054652515390e-06;
    const P5: f64 = 4.13813679705723846039e-08;
    const LG2: f64 = 6.93147180559945286227e-01;
    const LG2_H: f64 = 6.93147182464599609375e-01;
    const LG2_L: f64 = -1.90465429995776804525e-09;
    const OVT: f64 = 8.0085662595372944372e-0017;
    const CP: f64 = 9.61796693925975554329e-01;
    const CP_H: f64 = 9.61796700954437255859e-01;
    const CP_L: f64 = -7.02846165095275826516e-09;
    const IVLN2: f64 = 1.44269504088896338700e+00;
    const IVLN2_H: f64 = 1.44269502162933349609e+00;
    const IVLN2_L: f64 = 1.92596299112661746887e-08;

    let hx = hi(x);
    let lx = lo(x);
    let hy = hi(y);
    let ly = lo(y);
    let mut ix = hx & 0x7fffffff;
    let iy = hy & 0x7fffffff;

    // y == zero: x**0 = 1
    if (iy as u32 | ly) == 0 {
        return ONE;
    }
    // +-NaN return x+y
    if ix > 0x7ff00000
        || (ix == 0x7ff00000 && lx != 0)
        || iy > 0x7ff00000
        || (iy == 0x7ff00000 && ly != 0)
    {
        return x + y;
    }

    // yisint = 0: not an integer, 1: odd integer, 2: even integer
    let mut yisint = 0;
    if hx < 0 {
        if iy >= 0x43400000 {
            yisint = 2;
        } else if iy >= 0x3ff00000 {
            let k = (iy >> 20) - 0x3ff;
            if k > 20 {
                let j = ly >> (52 - k);
                if (j << (52 - k)) == ly {
                    yisint = 2 - (j & 1) as i32;
                }
            } else if ly == 0 {
                let j = iy >> (20 - k);
                if (j << (20 - k)) == iy {
                    yisint = 2 - (j & 1);
                }
            }
        }
    }

    // special value of y
    if ly == 0 {
        if iy == 0x7ff00000 {
            // y is +-inf
            if ((ix.wrapping_sub(0x3ff00000)) as u32 | lx) == 0 {
                return y - y; // inf**+-1 is NaN
            } else if ix >= 0x3ff00000 {
                return if hy >= 0 { y } else { ZERO };
            } else {
                return if hy < 0 { -y } else { ZERO };
            }
        }
        if iy == 0x3ff00000 {
            // y is +-1
            return if hy < 0 { ONE / x } else { x };
        }
        if hy == 0x40000000 {
            return x * x; // y is 2
        }
        if hy == 0x3fe00000 && hx >= 0 {
            return x.sqrt(); // y is 0.5, x >= +0
        }
    }

    let mut ax = x.abs();
    // special value of x
    if lx == 0 && (ix == 0x7ff00000 || ix == 0 || ix == 0x3ff00000) {
        let mut z = ax; // x is +-0, +-inf, +-1
        if hy < 0 {
            z = ONE / z;
        }
        if hx < 0 {
            if (ix.wrapping_sub(0x3ff00000) | yisint) == 0 {
                z = f64::NAN; // (-1)**non-int is NaN
            } else if yisint == 1 {
                z = -z;
            }
        }
        return z;
    }

    let mut n: i32 = (hx >> 31) + 1;

    // (x<0)**(non-int) is NaN
    if (n | yisint) == 0 {
        return f64::NAN;
    }

    let mut s = ONE; // sign of result: -1 for (-ve)**(odd int)
    if (n | (yisint - 1)) == 0 {
        s = -ONE;
    }

    let t1: f64;
    let t2: f64;
    if iy > 0x41e00000 {
        // |y| > 2**31
        if iy > 0x43f00000 {
            if ix <= 0x3fefffff {
                return if hy < 0 { HUGE * HUGE } else { TINY * TINY };
            }
            if ix >= 0x3ff00000 {
                return if hy > 0 { HUGE * HUGE } else { TINY * TINY };
            }
        }
        if ix < 0x3fefffff {
            return if hy < 0 {
                s * HUGE * HUGE
            } else {
                s * TINY * TINY
            };
        }
        if ix > 0x3ff00000 {
            return if hy > 0 {
                s * HUGE * HUGE
            } else {
                s * TINY * TINY
            };
        }
        let t = ax - ONE;
        let w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
        let u = IVLN2_H * t;
        let v = t * IVLN2_L - w * IVLN2;
        t1 = with_lo(u + v, 0);
        t2 = v - (t1 - u);
    } else {
        n = 0;
        if ix < 0x00100000 {
            ax *= TWO53;
            n -= 53;
            ix = hi(ax);
        }
        n += (ix >> 20) - 0x3ff;
        let j = ix & 0x000fffff;
        ix = j | 0x3ff00000;
        let k: usize;
        if j <= 0x3988E {
            k = 0;
        } else if j < 0xBB67A {
            k = 1;
        } else {
            k = 0;
            n += 1;
            ix -= 0x00100000;
        }
        ax = with_hi(ax, ix);

        let u = ax - BP[k];
        let v = ONE / (ax + BP[k]);
        let ss = u * v;
        let s_h = with_lo(ss, 0);
        let mut t_h = with_hi(
            ZERO,
            ((ix >> 1) | 0x20000000) + 0x00080000 + ((k as i32) << 18),
        );
        let t_l = ax - (t_h - BP[k]);
        let s_l = v * ((u - s_h * t_h) - s_h * t_l);
        let mut s2 = ss * ss;
        let mut r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
        r += s_l * (s_h + ss);
        s2 = s_h * s_h;
        t_h = with_lo(3.0 + s2 + r, 0);
        let t_l = r - ((t_h - 3.0) - s2);
        let u = s_h * t_h;
        let v = s_l * t_h + t_l * ss;
        let p_h = with_lo(u + v, 0);
        let p_l = v - (p_h - u);
        let z_h = CP_H * p_h;
        let z_l = CP_L * p_h + p_l * CP + DP_L[k];
        let t = n as f64;
        t1 = with_lo(((z_h + z_l) + DP_H[k]) + t, 0);
        t2 = z_l - (((t1 - t) - DP_H[k]) - z_h);
    }

    // split y into y1+y2 and compute (y1+y2)*(t1+t2)
    let y1 = with_lo(y, 0);
    let p_l = (y - y1) * t1 + y * t2;
    let mut p_h = y1 * t1;
    let mut z = p_l + p_h;
    let j = hi(z);
    let i = lo(z) as i32;
    if j >= 0x40900000 {
        // z >= 1024
        if (j.wrapping_sub(0x40900000) | i) != 0 || p_l + OVT > z - p_h {
            return s * HUGE * HUGE;
        }
    } else if (j & 0x7fffffff) >= 0x4090cc00 {
        // z <= -1075
        if (j.wrapping_sub(0xc090cc00u32 as i32) | i) != 0 || p_l <= z - p_h {
            return s * TINY * TINY;
        }
    }

    // compute 2**(p_h+p_l)
    let i = j & 0x7fffffff;
    let mut k = (i >> 20) - 0x3ff;
    let mut n: i32 = 0;
    if i > 0x3fe00000 {
        // |z| > 0.5: n = [z+0.5]
        n = j.wrapping_add(0x00100000 >> (k + 1));
        k = ((n & 0x7fffffff) >> 20) - 0x3ff;
        let t = with_hi(ZERO, n & !(0x000fffff >> k));
        n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
        if j < 0 {
            n = -n;
        }
        p_h -= t;
    }
    let t = with_lo(p_l + p_h, 0);
    let u = t * LG2_H;
    let v = (p_l - (t - p_h)) * LG2 + t * LG2_L;
    z = u + v;
    let w = v - (z - u);
    let t = z * z;
    let t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    let r = (z * t1) / ((t1 - TWO) - (w + z * w));
    z = ONE - (r - z);
    let j = hi(z).wrapping_add(((n as u32) << 20) as i32);
    if (j >> 20) <= 0 {
        z = libm::scalbn(z, n); // subnormal output; scalbn is exact
    } else {
        z = with_hi(z, j);
    }
    s * z
}

/// `Math.exp`.
#[inline]
pub fn exp(x: f64) -> f64 {
    libm::exp(x)
}

/// `Math.sqrt`: IEEE-754 requires the correctly rounded result everywhere, so the hardware instruction is exact.
#[inline]
pub fn sqrt(x: f64) -> f64 {
    x.sqrt()
}

/// `Math.round`: the nearest integer, halves rounded towards +∞ (so `round(-0.5)` is `-0`). Computed as V8 does, from
/// the ceiling, which avoids `floor(x + 0.5)`'s error at 0.49999999999999994.
#[inline]
pub fn round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let up = x.ceil();
    if up - 0.5 > x {
        up - 1.0
    } else {
        up
    }
}

/// `Math.min(a, b)`: NaN if either is NaN; `-0` below `+0`.
#[inline]
pub fn min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        // Only ±0 compare equal with different bits; -0 is the smaller.
        return if a.is_sign_negative() { a } else { b };
    }
    if a < b {
        a
    } else {
        b
    }
}

/// `Math.max(a, b)`: NaN if either is NaN; `+0` above `-0`.
#[inline]
pub fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        return if a.is_sign_positive() { a } else { b };
    }
    if a > b {
        a
    } else {
        b
    }
}

/// `Math.fround`: a double rounded to the nearest single, as storing into a `Float32Array` does.
#[inline]
pub fn fround(x: f64) -> f64 {
    x as f32 as f64
}

/// `Math.hypot` over any number of arguments, as V8's Torque builtin computes it: NaN only when no argument is
/// infinite, then each value divided by the largest and squared with Kahan-compensated summation, square-rooted and
/// scaled back. It is not `sqrt(x² + y²)`, so ports call this.
pub fn hypot_n(values: &[f64]) -> f64 {
    let mut max = 0.0f64;
    let mut one_is_nan = false;
    for &v in values {
        if v.is_nan() {
            one_is_nan = true;
        } else {
            let a = v.abs();
            if a > max {
                max = a;
            }
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if one_is_nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0f64;
    let mut compensation = 0.0f64;
    for &v in values {
        let n = v.abs() / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}

/// `Math.hypot(x, y)`.
#[inline]
pub fn hypot(x: f64, y: f64) -> f64 {
    hypot_n(&[x, y])
}

/// `Math.atan2(y, x)`.
#[inline]
pub fn atan2(y: f64, x: f64) -> f64 {
    crate::fdlibm::atan2(y, x)
}

/// `Math.sin`.
#[inline]
pub fn sin(x: f64) -> f64 {
    crate::fdlibm::sin(x)
}

/// `Math.cos`.
#[inline]
pub fn cos(x: f64) -> f64 {
    crate::fdlibm::cos(x)
}

/// `Math.log`.
#[inline]
pub fn log(x: f64) -> f64 {
    crate::fdlibm::log(x)
}

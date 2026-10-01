//! The centre of a chart, marked on the printed outputs (G-083): a black triangle on each ruler where the middle line meets
//! it, and a heavy frame round the central stitch, or the central 2 × 2 block of an even-sided chart.

/// The stitches the centre frame goes round, as `(x0, y0, x1, y1)` with the end exclusive. One stitch on an odd side, two on
/// an even one.
pub fn centre_block(width: usize, height: usize) -> (usize, usize, usize, usize) {
    (
        (width - 1) / 2,
        (height - 1) / 2,
        width / 2 + 1,
        height / 2 + 1,
    )
}

/// The width of the frame: heavy beside the grid lines (never under 3 pixels), in proportion to the stitch.
pub fn frame_width(cell: f64) -> f64 {
    (cell * 0.16).round().max(3.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_block_is_one_stitch_on_an_odd_side_and_two_on_an_even_one() {
        assert_eq!(centre_block(5, 5), (2, 2, 3, 3));
        assert_eq!(centre_block(6, 6), (2, 2, 4, 4));
        assert_eq!(centre_block(7, 4), (3, 1, 4, 3));
        assert_eq!(centre_block(1, 1), (0, 0, 1, 1));
        assert_eq!(centre_block(2, 2), (0, 0, 2, 2));
    }
}

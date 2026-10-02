# D268 · Traced lines are corner-to-corner stitches of three cells at most
Date: 2026-10-02 · Goal: G-084 · Status: active (the procedure superseded by: D272)
Context: the skeleton of a line is a path of fractions of a cell; backstitch joins grid corners.
Decision: a path is smoothed, simplified to within 0.8 cell, snapped to corners by one-cell steps (horizontal, vertical, diagonal) along the straight line between its vertices, and straight runs are merged into stitches of up to three cells.
Force: judgment — the model allows any two corners, but long slanted stitches are not how backstitch is worked, and the numbers (0.8, three) are read from pictures, not compelled.
Rejected: long arbitrary segments between simplified vertices (loose, slanted stitches); no simplification (a staircase ladder from skeleton noise, seen on 30-degree spokes).
Consequence: a line's length in the legend is its stitched length, a little over the straight distance.
Evidence: rust/cs-core/src/lines.rs (`a_straight_slanted_line_is_one_clean_staircase_not_a_ladder`)

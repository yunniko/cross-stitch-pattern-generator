/**
 * Wraps a 2D context so every straight single-segment stroke is drawn as the filled rectangle it covers: butt caps,
 * `lineWidth` wide, in the stroke colour, with half-pixel edges at 50% alpha instead of anti-aliasing. The frozen
 * pre-G-036 renderer draws its grid lines as such strokes, so drawing it through this wrapper gives the on-screen
 * reference with grid lines as filled rectangles (D135) without editing it.
 */
export function rectGridContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  let path: Array<[number, number]> = [];
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop === "beginPath") {
        return () => {
          path = [];
          target.beginPath();
        };
      }
      if (prop === "moveTo" || prop === "lineTo") {
        return (x: number, y: number) => {
          path.push([x, y]);
          target[prop](x, y);
        };
      }
      if (prop === "stroke") {
        return () => {
          const [a, b] = path;
          if (path.length !== 2 || (a[0] !== b[0] && a[1] !== b[1])) {
            target.stroke();
            return;
          }
          // Whole pixels opaque; an odd width's half pixel on each side at 50% alpha, with no anti-aliasing (D135).
          const w = target.lineWidth;
          const vertical = a[0] === b[0];
          const centre = vertical ? a[0] : a[1];
          const from = vertical ? Math.min(a[1], b[1]) : Math.min(a[0], b[0]);
          const length = vertical ? Math.abs(b[1] - a[1]) : Math.abs(b[0] - a[0]);
          const rect = (at: number, size: number) => (vertical ? target.fillRect(at, from, size, length) : target.fillRect(from, at, length, size));
          const fill = target.fillStyle;
          const alpha = target.globalAlpha;
          target.fillStyle = target.strokeStyle;
          if (w % 2 === 0) {
            rect(centre - w / 2, w);
          } else {
            if (w > 1) rect(centre - (w - 1) / 2, w - 1);
            target.globalAlpha = alpha * 0.5;
            rect(centre - (w + 1) / 2, 1);
            rect(centre + (w - 1) / 2, 1);
            target.globalAlpha = alpha;
          }
          target.fillStyle = fill;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
  });
}

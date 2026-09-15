/**
 * Wraps a 2D context so every straight single-segment stroke is drawn as the filled rectangle it covers (butt caps,
 * `lineWidth` wide, in the stroke colour). The frozen pre-G-036 renderer draws grid lines that way, so drawing it
 * through this wrapper gives the on-screen reference with grid lines as filled rectangles (D135) without editing it.
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
          const w = target.lineWidth;
          const fill = target.fillStyle;
          target.fillStyle = target.strokeStyle;
          if (a[0] === b[0]) target.fillRect(a[0] - w / 2, Math.min(a[1], b[1]), w, Math.abs(b[1] - a[1]));
          else target.fillRect(Math.min(a[0], b[0]), a[1] - w / 2, Math.abs(b[0] - a[0]), w);
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

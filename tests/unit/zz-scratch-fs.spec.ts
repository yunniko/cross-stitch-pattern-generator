import { test } from "vitest";
import { ditherToPalette } from "../../lib/pipeline/dither";
import { rgbToOklab } from "../../lib/color/color";

const pal: [number, number, number][] = [[20,20,20],[235,235,235],[200,30,30],[30,140,40],[40,60,200],[130,130,130]];
const po = pal.map((p) => rgbToOklab(p as any));
function nearest(l: number, a: number, b: number) {
  let best = 0, bd = Infinity;
  po.forEach((p, c) => { const d = (l-p[0])**2+(a-p[1])**2+(b-p[2])**2; if (d < bd) { bd = d; best = c; } });
  return best;
}
// FS with optional error clamp, same kernel/scan as production
function fs(cell: Float64Array, w: number, h: number, clamp: number) {
  const work = Float64Array.from(cell), lab = new Uint8Array(w*h); let maxDrift = 0;
  for (let y = 0; y < h; y++) { const ltr = y % 2 === 0;
    for (let s = 0; s < w; s++) { const x = ltr ? s : w-1-s, o = (y*w+x)*3;
      const k = nearest(work[o], work[o+1], work[o+2]); lab[y*w+x] = k;
      maxDrift = Math.max(maxDrift, Math.hypot(work[o]-cell[o], work[o+1]-cell[o+1], work[o+2]-cell[o+2]));
      let e = [work[o]-po[k][0], work[o+1]-po[k][1], work[o+2]-po[k][2]];
      const m = Math.hypot(...e); if (clamp && m > clamp) e = e.map((v) => v*clamp/m);
      const ah = ltr ? 1 : -1;
      for (const [dx,dy,wt] of [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]]) {
        const nx = x+ah*dx, ny = y+dy; if (nx<0||nx>=w||ny>=h) continue;
        const n = (ny*w+nx)*3; work[n]+=e[0]*wt; work[n+1]+=e[1]*wt; work[n+2]+=e[2]*wt; } } }
  return { lab, maxDrift };
}
function flatFrac(lab: Uint8Array, w: number, h: number) { // cells whose 5x5 window is one thread
  let f = 0, n = 0;
  for (let y = 2; y < h-2; y++) for (let x = 2; x < w-2; x++) { n++; let same = true;
    for (let j=-2;j<=2&&same;j++) for (let i=-2;i<=2;i++) if (lab[(y+j)*w+x+i]!==lab[y*w+x]) { same=false; break; }
    if (same) f++; }
  return (f/n*100).toFixed(1)+"%";
}
const cases: Record<string, (t: number) => [number,number,number]> = {
  "gray ramp (in palette hull)": (t) => [20+215*t,20+215*t,20+215*t],
  "orange->yellow (outside hull)": (t) => [240, 120+100*t, 20],
  "teal (outside hull)": () => [0, 170, 160],
  "pale pink (near light, off-axis)": () => [240, 215, 220],
};
test("fs", () => {
  const w = 80, h = 80;
  for (const [name, f] of Object.entries(cases)) {
    const cell = new Float64Array(w*h*3);
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) { const [l,a,b] = rgbToOklab(f(y/(h-1)) as any); const o=(y*w+x)*3; cell[o]=l;cell[o+1]=a;cell[o+2]=b; }
    const prod = ditherToPalette(cell, w, h, pal as any, "floyd-steinberg");
    const a = fs(cell, w, h, 0), c = fs(cell, w, h, 0.25);
    const same = a.lab.every((v,i)=>v===prod[i]);
    console.log(name.padEnd(36), "matches prod:", same, "| flat5x5 unclamped", flatFrac(a.lab,w,h), "clamped", flatFrac(c.lab,w,h), "| max drift", a.maxDrift.toFixed(2), "->", c.maxDrift.toFixed(2));
  }
});

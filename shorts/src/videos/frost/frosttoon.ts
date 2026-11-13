// Frost short drawings on top of toon.ts (same Pen, plum ink, painted crescents, no outline on the world side):
// the elephant, the printing press, the sheep on its spit, the swing boat, a duck, skittles, the crack racing over the
// ice, drips, snowflakes, coins. Wide cards use a 1500 x 1000 design space with the ground at y = 975 (cast.ts WIDE).
import { Pen, INK, mul, shade, mix, bodyFront, Outfit, Expr } from "./toon";

type P2 = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const SH: [number, number, number] = [0.66, 0.68, 0.78];
/** canvas angle the key light comes FROM (cast.ts light2D); thick ink away from it */
const thickOf = (light: number) => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light));
const ellP = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, n = 48): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) { const a = rad(a0 + ((a1 - a0) * i) / n); out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
};
const filled = (p: Pen, pts: P2[], col: string, light: number, R: number, ow = 9) => {
  p.shadedFill(pts, col, mul(col, SH), light, R, 0.4);
  p.inkRing(pts, ow, thickOf(light));
};

// ---------------- the elephant (side view facing screen-right), 1500 x 1000 ----------------
export type ElephantExpr = "happy" | "smug" | "neutral";
export const elephant = (p: Pen, phase: number, expr: ElephantExpr, blink: number, light: number, walking = true) => {
  const G = "#a3a8b4", G2 = "#8e93a0", TOE = "#efe3c8";
  const legs: [number, number, boolean][] = [[430, 0.5, false], [890, 0.0, false], [500, 0.0, true], [960, 0.5, true]]; // x, phase offset, near
  const leg = (x: number, off: number, near: boolean) => {
    const c = (((phase + off) % 1) + 1) % 1, up = walking ? Math.max(0, Math.sin(2 * Math.PI * c)) * 34 : 0, dx = walking ? 26 * Math.cos(2 * Math.PI * c) : 0;
    const col = near ? G : G2;
    const pts: P2[] = [[x - 56, 640], [x + 56, 640], [x + 52 + dx, 960 - up], [x - 52 + dx, 960 - up]];
    p.gradFill(pts, col, mul(col, SH), light); p.poly(pts, null, near ? 9 : 8);
    p.ell(x + dx, 962 - up, 56, 14, col, near ? 9 : 8, 0, 180);
    for (const t of [-30, 0, 30]) p.ell(x + dx + t, 958 - up, 10, 7, TOE, 3);
  };
  for (const [x, o, n] of legs) if (!n) leg(x, o, n);
  // tail
  p.stroke([[262, 520], [232, 600], [240, 680]], 10, INK); p.stroke([[262, 520], [232, 600], [240, 680]], 5, G2);
  p.poly([[226, 676], [254, 676], [248, 720], [232, 720]], "#4b4450", 4);
  // body + blanket
  const body = ellP(640, 560, 400, 255);
  filled(p, body, G, light, 400, 12);
  p.clip(body, () => {
    p.poly([[430, 300], [840, 300], [860, 610], [410, 610]], "#c4473b", 0);
    p.band([[410, 600], [860, 600]], "#e8c45a", 22, 3);
    p.band([[440, 310], [450, 600]], "#e8c45a", 12, 2); p.band([[830, 310], [840, 600]], "#e8c45a", 12, 2);
  });
  p.inkRing(body, 12, thickOf(light));
  for (let i = 0; i < 6; i++) { const x = 425 + i * 86; p.stroke([[x, 612], [x, 650]], 3, "#e8c45a"); p.ell(x, 656, 7, 9, "#e8c45a", 3); }
  for (const [x, o, n] of legs) if (n) leg(x, o, n);
  // head, trunk, ear, tusk, eye
  const swing = walking ? 10 * Math.sin(2 * Math.PI * phase) : 4;
  const trunk: P2[] = [[1110, 520], [1205, 610 + swing * 0.3], [1225, 760 + swing], [1200, 880 + swing], [1240, 905 + swing]];
  p.line(trunk, G, 62, false); p.stroke(trunk, 74, INK); p.line(trunk, G, 58, false);
  for (let i = 1; i < 6; i++) { const y = 640 + i * 42 + swing * (i / 6); p.arc(1218, y, 22, 6, 200, 340, 3, mix(G, INK, 0.45)); }
  const head = ellP(1040, 440, 175, 185);
  filled(p, head, G, light, 180, 12);
  p.poly([[1150, 560], [1215, 590], [1166, 600]], "#f6efe0", 4); // tusk
  const ear = ellP(920, 455, 125, 170);
  filled(p, ear, G2, light, 150, 9);
  p.arc(920, 470, 70, 110, 120, 240, 4, mix(G2, INK, 0.4));
  const ex = 1078, ey = 400;
  if (blink >= 1) p.stroke([[ex - 16, ey], [ex + 16, ey]], 8);
  else if (expr === "smug" || blink > 0) { p.ell(ex, ey, 14, 11, INK, 0, 0, 180); p.stroke([[ex - 18, ey], [ex + 18, ey]], 8); }
  else if (expr === "happy") p.arc(ex, ey + 6, 16, 12, 200, 340, 8);
  else p.ell(ex, ey, 9, 13, INK, 0);
  p.stroke([[ex - 22, ey - 34 + (expr === "smug" ? 6 : 0)], [ex + 18, ey - 40]], 8);
  if (expr !== "neutral") p.arc(1120, 520, 30, 16, 20, 150, 7); // the corner of a smile under the trunk root
  // headdress: a small gold cap with a tassel
  p.poly([[985, 270], [1080, 262], [1070, 300], [995, 306]], "#c4473b", 6);
  p.dot(1030, 255, 12, "#e8c45a");
};

// ---------------- the printing press (front-ish), 600 x 1000 body card ----------------
/** k: lever 0 (up) .. 1 (pulled down) */
export const press = (p: Pen, k: number, light: number) => {
  const W = "#9a6a3e", Wd = "#7a4b2a";
  for (const x of [150, 450]) { const pts: P2[] = [[x - 26, 260], [x + 26, 260], [x + 26, 975], [x - 26, 975]]; p.gradFill(pts, W, mul(W, SH), light); p.poly(pts, null, 8); }
  const top: P2[] = [[110, 230], [490, 230], [490, 300], [110, 300]]; p.gradFill(top, Wd, mul(Wd, SH), light); p.poly(top, null, 8);
  p.poly([[285, 300], [315, 300], [315, 470 + 40 * k], [285, 470 + 40 * k]], "#6d7280", 6); // screw
  for (let i = 0; i < 5; i++) p.stroke([[285, 320 + i * 30 + 8 * k], [315, 330 + i * 30 + 8 * k]], 3, "#3a3d47");
  const pl: P2[] = [[200, 470 + 40 * k], [400, 470 + 40 * k], [400, 520 + 40 * k], [200, 520 + 40 * k]]; p.gradFill(pl, "#c9ccd2", mul("#c9ccd2", SH), light); p.poly(pl, null, 7);
  const bed: P2[] = [[90, 600], [510, 600], [510, 660], [90, 660]]; p.gradFill(bed, Wd, mul(Wd, SH), light); p.poly(bed, null, 8);
  p.poly([[210, 580], [390, 580], [390, 600], [210, 600]], "#f7f1e1", 4); // paper on the forme
  const ang = rad(-35 + 70 * k), L = 230, hx = 315 + Math.cos(ang) * L, hy = 400 + Math.sin(ang) * L;
  p.band([[315, 400], [hx, hy]], "#3a3d47", 16, 4, "round");
  p.dot(hx, hy, 16, Wd);
  const legsT: P2[] = [[110, 660], [490, 660], [470, 975], [130, 975]]; p.gradFill(legsT, mix(Wd, "#000000", 0.1), mul(Wd, SH), light); p.poly(legsT, null, 8);
};

// ---------------- the sheep on its spit over the fire, 1500 x 1000 ----------------
export const roast = (p: Pen, flick: number, light: number, sliced = 0) => {
  const W = "#7a4b2a";
  for (const x of [230, 1270]) {
    p.band([[x, 975], [x, 470]], W, 26, 6, "round");
    p.band([[x, 470], [x - 50, 400]], W, 20, 5, "round"); p.band([[x, 470], [x + 50, 400]], W, 20, 5, "round");
  }
  // fire: logs + flames (flick 0..1 picks the flame shape)
  for (const [x0, x1, y] of [[560, 940, 955], [600, 900, 925], [640, 880, 940]] as const) p.band([[x0, y], [x1, y - 10]], "#6e4b33", 30, 5, "round");
  const fl = (cx: number, h: number, w: number, c: string, ph: number) => {
    const s = Math.sin((flick + ph) * Math.PI * 2);
    p.poly([[cx - w, 935], [cx - w * 0.6, 935 - h * 0.45], [cx + 8 * s, 935 - h], [cx + w * 0.6, 935 - h * 0.5 + 10 * s], [cx + w, 935]], c, 6);
  };
  fl(680, 210, 70, "#f08a2c", 0); fl(800, 260, 85, "#f08a2c", 0.3); fl(900, 190, 60, "#f08a2c", 0.6);
  fl(740, 150, 45, "#fbd35a", 0.2); fl(840, 180, 50, "#fbd35a", 0.5);
  // spit and the sheep (roasted brown, woolly outline), the cut side shows when sliced
  p.band([[150, 452], [1350, 452]], "#6d7280", 12, 4, "round");
  p.band([[1340, 452], [1385, 500]], "#6d7280", 10, 3, "round");
  const body = ellP(760, 470, 300, 120, 0, 360, 64).map(([x, y], i) => [x + 9 * Math.cos(i * 1.3), y + 9 * Math.sin(i * 1.7)] as P2);
  filled(p, body, "#b5713c", light, 300, 11);
  if (sliced > 0) p.ell(1010, 470, 34 * sliced, 80 * sliced, "#e9a07a", 5);
  for (const [x, dy] of [[600, -1], [700, 1], [820, -1], [920, 1]] as const) p.band([[x, 470 + dy * 80], [x + 40, 470 + dy * 140]], "#9a5e33", 18, 4, "round");
  const head = ellP(470, 440, 70, 55);
  filled(p, head, "#a8663a", light, 70, 9);
  p.stroke([[440, 432], [462, 432]], 6); // closed eye (deadpan)
};

// ---------------- the swing boat (pivot at design (500, 20)), 1000 x 1400 ----------------
export const swingBoat = (p: Pen, riders: [Outfit, Expr][], light: number, blink: number) => {
  const g = p.g;
  p.line([[500, 20], [190, 1170]], "#6d7280", 14); p.line([[500, 20], [810, 1170]], "#6d7280", 14);
  riders.forEach(([o, e], i) => {
    g.save(); g.translate(i ? 560 : 170, 830); g.scale(0.55, 0.55);
    bodyFront(new Pen(g), o, { mode: "sit", expr: e, light, seed: 11 + i * 4, blink, facing: i ? -1 : 1, wave: i ? 0.6 : undefined });
    g.restore();
  });
  const hull: P2[] = [[110, 1150], [890, 1150], [830, 1330], [170, 1330]];
  p.gradFill(hull, "#c4473b", mul("#c4473b", SH), light); p.inkRing(hull, 10, thickOf(light));
  p.band([[120, 1180], [880, 1180]], "#e8c45a", 18, 4);
  for (const x of [300, 500, 700]) p.dot(x, 1250, 14, "#e8c45a");
};

// ---------------- small things (fx cards) ----------------
export const duck = (p: Pen, look: number, blink: number) => { // 320 x 260, side view, floating
  const body = ellP(160, 170, 110, 60);
  p.shadedFill(body, "#7a5a3c", "#5a4230", -2.1, 110); p.inkRing(body, 7, 0.6);
  p.poly([[60, 150], [30, 120], [70, 140]], "#5a4230", 5);
  const head = ellP(235, 105, 50, 46);
  p.shadedFill(head, "#2f7a4f", "#22593a", -2.1, 50); p.inkRing(head, 7, 0.6);
  p.poly([[275, 110], [318, 118 + look * 8], [276, 128]], "#f0a830", 5);
  p.band([[200, 140], [262, 142]], "#f4f1ea", 8, 2);
  if (blink >= 1) p.stroke([[238, 98 + look * 3], [254, 98 + look * 3]], 5);
  else p.ell(246, 98 + look * 4, 6, 7, INK, 0);
};
export const pin = (p: Pen) => { // 120 x 300
  const pts: P2[] = [[60, 12], [82, 40], [74, 92], [96, 190], [88, 286], [32, 286], [24, 190], [46, 92], [38, 40]];
  p.poly(pts, "#f4f1ea", 7);
  p.band([[44, 100], [76, 100]], "#c4473b", 10, 2); p.band([[42, 122], [78, 122]], "#c4473b", 10, 2);
};
export const ball = (p: Pen) => { p.ell(100, 100, 86, 86, "#3a3046", 8); p.ell(70, 64, 22, 16, "#5a5068", 0); };
export const coin = (p: Pen, spin: number) => { const w = Math.max(0.15, Math.abs(Math.cos(spin * Math.PI * 2))); p.ell(100, 100, 80 * w, 80, "#e8c45a", 8); if (w > 0.4) p.ell(100, 100, 46 * w, 46, null, 4); };
export const paperCard = (p: Pen) => { p.poly([[20, 20], [280, 20], [280, 190], [20, 190]], "#f7f1e1", 8); for (let i = 0; i < 3; i++) p.stroke([[60, 70 + i * 40], [240 - i * 50, 70 + i * 40]], 10, "#3a3046"); };
export const drip = (p: Pen) => { p.poly([[50, 10], [78, 70], [72, 100], [50, 112], [28, 100], [22, 70]], "#bfe3ff", 6); p.ell(42, 82, 8, 12, "#ffffff", 0); };
export const flake = (p: Pen) => { p.g.fillStyle = "rgba(255,255,255,0.95)"; p.g.beginPath(); p.g.arc(32, 32, 26, 0, Math.PI * 2); p.g.fill(); };
export const dust = (p: Pen, u: number) => { // 600 x 400 rolling dust cloud, u 0..1
  const a = 1 - u;
  for (let i = 0; i < 7; i++) { const x = 120 + i * 60 + 40 * u * (i - 3), y = 260 - 80 * u - (i % 2) * 40; p.ell(x, y, 70 + 60 * u, 55 + 40 * u, mix("#d8cbb5", "#ffffff", 0.3 * u), 0); }
  p.g.globalCompositeOperation = "destination-in"; p.g.fillStyle = `rgba(0,0,0,${0.9 * a})`; p.g.fillRect(0, 0, 600, 400); p.g.globalCompositeOperation = "source-over";
};
/** the crack racing over the ice: floe edges (world x/z) drawn out to radius u around (ox, oz) on a 2048 x 1024 canvas
 *  that covers the rect r (x across the canvas width, z down its height) */
export const crack = (p: Pen, edges: [number, number, number, number][], r: { x0: number; x1: number; z0: number; z1: number }, ox: number, oz: number, reach: number) => {
  const sx = 2048 / (r.x1 - r.x0), sz = 1024 / (r.z1 - r.z0), g = p.g;
  g.lineCap = "round"; g.lineJoin = "round";
  for (const [x0, z0, x1, z1] of edges) {
    const d0 = Math.hypot(x0 - ox, z0 - oz), d1 = Math.hypot(x1 - ox, z1 - oz);
    if (Math.min(d0, d1) > reach) continue;
    let ax = x0, az = z0, bx = x1, bz = z1;
    if (d0 > d1) { [ax, az, bx, bz] = [x1, z1, x0, z0]; }
    const dA = Math.min(d0, d1), dB = Math.max(d0, d1), k = dB <= reach ? 1 : (reach - dA) / Math.max(0.01, dB - dA);
    const ex = ax + (bx - ax) * k, ez = az + (bz - az) * k;
    const P = (x: number, z: number): [number, number] => [(x - r.x0) * sx, (z - r.z0) * sz];
    const [a1, a2] = P(ax, az), [b1, b2] = P(ex, ez);
    g.strokeStyle = "rgba(36,23,38,0.9)"; g.lineWidth = 7; g.beginPath(); g.moveTo(a1, a2); g.lineTo(b1, b2); g.stroke();
    g.strokeStyle = "rgba(235,248,255,0.9)"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(a1 + 3, a2 + 3); g.lineTo(b1 + 3, b2 + 3); g.stroke();
  }
};
export { shade };

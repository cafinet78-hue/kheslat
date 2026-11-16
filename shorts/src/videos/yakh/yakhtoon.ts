// Yakhchal short drawings on top of toon.ts: the goat (whose hair went into the sarooj), heat rising from the pool to
// the night sky, a thermometer just above zero, sweat drops, ice chips. Same Pen, plum ink, painted crescents.
import { Pen, INK, mul, mix } from "./toon";

type P2 = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const SH: [number, number, number] = [0.66, 0.68, 0.78];
const ellP = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, n = 48): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) { const a = rad(a0 + ((a1 - a0) * i) / n); out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
};
const thickOf = (light: number) => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light));
const filled = (p: Pen, pts: P2[], col: string, light: number, R: number, ow = 8) => { p.shadedFill(pts, col, mul(col, SH), light, R, 0.4); p.inkRing(pts, ow, thickOf(light)); };

/** goat, side view facing screen-right, on a 600 x 1000 body card (ground at y = 975); bald = the shaved patch;
 *  expr: "calm" | "shock" | "nervous" */
export const goat = (p: Pen, phase: number, expr: string, blink: number, light: number, bald: boolean) => {
  const G = "#efe6d6", G2 = "#d9cdb8";
  const leg = (x: number, near: boolean, off: number) => {
    const sw = 10 * Math.sin(2 * Math.PI * (phase + off));
    p.band([[x, 790], [x + sw, 960]], near ? G : G2, 22, 5, "round");
    p.ell(x + sw + 4, 962, 16, 9, "#3a3046", 4);
  };
  leg(170, false, 0.5); leg(380, false, 0);
  const body = ellP(280, 700, 190, 115, 0, 360, 64).map(([x, y], i) => [x + 7 * Math.cos(i * 1.7), y + 7 * Math.sin(i * 2.3)] as P2);
  filled(p, body, G, light, 190, 9);
  if (bald) { p.ell(250, 690, 70, 45, "#f2c8b2", 4); p.stroke([[215, 675], [235, 668]], 3, "#d79b86"); }
  leg(210, true, 0); leg(410, true, 0.5);
  p.stroke([[95, 650], [70, 610]], 12, INK); p.stroke([[95, 650], [70, 610]], 6, G2); // tail
  // neck + head
  p.poly([[410, 640], [470, 520], [520, 545], [470, 680]], G, 8);
  const head = ellP(505, 500, 70, 52, 0, 360);
  filled(p, head, G, light, 70, 8);
  p.poly([[470, 455], [440, 380], [462, 375], [492, 450]], "#9a8a72", 6); // horns
  p.poly([[505, 452], [495, 385], [518, 382], [524, 450]], "#9a8a72", 6);
  p.poly([[455, 490], [400, 470], [420, 505]], G2, 6); // ear
  p.poly([[540, 548], [548, 600], [528, 600]], "#cfc2aa", 4); // beard
  const ex = 525, ey = 488;
  if (blink >= 1) p.stroke([[ex - 12, ey], [ex + 12, ey]], 6);
  else if (expr === "shock") { p.ell(ex, ey, 16, 16, "#ffffff", 4); p.dot(ex + 4, ey + 2, 6); p.ell(560, 528, 10, 12, "#5a1e28", 4); }
  else if (expr === "nervous") { p.ell(ex, ey, 7, 9, INK, 0); p.ell(470, 430, 7, 11, "#9fd4ff", 3); p.stroke([[548, 524], [558, 530], [566, 524]], 4); }
  else { p.ell(ex, ey, 10, 4, INK, 0); p.stroke([[ex - 13, ey - 2], [ex + 13, ey - 2]], 6); p.arc(556, 518, 12, 7, 20, 150, 4); }
};

/** heat rising from the pool into the night sky: a wavy column (soft card), u = scroll phase */
export const heatWave = (p: Pen, u: number) => {
  const g = p.g;
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = `rgba(255,${190 + 20 * k},${140 + 30 * k},${0.55 - 0.12 * k})`; g.lineWidth = 16 - 4 * k; g.lineCap = "round";
    g.beginPath();
    for (let y = 980; y >= 20; y -= 10) {
      const x = 150 + 40 * Math.sin((y / 120) + u * Math.PI * 2 + k * 2.1) * (0.4 + 0.6 * (1 - y / 1000));
      if (y === 980) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  // arrow head at the top
  g.fillStyle = "rgba(255,210,170,0.7)"; g.beginPath(); g.moveTo(150, 0); g.lineTo(110, 60); g.lineTo(190, 60); g.closePath(); g.fill();
};

/** thermometer card (no numbers): the red column just above the zero tick (k 0..1 animates it settling) */
export const thermometer = (p: Pen, k: number) => {
  p.poly([[110, 40], [190, 40], [190, 860], [110, 860]], "#f4efe2", 8);
  p.ell(150, 900, 62, 62, "#d23b3b", 8);
  const zero = 600, top = zero - 40 - 50 * (1 - k);
  p.poly([[132, top], [168, top], [168, 880], [132, 880]], "#d23b3b", 0);
  for (let i = 0; i < 9; i++) p.stroke([[190, 140 + i * 80], [i === 6 ? 236 : 214, 140 + i * 80]], i === 6 ? 9 : 5);
  p.ell(150, 900, 62, 62, null, 8);
};

export const drip = (p: Pen) => { p.poly([[50, 10], [78, 70], [72, 100], [50, 112], [28, 100], [22, 70]], "#bfe3ff", 6); p.ell(42, 82, 8, 12, "#ffffff", 0); };
export const iceChip = (p: Pen, k: number) => {
  const pts: P2[] = [[40, 10 + 10 * k], [110, 30], [120, 90], [60, 120], [15, 70]];
  p.poly(pts, mix("#d6ecfa", "#ffffff", 0.3 * k), 6);
};
export { mul };

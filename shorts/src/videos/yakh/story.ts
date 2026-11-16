// Timeline of Tarikh-Khand ep. 1 "Ice in the desert" (the yakhchal): every shot, camera key, kick and lens change is
// anchored to a word of the Persian voice-over (words.ts from stories/yakhchal/voice/words.json). A new voice only
// means regenerating words.ts. Camera grammar as in the bridge / frost shorts.
import { WORDS } from "./words";

export const FPS = 30;
export const D0 = 0; // flat desert: the ground is y = 0
export type V3 = [number, number, number];

export const LEADF = 2;
export const wt = (i: number) => WORDS[Math.max(0, Math.min(i, WORDS.length - 1))][1];
export const wf = (i: number) => Math.max(0, Math.round(wt(i) * FPS) - LEADF);
export const TOTAL = Math.round((WORDS[WORDS.length - 1][2] + 1.8) * FPS);
/** word indices of stories/yakhchal/SCRIPT.md (narration section) */
export const W = {
  people: 10, ice0: 11, noPower: 13, noFridge: 15, yazd: 17, deg: 19, thirsty: 21, winter: 24, pool: 29, water: 34,
  beside: 36, wall: 39, tall: 41, only: 44, shade: 47, night1: 49, freeze: 51, morning: 53, breakIce: 57, carry: 59, dome: 62,
  tomorrow: 65, dayAfter: 68, until: 71, pit: 73, summer2: 76, outside: 79, but: 83, ice2: 86, luckily: 87, unluckily: 93,
  secret: 100, sky: 102, heat: 108, even: 117, zero: 121, like: 126, glass: 128, car: 129, cold: 143, wallDome: 145,
  sarooj: 149, ash: 155, goatHair: 157, goat: 158, meybod: 159, next: 163, fridge: 168, open: 170, oneOf: 174,
  power: 179, only2: 181, wall3: 183, sky3: 187,
} as const;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

// ---------------- places ----------------
export const DOME: V3 = [0, 0, 0];          // yakhchal: stepped mud cone, radius 10, height 17, door to the south (-z)
export const DOME_R = 10, DOME_H = 17;
export const DOOR: V3 = [0, 0, -DOME_R];
export const WALL_Z = -36.5, WALL_H = 11, WALL_X = 30; // the shade wall, east-west, south of the pools
export const POOLS = { x0: -24, x1: 24, z0: -34, z1: -22 };
export const CAR_AT: V3 = [70, 0, -70];
export const FRIDGE_AT: V3 = [12, 0, -16];
export const GOAT_AT: V3 = [-4, 0, -12.6];
export const ALLEY: V3 = [0, 0, 32];        // town alley north of the dome

// ---------------- shots ----------------
export type Light = "day" | "golden" | "night";
export type Season = "winter" | "summer";
/** pool state: dry (summer), water, freeze (ice front sweeps the pool during the shot), frozen */
export type Pool = "dry" | "water" | "freeze" | "frozen";
export type ShotDef = { id: number; a: number; b: number; light: Light; season: Season; pool: Pool };
const SHOT_LIST: [number, Light, Season, Pool][] = [
  [0, "day", "summer", "dry"],            // 1 hook: ice in the summer desert
  [W.noPower, "day", "summer", "dry"],    // 2 no power, no fridge: the dome alone in the heat
  [W.yazd, "day", "summer", "dry"],       // 3 Yazd aerial -> thirsty people
  [W.winter, "night", "winter", "water"], // 4 winter nights: filling the pools
  [W.beside, "day", "winter", "water"],   // 5 the tall wall, only for the shade
  [W.night1, "night", "winter", "freeze"],// 6 the water freezes
  [W.morning, "golden", "winter", "frozen"], // 7 dawn: break the ice, carry it to the dome
  [W.tomorrow, "night", "winter", "freeze"], // 8 next night, again
  [W.dayAfter, "golden", "winter", "frozen"],// 9 next dawn, again
  [W.until, "day", "winter", "frozen"],   // 10 inside: the pit fills up
  [W.summer2, "day", "summer", "dry"],    // 11 summer: 45 outside, ice inside
  [W.luckily, "day", "summer", "dry"],    // 12 luckily: ice all summer
  [W.unluckily, "day", "summer", "dry"],  // 13 the wall shares its shade with nobody
  [W.secret, "night", "winter", "freeze"],// 14 the clear desert sky: heat goes straight up
  [W.like, "golden", "winter", "dry"],    // 15 the frosted car windscreen
  [W.wallDome, "day", "summer", "dry"],   // 16 sarooj ... and goat hair
  [W.meybod, "golden", "summer", "dry"],  // 17 Meybod's yakhchal still stands
  [W.next, "day", "summer", "dry"],       // 18 next time you open your fridge
  [W.oneOf, "night", "summer", "dry"],    // 19 a wall ... and a sky
];
export const SHOTS: ShotDef[] = SHOT_LIST.map(([w, light, season, pool], i) => ({
  id: i + 1, a: i === 0 ? 0 : wf(w), b: i + 1 < SHOT_LIST.length ? wf(SHOT_LIST[i + 1][0]) : TOTAL, light, season, pool,
}));
export const XFADE: Record<number, number> = { 4: 10, 10: 8, 11: 8, 14: 10, 15: 8, 17: 10, 19: 12 };
export const FLASH_AT = wf(W.yazd);

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- story physics ----------------
export const T = (f: number) => f / FPS;
const S = (id: number) => SHOTS[id - 1];
/** the ice front sweeping the pools (x), from west to east over the shot */
export const iceFrontX = (id: number, t: number) => {
  const s = S(id), a = s.a / FPS, b = s.b / FPS;
  return POOLS.x0 - 3 + (POOLS.x1 - POOLS.x0 + 6) * smooth((t - a - 0.2) / Math.max(0.5, (b - a) * 0.85));
};
/** how full the pit is (shot 10): stacks rise on "again" beats */
export const pitFill = (t: number) => 0.15 + 0.85 * smooth((t - wt(W.until) + 0.3) / (wt(W.summer2) - wt(W.until)));
/** fridge door angle (shot 18), opens on "open" */
export const fridgeDoor = (t: number) => 1.9 * smooth((t - wt(W.open) + 0.25) / 0.6);
export const BREAK_T = [wt(W.breakIce) - 0.05, wt(W.breakIce) + 0.45, wt(W.dayAfter) + 0.3, wt(W.dayAfter) + 0.9];

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixCam(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const pushK = (f: number, f0: number, rate = 0.0022, punch = 0, n = 32) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const hold = (pos: V3, look: V3, f0: number, rest: Partial<Cam> = {}, rate = 0.0022, punch = 0, n = 32) =>
  (f: number) => dolly(pos, look, pushK(f, f0, rate, punch, n), rest);
const zhold = (pos: V3, look: V3, fov: number, f0: number, rest: Partial<Cam> = {}, rate = 0.002, punch = 0, n = 32) =>
  (f: number) => zoom(pos, look, fov, pushK(f, f0, rate, punch, n), rest);

export const EATER: V3 = [6, 0, -17];
const C: Record<number, Key[]> = {};
{
  const a = S(1).a, ic = wf(W.ice0);
  C[1] = [
    { f: a, s: zhold([12, 3.0, -30], [3, 4.0, -8], 42, a, {}, 0.0018) },
    { f: ic - 8, dur: 26, s: hold([EATER[0] + 1.6, 1.55, EATER[2] - 3.3], [EATER[0], 1.6, EATER[2]], ic - 8, { fov: 40, roll: -0.035 }, 0.0024) },
  ];
  const b = S(2).a, nf = wf(W.noFridge);
  C[2] = [
    { f: b, s: zhold([-58, 2.4, -6], [0, 6, -4], 44, b, {}, 0.0018) },
    { f: nf, cut: true, s: zhold([-58, 2.4, -6], [0, 7, -2], 26, nf, { roll: 0.03 }, 0.0024) },
  ];
  const c = S(3).a, th = wf(W.thirsty);
  C[3] = [
    { f: c, s: zhold([-50, 46, -20], [10, 0, 50], 46, c, {}, 0.0016) },
    { f: th, cut: true, s: hold([ALLEY[0] + 2.4, 1.6, ALLEY[2] - 5.6], [ALLEY[0], 1.45, ALLEY[2]], th, { fov: 40 }, 0.0025, 0.005, 26) },
  ];
  const d = S(4).a;
  C[4] = [{ f: d, s: hold([15, 2.4, -17.5], [0, 0.3, -25.5], d, { fov: 42 }, 0.0022) }];
  const e = S(5).a, sh = wf(W.shade);
  C[5] = [
    { f: e, s: zhold([2.5, 1.2, -20.5], [0, 2.5, -36], 42, e, {}, 0.0016) },
    { f: wf(W.tall) - 6, dur: 34, s: zhold([2.5, 1.2, -20.5], [0, 10.5, -36], 48, wf(W.tall) - 6, { roll: 0.03 }, 0.0016) },
    { f: sh, cut: true, s: zhold([16, 13, -12], [0, 0, -30], 44, sh, {}, 0.0016) },
  ];
  const g = S(6).a;
  C[6] = [{ f: g, s: hold([7, 0.95, -20.8], [-4, 0.0, -29], g, { fov: 42, roll: -0.03 }, 0.0024) }];
  const h = S(7).a, cr = wf(W.carry);
  C[7] = [
    { f: h, s: hold([6.5, 1.5, -31.5], [0, 0.8, -28], h, { fov: 40 }, 0.0026) },
    { f: cr, cut: true, s: hold([7, 1.8, -19], [0, 1.6, -11.5], cr, { fov: 42 }, 0.0022) },
  ];
  const i8 = S(8).a;
  C[8] = [{ f: i8, s: zhold([0, 8, -14], [0, 0, -30], 44, i8, {}, 0.002) }];
  const j = S(9).a;
  C[9] = [{ f: j, s: hold([-7.5, 1.6, -23.5], [0, 0.9, -28.5], j, { fov: 40, roll: 0.03 }, 0.0026) }];
  const k = S(10).a;
  C[10] = [{ f: k, s: hold([4.2, 7.2, -3.8], [0, 0.6, 1.5], k, { fov: 46 }, 0.0018) }];
  const l = S(11).a, bt = wf(W.but);
  C[11] = [
    { f: l, s: hold([2.8, 1.65, -15.4], [0, 1.6, -11], l, { fov: 40 }, 0.0024) },
    { f: bt, cut: true, s: hold([3.6, 2.6, -1.5], [0, 1.0, 3.0], bt, { fov: 44, roll: 0.03 }, 0.0024, 0.006, 26) },
  ];
  const m = S(12).a;
  C[12] = [{ f: m, s: hold([ALLEY[0] - 2.2, 1.65, ALLEY[2] - 5.4], [ALLEY[0], 1.45, ALLEY[2]], m, { fov: 40 }, 0.0024) }];
  const n = S(13).a;
  C[13] = [{ f: n, s: zhold([12, 2.2, -17.5], [4, 1.1, -22.5], 42, n, {}, 0.0018) }];
  const o = S(14).a, ev = wf(W.even);
  C[14] = [
    { f: o, s: zhold([6, 1.4, -15.5], [0, 7, -28], 52, o, {}, 0.0014) },
    { f: ev, cut: true, s: hold([5.6, 1.5, -18.6], [2.6, 1.15, -21.4], ev, { fov: 38 }, 0.0025) },
  ];
  const p = S(15).a;
  C[15] = [{ f: p, s: hold([CAR_AT[0] + 3.8, 1.55, CAR_AT[2] + 5.2], [CAR_AT[0] - 0.2, 1.15, CAR_AT[2] + 0.4], p, { fov: 40 }, 0.0024) }];
  const q = S(16).a, gh = wf(W.goatHair);
  C[16] = [
    { f: q, s: hold([3.2, 2.2, -14.6], [0, 2.8, -10.2], q, { fov: 40 }, 0.0028) },
    { f: gh, cut: true, s: hold([GOAT_AT[0] + 2.4, 1.0, GOAT_AT[2] - 2.8], [GOAT_AT[0], 0.9, GOAT_AT[2]], gh, { fov: 40, roll: -0.04 }, 0.0024, 0.006, 24) },
  ];
  const r = S(17).a;
  C[17] = [{ f: r, s: zhold([-24, 3.2, -34], [0, 7, 0], 42, r, {}, 0.0016) }];
  const s = S(18).a;
  C[18] = [{ f: s, s: hold([FRIDGE_AT[0] + 3.6, 1.75, FRIDGE_AT[2] - 4.0], [FRIDGE_AT[0], 1.25, FRIDGE_AT[2]], s, { fov: 40 }, 0.0024) }];
  const u = S(19).a;
  C[19] = [{ f: u, s: (f) => { const x = glide((f - u) / (S(19).b - u)); return { pos: [6 - 6 * x, 2.5 + 22 * x, -50 - 30 * x] as V3, look: [0, 8 + 6 * x, -6] as V3, fov: 44, roll: 0 }; } }];
}

const KICKS: [number, number][] = [...BREAK_T.map((t) => [t, 0.7] as [number, number]), [wt(W.ice2), 0.8], [wt(W.goat), 0.6]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(C[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of C[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const at = (p: V3) => () => p;
export const DOF: Dof[] = [
  { f: 0, cInf: 0 },
  { f: wf(W.ice0) - 8, dur: 26, cInf: 13, focus: at([EATER[0], 1.6, EATER[2]]) },
  { f: S(2).a, cInf: 0 },
  { f: wf(W.thirsty), cInf: 11 },
  { f: S(4).a, cInf: 9 },
  { f: S(5).a, cInf: 0 },
  { f: S(6).a, cInf: 8 },
  { f: S(7).a, cInf: 10 },
  { f: S(8).a, cInf: 0 },
  { f: S(9).a, cInf: 10 },
  { f: S(10).a, cInf: 0 },
  { f: S(11).a, cInf: 11 },
  { f: wf(W.but), cInf: 6 },
  { f: S(12).a, cInf: 11 },
  { f: S(13).a, cInf: 0 },
  { f: S(14).a, cInf: 0 },
  { f: wf(W.even), cInf: 14 },
  { f: S(15).a, cInf: 11 },
  { f: S(16).a, cInf: 9 },
  { f: wf(W.goatHair), cInf: 13, focus: at([GOAT_AT[0], 0.9, GOAT_AT[2]]) },
  { f: S(17).a, cInf: 0 },
  { f: S(18).a, cInf: 10, focus: at([FRIDGE_AT[0], 1.2, FRIDGE_AT[2]]) },
  { f: S(19).a, cInf: 0 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [];

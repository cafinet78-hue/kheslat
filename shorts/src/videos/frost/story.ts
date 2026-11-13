// Timeline of "The Bridge That Froze the Thames": every shot, camera key, impact kick and lens change is anchored to a
// word of the voice-over (words.ts, generated from stories/frost/voice/words.json). Replacing the voice only means
// regenerating words.ts; the film re-times itself. Camera grammar is the bridge short's: continuous slow push-ins,
// symmetric smootherstep glides of 18-40 f, hard cuts for big reframes, 7-frame flip kicks on impacts, 4-5 deg rolls.
import { WORDS } from "./words";

export const FPS = 30;
export const D0 = 6.0; // bank top (m); the ice / water surface is y = 0
export type V3 = [number, number, number];

// ---------------- word cues ----------------
/** reactions land 0-3 frames before their word */
export const LEADF = 2;
export const wt = (i: number) => WORDS[Math.max(0, Math.min(i, WORDS.length - 1))][1];
export const wf = (i: number) => Math.max(0, Math.round(wt(i) * FPS) - LEADF);
export const TOTAL = Math.round((WORDS[WORDS.length - 1][2] + 1.7) * FPS);
/** word indices of the script (stories/frost/SCRIPT.md); the aligner keeps the script's word list */
export const W = {
  elephant0: 5, noBridge: 10, noBoat: 12, justIce: 14, ice0: 15, that: 16, froze: 24, bank2: 28, so: 29, sensible: 33, they: 35, party: 38,
  first: 41, skaters: 44, then1: 45, gin: 48, then2: 49, swings: 50, skittles: 51, printing: 53, name: 58, card: 61, pence: 65,
  someone: 66, sheep: 70, charged: 74, watch: 78, sold: 81, shilling: 85, slice: 87,
  andThen: 88, blackfriars: 92, came: 94, elephant1: 96, four: 97, thaw: 101, theIce: 103, split: 105, tents: 107, presses: 109,
  barges: 113, sailing: 115, river2: 118, luckily: 119, elephant2: 121, side: 127, unluckily: 128, presses2: 131, not: 133,
  but: 134, bridge1: 143, old: 144, nineteen: 149, arches: 151, dam: 158, above: 159, moved: 164,
  and2: 165, still: 166, faster: 170, moving: 172, its: 174, puddle: 177, overnight: 179, stream: 182, running: 189,
  in1831: 190, opened: 193, five: 199, arches2: 201, and3: 202, pulled: 203, down: 207, theRiver: 208, sped: 210,
  and4: 212, notFrozen: 216, since: 221, so2: 222, greatest: 224, party2: 225, weather: 235, it: 236, stopped2: 238, bridgeEnd: 241,
} as const;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 3;

// ---------------- places ----------------
export const BLACKFRIARS_X = -60;   // 9 elliptical arches, upstream end of the fair
export const OLD_LB_X = 100;        // Old London Bridge: 19 narrow arches on starlings
export const NEW_LB_X = 76;         // the 1831 bridge: 5 wide arches, built just upstream of the old one
export const ELEPHANT_X = -48;      // "just below Blackfriars Bridge"
export const STAIRS_X: [number, number] = [-8, 4]; // watermen's stairs down the near quay wall (top at x0, foot at x1)
export const PARK: V3 = [70, D0, -75];
/** the fair on the ice: booths in two rows facing the lane z in [-4, 4] */
export const TENTS: { x: number; z: number; yaw: number; c: number }[] = [];
for (let i = 0; i < 9; i++) for (const s of [-1, 1]) TENTS.push({ x: -20 + i * 8 + (s > 0 ? 3 : 0), z: s * 7, yaw: s > 0 ? Math.PI : 0, c: (i * 2 + (s > 0 ? 1 : 0)) % 5 });
export const GIN_TENT = 0;          // TENTS[0]: x -20, near row
export const PRESS_AT: V3 = [28.6, 0, -4.2];
export const SWING_AT: V3 = [6, 0, -15];
export const SKITTLE_AT: V3 = [18, 0, -12.5];
export const ROAST_AT: V3 = [54, 0, 0.5];
export const ROWBOAT_AT: V3 = [-43.5, 0, -6];
export const DUCK_AT: V3 = [OLD_LB_X - 18, 0, -6.0]; // shot 16: upstream of the starlings
/** the floe field (thaw): jittered grid over the fair */
export const FLOE_RECT = { x0: -50, x1: 66, z0: -29.6, z1: 29.6 };

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type Season = "winter" | "summer";
/** frozen: the whole river is ice. thaw: ice -> floes after the split. dam: ice only upstream of Old London Bridge
 *  (front animated), rapids through the arches. open: no ice at all. */
export type Ice = "frozen" | "thaw" | "dam" | "open";
export type ShotDef = { id: number; a: number; b: number; light: Light; season: Season; ice: Ice };
const SHOT_LIST: [number, Light, Season, Ice][] = [
  [0, "day", "winter", "frozen"],            // 1 hook: the elephant on the ice
  [W.noBridge, "day", "winter", "frozen"],   // 2 no bridge / no boat / just ice
  [W.that, "day", "winter", "frozen"],       // 3 town aerial, frozen bank to bank
  [W.so, "day", "winter", "frozen"],         // 4 down the stairs -> the party pops up
  [W.first, "day", "winter", "frozen"],      // 5 skaters
  [W.then1, "day", "winter", "frozen"],      // 6 gin tent
  [W.then2, "day", "winter", "frozen"],      // 7 swings, skittles, printing press
  [W.someone, "day", "winter", "frozen"],    // 8 the sheep
  [W.andThen, "day", "winter", "frozen"],    // 9 below Blackfriars: the elephant
  [W.four, "day", "winter", "thaw"],         // 10 four days later: drip
  [W.theIce, "day", "winter", "thaw"],       // 11 the split, floes sail
  [W.luckily, "day", "winter", "thaw"],      // 12 the elephant on the other side
  [W.unluckily, "day", "winter", "thaw"],    // 13 the printer on his floe
  [W.but, "day", "winter", "dam"],           // 14 Old London Bridge reveal
  [W.old, "day", "winter", "dam"],           // 15 nineteen narrow arches, like a dam
  [W.above, "day", "winter", "dam"],         // 16 above it the water barely moved (duck)
  [W.and2, "day", "winter", "dam"],          // 17 still water freezes faster (aerial)
  [W.its, "golden", "winter", "open"],       // 18 puddle vs stream (dawn)
  [W.in1831, "day", "summer", "open"],       // 19 the new bridge opens
  [W.and3, "day", "summer", "open"],         // 20 the old one comes down
  [W.theRiver, "day", "summer", "open"],     // 21 the river sped up
  [W.and4, "day", "summer", "open"],         // 22 never froze again (sad skater)
  [W.so2, "golden", "winter", "frozen"],     // 23 the greatest party (golden crane, snow)
  [W.it, "golden", "summer", "open"],        // 24 stopped by a bridge
];
export const SHOTS: ShotDef[] = SHOT_LIST.map(([w, light, season, ice], i) => ({
  id: i + 1, a: i === 0 ? 0 : wf(w), b: i + 1 < SHOT_LIST.length ? wf(SHOT_LIST[i + 1][0]) : TOTAL, light, season, ice,
}));
/** crossfades (frames) at place / time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 10: 8, 14: 8, 18: 10, 19: 10, 23: 10 };
export const FLASH_AT = wf(W.that);

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
export const SPLIT_T = wt(W.split) - LEADF / FPS;      // the ice cracks into floes
export const CRACK_T0 = wt(W.theIce) - 0.1;            // crack lines start racing just before
export const DEMOLISH_T = wt(W.down) - LEADF / FPS;    // the old bridge's arches drop
/** ice front (x) upstream of Old London Bridge in the dam shots: still water freezes toward the bridge */
export const iceFrontX = (id: number, t: number) => {
  if (id === 14 || id === 15) return 84;
  if (id === 16) return 66 + 18 * smooth((t - wt(W.above)) / 1.9);   // reaches the duck (DUCK_AT x 82) on "moved"
  if (id === 17) return 86 + 12.5 * smooth((t - wt(W.still)) / 2.6); // up to the starlings on "faster"
  return 84;
};
/** river flow speed (m/s of the painted marks) */
export const flowAt = (id: number) => (id >= 21 && id <= 22 ? 2.4 : id === 24 || id === 19 || id === 20 ? 1.1 : 0.35);

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
/** push-in factor since f0 (0.15-0.35 %/f creep; `punch` for the first n frames, soft 8 f edges) */
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
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });
/** a dolly framing that creeps in from key frame f0 */
const hold = (pos: V3, look: V3, f0: number, rest: Partial<Cam> = {}, rate = 0.0022, punch = 0, n = 32) =>
  (f: number) => dolly(pos, look, pushK(f, f0, rate, punch, n), rest);
const zhold = (pos: V3, look: V3, fov: number, f0: number, rest: Partial<Cam> = {}, rate = 0.002, punch = 0, n = 32) =>
  (f: number) => zoom(pos, look, fov, pushK(f, f0, rate, punch, n), rest);

// ---------------- elephant + floes (shared with cast / world) ----------------
/** elephant walk across the river along +z at x = ELEPHANT_X (shots 1-2 flash-forward mid-river, 9 entering) */
export const elephantZ = (id: number, t: number) =>
  id <= 2 ? -5 + 0.75 * t : id === 9 ? -19 + 0.75 * (t - wt(W.andThen)) : 34.5;
export const E = (id: number, f: number): V3 => [ELEPHANT_X, 0, elephantZ(id, T(f))];

const C: Record<number, Key[]> = {};
const S = (id: number) => SHOTS[id - 1];
{
  // 1 hook: 3/4 front of the elephant walking toward the lens's left, Blackfriars behind; low MS on "elephant"
  const a = S(1).a, f5 = wf(W.elephant0);
  C[1] = [
    { f: a, s: (f) => { const e = E(1, f); return dolly([e[0] + 9.5, 1.7, e[2] + 6.5], [e[0] - 0.4, 2.0, e[2] + 0.6], pushK(f, a, 0.0026), { fov: 42 }); } },
    { f: f5 - 10, dur: 30, s: (f) => { const e = E(1, f); return dolly([e[0] + 6.0, 1.1, e[2] + 4.6], [e[0] - 0.2, 2.1, e[2] + 0.7], pushK(f, f5 - 10, 0.002), { fov: 40, roll: -0.04 }); } },
  ];
  // 2: "No bridge" (empty river toward Blackfriars, deadpan push), "No boat" (waterman sat in a boat frozen solid),
  // "Just ice" (boot-level across the ice as the elephant's foot lands)
  const b = S(2).a, nb = wf(W.noBoat), ji = wf(W.justIce);
  C[2] = [
    { f: b, s: (f) => { const e = E(2, f); return dolly([e[0] - 7, 1.5, e[2] + 7.5], [e[0] + 2, 1.7, e[2] - 1], pushK(f, b, 0.0028), { fov: 42 }); } }, // away from the bridges: just the elephant on open ice
    { f: nb, cut: true, s: hold([ROWBOAT_AT[0] + 3.4, 1.35, ROWBOAT_AT[2] - 3.6], [ROWBOAT_AT[0], 0.75, ROWBOAT_AT[2]], nb, { fov: 38, roll: 0.035 }, 0.003) },
    { f: ji, cut: true, s: (f) => { const e = E(2, f); return dolly([e[0] + 3.2, 0.28, e[2] + 2.6], [e[0] - 0.2, 0.35, e[2] + 0.2], pushK(f, ji, 0.0035), { fov: 40, roll: -0.04 }); } },
  ];
  // 3: aerial over the frozen river (bank to bank), glide sideways on "froze"
  const c = S(3).a, fz = wf(W.froze);
  C[3] = [
    { f: c, s: zhold([-92, 30, -52], [10, 0, 2], 44, c, {}, 0.0016) }, // down the frozen river toward Old London Bridge
    { f: fz - 12, dur: 36, s: zhold([-70, 44, -44], [16, 0, 0], 46, fz - 12, {}, 0.0016) },
  ];
  // 4: Londoners coming down the watermen's stairs ("the sensible thing"), then the fair pops up ("party")
  const d = S(4).a, th = wf(W.they);
  C[4] = [
    { f: d, s: hold([STAIRS_X[1] + 6.5, 1.6, -22.5], [STAIRS_X[0] + 5, 3.4, -28.8], d, { fov: 42 }) },
    { f: th, cut: true, s: hold([-26, 6.5, -24], [10, 0.8, 0], th, { fov: 44, roll: 0.03 }, 0.0022, 0.005, 28) },
  ];
  // 5: low on the ice, skaters gliding across the frame
  const e5 = S(5).a;
  C[5] = [{ f: e5, s: hold([-17, 0.75, -27.5], [-24, 1.05, -16], e5, { fov: 40, roll: -0.03 }, 0.0025) }];
  // 6: the gin tent
  const g = S(6).a, tg = TENTS[GIN_TENT];
  C[6] = [{ f: g, s: hold([tg.x + 2.8, 2.0, 1.6], [tg.x, 1.45, -5.6], g, { fov: 42 }, 0.0025, 0.005, 24) }];
  // 7: swing boat -> skittles (cut, kick) -> printing press
  const h = S(7).a, sk = wf(W.skittles), pr = wf(W.printing), nm = wf(W.name);
  C[7] = [
    { f: h, s: hold([SWING_AT[0] + 1.4, 2.0, SWING_AT[2] - 6.8], [SWING_AT[0], 2.3, SWING_AT[2]], h, { fov: 42 }, 0.003) }, // along z: the boat swings in x-y
    { f: sk, cut: true, s: hold([SKITTLE_AT[0] + 4.2, 0.5, SKITTLE_AT[2] - 2.6], [SKITTLE_AT[0] + 0.6, 0.45, SKITTLE_AT[2]], sk, { fov: 38, roll: 0.04 }, 0.003) },
    { f: pr, cut: true, s: hold([PRESS_AT[0] + 0.4, 1.7, PRESS_AT[2] + 5.4], [PRESS_AT[0] - 0.2, 1.4, PRESS_AT[2]], pr, { fov: 40 }) },
    { f: nm, dur: 24, s: hold([PRESS_AT[0] + 1.1, 1.65, PRESS_AT[2] + 3.6], [PRESS_AT[0] + 0.5, 1.5, PRESS_AT[2]], nm, { fov: 38, roll: -0.035 }, 0.0025) },
  ];
  // 8: the sheep: MS on the spit -> the man taking sixpence at the rope -> slicing ("a shilling a slice")
  const i8 = S(8).a, ch = wf(W.charged), so = wf(W.sold);
  C[8] = [
    { f: i8, s: hold([ROAST_AT[0] - 0.8, 1.6, ROAST_AT[2] - 6.4], [ROAST_AT[0], 1.0, ROAST_AT[2]], i8, { fov: 42 }, 0.0024) },
    { f: ch, cut: true, s: hold([ROAST_AT[0] - 7.6, 1.7, ROAST_AT[2] - 1.0], [ROAST_AT[0] - 4.2, 1.55, ROAST_AT[2] - 3.4], ch, { fov: 38, roll: 0.035 }, 0.0025) },
    { f: so, cut: true, s: hold([ROAST_AT[0] - 2.8, 1.7, ROAST_AT[2] - 3.7], [ROAST_AT[0] + 0.4, 1.35, ROAST_AT[2] - 0.2], so, { fov: 38 }, 0.0025, 0.006, 26) },
  ];
  // 9: wide below Blackfriars; the crowd parts and the elephant comes in ("came the elephant": punch)
  const j = S(9).a, el = wf(W.elephant1);
  C[9] = [
    { f: j, s: zhold([ELEPHANT_X + 16, 2.6, -28], [ELEPHANT_X - 4, 3.0, -10], 44, j, {}, 0.0016) },
    { f: el - 6, dur: 26, s: zhold([ELEPHANT_X + 15, 2.2, -27.5], [ELEPHANT_X, 2.1, -16.5], 38, el - 6, { roll: -0.035 }, 0.002) },
  ];
  // 10: four days later: the sun on the fair, drips (the lane between the tents)
  const k10 = S(10).a;
  C[10] = [{ f: k10, s: hold([-24, 1.9, 1.4], [-6, 2.6, -1.2], k10, { fov: 42 }, 0.0022) }];
  // 11: crack races at boot level ("split" kick) -> high wide: the floes sail off
  const l = S(11).a, sp = wf(W.split), tn = wf(W.tents);
  C[11] = [
    { f: l, s: hold([-4, 0.55, -2.2], [6, 0.2, 0.6], l, { fov: 42, roll: 0.03 }, 0.003) },
    { f: tn - 4, cut: true, s: zhold([4, 38, -62], [10, 0, 2], 46, tn - 4, {}, 0.0014) },
  ];
  // 12: the elephant, smug, on the far bank
  const m12 = S(12).a;
  C[12] = [{ f: m12, s: hold([ELEPHANT_X + 7.5, D0 + 2.2, 28.6], [ELEPHANT_X, D0 + 2.2, 34.5], m12, { fov: 42 }, 0.0024, 0.005, 26) }];
  // 13: the printer on his floe, at the water line, drifting away (camera rides along a little slower)
  const n13 = S(13).a;
  C[13] = [{ f: n13, s: (f) => { const p = pressFloe(T(f)); return dolly([p[0] + 2.6, 0.75, p[2] + 5.4], [p[0] - 0.4, 1.25, p[2]], pushK(f, n13, 0.002), { fov: 40, roll: -0.035 }); } }]; // from the lane side
  // 14: Old London Bridge from upstream (frozen above it), push-in on "bridge"
  const o14 = S(14).a, b1 = wf(W.bridge1);
  C[14] = [
    { f: o14, s: zhold([OLD_LB_X - 52, 7, -22], [OLD_LB_X, 3.5, 0], 42, o14, {}, 0.0016) },
    { f: b1 - 6, dur: 24, s: zhold([OLD_LB_X - 52, 7, -22], [OLD_LB_X, 3.5, -2], 30, b1 - 6, {}, 0.002) },
  ];
  // 15: downstream face: water squeezed through 19 arches; glide along on "nineteen"; aerial on "dam"
  const p15 = S(15).a, nn = wf(W.nineteen), dm = wf(W.dam);
  C[15] = [
    { f: p15, s: zhold([OLD_LB_X + 40, 3.2, -16], [OLD_LB_X, 2.8, -4], 42, p15, {}, 0.0018) },
    { f: nn, dur: 36, s: zhold([OLD_LB_X + 38, 3.0, 12], [OLD_LB_X, 2.6, 2], 44, nn, { roll: 0.035 }, 0.0018) },
    { f: dm, cut: true, s: zhold([OLD_LB_X + 34, 44, -46], [OLD_LB_X - 2, 0, 0], 44, dm, {}, 0.0016) },
  ];
  // 16: above it: flat water, a duck, the ice creeping in
  const q16 = S(16).a;
  C[16] = [{ f: q16, s: hold([DUCK_AT[0] + 7.5, 1.15, DUCK_AT[2] - 4.4], [DUCK_AT[0] - 2.5, 0.35, DUCK_AT[2] + 0.6], q16, { fov: 42 }, 0.0024) }]; // looking upstream: the ice creeps up to the duck
  // 17: over the bridge: ice racing toward it upstream, rapids downstream
  const r17 = S(17).a;
  C[17] = [{ f: r17, s: zhold([OLD_LB_X - 14, 62, -64], [OLD_LB_X - 2, 0, -2], 42, r17, { roll: -0.03 }, 0.0016) }];
  // 18: dawn in the park: frozen puddle -> glide to the running stream
  const s18 = S(18).a, st = wf(W.stream);
  C[18] = [
    { f: s18, s: hold([PARK[0] - 2.4, D0 + 1.25, PARK[2] + 4.6], [PARK[0] - 0.6, D0 + 0.45, PARK[2] - 0.6], s18, { fov: 40 }, 0.0022) },
    { f: st - 8, dur: 30, s: hold([PARK[0] + 0.8, D0 + 1.2, PARK[2] + 3.2], [PARK[0] + 1.6, D0 + 0.2, PARK[2] - 3.6], st - 8, { fov: 42, roll: 0.035 }, 0.0022) },
  ];
  // 19: the new bridge, flags and crowd; punch on "five wide arches"
  const t19 = S(19).a, fv = wf(W.five);
  C[19] = [
    { f: t19, s: zhold([NEW_LB_X - 46, 7, -16], [NEW_LB_X, 4.2, 0], 42, t19, {}, 0.0016) },
    { f: fv - 8, dur: 28, s: zhold([NEW_LB_X - 36, 2.2, -10], [NEW_LB_X, 3.0, -1], 48, fv - 8, { roll: 0.03 }, 0.0018, 0.005, 26) },
  ];
  // 20: workers on the old bridge; on "down" the near arches drop (kick)
  const u20 = S(20).a;
  C[20] = [{ f: u20, s: hold([OLD_LB_X + 24, 9.5, -20], [OLD_LB_X, 5.0, -10], u20, { fov: 44 }, 0.0022) }]; // downstream, over the water, above the deck
  // 21: low over the fast water by the new bridge
  const v21 = S(21).a;
  C[21] = [{ f: v21, s: hold([NEW_LB_X - 30, 1.0, -9], [NEW_LB_X - 6, 1.2, -5.5], v21, { fov: 42, roll: -0.04 }, 0.0028) }];
  // 22: the skater sat on the quay with his skates, the river running behind him
  const w22 = S(22).a;
  C[22] = [{ f: w22, s: hold([-3.4, D0 + 1.1, -36.2], [-5.6, D0 + 0.8, -31.2], w22, { fov: 40 }, 0.0024, 0.005, 28) }];
  // 23: golden crane over the frozen fair, snow falling ("the weather")
  const x23 = S(23).a;
  C[23] = [{ f: x23, s: (f) => { const u = glide((f - x23) / (S(23).b - x23)); return { pos: [8 - 6 * u, 9 + 16 * u, -40 - 16 * u] as V3, look: [12, 1.2 - 0.6 * u, 0] as V3, fov: 44, roll: 0 }; } }];
  // 24: the new bridge at sunset, punch-in on "bridge", hold to the end
  const y24 = S(24).a, be = wf(W.bridgeEnd);
  C[24] = [
    { f: y24, s: zhold([NEW_LB_X - 36, 2.6, -24], [NEW_LB_X, 4.0, 2], 44, y24, {}, 0.0016) },
    { f: be - 8, dur: 26, s: zhold([NEW_LB_X - 36, 2.6, -24], [NEW_LB_X, 4.4, 1], 30, be - 8, {}, 0.0012) },
  ];
}
void rolled;

/** the printer's floe centre (shot 13, and world.ts floe drift): drifts downstream and away from the lane */
export const floeDrift = (cx: number, cz: number, seed: number, t: number) => {
  const u = Math.max(0, t - SPLIT_T);
  const r = (k: number) => { const v = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const sp = 0.9 + 0.7 * r(1), side = (r(2) - 0.5) * 0.5;
  const dx = sp * u + 0.06 * u * u, dz = side * u + 0.08 * Math.sign(cz || 1) * u * (0.4 + r(3));
  return { x: cx + dx, z: cz + dz, yaw: (r(4) - 0.5) * 0.25 * u, tilt: 0.02 * Math.sin(u * 1.7 + seed) };
};
export const pressFloe = (t: number): V3 => { const d = floeDrift(PRESS_AT[0], PRESS_AT[2], 4242, t); return [d.x, 0, d.z]; };

// impact kicks (reference v14): image offset flips sign every frame, decays to 0 in 7 f
const KICKS: [number, number][] = [
  [wt(W.justIce) + 0.15, 0.6], [wt(W.skittles) + 0.05, 0.6], [SPLIT_T, 1.2], [DEMOLISH_T + 0.12, 1.4],
];
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

// ---------------- lens: depth of field ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const at = (p: V3) => () => p;
export const DOF: Dof[] = [
  { f: 0, cInf: 12, focus: (f) => { const e = E(1, f); return [e[0], 2.2, e[2]]; } },
  { f: wf(W.noBridge), cInf: 0 },
  { f: wf(W.noBoat), cInf: 13, focus: at([ROWBOAT_AT[0], 1.0, ROWBOAT_AT[2]]) },
  { f: wf(W.justIce), cInf: 14 },
  { f: S(3).a, cInf: 0 },
  { f: S(4).a, cInf: 10 },
  { f: wf(W.they), cInf: 0 },
  { f: S(5).a, cInf: 10, focus: at([-24, 1.0, -18]) },
  { f: S(6).a, cInf: 12 },
  { f: S(7).a, cInf: 8 },
  { f: wf(W.skittles), cInf: 13 },
  { f: wf(W.printing), cInf: 11 },
  { f: S(8).a, cInf: 11 },
  { f: S(9).a, cInf: 0 },
  { f: S(10).a, cInf: 8 },
  { f: S(11).a, cInf: 12 },
  { f: wf(W.tents) - 4, cInf: 0 },
  { f: S(12).a, cInf: 10 },
  { f: S(13).a, cInf: 12, focus: (f) => { const p = pressFloe(T(f)); return [p[0], 1.2, p[2]]; } },
  { f: S(14).a, cInf: 0 },
  { f: S(16).a, cInf: 13, focus: at([DUCK_AT[0], 0.4, DUCK_AT[2]]) },
  { f: S(17).a, cInf: 0 },
  { f: S(18).a, cInf: 9 },
  { f: S(19).a, cInf: 0 },
  { f: S(22).a, cInf: 12, focus: at([-5.6, D0 + 1.0, -31.2]) },
  { f: S(23).a, cInf: 0 },
  { f: S(24).a, cInf: 5 },
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

/** near framing objects (none in this short yet; kept for world.ts's contract) */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [];

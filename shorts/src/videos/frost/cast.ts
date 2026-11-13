// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, KID, fxBurst, fxSplash, fxStars, fxRing, fxShadow, fxContact, fxPuff,
  Outfit, Expr, FrontOpts, SideOpts, winterFolk, SKATER, PRINTER, COOK, KEEPER, WORKER, WATERMAN,
} from "./toon";
import { elephant, press, roast, swingBoat, duck, pin, ball, coin, paperCard, drip, flake, dust, crack } from "./frosttoon";
import {
  FPS, D0, PARK, SHOTS, V3, smooth, clamp01, W, wt, E, ELEPHANT_X, TENTS, GIN_TENT, PRESS_AT, SWING_AT, SKITTLE_AT, ROAST_AT, ROWBOAT_AT,
  STAIRS_X, OLD_LB_X, NEW_LB_X, DUCK_AT, SPLIT_T, CRACK_T0, DEMOLISH_T, FLOE_RECT, pressFloe, iceFrontX,
} from "./story";
import { floeEdges } from "./bridges";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
/** wide cards (elephant, the roast): 1500 x 1000 design units, ground at y = 975 */
export const WIDE = (() => { const g = new THREE.PlaneGeometry(1500 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
/** the swing boat card: 1000 x 1400 design units hanging from its pivot at design (500, 20) */
export const SWINGBOAT = (() => { const g = new THREE.PlaneGeometry(1000 * SU, 1400 * SU); g.translate(0, -(700 - 20) * SU, 0); return g; })();
export const swingBoatAngle = (t: number) => 0.55 * Math.sin(2 * Math.PI * (t - wt(W.swings) + 0.35) / 2.1);
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "wide" | "swingboat"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const FOLK = [0, 1, 2, 3, 4, 5].map((v) => winterFolk(v));
const SKATERS = [0, 1, 2, 3].map((v) => SKATER(v));
const WORKERS = [0, 1, 2].map((v) => WORKER(v));
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const SWAPS: Record<number, number[]> = {};
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- the frost short's cast by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };
const L = LEAD;
const after = (t: number, w: number) => t >= wt(w) - L;
/** a wide card (1500 x 1000 design) sized by distance */
const wideTier = (cam: CamInfo, x: number, y: number, z: number, sc: number): [number, number, number] => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.5 * sc, z)) / sc;
  const k = d < 5 ? 1.6 : d < 10 ? 1.1 : d < 22 ? 0.6 : 0.3;
  return [Math.round(1500 * k), Math.round(1000 * k), k];
};
const folk = (i: number): Who => ({ i: i + 300, o: FOLK[i % 6], okey: `w${i % 6}` });
const CHEERX: Expr[] = ["grin", "laugh", "smile_closed", "grin", "smile"];

/** people standing about on the ice or a bank: spots [x, y, z]; cheer = waving arms + laughing */
const crowd = (cam: CamInfo, t: number, out: Stage, spots: V3[], cheer: boolean, exprs: Expr[] = ["smile", "grin", "smile_closed", "neutral"], seed = 0) => {
  spots.forEach(([x, y, z], i) => {
    const j = i + seed, kid = j % 7 === 3, who: Who = kid ? { i: j + 600, o: { ...KID, scarf: "#3f6fb5" }, okey: "kid" } : folk(j);
    const hop = kid && cheer ? Math.max(0, Math.sin(t * 7 + j)) * 0.16 : 0;
    const expr = cheer ? CHEERX[j % 5] : exprs[j % exprs.length];
    const fo: FrontOpts = { mode: "stand", expr, wave: cheer && j % 3 !== 2 ? q(Math.sin(t * 9 + j * 1.3), 30) : undefined, blink: lidAt(t, j + 40), look: j % 4 === 1 ? -1 : j % 4 === 2 ? 1 : 0 };
    out.places.push(person(cam, who, x, y + hop, z, { side: false, mirror: false }, fo, {}, kid ? 0.72 : 1));
    blob(out, x, y, z, kid ? 0.72 : 1, hop > 0 ? 0.6 : 1);
  });
};
/** deterministic scatter of n spots in a rect, kept out of the given holes [x, z, r] */
const scatter = (n: number, x0: number, x1: number, z0: number, z1: number, y: number, seed: number, holes: [number, number, number][] = []): V3[] => {
  const out: V3[] = [];
  for (let i = 0, k = 0; out.length < n && k < n * 8; k++, i++) {
    const x = x0 + (x1 - x0) * hh(seed + i, 1), z = z0 + (z1 - z0) * hh(seed + i, 2);
    if (holes.some(([hx, hz, r]) => Math.hypot(x - hx, z - hz) < r)) continue;
    if (out.some(([ox, , oz]) => Math.hypot(x - ox, z - oz) < 1.1)) continue;
    out.push([x, y, z]);
  }
  return out;
};

/** the elephant + its keeper; `at` = feet position, walking along +z unless standing */
const elephantAt = (cam: CamInfo, t: number, out: Stage, at: V3, walking: boolean, expr: "happy" | "smug" | "neutral", keeperFar = false) => {
  const [x, y, z] = at, sc = 1.42, view = viewOf(cam, x, z, 0, 1);
  const phase = walking ? q((t * 0.62) % 1, 24) : 0, blinkV = lidAt(t, 501), light = light2D(cam, view.mirror);
  out.places.push({ key: `ele|${phase}|${expr}|${blinkV}|${q(light)}|${walking}`, geo: "wide", x, y, z, scale: sc, mirror: view.mirror,
    draw: (p) => elephant(p, phase, expr, blinkV, light, walking), size: wideTier(cam, x, y, z, sc) });
  blob(out, x, y, z, 2.6, 0.9);
  // keeper on the lens side, a step ahead, walking with it
  const side = ((cam.pos.x - x) > 0 ? 1 : -1) * (keeperFar ? -1 : 1), kx = x + side * 1.9, kz = z + 1.6;
  const kv = viewOf(cam, kx, kz, 0, 1);
  const so: SideOpts = { mode: walking ? "march" : "stand", phase: walking ? q((t * 0.75) % 1, 60) : 0, expr: "smile", stomp: 0.5, stride: 0.75 * kv.fs, blink: lidAt(t, 502) };
  out.places.push(person(cam, { i: 502, o: KEEPER, okey: "keeper" }, kx, y, kz, walking ? kv : { side: false, mirror: false }, { mode: "stand", expr: "smile", blink: lidAt(t, 502) }, so));
  blob(out, kx, y, kz);
};

/** skaters gliding back and forth along x in the skating patch */
const skaters = (cam: CamInfo, t: number, out: Stage, n: number, x0: number, x1: number, z0: number, z1: number) => {
  for (let i = 0; i < n; i++) {
    const sp = 2.2 + 1.2 * hh(i, 3), dir = i % 2 ? 1 : -1, span = x1 - x0, z = z0 + (z1 - z0) * hh(i, 4);
    const u = (((t * sp * dir + hh(i, 5) * span) % span) + span) % span, x = x0 + u;
    const view = viewOf(cam, x, z, dir, 0), who: Who = { i: 700 + i, o: SKATERS[i % 4], okey: `sk${i % 4}` };
    const so: SideOpts = { mode: "skate", phase: q((t * 0.8 + hh(i, 6)) % 1, 24), expr: i % 3 ? "grin" : "smile_closed", blink: lidAt(t, 700 + i) };
    out.places.push(person(cam, who, x, 0, z, view.side ? view : { side: true, mirror: dir * cam.right.x < 0 }, { mode: "stand", expr: "grin" }, so));
    blob(out, x, 0, z);
  }
};

const fireSmoke = (t: number, out: Stage, x: number, y: number, z: number, n = 5, size = 1.4) => {
  for (let k = 0; k < n; k++) {
    const u = ((t * 0.35 + k / n) % 1);
    out.fx.push({ key: `puff${q(u * 0.6, 20)}`, cw: 400, ch: 400, draw: (p) => fxPuff(p, q(u * 0.6, 20)), x: x + 0.5 * Math.sin(k * 2.1 + u * 3), y: y + 0.6 + u * 3.2, z, w: size * (0.7 + u), h: size * (0.7 + u), soft: true });
  }
};

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  const f = Math.round(t * FPS);
  const fairCrowd = (cheer: boolean, n = 46, seed = 0, exprs?: Expr[]) => {
    // the lane between the booths and the ice around them, away from the props
    const holes: [number, number, number][] = [[PRESS_AT[0], PRESS_AT[2], 2.4], [SWING_AT[0], SWING_AT[2], 4], [SKITTLE_AT[0] + 1, SKITTLE_AT[2], 3.5], [ROAST_AT[0], ROAST_AT[2], 4.2]];
    crowd(cam, t, out, [...scatter(Math.round(n * 0.6), -22, 60, -3.4, 3.4, 0, seed + 11, holes), ...scatter(Math.round(n * 0.4), -26, 64, -24, -10, 0, seed + 57, holes)], cheer, exprs, seed);
  };
  switch (id) {
    case 1: case 2: {
      const e = E(id, f);
      elephantAt(cam, t, out, e, true, "happy", id === 2);
      const spots: V3[] = [];
      // onlookers behind the elephant (the bridge side) and a few on the lens side well behind it
      for (let i = 0; i < 16; i++) { const far = i < 11, k = far ? i : i - 11; spots.push(far ? [ELEPHANT_X - 4.5 - hh(i, 7) * 3.5, 0, -16 + k * 2.6 + hh(i, 8)] : [ELEPHANT_X + 4 + hh(i, 7) * 3, 0, -20 + k * 2.2]); }
      crowd(cam, t, out, spots, true, undefined, 3);
      if (id === 2) { // the waterman sat in his frozen boat, not going anywhere
        const [bx, , bz] = ROWBOAT_AT;
        out.places.push(person(cam, { i: 520, o: WATERMAN, okey: "waterman" }, bx, 0.22, bz, { side: false, mirror: false }, { mode: "sit", expr: after(t, W.noBoat) ? "neutral" : "smile", blink: lidAt(t, 520) }, {}));
        if (after(t, W.justIce)) { // the elephant's foot lands: a little white impact on the ice
          const u = (t - (wt(W.justIce) + 0.15)) / 0.3;
          if (u >= 0 && u < 1) out.fx.push({ key: `burst${q(u, 20)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 20), "#ffffff"), x: e[0] + 0.3, y: 0.15, z: e[2] + 0.6, w: 1.4, h: 1.4 });
        }
      }
      break;
    }
    case 4: {
      // Londoners walking down the watermen's stairs (from the quay top at x0 to the ice at x1)
      for (let i = 0; i < 9; i++) {
        const u = ((t - wt(W.so)) * 0.11 + i * 0.105) % 1.0, x = STAIRS_X[0] + (STAIRS_X[1] - STAIRS_X[0]) * u, y = D0 * (1 - u), z = -28.8 + (hh(i, 9) - 0.5) * 0.9;
        const view = viewOf(cam, x, z, 1, 0);
        const so: SideOpts = { mode: "march", phase: q((t * 0.9 + hh(i, 2)) % 1, 60), expr: i % 3 ? "neutral" : "smile_closed", stomp: 0.5, stride: 0.6 * view.fs, blink: lidAt(t, 310 + i) };
        out.places.push(person(cam, folk(i + 5), x, y, z, view.side ? view : { side: true, mirror: false }, { mode: "stroll", expr: "neutral" }, so));
      }
      if (after(t, W.they)) fairCrowd(after(t, W.party), 48, 1);
      break;
    }
    case 5: {
      skaters(cam, t, out, 10, -36, -8, -23.5, -17);
      // one of them is sitting down on the ice, seeing stars
      out.places.push(person(cam, { i: 760, o: SKATERS[1], okey: "sk1" }, -20.5, 0.02, -19.5, { side: false, mirror: false }, { mode: "sit", expr: "dazed", blink: 0 }, {}));
      const u = (t * 0.9) % 1;
      out.fx.push({ key: `stars${q(u, 30)}`, cw: 420, ch: 210, draw: (p) => fxStars(p, q(u, 30)), x: -20.5, y: 1.25, z: -19.5, w: 0.75, h: 0.375 });
      crowd(cam, t, out, scatter(8, -36, -8, -28, -25.5, 0, 91), after(t, W.skaters), undefined, 9);
      break;
    }
    case 6: {
      const tg = TENTS[GIN_TENT], cheer = after(t, W.gin);
      out.places.push(person(cam, { i: 530, o: { ...FOLK[3], apron: "#efe6d0" }, okey: "ginseller" }, tg.x - 0.5, 0, tg.z + 0.2, { side: false, mirror: false },
        { mode: "stand", expr: cheer ? "grin" : "smile", prop: cheer ? "mug" : null, blink: lidAt(t, 530) }, {}));
      const cust: V3[] = [[tg.x - 1.4, 0, tg.z + 2.4], [tg.x + 0.4, 0, tg.z + 2.9], [tg.x + 1.6, 0, tg.z + 2.3], [tg.x - 0.3, 0, tg.z + 4.2]];
      cust.forEach(([x, y, z], i) => {
        const raise = cheer && i !== 3;
        out.places.push(person(cam, folk(i + 20), x, y, z, { side: false, mirror: false }, { mode: "stand", expr: raise ? CHEERX[i] : "smile", prop: raise ? "mug" : null, blink: lidAt(t, 320 + i) }, {}));
        blob(out, x, y, z);
      });
      crowd(cam, t, out, scatter(10, tg.x - 6, tg.x + 12, -3, 3, 0, 33, cust.map(([x, , z]) => [x, z, 1.2] as [number, number, number])), false, undefined, 14);
      break;
    }
    case 7: {
      // the swing boat
      const th = swingBoatAngle(t), lightS = light2D(cam, false), lid = lidAt(t, 540);
      const riders: [Outfit, Expr][] = [[FOLK[1], th > 0.2 ? "laugh" : "grin"], [FOLK[4], th < -0.2 ? "laugh" : "grin"]];
      out.places.push({ key: `swingboat|${q(lightS)}|${riders.map((r) => r[1]).join()}|${lid}`, geo: "swingboat", x: SWING_AT[0], y: 4.2, z: SWING_AT[2], yaw: 0, roll: th,
        draw: (p) => swingBoat(p, riders, lightS, lid), size: [800, 1120, 0.8] });
      // skittles: the ball rolls in, the pins fly on "skittles"
      const hit = wt(W.skittles) + 0.05, [sx, , sz] = SKITTLE_AT;
      const ballX = Math.min(sx - 0.25, sx - 5 + 4.4 * clamp01((t - (hit - 1.0)) / 1.0));
      out.fx.push({ key: "ball", cw: 200, ch: 200, draw: ball, x: ballX, y: 0.13, z: sz, w: 0.26, h: 0.26 });
      const PINS: [number, number][] = [[0, 0], [0.35, -0.22], [0.35, 0.22], [0.7, -0.44], [0.7, 0], [0.7, 0.44]];
      PINS.forEach(([dx, dz], i) => {
        const u = Math.max(0, t - hit - dx * 0.08), flyX = u * (1.6 + hh(i, 1)), flyY = Math.max(0, 3.2 * u - 4.9 * u * u);
        out.fx.push({ key: "pin", cw: 120, ch: 300, draw: pin, x: sx + dx + flyX, y: 0.2 + flyY, z: sz + dz + u * (hh(i, 2) - 0.5) * 2, w: 0.16, h: 0.4, rot: u * (6 + 6 * hh(i, 3)) * (i % 2 ? 1 : -1) });
      });
      if (t >= hit && t < hit + 0.3) { const u = (t - hit) / 0.3; out.fx.push({ key: `burst${q(u, 20)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 20)), x: sx, y: 0.35, z: sz, w: 1.0, h: 1.0 }); }
      out.places.push(person(cam, folk(31), sx - 6.2, 0, sz + 0.4, { side: true, mirror: false }, {}, { mode: "push", pose: q(clamp01((t - hit + 1.1) / 0.4), 20), expr: "grin", blink: lidAt(t, 331) }));
      // the printing press: lever pulled on "name", the card flies to the customer on "card", a coin back on "pence"
      const [px, , pz] = PRESS_AT, pull = smooth((t - (wt(W.name) - 0.25)) / 0.25) * (1 - smooth((t - (wt(W.name) + 0.35)) / 0.3));
      out.places.push({ key: `press|${q(pull, 12)}|${q(light2D(cam, false))}`, x: px, y: 0, z: pz, scale: 0.92, draw: (p) => press(p, q(pull, 12), light2D(cam, false)), size: tier(cam.pos.distanceTo(tmp.set(px, 1, pz))) });
      out.places.push(person(cam, { i: 545, o: PRINTER, okey: "printer" }, px - 1.15, 0, pz - 0.2, { side: false, mirror: false }, { mode: "stand", expr: pull > 0.5 ? "grin" : "smile", wave: pull > 0.05 ? q(1 - 2 * pull, 20) : undefined, blink: lidAt(t, 545), facing: 1 }, {}));
      blob(out, px - 1.15, 0, pz - 0.2);
      const gotCard = after(t, W.card), paying = after(t, W.pence);
      out.places.push(person(cam, folk(40), px + 1.25, 0, pz + 0.7, { side: false, mirror: false }, { mode: "stand", expr: gotCard ? "grin" : "smile", prop: paying ? "coin" : gotCard ? "card" : null, blink: lidAt(t, 340), facing: -1 }, {}));
      blob(out, px + 1.25, 0, pz + 0.7);
      const cu = (t - (wt(W.card) - 0.45)) / 0.4;
      if (cu > 0 && cu < 1) out.fx.push({ key: "paper", cw: 300, ch: 210, draw: paperCard, x: px + 1.3 * cu, y: 1.2 + 0.6 * Math.sin(cu * Math.PI), z: pz + 0.35 * cu, w: 0.28, h: 0.2, rot: cu * 4 });
      const ku = (t - wt(W.pence)) / 0.5;
      if (ku > 0 && ku < 1) out.fx.push({ key: `coin${q(ku * 3 % 1, 12)}`, cw: 200, ch: 200, draw: (p) => coin(p, q(ku * 3 % 1, 12)), x: px + 1.2 - 2.2 * ku, y: 1.3 + 0.7 * Math.sin(ku * Math.PI), z: pz + 0.5 - 0.6 * ku, w: 0.14, h: 0.14 });
      crowd(cam, t, out, scatter(14, -2, 36, -9, 2, 0, 71, [[SWING_AT[0], SWING_AT[2], 4], [sx, sz, 3.5], [px, pz, 2.6]]), false, ["smile", "grin", "smile_closed"], 21);
      break;
    }
    case 8: {
      const [rx, , rz] = ROAST_AT, sold = after(t, W.sold), lightR = light2D(cam, false), fl = q((t * 3) % 1, 12);
      out.places.push({ key: `roast|${fl}|${sold ? 1 : 0}|${q(lightR)}`, geo: "wide", x: rx, y: 0, z: rz, scale: 1.0, draw: (p) => roast(p, fl, lightR, sold ? 1 : 0), size: wideTier(cam, rx, 0, rz, 1) });
      fireSmoke(t, out, rx + 0.1, 1.0, rz, 5, 1.3);
      out.places.push(person(cam, { i: 550, o: COOK, okey: "cook" }, rx + 2.0, 0, rz - 0.9, { side: false, mirror: false }, { mode: "stand", expr: sold ? "smug" : "smile", prop: sold ? "knife" : null, blink: lidAt(t, 550), facing: -1 }, {}));
      blob(out, rx + 2.0, 0, rz - 0.9, 1.1);
      // the man taking sixpence at the rope, and the people who paid just to watch (deadpan)
      const charging = after(t, W.charged);
      out.places.push(person(cam, folk(45), rx - 4.0, 0, rz - 3.2, { side: false, mirror: false }, { mode: "stand", expr: charging ? "smug" : "smile", prop: charging ? "coin" : null, blink: lidAt(t, 345), facing: 1 }, {}));
      blob(out, rx - 4.0, 0, rz - 3.2);
      const watch: V3[] = [];
      for (let i = 0; i < 9; i++) { const a = 0.35 + i * 0.3; watch.push([rx + Math.cos(a) * 4.3, 0, rz + Math.sin(a) * 3.4]); } // the far side of the fire
      crowd(cam, t, out, watch, false, after(t, W.watch) ? ["neutral", "stern", "neutral", "smile"] : ["smile", "grin", "smile_closed"], 41);
      if (sold) { // a customer with a very small slice
        out.places.push(person(cam, folk(52), rx - 1.2, 0, rz - 2.6, { side: false, mirror: false }, { mode: "stand", expr: "sad", prop: "card", blink: lidAt(t, 352) }, {}));
        blob(out, rx - 1.2, 0, rz - 2.6);
      }
      break;
    }
    case 9: {
      const e = E(9, f);
      const spots: V3[] = [];
      for (let i = 0; i < 22; i++) { const side = i % 2 ? 1 : -1, k = i >> 1; spots.push([ELEPHANT_X + side * (3.6 + hh(i, 7) * 3 + Math.max(0, 2 - Math.abs(-19 + k * 2.4 - e[2]) * 0.5)), 0, -27 + k * 2.4 + hh(i, 8)]); }
      crowd(cam, t, out, spots, after(t, W.elephant1), ["smile", "grin", "nervous"], 5);
      elephantAt(cam, t, out, e, true, "happy");
      break;
    }
    case 10: {
      fairCrowd(false, 30, 2, ["nervous", "neutral", "smile", "nervous"]);
      for (let i = 0; i < 18; i++) { // drips off the booth roofs
        const tn = TENTS[i % TENTS.length], u = ((t * 1.1 + hh(i, 3)) % 1);
        out.fx.push({ key: "drip", cw: 100, ch: 120, draw: drip, x: tn.x - 1.6 + 3.2 * hh(i, 4), y: 2.1 - 2.1 * u * u, z: tn.z + (tn.z > 0 ? -1.4 : 1.4), w: 0.09, h: 0.11 });
      }
      break;
    }
    case 11: {
      const reach = 70 * clamp01((t - CRACK_T0) / (SPLIT_T - CRACK_T0 + 0.6)) ** 1.4;
      if (t < SPLIT_T + 0.4 && reach > 0.2) {
        const r = FLOE_RECT, rk = q(reach / 70, 30) * 70;
        out.fx.push({ key: `crack${q(reach / 70, 30)}`, cw: 2048, ch: 1024, draw: (p) => crack(p, EDGES, r, 2, 0.5, rk), x: (r.x0 + r.x1) / 2, y: 0.05, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, h: r.z1 - r.z0, flat: true });
      }
      if (t < SPLIT_T + 0.6) crowd(cam, t, out, [[3.2, 0, 2.4], [6.6, 0, 3.0], [9.8, 0, 1.8], [12.2, 0, -2.6]], false, after(t, W.split) ? ["shock"] : ["nervous", "neutral"], 61);
      break;
    }
    case 12: {
      elephantAt(cam, t, out, [ELEPHANT_X, D0, 34.5], false, "smug");
      crowd(cam, t, out, [[ELEPHANT_X + 4.5, D0, 33.2], [ELEPHANT_X - 4.2, D0, 35.4], [ELEPHANT_X + 6.2, D0, 35.8]], false, ["smile", "grin"], 71);
      break;
    }
    case 13: {
      const p0 = pressFloe(t), pull = (Math.sin((t - wt(W.unluckily)) * 4.2) + 1) / 2;
      out.places.push({ key: `press|${q(pull, 12)}|${q(light2D(cam, false))}`, x: p0[0], y: 0.04, z: p0[2], scale: 0.92, draw: (p) => press(p, q(pull, 12), light2D(cam, false)), size: tier(cam.pos.distanceTo(tmp.set(p0[0], 1, p0[2]))) });
      out.places.push(person(cam, { i: 545, o: PRINTER, okey: "printer" }, p0[0] - 1.15, 0.04, p0[2] - 0.2, { side: false, mirror: false }, { mode: "stand", expr: after(t, W.not) ? "neutral" : "smile", wave: q(1 - 2 * pull, 20), blink: lidAt(t, 545), facing: 1 }, {}));
      blob(out, p0[0] - 1.15, 0.04, p0[2] - 0.2);
      for (let k = 0; k < 3; k++) { // cards he keeps printing blow off into the river
        const u = ((t - wt(W.unluckily)) * 0.6 + k / 3) % 1;
        out.fx.push({ key: "paper", cw: 300, ch: 210, draw: paperCard, x: p0[0] + 0.6 + 2.2 * u, y: 1.1 + 0.8 * Math.sin(u * Math.PI) - 0.9 * u, z: p0[2] - 0.6 * u, w: 0.26, h: 0.18, rot: u * 6 + k });
      }
      break;
    }
    case 16: {
      // the duck floats on still water until the ice front reaches it
      const dx = DUCK_AT[0], dz = DUCK_AT[2], frozen = iceFrontX(16, t) > dx + 0.6, bob = frozen ? 0 : 0.03 * Math.sin(t * 2.0);
      const look = frozen ? 1 : 0, lid = lidAt(t, 560);
      out.fx.push({ key: `duck${look}${lid}`, cw: 320, ch: 260, draw: (p) => duck(p, look, lid), x: dx, y: 0.26 + bob, z: dz, w: 0.62, h: 0.5 });
      if (!frozen) { const u = (t * 0.5) % 1; out.fx.push({ key: `ring${q(u, 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q(u, 30)), x: dx, y: 0.03, z: dz, w: 1.4, h: 1.4, flat: true }); }
      break;
    }
    case 18: {
      // dawn: a kid slides on the frozen puddle, then looks at the stream that is still running
      const st = after(t, W.stream), slide = Math.sin((t - wt(W.puddle)) * 2.4) * 0.35 * smooth((t - wt(W.puddle) + 0.3) / 0.4);
      const kx = PARK[0] - 0.6 + (st ? 0 : slide), kz = PARK[2] - 0.6;
      out.places.push(person(cam, { i: 600, o: { ...KID, scarf: "#c4473b" }, okey: "kidS" }, kx, D0 + 0.03, kz, { side: false, mirror: false },
        { mode: "stand", expr: st ? "shock" : "grin", look: st ? 1 : 0, wave: st ? undefined : q(slide * 2, 20), blink: lidAt(t, 600), facing: st ? 1 : 0 }, {}, 0.72));
      blob(out, kx, D0, kz, 0.72);
      break;
    }
    case 19: {
      // crowds on the new bridge, cheering
      const spots: V3[] = [];
      for (let i = 0; i < 30; i++) spots.push([NEW_LB_X - 3.6 + 7.2 * hh(i, 1), D0 + 0.52, -24 + 48 * (i / 30) + hh(i, 2)]);
      crowd(cam, t, out, spots, after(t, W.opened), undefined, 81);
      break;
    }
    case 20: {
      // workers hammering on the part that stays; dust and splashes where the arches drop
      for (let i = 0; i < 4; i++) {
        const z = -5.2 + i * 1.3, x = OLD_LB_X - 2.6 + i * 1.6, hit = (t * 1.6 + i * 0.27) % 1;
        out.places.push(person(cam, { i: 610 + i, o: WORKERS[i % 3], okey: `wk${i % 3}` }, x, D0 + 0.3, z, { side: false, mirror: false }, { mode: "stand", expr: "stern", prop: ["hammer", q(hit < 0.2 ? hit / 0.2 : 1 - (hit - 0.2) / 0.8, 20)], blink: lidAt(t, 610 + i), facing: -1 }, {}));
      }
      if (t >= DEMOLISH_T - 0.1) for (let k = 0; k < 6; k++) {
        const z = -28 + k * 4, u = (t - DEMOLISH_T - (z + 30) * 0.012 - 0.55) / 1.1;
        if (u > 0 && u < 1) out.fx.push({ key: `splash${q(u, 30)}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, q(u, 30)), x: OLD_LB_X, y: 2.4, z, w: 6, h: 6 });
        const du = (t - DEMOLISH_T - (z + 30) * 0.012) / 1.6;
        if (du > 0 && du < 1) out.fx.push({ key: `dust${q(du, 20)}`, cw: 600, ch: 400, draw: (p) => dust(p, q(du, 20)), x: OLD_LB_X, y: 5.5 + 2 * du, z, w: 8, h: 5.3, soft: true });
      }
      break;
    }
    case 21: {
      // the duck again, swept past on the fast river
      const u = ((t - wt(W.theRiver)) * 2.4) - 3, look = 0;
      out.fx.push({ key: `duck${look}0`, cw: 320, ch: 260, draw: (p) => duck(p, look, 0), x: NEW_LB_X - 14 + u, y: 0.26, z: -6.5, w: 0.62, h: 0.5, rot: 0.08 * Math.sin(t * 6) });
      break;
    }
    case 22: {
      out.places.push(person(cam, { i: 620, o: SKATERS[0], okey: "sk0" }, -5.6, D0 + 0.02, -31.2, { side: false, mirror: false }, { mode: "sit", expr: "sad", prop: "skates", blink: lidAt(t, 620) }, {}));
      blob(out, -5.6, D0, -31.2);
      break;
    }
    case 23: {
      fairCrowd(true, 52, 3);
      skaters(cam, t, out, 5, -34, -10, -24, -11);
      // snow falling around the lens
      const c0 = cam.pos;
      for (let i = 0; i < 90; i++) {
        const fx0 = c0.x - 8 + 26 * hh(i, 1), fz0 = c0.z + 4 + 30 * hh(i, 2), y = c0.y + 6 - ((t * 0.9 + hh(i, 3) * 12) % 12);
        out.fx.push({ key: "flake", cw: 64, ch: 64, draw: flake, x: fx0 + 0.4 * Math.sin(t + i), y, z: fz0, w: 0.09, h: 0.09 });
      }
      break;
    }
    case 24: {
      const spots: V3[] = [];
      for (let i = 0; i < 10; i++) spots.push([NEW_LB_X - 3 + 6 * hh(i, 5), D0 + 0.52, -14 + 28 * (i / 10)]);
      crowd(cam, t, out, spots, false, ["smile", "smile_closed"], 91);
      break;
    }
  }
  return out;
};
const EDGES = floeEdges();
export { FPS };

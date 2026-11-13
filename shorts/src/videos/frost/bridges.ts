// Frost short scenery that the bridge short did not have: stone arch bridges (Blackfriars, Old London Bridge on its
// starlings, the 1831 bridge), the watermen's stairs, the fair's booths, barges and a rowing boat, and the ice-floe
// field the river breaks into. Everything is plain extruded / boxed geometry with two-tone materials (shade.ts), so the
// world ink pass outlines it like the rest of the town.
import * as THREE from "three";
import { Batch, boxGeo, V, lam, quad } from "./build";
import { stoneHD, beam, cobbleHD, tentCloth, rng } from "./paint";
import { D0, FLOE_RECT, V3 } from "./story";

const stoneM = () => lam("bridgeStone", () => ({ map: stoneHD("bridgeStoneHD", ["#d9cdb9", "#cfc2ad", "#e2d7c5", "#c6b8a2"], "#9c8e7b") }));
const ringM = () => lam("bridgeRing", () => ({ map: stoneHD("bridgeRingHD", ["#e8dfcf", "#e0d6c4", "#efe7da", "#d9cfbc"], "#a89a86") }));
const deckM = () => lam("bridgeDeck", () => ({ map: cobbleHD() }));
const woodM = () => lam("wood", () => ({ map: beam() }));

/** scale ExtrudeGeometry's metre UVs to one texture repeat per `tile` metres */
const tileUV = (g: THREE.BufferGeometry, tile: number) => {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return g;
};
/** arch opening outline from the water line up, left springing (za) to right springing (zb), in (u = z, v = y) */
const archPts = (za: number, zb: number, spring: number, rise: number, n = 18): THREE.Vector2[] => {
  const c = (za + zb) / 2, a = (zb - za) / 2, out: THREE.Vector2[] = [new THREE.Vector2(za, -1.0), new THREE.Vector2(za, spring)];
  for (let i = 1; i < n; i++) { const th = Math.PI - (Math.PI * i) / n; out.push(new THREE.Vector2(c + a * Math.cos(th), spring + rise * Math.sin(th))); }
  out.push(new THREE.Vector2(zb, spring), new THREE.Vector2(zb, -1.0));
  return out;
};

export type ArchBridge = { x: number; n: number; pier: number; spring: number; rise: number; deck: number; width: number; starling?: number; ringW?: number };
export type Bay = { group: THREE.Group; z: number };
/** a stone arch bridge across the river (z -30..30) at x, built as one Group per bay (pier half + arch + pier half),
 *  so bays can fall one by one. Returns the bays; each group's origin sits at the bay centre on the water line. */
export const archBridge = (parent: THREE.Object3D, o: ArchBridge): Bay[] => {
  const z0 = -30, z1 = 30, n = o.n, span = (z1 - z0 - (n - 1) * o.pier) / n, P = span + o.pier, hw = o.width / 2;
  const bays: Bay[] = [];
  const ring = o.ringW ?? Math.min(0.7, span * 0.18);
  for (let k = 0; k < n; k++) {
    const za = z0 + k * P, zb = za + span, cz = (za + zb) / 2;
    const left = k === 0 ? za - 3 : za - o.pier / 2, right = k === n - 1 ? zb + 3 : zb + o.pier / 2;
    const top = o.deck;
    const sh = new THREE.Shape([new THREE.Vector2(left, -1.2), new THREE.Vector2(right, -1.2), new THREE.Vector2(right, top), new THREE.Vector2(left, top)]);
    sh.holes.push(new THREE.Path(archPts(za, zb, o.spring, o.rise).reverse()));
    const g = tileUV(new THREE.ExtrudeGeometry(sh, { depth: o.width, bevelEnabled: false, curveSegments: 4 }), 4);
    // shape (u, v) -> world (x across the river's flow, y, z): extrusion along x
    g.rotateY(-Math.PI / 2); g.translate(hw, 0, 0); // shape u -> z, extrusion -> x in [-hw, hw]
    const grp = new THREE.Group(), b = new Batch();
    b.add(g, stoneM(), new THREE.Matrix4().makeTranslation(o.x, 0, 0));
    // voussoir ring proud of both faces
    const outer = archPts(za - ring, zb + ring, o.spring, o.rise + ring).slice(1, -1), inner = archPts(za, zb, o.spring, o.rise).slice(1, -1).reverse();
    const rs = new THREE.Shape([...outer, ...inner]);
    for (const s of [-1, 1]) {
      const rg = tileUV(new THREE.ExtrudeGeometry(rs, { depth: 0.14, bevelEnabled: false, curveSegments: 4 }), 3);
      rg.rotateY(-Math.PI / 2); rg.translate(s > 0 ? hw + 0.12 : -hw + 0.02, 0, 0);
      b.add(rg, ringM(), new THREE.Matrix4().makeTranslation(o.x, 0, 0));
    }
    // deck top, string course and parapets
    b.add(boxGeo(V(o.x - hw - 0.15, top - 0.35, left), V(o.x + hw + 0.15, top - 0.1, right), 2), ringM());
    b.add(boxGeo(V(o.x - hw + 0.35, top - 0.02, left), V(o.x + hw - 0.35, top + 0.02, right), 3), deckM());
    for (const s of [-1, 1]) b.add(boxGeo(V(o.x + s * hw - (s > 0 ? 0.4 : 0), top, left), V(o.x + s * hw + (s < 0 ? 0.4 : 0), top + 1.05, right), 2), stoneM());
    // starlings round the piers on each side of this bay (boat-shaped, pointing up and down stream)
    if (o.starling) for (const pz of k === n - 1 ? [] : [zb + o.pier / 2]) {
      const L = hw + o.starling, Wd = o.pier / 2 + 0.7;
      const st = new THREE.Shape([new THREE.Vector2(-L - 1.6, 0), new THREE.Vector2(-L, -Wd), new THREE.Vector2(L, -Wd), new THREE.Vector2(L + 1.6, 0), new THREE.Vector2(L, Wd), new THREE.Vector2(-L, Wd)]);
      const sg = tileUV(new THREE.ExtrudeGeometry(st, { depth: 2.0, bevelEnabled: false }), 3);
      sg.rotateX(-Math.PI / 2); sg.translate(o.x, -1.2, pz);
      b.add(sg, stoneM());
    }
    b.build(grp);
    grp.userData.cz = cz;
    parent.add(grp);
    bays.push({ group: grp, z: cz });
  }
  return bays;
};

/** watermen's stairs down the near quay wall: from (x0, D0) to (x1, 0), 2.4 m wide against the wall (z -30..-27.6) */
export const stairs = (b: Batch, x0: number, x1: number) => {
  const n = 22, dx = (x1 - x0) / n, dy = D0 / n, m = lam("stairStone", () => ({ map: stoneHD("copeHD") }));
  for (let i = 0; i < n; i++) b.add(boxGeo(V(Math.min(x0 + i * dx, x0 + (i + 1) * dx), -0.6, -30), V(Math.max(x0 + i * dx, x0 + (i + 1) * dx), D0 - i * dy, -27.6), 2), m);
  b.add(boxGeo(V(Math.min(x0, x1) - 0.2, -0.6, -27.6), V(Math.max(x0, x1) + 0.2, 0.05, -27.2), 2), m);
};

const TENT_COLS: [string, string][] = [["#c4473b", "#f1e6cf"], ["#3f6fb5", "#f1e6cf"], ["#4f8a5a", "#efe0b8"], ["#d8a441", "#7a3b2e"], ["#8c3b4a", "#efe0b8"]];
/** a fair booth: four posts, a counter, a striped gabled cloth roof, a pennant. Group origin on the ice at the
 *  booth centre, front (open side) toward local +z. */
export const tent = (c: number) => {
  const grp = new THREE.Group(), b = new Batch(), [A, B] = TENT_COLS[c % TENT_COLS.length];
  const cloth = lam("tentCloth" + c, () => ({ map: tentCloth(A, B), side: THREE.DoubleSide }));
  const w = 3.4, d = 2.6, h = 2.2, rh = 1.2;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) b.add(boxGeo(V(x - 0.07, 0, z - 0.07), V(x + 0.07, h, z + 0.07)), woodM());
  b.add(boxGeo(V(-w / 2, 0, d / 2 - 0.5), V(w / 2, 1.05, d / 2 - 0.1), 1), woodM());             // counter
  b.add(quad(V(-w / 2, 0, -d / 2), V(w / 2, 0, -d / 2), V(w / 2, h, -d / 2), V(-w / 2, h, -d / 2)).scale(1, 1, 1), cloth); // back wall
  for (const s of [-1, 1]) b.add(quad(V(s * w / 2, 0, s * d / 2), V(s * w / 2, 0, -s * d / 2), V(s * w / 2, h, -s * d / 2), V(s * w / 2, h, s * d / 2)), cloth);
  const o = 0.25;
  b.add(quad(V(-w / 2 - o, h - 0.1, d / 2 + o), V(w / 2 + o, h - 0.1, d / 2 + o), V(w / 2 + o, h + rh, 0), V(-w / 2 - o, h + rh, 0), 2, 1), cloth);
  b.add(quad(V(w / 2 + o, h - 0.1, -d / 2 - o), V(-w / 2 - o, h - 0.1, -d / 2 - o), V(-w / 2 - o, h + rh, 0), V(w / 2 + o, h + rh, 0), 2, 1), cloth);
  for (const s of [-1, 1]) b.add(new THREE.BufferGeometry().copy(triG(V(s * w / 2, h, s * d / 2), V(s * w / 2, h, -s * d / 2), V(s * w / 2, h + rh, 0))), cloth);
  b.add(boxGeo(V(-0.03, h + rh, -0.03), V(0.03, h + rh + 1.0, 0.03)), woodM());
  const flag = new THREE.BufferGeometry();
  flag.setAttribute("position", new THREE.Float32BufferAttribute([0, h + rh + 1.0, 0, 0, h + rh + 0.62, 0, 0.62, h + rh + 0.81, 0], 3));
  flag.computeVertexNormals();
  b.add(flag, lam("pennant" + c, () => ({ color: A, side: THREE.DoubleSide })));
  b.build(grp);
  return grp;
};
const triG = (a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([a, bb, c].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  g.computeVertexNormals();
  return g;
};

/** boat hull along local x (length L, beam Bm, depth Dp; the waterline at y = 0, gunwale at Dp - 0.35) */
export const hull = (L: number, Bm: number, Dp: number, cabin = false) => {
  const grp = new THREE.Group(), b = new Batch();
  const sh = new THREE.Shape([new THREE.Vector2(-L / 2, 0), new THREE.Vector2(-L / 2 + Bm * 0.55, -Bm / 2), new THREE.Vector2(L / 2 - Bm * 0.9, -Bm / 2),
    new THREE.Vector2(L / 2, 0), new THREE.Vector2(L / 2 - Bm * 0.9, Bm / 2), new THREE.Vector2(-L / 2 + Bm * 0.55, Bm / 2)]);
  const hm = lam("hullTar", () => ({ color: "#4b3a33" })), rim = lam("hullRim", () => ({ color: "#8a5a3c" }));
  const H0 = Dp - 0.65; // hull solid from -0.35 to H0, then a wooden floor inset and a raised gunwale
  const g = new THREE.ExtrudeGeometry(sh, { depth: H0 + 0.35, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, -0.35, 0);
  b.add(g, hm);
  const inner = new THREE.Shape(sh.getPoints().map((p) => p.clone().multiplyScalar(0.86)));
  const gi = new THREE.ExtrudeGeometry(inner, { depth: 0.04, bevelEnabled: false });
  gi.rotateX(-Math.PI / 2); gi.translate(0, H0, 0);
  b.add(gi, woodM());
  b.add(boxGeo(V(-L / 2 + Bm * 0.55, H0, -Bm / 2 - 0.02), V(L / 2 - Bm * 0.9, H0 + 0.3, -Bm / 2 + 0.12)), rim);
  b.add(boxGeo(V(-L / 2 + Bm * 0.55, H0, Bm / 2 - 0.12), V(L / 2 - Bm * 0.9, H0 + 0.3, Bm / 2 + 0.02)), rim);
  if (cabin) {
    b.add(boxGeo(V(-L / 2 + 1.0, H0, -Bm * 0.32), V(-L / 2 + 3.2, H0 + 1.4, Bm * 0.32), 1), woodM());
    for (let i = 0; i < 3; i++) b.add(boxGeo(V(-0.6 + i * 1.3, H0, -0.45), V(0.4 + i * 1.3, H0 + 0.8 + 0.2 * (i % 2), 0.45), 1), lam("crate", () => ({ color: "#b98b5a" })));
  }
  b.build(grp);
  return grp;
};

// ---------------- ice floes ----------------
export type Floe = { mesh: THREE.Mesh; cx: number; cz: number; seed: number; pts: [number, number][] };
/** jittered grid of convex floes covering FLOE_RECT; shared corners so the field reads as one sheet before the split.
 *  Pure (seeded): cast.ts draws the crack along the same edges. */
export const floePolys = (cell = 6.2): [number, number][][] => {
  const { x0, x1, z0, z1 } = FLOE_RECT, nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const r = rng(77), cw = (x1 - x0) / nx, ch = (z1 - z0) / nz;
  const P: [number, number][][] = [];
  for (let i = 0; i <= nx; i++) {
    P.push([]);
    for (let j = 0; j <= nz; j++) {
      const edgeX = i === 0 || i === nx, edgeZ = j === 0 || j === nz;
      P[i].push([x0 + i * cw + (edgeX ? 0 : (r() - 0.5) * cw * 0.55), z0 + j * ch + (edgeZ ? 0 : (r() - 0.5) * ch * 0.55)]);
    }
  }
  const out: [number, number][][] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    if (r() < 0.35) {
      if (r() < 0.5) out.push([a, b, c], [a, c, d]); else out.push([a, b, d], [b, c, d]);
    } else out.push([a, b, c, d]);
  }
  return out;
};
/** unique floe edges as [x0, z0, x1, z1] */
export const floeEdges = () => {
  const seen = new Set<string>(), out: [number, number, number, number][] = [];
  for (const pts of floePolys()) pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length], k = [a, b].map((q) => q.map((v) => v.toFixed(2)).join(",")).sort().join("|");
    if (!seen.has(k)) { seen.add(k); out.push([a[0], a[1], b[0], b[1]]); }
  });
  return out;
};
export const floeField = (parent: THREE.Object3D, mat: THREE.Material): Floe[] =>
  floePolys().map((pts, i) => {
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x - cx, -(z - cz))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.42, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, -0.38, 0); // top face at y = 0.04
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx, 0, cz); m.visible = false; m.receiveShadow = true; m.castShadow = false;
    parent.add(m);
    return { mesh: m, cx, cz, seed: i + 1, pts };
  });
export const inPoly = (x: number, z: number, pts: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
export type { V3 };

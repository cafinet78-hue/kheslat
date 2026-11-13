// The frozen Thames as one three.js scene: sky, town under snow (or in summer), the river as ice / water from one
// shader (ice everywhere, ice only above Old London Bridge, open water with rapids), the ice-floe field of the thaw,
// three stone bridges, the fair's booths, barges, the park puddle and stream, and the cast. update(id, f, camera)
// poses everything for shot `id` at frame f (a pure function of id + f).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import { Batch, boxGeo, V, lam, buildTown, Kit, Ray, kitClone, seasonal, setSeason } from "./build";
import { bed, ctex, cobbleHD, grassHD, stoneHD, waterNear, waterFar, cloudHD, snowHD, iceMarks } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, WIDE, SWINGBOAT, swingBoatAngle } from "./cast";
import {
  FPS, D0, SHOTS, ShotDef, V3, camAt, FOREGROUND, smooth, T, TENTS, SPLIT_T, DEMOLISH_T, floeDrift, iceFrontX, flowAt, wf, W,
  BLACKFRIARS_X, OLD_LB_X, NEW_LB_X, STAIRS_X, PARK, SWING_AT, ROWBOAT_AT, PRESS_AT, FLOE_RECT,
} from "./story";
import { archBridge, Bay, stairs, tent, hull, floeField, Floe, inPoly } from "./bridges";

// ---------------- assets ----------------
const KENNEY = ["tree_oak", "tree_default", "tree_detailed", "tree_fat", "tree_cone", "tree-high-round", "tree", "plant_bushLarge", "plant_bushDetailed",
  "plant_bush", "hedge", "lantern", "cart"];
let kitP: Promise<Kit> | null = null;
export const loadKit = () => {
  if (!kitP) {
    const loader = new GLTFLoader();
    kitP = Promise.all(KENNEY.map((n) => loader.loadAsync(staticFile(`bridge/kenney/${n}.glb`)).then((g) => [n, g.scene] as const).catch(() => [n, null] as const)))
      .then((list) => Object.fromEntries(list.filter((e) => e[1]).map(([n, s]) => [n, s!])) as Kit);
  }
  return kitP;
};

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
/** per-shot sun override (az from the shot's mean view axis, el) */
const SUN_SHOT: Record<number, { az?: number; el?: number }> = { 3: { az: 120 }, 11: { az: 110 }, 15: { az: 120, el: 40 }, 17: { az: 100 }, 18: { az: -40, el: 10 }, 23: { az: 135, el: 18 }, 24: { az: 150, el: 14 } };
const smokeTex = () => ctex("smoke", 256, 256, (g) => {
  const p = new Pen(g);
  for (const [x, y, r, c] of [[90, 150, 60, "#8f8d96"], [150, 120, 70, "#a3a1aa"], [170, 165, 55, "#8f8d96"], [120, 100, 50, "#b4b2ba"]] as const) p.ell(x, y, r, r * 0.85, c, 0);
});
/** the park stream's painted surface: blue with white flow streaks along u */
const streamTex = () => ctex("streamHD", 512, 128, (g, r) => {
  g.fillStyle = "#3d8fc4"; g.fillRect(0, 0, 512, 128);
  g.lineCap = "round";
  for (let i = 0; i < 46; i++) {
    const x = r() * 512, y = 8 + r() * 112, w = 30 + r() * 90;
    for (const ox of [-512, 0, 512]) { g.strokeStyle = i % 3 ? "rgba(225,245,255,0.55)" : "rgba(20,70,120,0.35)"; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + w, y + (r() - 0.5) * 6); g.stroke(); }
  }
});

/** every lens position of the film looking at its subject (houses there are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 3) {
    const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = fw.length();
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};

type Mats = Record<string, THREE.Material>;
/** Old London Bridge arch span (19 arches, 1.5 m piers across 60 m): the rapids' lanes line up with the openings */
const OLD_SPAN = (60 - 18 * 1.5) / 19;
/** barges frozen in along the banks and in the fair (x, z, yaw, length) */
const BARGES: [number, number, number, number][] = [
  [-34, 21, 0.15, 11], [-22, 23.5, -0.1, 10], [36, -21.5, 0.2, 11], [47, -22.5, -0.15, 10], [58, 20.5, 0.1, 12], [62, -18, 0.6, 10],
  [-12, 22.5, -0.3, 9], [14, 22.5, 0.05, 11], [78, 21, 0.1, 12], [88, -21.5, -0.2, 11], [30, 22.5, -0.1, 10],
];

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private wides: Actor[] = [];
  private fxs: Fx[] = [];
  private swingBoat: Actor;
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>;
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private fgs: { o: THREE.Object3D; a: number; b: number }[] = [];
  private smoke: { m: THREE.Mesh; mat: THREE.MeshLambertMaterial; top: V3; k: number }[] = [];
  private clouds: THREE.Mesh[] = [];
  private oldLB: Bay[] = []; private newLB: Bay[] = [];
  private tents: { g: THREE.Group; x: number; z: number; yaw: number; floe: number }[] = [];
  private barges: { g: THREE.Group; x: number; z: number; yaw: number; floe: number }[] = [];
  private rowboat: THREE.Group;
  private floes: Floe[] = [];
  private drifts: THREE.Group;
  private winterOnly: THREE.Object3D[] = [];
  private streamTexture: THREE.Texture;
  private swingFrame: THREE.Group;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(kit: Kit) {
    const R = this.root, M: Mats = {};
    // ---- sky + light ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }

    // ---- ground, quays, river bed (static) ----
    const b = new Batch();
    M.grass = seasonal(lam("groundHD", () => ({ map: grassHD() })) as THREE.MeshLambertMaterial, snowHD(), grassHD());
    M.cobble = seasonal(lam("quayHD", () => ({ map: cobbleHD() })) as THREE.MeshLambertMaterial, snowHD("snowTrodHD", 1), cobbleHD());
    M.wall = lam("wallHD", () => ({ map: stoneHD("wallHD", ["#c9bcaa", "#bfb19f", "#d1c5b4", "#b8aa97"], "#958776") }));
    M.cope = lam("copeHD", () => ({ map: stoneHD("copeHD", ["#e6dccd", "#ddd3c3", "#ece4d6", "#d6cbba"], "#aea293") }));
    M.bed = lam("bed", () => ({ map: bed() }));
    const gaps: [number, number][] = [[BLACKFRIARS_X - 6, BLACKFRIARS_X + 6], [NEW_LB_X - 7, NEW_LB_X + 7], [OLD_LB_X - 8, OLD_LB_X + 8]];
    const segs = (x0: number, x1: number, extra: [number, number][] = []) => {
      const cuts = [...gaps, ...extra].sort((a, c) => a[0] - c[0]), out: [number, number][] = [];
      let x = x0;
      for (const [a, c] of cuts) { if (a > x) out.push([x, a]); x = Math.max(x, c); }
      if (x < x1) out.push([x, x1]);
      return out;
    };
    for (const s of [-1, 1]) {
      const zn = s * 30, zf = s * 900;
      b.add(s < 0 ? quadUp(-900, 900, zf, zn, 450, 217.5) : quadUp(-900, 900, zn, zf, 450, 217.5), M.grass);
      b.add(s < 0 ? quadUp(-160, 160, -36.5, -30, 80, 1.625, 0.012) : quadUp(-160, 160, 30, 36.5, 80, 1.625, 0.012), M.cobble);
      b.add(s < 0 ? quadUp(-6, 6, -170, -36.5, 3, 33.375, 0.012) : quadUp(-6, 6, 36.5, 170, 3, 33.375, 0.012), M.cobble);
      b.add(s < 0 ? wallQuad(-900, 900, -30, 1) : wallQuad(900, -900, 30, -1), M.wall);
      for (const [x0, x1] of segs(-600, 600, s < 0 ? [[STAIRS_X[0] - 2.5, STAIRS_X[0] + 0.5]] : [])) b.add(boxGeo(V(x0, D0, s < 0 ? -30.5 : 30), V(x1, D0 + 0.75, s < 0 ? -30 : 30.5), 2), M.cope);
      b.add(boxGeo(V(-600, D0 - 0.05, s < 0 ? -30.6 : 29.4), V(600, D0 + 0.02, s < 0 ? -29.4 : 30.6), 2), M.cope);
    }
    b.add(quadUp(-900, 900, -30, 30, 225, 7.5, -0.6 - D0), M.bed);
    stairs(b, STAIRS_X[0], STAIRS_X[1]);
    // park: swing frame stays (a winter park), a snow-banked stream and the puddle
    b.build(R);
    buildTown(R, kit, sightLines());
    this.swingFrame = new THREE.Group();
    {
      const pb = new Batch(), wood = lam("wood2", () => ({ color: "#8a5a3c" }));
      // swing boat A-frames on the ice (fair): beam along z at 4.2 m, legs spread in x
      for (const zz of [-1.6, 1.6]) for (const sx of [-1, 1]) pb.add(beamBetween(V(SWING_AT[0], 4.2, SWING_AT[2] + zz), V(SWING_AT[0] + sx * 2.4, 0, SWING_AT[2] + zz), 0.16), wood);
      pb.add(beamBetween(V(SWING_AT[0], 4.2, SWING_AT[2] - 1.75), V(SWING_AT[0], 4.2, SWING_AT[2] + 1.75), 0.18), wood);
      pb.build(this.swingFrame);
      R.add(this.swingFrame);
    }
    {
      const pk = new THREE.Group(), pb = new Batch();
      const bank = lam("snowBank", () => ({ map: snowHD() }));
      for (const s of [-1, 1]) pb.add(new THREE.CylinderGeometry(0.32, 0.32, 44, 14).rotateZ(Math.PI / 2), bank, new THREE.Matrix4().makeTranslation(PARK[0], D0 - 0.04, PARK[2] - 3.6 + s * 1.05));
      pb.build(pk);
      this.streamTexture = streamTex().clone(); this.streamTexture.repeat.set(10, 1); this.streamTexture.needsUpdate = true;
      const sm = lam("stream", () => ({ map: this.streamTexture }));
      const strip = new THREE.Mesh(quadUp(PARK[0] - 22, PARK[0] + 22, PARK[2] - 4.4, PARK[2] - 2.8, 1, 1, 0.025), sm);
      strip.receiveShadow = true; pk.add(strip);
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40).rotateX(-Math.PI / 2).scale(1.3, 1, 0.85).translate(PARK[0] - 0.6, D0 + 0.02, PARK[2] - 0.7),
        lam("puddleIce", () => ({ color: "#bcd9ee" })));
      puddle.receiveShadow = true; pk.add(puddle);
      R.add(pk);
    }

    // ---- river: water / ice from one shader ----
    const wNear = waterNear(), wFar = waterFar(), ice = iceMarks();
    for (const t of [wNear, wFar, ice]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wFlowT: { value: 0 },
      iceTex: { value: ice }, iceA: { value: new THREE.Color() }, iceB: { value: new THREE.Color() }, iceSnow: { value: new THREE.Color() }, iceLine: { value: new THREE.Color() },
      wIce: { value: 1 }, wIceX: { value: 1e4 }, wHide: { value: new THREE.Vector4(0, 0, 0, 0) }, wWet: { value: 0 },
      wFoamX: { value: OLD_LB_X + 5.5 }, wFoam: { value: 0 }, wLane: { value: new THREE.Vector2(-30 + OLD_SPAN / 2, OLD_SPAN + 1.5) }, foamC: { value: new THREE.Color() },
    };
    const waterMat = (floe: boolean) => {
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.WU);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWP; varying vec3 vWN;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", WATER_DECL + (floe ? "\n#define FLOE 1" : ""))
          .replace("#include <map_fragment>", WATER_COL)
          .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
          .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
      };
      m.customProgramCacheKey = () => (floe ? "floe1" : "river2");
      return m;
    };
    const wm = new THREE.Mesh(quadUp(-900, 900, -30, 30, 1, 1, -D0), waterMat(false));
    wm.receiveShadow = true;
    R.add(wm);
    this.floes = floeField(R, waterMat(true));

    // ---- bridges ----
    archBridge(R, { x: BLACKFRIARS_X, n: 9, pier: 2.2, spring: 1.4, rise: 3.1, deck: D0 + 0.4, width: 9, ringW: 0.6 });
    this.oldLB = archBridge(R, { x: OLD_LB_X, n: 19, pier: 1.5, spring: 1.6, rise: 1.15, deck: D0 + 0.3, width: 11, starling: 3.2, ringW: 0.42 });
    this.newLB = archBridge(R, { x: NEW_LB_X, n: 5, pier: 2.6, spring: 1.2, rise: 3.7, deck: D0 + 0.5, width: 10, ringW: 0.7 });

    // ---- the fair: booths, barges, the frozen rowing boat, snow drifts along the walls ----
    const floeAt = (x: number, z: number) => this.floes.findIndex((fl) => inPoly(x, z, fl.pts));
    TENTS.forEach((t) => { const g = tent(t.c); g.position.set(t.x, 0, t.z); g.rotation.y = t.yaw; R.add(g); this.tents.push({ g, x: t.x, z: t.z, yaw: t.yaw, floe: floeAt(t.x, t.z) }); });
    BARGES.forEach(([x, z, yaw, L], i) => { const g = hull(L, 3.0, 1.5, i % 3 === 0); g.position.set(x, 0, z); g.rotation.y = yaw; R.add(g); this.barges.push({ g, x, z, yaw, floe: floeAt(x, z) }); });
    this.rowboat = hull(3.6, 1.35, 0.85);
    this.rowboat.position.set(ROWBOAT_AT[0], -0.05, ROWBOAT_AT[2]); this.rowboat.rotation.y = 0.5;
    R.add(this.rowboat);
    this.drifts = new THREE.Group();
    {
      const db = new Batch(), sm = lam("driftSnow", () => ({ map: snowHD() }));
      for (const s of [-1, 1]) for (let x = -140; x < 140; x += 7) {
        if (Math.abs(x - BLACKFRIARS_X) < 7 || Math.abs(x - OLD_LB_X) < 9 || (s < 0 && x > STAIRS_X[0] - 4 && x < STAIRS_X[1] + 3)) continue;
        db.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sm, new THREE.Matrix4().compose(V(x + 3.5, -0.05, s * 29.4), new THREE.Quaternion(), V(3.8, 0.75 + 0.35 * Math.sin(x), 1.5)));
      }
      db.build(this.drifts);
      R.add(this.drifts);
      this.winterOnly.push(this.drifts);
    }
    // chimney smoke
    const smokeT = smokeTex();
    for (const [top, n] of [[[-22, D0 + 30.6, -77], 7], [[-80, D0 + 24.6, 93], 6]] as const)
      for (let k = 0; k < n; k++) {
        const mat = new THREE.MeshLambertMaterial({ map: smokeT, transparent: true, depthWrite: false });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        m.layers.set(NOINK);
        this.smoke.push({ m, mat, top: top as unknown as V3, k: k / n }); R.add(m);
      }
    this.swingBoat = new Actor(R, SWINGBOAT);
    for (const fg of FOREGROUND) {
      const o = kitClone(kit, fg.kit, fg.s ?? 1);
      if (!o) continue;
      o.position.set(...fg.pos); o.rotation.y = fg.yaw ?? 0; o.visible = false;
      this.fgs.push({ o, a: fg.a, b: fg.b }); R.add(o);
    }
  }

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(SUN_SHOT[id]?.az ?? L.az), el = THREE.MathUtils.degToRad(SUN_SHOT[id]?.el ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private wide(i: number) { while (this.wides.length <= i) this.wides.push(new Actor(this.root, WIDE)); return this.wides[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = T(f), s = SHOTS[id - 1], L = LIGHTS[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    setSeason(s.season);
    for (const o of this.winterOnly) o.visible = s.season === "winter";
    // ---- sky, fog, sun disc, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    // ---- river: colours, ice, flow, foam ----
    const Wu = this.WU, wc = K.water, ic = K.ice;
    untone(wc.near, Wu.wNearC.value); untone(wc.mid, Wu.wMidC.value); untone(wc.far, Wu.wFarC.value);
    untone(wc.crest, Wu.wCrest.value); untone(wc.trough, Wu.wTrough.value); untone(wc.glint, Wu.wGlint.value);
    untone(ic.a, Wu.iceA.value); untone(ic.b, Wu.iceB.value); untone(ic.snow, Wu.iceSnow.value); untone(ic.line, Wu.iceLine.value); untone(ic.foam, Wu.foamC.value);
    Wu.wShade.value.set(...wc.shade); Wu.wFlowT.value = flowAt(id) * t;
    const split = s.ice === "thaw" && t >= SPLIT_T;
    Wu.wIce.value = s.ice === "open" || (s.ice === "thaw" && split) ? 0 : 1;
    Wu.wIceX.value = s.ice === "dam" ? iceFrontX(id, t) : 1e4;
    Wu.wHide.value.set(0, 0, 0, 0);
    Wu.wWet.value = s.ice === "thaw" ? 0.75 : 0;
    Wu.wFoam.value = s.ice === "dam" ? 1 : 0;
    this.streamTexture.offset.x = -t * 0.9;
    // ---- floes (thaw, after the split) ----
    for (const fl of this.floes) {
      fl.mesh.visible = split;
      if (!split) continue;
      const press = inPoly(PRESS_AT[0], PRESS_AT[2], fl.pts);
      const d = floeDrift(fl.cx, fl.cz, press ? 4242 : fl.seed, t);
      fl.mesh.position.set(d.x, 0.02 * Math.sin(t * 1.3 + fl.seed), d.z);
      fl.mesh.rotation.set(d.tilt, press ? 0 : d.yaw, 0);
    }
    // ---- booths (pop up on "party"), barges, the rowing boat ----
    const fair = s.ice === "frozen" || s.ice === "thaw";
    const pop0 = wf(W.party);
    this.tents.forEach((tn, i) => {
      let sc2 = fair && (id <= 2 || id >= 4) ? 1 : 0;
      if (id === 4) sc2 = smooth((f - pop0 - (i % 9) * 2) / 7) * (1 + 0.12 * Math.sin(Math.min(1, Math.max(0, (f - pop0 - (i % 9) * 2) / 12)) * Math.PI));
      tn.g.visible = sc2 > 0.01;
      tn.g.scale.setScalar(Math.max(0.01, sc2));
      if (split && tn.floe >= 0) {
        const fl = this.floes[tn.floe], dx = tn.x - fl.cx, dz = tn.z - fl.cz, rot = fl.mesh.rotation.y, cs = Math.cos(rot), sn = Math.sin(rot);
        tn.g.position.set(fl.mesh.position.x + dx * cs + dz * sn, fl.mesh.position.y + 0.04, fl.mesh.position.z - dx * sn + dz * cs);
        tn.g.rotation.set(fl.mesh.rotation.x, tn.yaw + rot, 0);
      } else { tn.g.position.set(tn.x, 0, tn.z); tn.g.rotation.set(0, tn.yaw, 0); }
    });
    this.barges.forEach((bg, i) => {
      bg.g.visible = s.season === "winter" && s.ice !== "dam" && s.ice !== "open";
      if (split && bg.floe >= 0) {
        const fl = this.floes[bg.floe], dx = bg.x - fl.cx, dz = bg.z - fl.cz, rot = fl.mesh.rotation.y, cs = Math.cos(rot), sn = Math.sin(rot);
        bg.g.position.set(fl.mesh.position.x + dx * cs + dz * sn, 0.04, fl.mesh.position.z - dx * sn + dz * cs);
        bg.g.rotation.set(0, bg.yaw + rot, 0);
      } else if (split || s.ice === "open") {
        const u = split ? Math.max(0, t - SPLIT_T) : 0, sp = 0.6 + 0.3 * Math.sin(i * 2.1);
        bg.g.position.set(bg.x + sp * u, 0.03 * Math.sin(t * 1.4 + i), bg.z);
        bg.g.rotation.set(0, bg.yaw + 0.35 * u * Math.sin(i * 1.7), 0.015 * Math.sin(t * 1.1 + i));
      } else { bg.g.position.set(bg.x, -0.05, bg.z); bg.g.rotation.set(0, bg.yaw, 0); }
    });
    this.rowboat.visible = s.ice === "frozen";
    this.swingFrame.visible = fair && (id <= 2 || id >= 4);
    // ---- bridges: the new one from 1831, the old one comes down on "down" ----
    const summer = s.season === "summer";
    for (const bay of this.newLB) bay.group.visible = summer;
    for (const bay of this.oldLB) {
      bay.group.visible = !summer || id <= 20;
      bay.group.position.set(0, 0, 0); bay.group.rotation.set(0, 0, 0);
      if (id === 20 && bay.z < -6 && t >= DEMOLISH_T) {
        const u = t - DEMOLISH_T - (bay.z + 30) * 0.012, dropU = Math.max(0, u);
        bay.group.position.y = -0.5 * 9.8 * dropU * dropU;
        bay.group.rotation.x = 0.25 * dropU * Math.sin(bay.z);
        bay.group.visible = bay.group.position.y > -9;
      }
    }
    for (const g of this.fgs) g.o.visible = f >= g.a && f < g.b && g.a < s.b && g.b > s.a;
    for (const sm of this.smoke) {
      const u = (t * 0.11 + sm.k) % 1, sz = 3 + u * 9;
      sm.m.position.set(sm.top[0] - u * 18, sm.top[1] + u * 13 + u * u * 4, sm.top[2] + u * 3);
      sm.m.scale.set(sz, sz, 1); sm.m.quaternion.copy(cam.quaternion);
      sm.mat.opacity = 0.85 * (1 - u) ** 1.2;
    }
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0, wi = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1, geo = p.geo ?? "body";
      if (geo !== "swingboat" && !this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5 * (geo === "wide" ? 2 : 1) * sc2))) continue;
      const a = geo === "swingboat" ? this.swingBoat : geo === "wide" ? this.wide(wi++) : this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    for (let i = wi; i < this.wides.length; i++) this.wides[i].mesh.visible = false;
    if (!used.includes(this.swingBoat)) this.swingBoat.mesh.visible = false;
    void swingBoatAngle;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e3 of fused) e3.bind();
    return focus;
  }
}

const WATER_DECL = `#include <common>
varying vec3 vWP; varying vec3 vWN;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade, iceA, iceB, iceSnow, iceLine, foamC;
uniform sampler2D wNearTex, wFarTex, iceTex;
uniform float wFlowT, wIce, wIceX, wWet, wFoamX, wFoam;
uniform vec4 wHide; uniform vec2 wLane;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(wFlowT, 0.0);
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  // rapids below Old London Bridge: white streaks in the lanes behind the arch openings
  float dn = vWP.x - wFoamX;
  float nearB = step(0.0, dn) * (1.0 - smoothstep(3.0, 26.0, dn));
  float lane = pow(max(0.0, cos(6.2831853 * (vWP.z - wLane.x) / wLane.y)), 2.0);
  float streak = texture2D(wFarTex, vec2(vWP.x * 0.045 - wFlowT * 0.05, vWP.z * 0.25)).r + texture2D(wNearTex, vec2(vWP.x * 0.11 - wFlowT * 0.12, vWP.z * 0.4)).r;
  wc = mix(wc, foamC, clamp(wFoam * nearB * (0.25 + 0.75 * lane) * (0.35 + 1.2 * streak), 0.0, 0.85));
  // ice: powder snow (r), scratches + cracks (g), clear windows (b)
  vec4 ik = mix(texture2D(iceTex, vWP.xz / 24.0), texture2D(iceTex, vWP.xz / 70.0 + 0.21), smoothstep(30.0, 110.0, wd));
  vec3 ic = mix(iceA, iceB, ik.b);
  ic = mix(ic, iceSnow, ik.r * 0.6);
  ic = mix(ic, iceLine, ik.g * 0.55);
  ic = mix(ic, mix(wMidC, iceB, 0.55), wWet * (0.35 + 0.4 * ik.b) * (1.0 - ik.r));
#ifdef FLOE
  float iceK = 1.0;
  ic *= mix(0.78, 1.0, smoothstep(0.35, 0.8, vWN.y)); // floe sides a little darker
#else
  float iceK = wIce * (1.0 - smoothstep(wIceX - 1.2, wIceX + 1.2, vWP.x + 1.5 * sin(vWP.z * 0.7)));
  iceK *= 1.0 - step(wHide.x, vWP.x) * step(vWP.x, wHide.y) * step(wHide.z, vWP.z) * step(vWP.z, wHide.w);
#endif
  diffuseColor.rgb = mix(wc, ic, iceK);`;

function quadUp(x0: number, x1: number, z0: number, z1: number, u: number, v: number, dy = 0) {
  const y = D0 + dy, g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}
function wallQuad(x0: number, x1: number, z: number, dir: number) {
  const g = new THREE.BufferGeometry(), y0 = -0.6, y1 = D0;
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(Array(6).fill([0, 0, dir]).flat(), 3));
  const u = Math.abs(x1 - x0) / 4, v = (y1 - y0) / 4;
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}
function beamBetween(a: THREE.Vector3, b: THREE.Vector3, th: number) {
  const g = new THREE.BoxGeometry(th, a.distanceTo(b), th);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()), V(1, 1, 1));
  return g.applyMatrix4(m);
}
export { FPS, FLOE_RECT };

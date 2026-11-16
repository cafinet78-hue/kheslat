// The desert of Yazd as one three.js scene: sky (day / golden / night with stars and moon), sand and dunes, an adobe
// town with windcatchers, the yakhchal (stepped mud cone, ice pit inside), the shade wall, the ice pools (dry, water,
// freezing, frozen) from the frost short's river shader, the car with a frosted windscreen, the fridge, and the cast.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import { Batch, boxGeo, V, lam, Kit, Ray, setSeason } from "./build";
import { ctex, waterNear, waterFar, cloudHD, iceMarks, sandHD, kahgelHD, frostGlass, rng } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, WIDE } from "./cast";
import {
  FPS, SHOTS, ShotDef, V3, camAt, T, iceFrontX, pitFill, fridgeDoor, DOME_R, DOME_H, WALL_Z, WALL_H, WALL_X, POOLS, CAR_AT, FRIDGE_AT, ALLEY,
} from "./story";

const KENNEY: string[] = [];
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
/** per-shot sun (az from the shot's mean view axis toward screen right, el) */
const SUN_SHOT: Record<number, { az?: number; el?: number }> = {
  1: { az: 70, el: 62 }, 2: { az: 100, el: 60 }, 3: { az: 120, el: 55 }, 5: { az: 0, el: 28 }, 7: { az: 60, el: 10 }, 9: { az: -60, el: 10 },
  11: { az: 80, el: 60 }, 12: { az: 70, el: 60 }, 13: { az: 85, el: 52 }, 15: { az: 50, el: 9 }, 17: { az: 120, el: 12 }, 18: { az: 80, el: 58 },
  14: { az: -30, el: 50 }, 19: { az: -20, el: 30 },
};

/** sight lines of every lens position (scenery standing in the way is left out) */
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
const blocks = (rays: Ray[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  for (const { o, d, len } of rays) {
    let t0 = 0, t1 = len;
    for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) t0 = Infinity; continue; }
      const ta = (a - oo) / dd, tb = (b - oo) / dd;
      t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (t0 <= t1) return true;
  }
  return false;
};

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private wides: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>;
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden" | "night", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private water: THREE.Mesh; private dryBed: THREE.Mesh;
  private ice: THREE.InstancedMesh; private iceN: number;
  private fridgeDoor: THREE.Group; private fridge: THREE.Group; private car: THREE.Group;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root;
    // ---- sky (with stars at night) + light ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() }, stars: { value: 0 } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; uniform float stars; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main(){ vec3 d = normalize(vP); float el = asin(clamp(d.y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          if (stars > 0.0) {
            vec3 q = d * 260.0, cell = floor(q), f = fract(q) - 0.5;
            float r = h(cell), s = step(0.985, r) * smoothstep(0.32, 0.0, length(f)) * smoothstep(0.03, 0.2, el);
            c += stars * s * (0.6 + 0.8 * h(cell + 3.1)) * vec3(0.9, 0.95, 1.0);
          }
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 64, 32), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)), night: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.night.cloud)) };
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6, d = 700;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.05, 1.05, 1.05), transparent: true, depthWrite: false, fog: false }));
      const w = 120 + (i % 3) * 30;
      m.position.set(Math.cos(a) * d, 150 + (i % 3) * 40, Math.sin(a) * d); m.scale.set(w, w / 2.4, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- ground, dunes, town ----
    const rays = sightLines();
    const b = new Batch();
    const sandT = sandHD(); sandT.anisotropy = 16;
    const sand = lam("sand", () => ({ map: sandT }));
    const g = new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300, uv.getY(i) * 300);
    b.add(g, sand);
    const dune = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dm = [lam("duneA", () => ({ color: "#e0bd85" })), lam("duneB", () => ({ color: "#d4ae76" }))];
    ([[-380, 300, 220, 38, 120], [260, 420, 260, 46, 140], [460, -60, 180, 30, 160], [-420, -220, 200, 34, 150], [40, -460, 280, 40, 120], [380, -360, 200, 34, 130]] as const)
      .forEach(([x, z, sx, sy, sz], i) => b.add(dune, dm[i % 2], new THREE.Matrix4().compose(V(x, -4, z), new THREE.Quaternion(), V(sx, sy, sz))));
    const wallM = lam("kahgel", () => ({ map: kahgelHD() }));
    const wallM2 = lam("kahgel2", () => ({ map: kahgelHD("kahgelHD2", "#b8875a") }));
    const darkM = lam("slot", () => ({ color: "#4a3426" }));
    const r = rng(5);
    // adobe houses with flat roofs + parapets, some small domes, windcatchers
    const house = (x: number, z: number, w: number, d: number, h: number, i: number) => {
      if (blocks(rays, x - w / 2 - 0.5, x + w / 2 + 0.5, 0, h + 7, z - d / 2 - 0.5, z + d / 2 + 0.5)) return;
      const m = i % 3 ? wallM : wallM2;
      b.add(boxGeo(V(x - w / 2, 0, z - d / 2), V(x + w / 2, h, z + d / 2), 4), m);
      b.add(boxGeo(V(x - w / 2 - 0.1, h, z - d / 2 - 0.1), V(x + w / 2 + 0.1, h + 0.5, z + d / 2 + 0.1), 4), m);
      for (let k = 0; k < Math.max(1, Math.floor(w / 3)); k++) { // dark arched openings on the front (-z)
        const wx = x - w / 2 + (k + 0.5) * (w / Math.max(1, Math.floor(w / 3)));
        b.add(boxGeo(V(wx - 0.45, 0.9, z - d / 2 - 0.05), V(wx + 0.45, 2.2, z - d / 2 + 0.02)), darkM);
      }
      if (i % 4 === 1) b.add(new THREE.SphereGeometry(Math.min(w, d) * 0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, new THREE.Matrix4().makeTranslation(x, h + 0.5, z));
      if (i % 3 === 0) { // windcatcher (badgir): tall tower with dark vertical slots
        const bx = x + w * 0.25, bz = z + d * 0.2, bh = h + 5 + (i % 2) * 2;
        b.add(boxGeo(V(bx - 1.1, h, bz - 1.1), V(bx + 1.1, bh, bz + 1.1), 4), m);
        for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
          b.add(boxGeo(V(bx + k * 0.6 - 0.12, bh - 2.6, bz + s * 1.1 - 0.03), V(bx + k * 0.6 + 0.12, bh - 0.5, bz + s * 1.1 + 0.03)), darkM);
          b.add(boxGeo(V(bx + s * 1.1 - 0.03, bh - 2.6, bz + k * 0.6 - 0.12), V(bx + s * 1.1 + 0.03, bh - 0.5, bz + k * 0.6 + 0.12)), darkM);
        }
        b.add(boxGeo(V(bx - 1.25, bh, bz - 1.25), V(bx + 1.25, bh + 0.35, bz + 1.25)), m);
      }
    };
    let hi = 0;
    for (let zz = 22; zz < 170; zz += 13) for (let xx = -150; xx < 150; xx += 11) {
      if (Math.abs(xx - ALLEY[0]) < 6 && zz < 60) continue;
      const w = 7 + r() * 3, d = 8 + r() * 3, h = 4.5 + r() * 3.5;
      house(xx + r() * 2, zz + r() * 3, w, d, h, hi++);
    }
    for (let i = 0; i < 40; i++) { const x = (r() < 0.5 ? -1 : 1) * (60 + r() * 120), z = -150 + r() * 160; house(x, z, 7 + r() * 3, 8 + r() * 3, 4.5 + r() * 3, hi++); }
    // the alley's two facing rows (ALLEY): walls on both sides
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) house(ALLEY[0] + s * 7.5, ALLEY[2] - 6 + k * 9, 8, 8.5, 5.5 + (k % 2), hi++);
    // shade wall: east-west, buttresses on the south face, a stepped top
    b.add(boxGeo(V(-WALL_X, 0, WALL_Z - 0.8), V(WALL_X, WALL_H, WALL_Z + 0.8), 4), wallM2);
    for (let x = -WALL_X; x <= WALL_X; x += 6) b.add(boxGeo(V(x - 0.6, 0, WALL_Z - 2.0), V(x + 0.6, WALL_H * 0.75, WALL_Z - 0.8), 4), wallM2);
    for (let x = -WALL_X; x < WALL_X; x += 2) b.add(boxGeo(V(x, WALL_H, WALL_Z - 0.6), V(x + 1.2, WALL_H + 0.6, WALL_Z + 0.6), 2), wallM2);
    // pools: rims and dividers
    const { x0, x1, z0, z1 } = POOLS;
    b.add(boxGeo(V(x0 - 0.6, 0, z0 - 0.6), V(x1 + 0.6, 0.3, z0), 2), wallM);
    b.add(boxGeo(V(x0 - 0.6, 0, z1), V(x1 + 0.6, 0.3, z1 + 0.6), 2), wallM);
    for (const x of [x0 - 0.6, x0 + 15.7, x0 + 31.7, x1]) b.add(boxGeo(V(x, 0, z0), V(x + 0.6, 0.3, z1), 2), wallM);
    // the yakhchal: stepped cone (lathe), a door, the pit wall inside
    const prof: THREE.Vector2[] = [new THREE.Vector2(0.01, DOME_H)];
    const steps = 9;
    for (let k = steps; k >= 0; k--) {
      const y = (DOME_H * k) / steps, rr = DOME_R * Math.pow(1 - k / steps, 0.72) + 0.4;
      prof.push(new THREE.Vector2(rr, y + 0.35), new THREE.Vector2(rr, y));
    }
    prof.push(new THREE.Vector2(DOME_R + 0.4, 0));
    const lathe = new THREE.LatheGeometry(prof.reverse(), 48);
    const luv = lathe.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 12, luv.getY(i) * 5);
    const domeM = lam("domeKahgel", () => ({ map: kahgelHD("kahgelDome", "#c49460"), side: THREE.DoubleSide }));
    const domeMesh = new THREE.Mesh(lathe, domeM); domeMesh.castShadow = true; domeMesh.receiveShadow = true; R.add(domeMesh);
    b.add(boxGeo(V(-1.6, 0, -DOME_R - 1.4), V(1.6, 3.4, -DOME_R + 0.8), 2), wallM);   // porch
    b.add(boxGeo(V(-0.85, 0, -DOME_R - 1.45), V(0.85, 2.4, -DOME_R - 1.38)), darkM);  // door opening
    const pit = new THREE.CylinderGeometry(7.2, 7.2, 1.1, 40, 1, true).translate(0, 0.55, 0);
    b.add(pit, lam("pitWall", () => ({ color: "#8a6a4a", side: THREE.DoubleSide })));
    b.build(R);
    // ice blocks in the pit (instanced, count by fill)
    const iceM = lam("iceBlock", () => ({ color: "#cfe6f6" }));
    const pos: V3[] = [];
    for (let layer = 0; layer < 5; layer++) for (let ix = -6; ix <= 6; ix += 1.3) for (let iz = -6; iz <= 6; iz += 1.3) if (Math.hypot(ix, iz) < 6.4) pos.push([ix + (layer % 2) * 0.3, 0.3 + layer * 0.62, iz]);
    this.iceN = pos.length;
    this.ice = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), iceM, pos.length);
    pos.forEach((p, i) => this.ice.setMatrixAt(i, this.m4.makeTranslation(...p)));
    this.ice.receiveShadow = true; R.add(this.ice);

    // ---- pools: water / ice from the frost short's river shader; a dry bed for summer ----
    const wNear = waterNear(), wFar = waterFar(), ice = iceMarks();
    for (const t of [wNear, wFar, ice]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wFlowT: { value: 0 },
      iceTex: { value: ice }, iceA: { value: new THREE.Color() }, iceB: { value: new THREE.Color() }, iceSnow: { value: new THREE.Color() }, iceLine: { value: new THREE.Color() },
      wIce: { value: 1 }, wIceX: { value: 1e4 }, wWet: { value: 0 },
    };
    const waterM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", WATER_DECL).replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    waterM.customProgramCacheKey = () => "pool1";
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.12, (z0 + z1) / 2), waterM);
    this.water.receiveShadow = true; R.add(this.water);
    this.dryBed = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.06, (z0 + z1) / 2), lam("dryBed", () => ({ color: "#b8935f" })));
    this.dryBed.receiveShadow = true; R.add(this.dryBed);

    // ---- the car (shot 15) behind a low wall, the fridge (shot 18) ----
    this.car = new THREE.Group();
    {
      const cb = new Batch(), body = lam("carBody", () => ({ color: "#3f6f8a" })), trim = lam("carTrim", () => ({ color: "#2a2e38" }));
      cb.add(boxGeo(V(-2.1, 0.45, -0.9), V(2.1, 1.2, 0.9), 1), body);
      cb.add(boxGeo(V(-1.2, 1.2, -0.82), V(0.9, 1.95, 0.82), 1), body);
      for (const [x, z] of [[-1.35, -0.92], [1.35, -0.92], [-1.35, 0.92], [1.35, 0.92]]) cb.add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18).rotateX(Math.PI / 2), trim, new THREE.Matrix4().makeTranslation(x, 0.42, z));
      cb.add(boxGeo(V(2.08, 0.75, -0.7), V(2.14, 0.95, -0.4)), lam("lamp", () => ({ color: "#f4f1d0" })));
      cb.add(boxGeo(V(2.08, 0.75, 0.4), V(2.14, 0.95, 0.7)), lam("lamp", () => ({ color: "#f4f1d0" })));
      cb.add(boxGeo(V(-4.5, 0, -3.2), V(5.5, 1.6, -2.6), 4), wallM);
      cb.build(this.car);
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.78), new THREE.MeshBasicMaterial({ map: frostGlass(), transparent: true }));
      ws.position.set(0.93, 1.58, 0); ws.rotation.set(0, Math.PI / 2, 0); ws.rotateX(-0.45); ws.layers.set(NOINK);
      this.car.add(ws);
      this.car.position.set(...CAR_AT); this.car.rotation.y = -0.5;
      R.add(this.car);
    }
    this.fridge = new THREE.Group(); this.fridgeDoor = new THREE.Group();
    {
      const fb = new Batch(), wh = lam("fridgeWhite", () => ({ color: "#eef1f4" }));
      fb.add(boxGeo(V(-0.45, 0, -0.4), V(0.45, 1.85, -0.3)), wh);
      fb.add(boxGeo(V(-0.45, 0, -0.4), V(-0.38, 1.85, 0.35)), wh); fb.add(boxGeo(V(0.38, 0, -0.4), V(0.45, 1.85, 0.35)), wh);
      fb.add(boxGeo(V(-0.45, 0, -0.4), V(0.45, 0.08, 0.35)), wh); fb.add(boxGeo(V(-0.45, 1.77, -0.4), V(0.45, 1.85, 0.35)), wh);
      for (const y of [0.55, 1.0, 1.4]) fb.add(boxGeo(V(-0.38, y, -0.3), V(0.38, y + 0.03, 0.3)), lam("shelf", () => ({ color: "#cfe6f6" })));
      fb.build(this.fridge);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.3, 1.45) }));
      glow.position.set(0, 0.92, -0.29); glow.layers.set(NOINK); this.fridge.add(glow);
      const db = new Batch();
      db.add(boxGeo(V(0, 0, 0), V(0.9, 1.85, 0.08)), wh);
      db.add(boxGeo(V(0.72, 0.9, 0.08), V(0.78, 1.5, 0.14)), lam("handle", () => ({ color: "#9aa3ad" })));
      db.build(this.fridgeDoor);
      this.fridgeDoor.position.set(-0.45, 0, 0.35);
      this.fridge.add(this.fridgeDoor);
      this.fridge.position.set(...FRIDGE_AT); this.fridge.rotation.y = 0.5;
      R.add(this.fridge);
    }
  }

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
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.15; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    const Rr = Math.max(s.light === "golden" ? 30 : 12, THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95));
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    setSeason(s.season);
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    su.stars.value = s.light === "night" ? 1.4 : 0;
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light !== "day";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      const moon = s.light === "night";
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(moon ? 2.2 : 1.7)));
      (this.sunDisc.material as THREE.SpriteMaterial).color.set(moon ? new THREE.Color(1.6, 1.7, 1.9) : new THREE.Color(6.0, 4.4, 2.4));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(moon ? 10 : 24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(moon ? 0.35 : 1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i];
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[s.light][i % 4];
    }
    // ---- pools ----
    const Wu = this.WU, wc = K.water, ic = K.ice;
    untone(wc.near, Wu.wNearC.value); untone(wc.mid, Wu.wMidC.value); untone(wc.far, Wu.wFarC.value);
    untone(wc.crest, Wu.wCrest.value); untone(wc.trough, Wu.wTrough.value); untone(wc.glint, Wu.wGlint.value);
    untone(ic.a, Wu.iceA.value); untone(ic.b, Wu.iceB.value); untone(ic.snow, Wu.iceSnow.value); untone(ic.line, Wu.iceLine.value);
    Wu.wShade.value.set(...wc.shade); Wu.wFlowT.value = 0.05 * t;
    this.water.visible = s.pool !== "dry"; this.dryBed.visible = s.pool === "dry";
    Wu.wIce.value = s.pool === "water" ? 0 : 1;
    Wu.wIceX.value = s.pool === "freeze" ? iceFrontX(id, t) : 1e4;
    // ---- ice in the pit: filling in shot 10, full from 11 on (and only after it was stored) ----
    const fill = id === 10 ? pitFill(t) : id >= 11 ? 1 : 0.25;
    this.ice.count = Math.round(this.iceN * fill);
    this.fridge.visible = id === 18; this.fridgeDoor.rotation.y = -fridgeDoor(t);
    this.car.visible = id === 15;
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0, wi = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1, geo = p.geo ?? "body";
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5 * (geo === "wide" ? 2 : 1) * sc2))) continue;
      const a = geo === "wide" ? this.wide(wi++) : this.actor(ai++);
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
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade, iceA, iceB, iceSnow, iceLine;
uniform sampler2D wNearTex, wFarTex, iceTex;
uniform float wFlowT, wIce, wIceX, wWet;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(wFlowT, 0.0);
  vec4 mk = mix(texture2D(wNearTex, wp / 4.0), texture2D(wFarTex, wp / 20.0 + 0.37), smoothstep(10.0, 60.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.4);
  wc = mix(wc, wCrest, mk.r * 0.5);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  vec4 ik = texture2D(iceTex, vWP.xz / 14.0);
  vec3 ic = mix(iceA, iceB, ik.b);
  ic = mix(ic, iceSnow, ik.r * 0.35);
  ic = mix(ic, iceLine, ik.g * 0.55);
  float iceK = wIce * (1.0 - smoothstep(wIceX - 0.8, wIceX + 0.8, vWP.x + 0.8 * sin(vWP.z * 1.3)));
  diffuseColor.rgb = mix(wc, ic, iceK);`;
export { FPS };

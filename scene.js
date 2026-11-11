// The house that builds itself — realistic version.
// Everything is procedural (no image downloads): PBR textures with normal maps are
// generated at load time, the sky is a physical (Preetham) sky that also lights the
// scene through an environment map, and the frame goes through ambient occlusion,
// bloom and a subtle film finish.
// render(s) takes the build progress s in [0, 5]:
//   0 ground · 1 structure · 2 finish · 3 inside · 4 living · 5 home
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
let _seed = 20261111;
const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ---------------------------------------------------------------- tileable noise */
const H = (i, j, s = 0) => {
  let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
};
function vn(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = H(x0, y0, s), b = H(x1, y0, s), c = H(x0, y1, s), d = H(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(u, v, px, py, oct, s) {
  let sum = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vn(u * px * f, v * py * f, px * f, py * f, s + o * 7); n += amp; amp *= 0.5; f *= 2; }
  return sum / n;
}

export async function createScene(canvas) {
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const Q = mobile
    ? { dpr: Math.min(devicePixelRatio || 1, 1.5), ao: false, lawn: 14000, meadow: 7000, shadow: 2048, tex: 512, samples: 0, transmission: false }
    : { dpr: Math.min(devicePixelRatio || 1, 1.5), ao: true, lawn: 48000, meadow: 26000, shadow: 4096, tex: 1024, samples: 4, transmission: true };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc8b49a, 0.0042);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
  camera.layers.enable(1);
  const aoCam = camera.clone(); // ambient occlusion ignores layer 1 (glass, water, grass, crane)
  aoCam.layers.set(0);
  const toLayer1 = (o) => o.traverse((c) => c.layers.set(1));
  const timeU = { value: 0 };

  /* ================================================================ PBR textures */
  const SZ = Q.tex;
  function pbr(size, fn, strength, repeat = 1) {
    const N = size * size, col = new Uint8ClampedArray(N * 4), h = new Float32Array(N), o = { r: 0, g: 0, b: 0, h: 0 };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      fn((x + 0.5) / size, (y + 0.5) / size, o);
      const i = y * size + x;
      col[i * 4] = o.r; col[i * 4 + 1] = o.g; col[i * 4 + 2] = o.b; col[i * 4 + 3] = 255; h[i] = o.h;
    }
    const nor = new Uint8ClampedArray(N * 4), k = strength * size / 256;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      const nx = (l - r) * k, ny = (d - u) * k, len = Math.hypot(nx, ny, 1);
      nor[i * 4] = (nx / len * 0.5 + 0.5) * 255; nor[i * 4 + 1] = (ny / len * 0.5 + 0.5) * 255; nor[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255; nor[i * 4 + 3] = 255;
    }
    const mk = (data, srgb) => {
      const t = new THREE.DataTexture(data, size, size);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
      t.anisotropy = maxAniso; t.repeat.set(repeat, repeat);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { map: mk(col, true), normalMap: mk(nor, false) };
  }

  const T = {};
  const brickPal = [[160, 84, 58], [176, 98, 66], [146, 72, 50], [188, 114, 78], [134, 64, 46], [168, 90, 60], [152, 96, 70]];
  T.brick = pbr(SZ, (u, v, o) => { // 1 m tile: 16 courses of 250 mm bricks
    const fy = v * 16, row = Math.floor(fy), ty = fy - row, off = (row & 1) * 0.5;
    const fx = u * 4 + off, c = Math.floor(fx), tx = fx - c, cid = ((c % 4) + 4) % 4;
    const e = Math.min(Math.min(tx, 1 - tx) / 0.035, Math.min(ty, 1 - ty) / 0.15);
    const n = fbm(u, v, 12, 12, 4, 3), n2 = vn(u * 256, v * 256, 256, 256, 5);
    if (e < 0.5) { const g = 176 + n * 40 + (n2 - 0.5) * 30; o.r = g; o.g = g - 8; o.b = g - 22; o.h = 0.12 + n2 * 0.12; }
    else {
      const p = brickPal[Math.floor(H(cid, row, 9) * brickPal.length)];
      const k = (0.8 + 0.3 * n + (n2 - 0.5) * 0.22) * (H(cid, row, 4) < 0.14 ? 0.78 : 1);
      o.r = p[0] * k; o.g = p[1] * k; o.b = p[2] * k;
      o.h = 0.55 + 0.35 * Math.sqrt(Math.min(1, (e - 0.5) * 1.3)) + (n2 - 0.5) * 0.12;
    }
  }, 2.2);
  await tick();
  const woodPal = [[150, 104, 68], [136, 92, 60], [160, 114, 76], [124, 84, 56], [144, 100, 66]];
  T.wood = pbr(SZ, (u, v, o) => { // 1 m tile: eight 125 mm larch boards
    const fx = u * 8, b = Math.floor(fx), tx = fx - b, sh = H(b, 1, 7);
    if (tx < 0.03 || tx > 0.985) { o.r = 36; o.g = 26; o.b = 18; o.h = 0; return; }
    const grain = fbm(u + sh * 0.37, v, 96, 3, 3, 11), fine = vn(u * 512, v * 16, 512, 16, 13);
    const p = woodPal[Math.floor(sh * woodPal.length)], k = 0.74 + 0.4 * grain + 0.12 * (fine - 0.5);
    o.r = p[0] * k; o.g = p[1] * k; o.b = p[2] * k;
    o.h = 0.5 + 0.4 * Math.min(1, Math.min(tx, 1 - tx) / 0.07) + (grain - 0.5) * 0.25;
  }, 2.0);
  await tick();
  T.render = pbr(SZ / 2, (u, v, o) => { // 2 m tile of lime plaster
    const n = fbm(u, v, 4, 4, 4, 21), f = fbm(u, v, 64, 64, 2, 22);
    const k = 0.92 + 0.08 * n + 0.05 * (f - 0.5);
    o.r = 238 * k; o.g = 232 * k; o.b = 221 * k; o.h = n * 0.25 + f * 0.75;
  }, 0.7, 0.5);
  T.stone = pbr(SZ, (u, v, o) => { // 1.2 m tile: travertine pavers 600×400 mm
    const fy = v * 3, r = Math.floor(fy), ty = fy - r, off = (r & 1) * 0.5;
    const fx = u * 2 + off, c = Math.floor(fx), tx = fx - c, cid = ((c % 2) + 2) % 2;
    if (tx < 0.008 || tx > 0.992 || ty < 0.012 || ty > 0.988) { o.r = 168; o.g = 158; o.b = 142; o.h = 0.05; return; }
    const vein = fbm(u, v, 3, 36, 3, 31), pit = vn(u * 96, v * 96, 96, 96, 33), tone = H(cid, r, 8);
    let k = 0.9 + 0.12 * tone + (vein - 0.5) * 0.22, hh = 0.7 + (vein - 0.5) * 0.06;
    if (pit > 0.8) { k *= 0.84; hh = 0.5; }
    o.r = 224 * k; o.g = 210 * k; o.b = 186 * k; o.h = hh;
  }, 1.6, 1 / 1.2);
  await tick();
  T.roof = pbr(SZ / 2, (u, v, o) => { // 1 m tile: standing seams every 500 mm
    const d = Math.abs(((u * 2) % 1) - 0.5) * 2; // 1 at seam
    const n = fbm(u, v, 6, 6, 3, 41);
    const k = 0.92 + 0.12 * n;
    o.r = 62 * k; o.g = 66 * k; o.b = 74 * k;
    o.h = d > 0.975 ? 1 : d > 0.95 ? 0.6 : 0.25 + n * 0.04;
  }, 3.0);
  T.concrete = pbr(SZ / 2, (u, v, o) => {
    const n = fbm(u, v, 6, 6, 4, 61), p = vn(u * 160, v * 160, 160, 160, 62);
    let k = 0.84 + 0.26 * n; if (p > 0.86) k *= 0.8;
    o.r = 164 * k; o.g = 161 * k; o.b = 154 * k; o.h = n * 0.4 + (p > 0.86 ? 0 : 0.4);
  }, 0.8, 0.5);
  await tick();
  T.floor = pbr(SZ, (u, v, o) => { // 2 m tile: 200 mm oak planks
    const fy = v * 10, r = Math.floor(fy), ty = fy - r, ph = H(r, 3, 71);
    const ju = (u + ph) % 1;
    if (ty < 0.02 || ju < 0.004) { o.r = 90; o.g = 66; o.b = 44; o.h = 0; return; }
    const grain = fbm(u + ph, v, 3, 160, 3, 72), tone = H(r, Math.floor(u + ph), 73);
    const k = 0.84 + 0.22 * grain + 0.1 * tone;
    o.r = 200 * k; o.g = 160 * k; o.b = 116 * k; o.h = 0.6 + grain * 0.2;
  }, 0.8, 0.5);
  await tick();
  T.dirt = pbr(SZ / 2, (u, v, o) => { // 3 m tile of site soil
    const n = fbm(u, v, 8, 8, 5, 81), p = vn(u * 90, v * 90, 90, 90, 82);
    if (p > 0.82) { const g = 150 + n * 40; o.r = g; o.g = g - 6; o.b = g - 14; o.h = 0.9; return; }
    const k = 0.62 + 0.55 * n;
    o.r = 120 * k; o.g = 92 * k; o.b = 68 * k; o.h = n * 0.6;
  }, 1.6, 14);
  T.ground = pbr(SZ / 2, (u, v, o) => { // 4 m tile, multiplied with the terrain's vertex colours
    const n = fbm(u, v, 24, 24, 4, 91), f = vn(u * 220, v * 220, 220, 220, 92);
    const g = 0.72 + 0.45 * n + (f - 0.5) * 0.35;
    o.r = 255 * g; o.g = 250 * g; o.b = 226 * g; o.h = f * 0.6 + n * 0.4;
  }, 1.2, 200);
  T.water = pbr(256, (u, v, o) => { o.r = o.g = o.b = 128; o.h = fbm(u, v, 5, 5, 4, 51); }, 1.4, 0.22);
  await tick();

  /* ================================================================ materials */
  const plane = () => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // keeps y <= constant
  const clip = { bl: plane(), bu: plane(), re: plane(), wo: plane() };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));
  const clipped = (o, p) => std(Object.assign(o, { clippingPlanes: [p], clipShadows: true }));
  const tx = (t, ns = 1) => ({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(ns, ns) });
  const M = {
    concrete: std({ ...tx(T.concrete), roughness: 0.95 }),
    concreteU: clipped({ ...tx(T.concrete), roughness: 0.95 }, clip.bu),
    brick: std({ ...tx(T.brick), roughness: 0.9 }),
    brickL: clipped({ ...tx(T.brick), roughness: 0.9 }, clip.bl),
    brickU: clipped({ ...tx(T.brick), roughness: 0.9 }, clip.bu),
    render: clipped({ ...tx(T.render, 0.6), roughness: 0.9 }, clip.re),
    gravel: clipped({ ...tx(T.concrete, 1.4), color: 0x9a968e, roughness: 1 }, clip.re),
    wood: clipped({ ...tx(T.wood), roughness: 0.78 }, clip.wo),
    roof: std({ ...tx(T.roof, 1), roughness: 0.38, metalness: 0.65 }),
    metal: std({ color: 0x2a2c30, roughness: 0.35, metalness: 0.8 }),
    frame: std({ color: 0x1c1d20, roughness: 0.32, metalness: 0.7 }),
    white: std({ ...tx(T.render, 0.6), roughness: 0.85 }),
    sill: std({ ...tx(T.stone, 0.5), roughness: 0.7 }),
    stone: std({ ...tx(T.stone, 0.9), roughness: 0.78 }),
    floor: std({ ...tx(T.floor, 0.6), roughness: 0.45 }),
    rebar: std({ color: 0x6b3b22, roughness: 0.7, metalness: 0.6 }),
    timber: std({ color: 0xc09a6a, roughness: 0.9, map: T.wood.map }),
    yellow: std({ color: 0xe9b02f, roughness: 0.5, metalness: 0.3 }),
    dirt: std({ ...tx(T.dirt, 1.2), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    poolTile: std({ color: 0xbfe3ea, roughness: 0.3 }),
    fab: std({ color: 0xd9cfc0, roughness: 1 }),
    fab2: std({ color: 0x7d6e5e, roughness: 1 }),
    linen: std({ color: 0xece5d6, roughness: 0.95, side: THREE.DoubleSide }),
    walnut: std({ color: 0x4b3426, roughness: 0.5 }),
    oak: std({ color: 0xb08a5e, roughness: 0.55, map: T.floor.map }),
    marble: std({ color: 0xf3f0ea, roughness: 0.18 }),
    pot: std({ color: 0xb9a68e, roughness: 0.9 }),
    lamp: std({ color: 0xfff0d8, emissive: 0xffc27a, emissiveIntensity: 0 }),
    fire: std({ color: 0x331100, emissive: 0xff6a1a, emissiveIntensity: 0 }),
    art: std({ color: 0xb8653d, roughness: 0.9 }),
    rug: std({ color: 0xc2b39b, roughness: 1, map: T.render.map }),
  };
  // radial fade for the site soil disc
  {
    const s = 128, d = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const r = Math.hypot(x - s / 2 + 0.5, y - s / 2 + 0.5) / (s / 2); const a = 255 * (1 - smooth(r, 0.7, 1)) * (0.85 + 0.15 * H(x, y, 3)); d.set([a, a, a, 255], (y * s + x) * 4); }
    const t = new THREE.DataTexture(d, s, s); t.needsUpdate = true; t.magFilter = THREE.LinearFilter;
    M.dirt.alphaMap = t;
  }
  M.glass = Q.transmission
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.02, ior: 1.5, side: THREE.DoubleSide, specularIntensity: 1, envMapIntensity: 1.3 })
    : new THREE.MeshPhysicalMaterial({ color: 0x9fb0bb, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 });
  M.glassUp = new THREE.MeshPhysicalMaterial({ color: 0x0c1116, metalness: 0.1, roughness: 0.04, envMapIntensity: 1.4, emissive: 0xffa85a, emissiveIntensity: 0, clearcoat: 1, clearcoatRoughness: 0.02 });
  M.water = new THREE.MeshPhysicalMaterial({ color: 0x1f8fb2, roughness: 0.02, metalness: 0, normalMap: T.water.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.86, envMapIntensity: 1.3, emissive: 0x0f6f96, emissiveIntensity: 0.05, clearcoat: 1, clearcoatRoughness: 0 });

  function windify(mat, amp, grow) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU; sh.uniforms.uWind = { value: amp };
      if (grow) sh.uniforms.uGrow = grow;
      sh.vertexShader = `uniform float uTime;\nuniform float uWind;\n${grow ? 'uniform float uGrow;\n' : ''}` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        ${grow ? 'transformed.y *= uGrow;' : ''}
        float sw = sin(uTime * 1.2 + ip.x * 0.13 + ip.z * 0.11) + 0.45 * sin(uTime * 2.7 + ip.x * 0.37 - ip.z * 0.21);
        float hy = max(position.y, 0.0);
        transformed.x += sw * uWind * hy * hy;
        transformed.z += sw * uWind * 0.6 * hy * hy;`);
    };
  }

  /* ================================================================ helpers */
  function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const ox = x - w / 2, oy = y - h / 2, oz = z - d / 2;
    const dims = [[d, h, oz, oy], [d, h, oz, oy], [w, d, ox, oz], [w, d, ox, oz], [w, h, ox, oy], [w, h, ox, oy]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v, D = dims[f]; uv.setXY(i, uv.getX(i) * D[0] + D[2], uv.getY(i) * D[1] + D[3]); }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg = 18) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function ball(r, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function wall(len, h, t, wins, mat, ext = 0, thick = 0) {
    const g = new THREE.Group();
    const L = len + ext * 2, Hh = h + (thick ? 0.03 : 0), Tk = t + thick * 2, inset = thick ? 0.03 : 0;
    const piece = (x0, x1, y0, y1) => { if (x1 - x0 > 0.005 && y1 - y0 > 0.005) box(x1 - x0, y1 - y0, Tk, mat, (x0 + x1) / 2, (y0 + y1) / 2, 0, g); };
    let c = -L / 2;
    for (const w of [...wins].sort((a, b) => a.x - b.x)) {
      const a = w.x - w.w / 2 + inset, b = w.x + w.w / 2 - inset;
      piece(c, a, 0, Hh); piece(a, b, 0, w.y + inset); piece(a, b, w.y + w.h - inset, Hh);
      c = b;
    }
    piece(c, L / 2, 0, Hh);
    return g;
  }
  function gable(width, rise, thick, mat, x, y) {
    const sh = new THREE.Shape();
    sh.moveTo(-width / 2, 0); sh.lineTo(width / 2, 0); sh.lineTo(0, rise); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
    geo.translate(0, 0, -thick / 2);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = Math.PI / 2; m.position.set(x, y, 0); m.castShadow = m.receiveShadow = true;
    return m;
  }
  const popIn = (list, s, start, step, dur = 0.25) => list.forEach((o, i) => {
    const t = clamp((s - start - i * step) / dur);
    o.visible = t > 0;
    o.scale.setScalar(Math.max(0.0001, t <= 0 ? 0 : easeOutBack(t)));
  });

  /* ---- foliage geometry: clusters of lumpy blobs with vertex colours and soft normals */
  const blobBase = new THREE.IcosahedronGeometry(1, 2);
  {
    const p = blobBase.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.82 + 0.36 * H(Math.round(x * 997), Math.round(y * 991), Math.round(z * 983));
      p.setXYZ(i, x * k, y * k, z * k);
    }
  }
  function foliage(blobs, center, colorOf, soft = 0.65) {
    const geos = blobs.map((b) => {
      const g = blobBase.clone();
      g.scale(b.sx, b.sy, b.sz); g.translate(b.x, b.y, b.z);
      const p = g.attributes.position, c = new Float32Array(p.count * 3), col = colorOf(b);
      for (let i = 0; i < p.count; i++) {
        const shade = 0.72 + 0.4 * ((p.getY(i) - b.y) / (b.sy * 2) + 0.5) * 0.6 + (H(i, b.i, 5) - 0.5) * 0.12;
        c[i * 3] = col[0] * shade; c[i * 3 + 1] = col[1] * shade; c[i * 3 + 2] = col[2] * shade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.deleteAttribute('uv');
      return g;
    });
    const g = mergeGeometries(geos);
    g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), m = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i) - center.x, (p.getY(i) - center.y) * center.k, p.getZ(i) - center.z).normalize();
      m.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(v, soft).normalize();
      n.setXYZ(i, m.x, m.y, m.z);
    }
    return g;
  }
  const srgb = (r, g, b) => { const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };
  function cypressGeo() { // unit height, ~1 unit wide before instance scaling
    const prof = (t) => 0.5 * Math.pow(1 - t, 0.85) * Math.min(1, (t + 0.06) / 0.22);
    const blobs = [];
    for (let i = 0; i < 110; i++) {
      const t = Math.pow(rnd(), 0.9) * 0.97, a = rnd() * Math.PI * 2, r = prof(t), rad = r * (0.45 + 0.5 * Math.sqrt(rnd()));
      const s = (0.1 + 0.14 * rnd()) * (0.45 + r * 1.4);
      blobs.push({ i, x: Math.cos(a) * rad, y: t, z: Math.sin(a) * rad, sx: s, sy: s * 0.16, sz: s, t, out: rad / Math.max(r, 0.01) });
    }
    const pal = [srgb(38, 54, 32), srgb(48, 64, 38), srgb(32, 46, 28), srgb(56, 70, 40)];
    return foliage(blobs, { x: 0, y: 0.5, z: 0, k: 0.12 }, (b) => { const c = pal[b.i % 4], k = 0.6 + 0.5 * b.out; return [c[0] * k, c[1] * k, c[2] * k]; }, 0.55);
  }
  function oliveCanopyGeo() { // metres, crown centre around y = 2.6
    const blobs = [];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, e = (rnd() - 0.35) * 1.2, r = 0.55 + 0.45 * rnd();
      blobs.push({ i, x: Math.cos(a) * Math.cos(e) * 2.0 * r, y: 2.6 + Math.sin(e) * 1.1 * r, z: Math.sin(a) * Math.cos(e) * 1.8 * r, sx: 0.5 + 0.35 * rnd(), sy: 0.38 + 0.25 * rnd(), sz: 0.5 + 0.35 * rnd() });
    }
    const pal = [srgb(122, 134, 96), srgb(104, 118, 82), srgb(140, 150, 110), srgb(94, 106, 74)];
    return foliage(blobs, { x: 0, y: 2.6, z: 0, k: 1.4 }, (b) => pal[b.i % 4], 0.6);
  }
  function limb(a, b, r0, r1) {
    const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r1, r0, d.length(), 7, 1);
    g.translate(0, d.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
    return g;
  }
  function oliveTrunkGeo() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const k = V(0.15, 1.2, 0.05);
    return mergeGeometries([limb(V(0, -0.2, 0), k, 0.26, 0.18), limb(k, V(-0.7, 2.3, 0.35), 0.15, 0.07), limb(k, V(0.8, 2.4, -0.45), 0.15, 0.07), limb(k, V(0.1, 2.6, 0.6), 0.12, 0.06)]);
  }
  function shrubGeo(w, h, d, pal, n = 14) {
    const blobs = [];
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); blobs.push({ i, x: Math.cos(a) * r * w * 0.5, y: h * (0.35 + 0.45 * rnd()), z: Math.sin(a) * r * d * 0.5, sx: w * (0.22 + 0.14 * rnd()), sy: h * (0.3 + 0.15 * rnd()), sz: d * (0.22 + 0.14 * rnd()) }); }
    return foliage(blobs, { x: 0, y: h * 0.4, z: 0, k: 1 }, (b) => pal[b.i % pal.length], 0.6);
  }
  const foliageMat = (wind) => { const m = std({ vertexColors: true, roughness: 0.95 }); windify(m, wind); return m; };

  /* ================================================================ sky & environment */
  const sky = new Sky();
  sky.scale.setScalar(1000);
  sky.material.fragmentShader = 'uniform float skyGain;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyGain, 1.0 );');
  sky.material.uniforms.skyGain = { value: 1 };
  scene.add(sky);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.material = sky.material;
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, envKey = -99, envT = 0;
  function updateEnv(s, now, force) {
    if (!force && envKey > -50 && (Math.abs(s - envKey) < 0.03 || now - envT < 0.12)) return;
    envKey = s; envT = now;
    const rt = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
  }

  /* ================================================================ terrain */
  function hh(x, z) {
    const r = Math.hypot(x, z), k = smooth(r, 26, 80);
    let h = Math.sin(x * 0.031 + 0.6) * 7 + Math.cos(z * 0.027 + 1.1) * 8 + Math.sin((x + z) * 0.061) * 3 + Math.sin(x * 0.13 - z * 0.07) * 1.1 + 6;
    h += Math.max(0, r - 120) * 0.17;
    return h * k;
  }
  {
    const geo = new THREE.PlaneGeometry(900, 900, 260, 260);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), cA = new THREE.Color(0x56692f), cB = new THREE.Color(0x8a8648), cC = new THREE.Color(0xb39a5e), cD = new THREE.Color(0x6e5a3c), cLawn = new THREE.Color(0x5b7d34);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, hh(x, z));
      const n = (Math.sin(x * 0.05) * Math.cos(z * 0.043) + Math.sin(x * 0.11 + z * 0.07) * 0.5) * 0.5 + 0.5;
      c.copy(cA).lerp(cB, clamp(n));
      const field = Math.sin(x * 0.012 + 2) * Math.cos(z * 0.015 - 1);
      if (field > 0.35) c.lerp(cC, 0.7);
      if (field < -0.6) c.lerp(cD, 0.45);
      c.lerp(cLawn, 1 - smooth(Math.hypot(x, z), 18, 42));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, std({ vertexColors: true, roughness: 1, ...tx(T.ground, 0.8) }));
    terrain.receiveShadow = true;
    scene.add(terrain);
  }
  await tick();

  /* ================================================================ vegetation */
  const dummy = new THREE.Object3D();
  {
    const keepOut = (x, z) => x > -17 && x < 17 && z > -12 && z < 24;
    const cyp = [], oli = [];
    for (let i = 0; i < 15; i++) cyp.push([-34 + i * 4.8 + rnd(), -26 + rnd()]);
    for (let i = 0; i < 32; i++) { const t = i / 31; cyp.push([38 + Math.sin(t * 3) * 10 + (i % 2 ? 2.3 : -2.3), 18 - t * 150]); }
    for (let i = 0; i < 28; i++) { const t = i / 27; cyp.push([-48 - t * 95 + (i % 2 ? 2.2 : -2.2), 30 - t * 60 + Math.sin(t * 4) * 6]); }
    for (let i = 0; i < 100; i++) {
      const a = rnd() * Math.PI * 2, r = 34 + rnd() * 260, n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) { const x = Math.cos(a) * r + k * 2.4, z = Math.sin(a) * r + rnd() * 2; if (!keepOut(x, z)) cyp.push([x, z]); }
    }
    cyp.push([-18, -14], [-15.5, -16], [16, -16], [18.5, -13.5]);
    const groves = [[-46, 6], [44, -34], [-66, -60], [16, -86], [-28, 44], [70, 34], [-96, -14], [100, -80], [-20, -120], [-130, 40]];
    for (const [cx, cz] of groves) for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      const x = cx + i * 6.5 + rnd() * 1.5, z = cz + j * 6.5 + rnd() * 1.5;
      if (!keepOut(x, z)) oli.push([x, z]);
    }
    oli.push([-21, -6], [-19, 12], [22, -4], [21, -15], [-8, -19], [9, -21], [-26, 18]);

    const cypMat = foliageMat(0.05);
    const variants = [cypressGeo(), cypressGeo(), cypressGeo()];
    variants.forEach((geo, vI) => {
      const list = cyp.filter((_, i) => i % 3 === vI);
      const im = new THREE.InstancedMesh(geo, cypMat, list.length);
      list.forEach(([x, z], i) => {
        const h = 8 + rnd() * 5, w = 1.5 + rnd() * 0.7;
        dummy.position.set(x, hh(x, z) - 0.3, z); dummy.scale.set(w, h, w); dummy.rotation.set(0, rnd() * 6, 0); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.castShadow = im.receiveShadow = true;
      scene.add(im);
    });
    const canopyMat = foliageMat(0.012), barkMat = std({ color: 0x6a5d50, roughness: 1 });
    const canopies = [oliveCanopyGeo(), oliveCanopyGeo()], trunkGeo = oliveTrunkGeo();
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, oli.length);
    canopies.forEach((geo, vI) => {
      const list = oli.map((p, i) => [p, i]).filter(([, i]) => i % 2 === vI);
      const im = new THREE.InstancedMesh(geo, canopyMat, list.length);
      list.forEach(([[x, z], idx], i) => {
        const s = 0.8 + rnd() * 0.45, ry = rnd() * 6;
        dummy.position.set(x, hh(x, z), z); dummy.scale.setScalar(s); dummy.rotation.set(0, ry, 0); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix); trunks.setMatrixAt(idx, dummy.matrix);
      });
      im.castShadow = im.receiveShadow = true;
      scene.add(im);
    });
    trunks.castShadow = trunks.receiveShadow = true;
    scene.add(trunks);

    // vineyard rows on the hillside
    const vineGeo = shrubGeo(1.3, 1.1, 0.6, [srgb(70, 92, 44), srgb(84, 104, 50), srgb(60, 80, 40)], 7);
    const vines = [];
    for (let r = 0; r < 18; r++) for (let i = 0; i < 34; i++) {
      const x = 52 + i * 1.3 + Math.sin(r) * 2, z = -40 + r * 2.8;
      vines.push([x, z]);
    }
    for (let r = 0; r < 14; r++) for (let i = 0; i < 30; i++) vines.push([-70 + i * 1.3, 60 + r * 2.8]);
    const vm = new THREE.InstancedMesh(vineGeo, foliageMat(0.01), vines.length);
    vines.forEach(([x, z], i) => { dummy.position.set(x, hh(x, z), z); dummy.scale.set(1, 0.9 + rnd() * 0.2, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); vm.setMatrixAt(i, dummy.matrix); });
    vm.castShadow = vm.receiveShadow = true;
    scene.add(vm);
  }
  await tick();

  /* ---- grass: instanced clumps of tapered blades swaying in the wind */
  function grassGeo(blades, hMin, hMax) {
    const geos = [];
    for (let b = 0; b < blades; b++) {
      const g = new THREE.PlaneGeometry(0.045, 1, 1, 4);
      g.translate(0, 0.5, 0);
      const p = g.attributes.position, h = hMin + (hMax - hMin) * rnd(), lean = (rnd() - 0.5) * 0.5;
      const c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setXYZ(i, p.getX(i) * Math.pow(1 - y, 0.8), y * h, y * y * lean * h);
        const k = 0.35 + 0.65 * y; c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.rotateY(rnd() * Math.PI);
      g.translate((rnd() - 0.5) * 0.22, 0, (rnd() - 0.5) * 0.22);
      g.deleteAttribute('uv');
      geos.push(g);
    }
    const g = mergeGeometries(geos), n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
  }
  const lawnGrow = { value: 0.001 };
  function grassField(count, geo, place, colors, grow) {
    const mat = std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
    windify(mat, 0.1, grow);
    const im = new THREE.InstancedMesh(geo, mat, count), c = new THREE.Color();
    let n = 0, guard = 0;
    while (n < count && guard++ < count * 6) {
      const p = place(); if (!p) continue;
      dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.scale.set(1, p[3], 1); dummy.updateMatrix();
      im.setMatrixAt(n, dummy.matrix);
      const col = colors[Math.floor(rnd() * colors.length)];
      c.setRGB(col[0], col[1], col[2]).multiplyScalar(0.85 + rnd() * 0.3);
      im.setColorAt(n, c);
      n++;
    }
    im.count = n;
    im.receiveShadow = true;
    toLayer1(im);
    scene.add(im);
    return im;
  }
  const inRect = (x, z, x0, x1, z0, z1) => x > x0 && x < x1 && z > z0 && z < z1;
  const lawn = grassField(Q.lawn, grassGeo(5, 0.7, 1.15), () => {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 21.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inRect(x, z, -7.8, 7.8, -4.8, 4.8) || inRect(x, z, -10.3, 10.3, 3.8, 13.3) || inRect(x, z, 5.3, 8.7, 13, 14.4) || inRect(x, z, -9.7, -0.5, 13.8, 15.3)) return null;
    return [x, 0, z, 0.2 + rnd() * 0.12];
  }, [srgb(70, 108, 40), srgb(84, 120, 46), srgb(62, 96, 36), srgb(96, 126, 52)], lawnGrow);
  grassField(Q.meadow, grassGeo(6, 0.6, 1.2), () => {
    const a = rnd() * Math.PI * 2, r = 19 + Math.pow(rnd(), 0.8) * 30, x = Math.cos(a) * r, z = Math.sin(a) * r;
    return [x, hh(x, z), z, 0.4 + rnd() * 0.5];
  }, [srgb(118, 128, 62), srgb(150, 140, 78), srgb(96, 118, 52), srgb(176, 158, 96)]);
  await tick();

  /* ================================================================ the house */
  const F0 = 0.5, H1 = 3.2, F1 = F0 + H1, U0 = F1 + 0.3, H2 = 3.0, U1 = U0 + H2, RISE = 1.8, RIDGE = U1 + RISE;
  const LW = 14, LD = 8, UW = 12, UD = 7.2, TH = 0.3;
  const house = new THREE.Group();
  scene.add(house);

  box(LW + 1, F0, LD + 1, M.concrete, 0, F0 / 2, 0, house);
  const rebar = new THREE.Group(); house.add(rebar);
  for (let x = -LW / 2 + 0.15; x <= LW / 2; x += 1.4) for (const z of [-LD / 2 + 0.15, LD / 2 - 0.15]) cyl(0.016, 0.016, 1.4 + rnd() * 1.2, M.rebar, x, F0 + 0.9, z, rebar, 6);
  for (let z = -LD / 2 + 1.5; z < LD / 2 - 1; z += 1.4) for (const x of [-LW / 2 + 0.15, LW / 2 - 0.15]) cyl(0.016, 0.016, 1.4 + rnd() * 1.2, M.rebar, x, F0 + 0.9, z, rebar, 6);

  const lowerDefs = [
    { len: LW, pos: [0, F0, LD / 2 - TH / 2], rot: 0, end: true, mull: 3, wins: [{ x: -4.7, w: 4.1, y: 0, h: 2.75 }, { x: 0, w: 4.7, y: 0, h: 2.75 }, { x: 4.7, w: 4.1, y: 0, h: 2.75 }] },
    { len: LW, pos: [0, F0, -LD / 2 + TH / 2], rot: 0, end: true, mull: 1, wins: [{ x: -3.6, w: 2.2, y: 0.9, h: 1.7 }, { x: 3.4, w: 1.4, y: 1.2, h: 1.2 }] },
    { len: LD - 2 * TH, pos: [LW / 2 - TH / 2, F0, 0], rot: Math.PI / 2, end: false, mull: 1, wins: [{ x: 0.6, w: 1.6, y: 0.9, h: 1.7 }] },
    { len: LD - 2 * TH, pos: [-LW / 2 + TH / 2, F0, 0], rot: Math.PI / 2, end: false, mull: 1, wins: [{ x: -2.2, w: 1.2, y: 0.9, h: 1.7 }] },
  ];
  const upperDefs = [
    { len: UW, pos: [0, U0, UD / 2 - TH / 2], rot: 0, end: true, mull: 1, sill: true, wins: [{ x: -3.8, w: 1.6, y: 0.5, h: 2 }, { x: 0, w: 1.6, y: 0.5, h: 2 }, { x: 3.8, w: 1.6, y: 0.5, h: 2 }] },
    { len: UW, pos: [0, U0, -UD / 2 + TH / 2], rot: 0, end: true, mull: 1, sill: true, wins: [{ x: -2.6, w: 1.4, y: 0.8, h: 1.5 }, { x: 2.6, w: 1.4, y: 0.8, h: 1.5 }] },
    { len: UD - 2 * TH, pos: [UW / 2 - TH / 2, U0, 0], rot: Math.PI / 2, end: false, mull: 1, wins: [{ x: 0, w: 1.2, y: 0.8, h: 1.5 }] },
    { len: UD - 2 * TH, pos: [-UW / 2 + TH / 2, U0, 0], rot: Math.PI / 2, end: false, mull: 1, wins: [{ x: 0, w: 1.2, y: 0.8, h: 1.5 }] },
  ];
  function buildWalls(defs, h, mat, shell) {
    for (const d of defs) {
      const g = shell ? wall(d.len, h, TH, d.wins, mat, d.end ? 0.06 : 0.02, 0.04) : wall(d.len, h, TH, d.wins, mat);
      g.position.set(...d.pos); g.rotation.y = d.rot;
      house.add(g);
    }
  }
  buildWalls(lowerDefs, H1, M.brickL, false);
  box(LW + 0.4, 0.3, LD + 0.4, M.concreteU, 0, F1 + 0.15, 0, house);
  buildWalls(upperDefs, H2, M.brickU, false);
  for (const sx of [1, -1]) house.add(gable(UD, RISE, TH, M.brickU, sx * (UW / 2 - TH / 2), U1));
  buildWalls(lowerDefs, H1, M.render, true);
  box(LW + 0.5, 0.34, LD + 0.5, M.render, 0, F1 + 0.15, 0, house);
  box(LW + 0.42, 0.04, LD + 0.42, M.gravel, 0, U0 + 0.01, 0, house);
  buildWalls(upperDefs, H2, M.wood, true);
  for (const sx of [1, -1]) house.add(gable(UD + 0.08, RISE + 0.04, TH + 0.08, M.wood, sx * (UW / 2 - TH / 2), U1 - 0.01));

  // roof, gutters and downpipes
  const roof = new THREE.Group(); house.add(roof);
  {
    const a = Math.atan(RISE / (UD / 2)), d = UD / 2 + 0.55, Ls = d / Math.cos(a);
    for (const sg of [1, -1]) {
      const p = box(UW + 1, 0.12, Ls, M.roof, 0, 0, 0, roof);
      p.position.set(0, RIDGE - (d / 2) * Math.tan(a) + 0.08, sg * d / 2);
      p.rotation.x = sg * a;
      const ey = RIDGE - d * Math.tan(a);
      const gut = cyl(0.075, 0.075, UW + 1, M.metal, 0, ey - 0.02, sg * (d + 0.05), roof, 12); gut.rotation.z = Math.PI / 2;
      for (const sx of [1, -1]) cyl(0.045, 0.045, ey - U0, M.metal, sx * (UW / 2 + 0.35), U0 + (ey - U0) / 2, sg * (d + 0.05), roof, 10);
    }
    box(UW + 1.05, 0.1, 0.3, M.metal, 0, RIDGE + 0.12, 0, roof);
    box(0.8, 1.6, 0.8, M.white, 3.4, RIDGE - 0.15, -1.3, roof);
    box(0.95, 0.08, 0.95, M.metal, 3.4, RIDGE + 0.68, -1.3, roof);
  }

  // glazing, sills, wall lights
  const panes = [];
  function addPanes(defs, baseY, mat) {
    for (const d of defs) {
      const g = new THREE.Group(); g.position.set(d.pos[0], baseY, d.pos[2]); g.rotation.y = d.rot; house.add(g);
      for (const w of d.wins) {
        const pw = w.w - 0.06, ph = w.h - 0.06;
        const p = new THREE.Group(); p.position.set(w.x, w.y + w.h / 2, 0.04); g.add(p);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat); p.add(gl); toLayer1(gl);
        const fr = 0.055;
        box(pw, fr, 0.1, M.frame, 0, ph / 2 - fr / 2, 0, p); box(pw, fr, 0.1, M.frame, 0, -ph / 2 + fr / 2, 0, p);
        box(fr, ph, 0.1, M.frame, -pw / 2 + fr / 2, 0, 0, p); box(fr, ph, 0.1, M.frame, pw / 2 - fr / 2, 0, 0, p);
        for (let i = 1; i < d.mull; i++) box(0.04, ph, 0.08, M.frame, -pw / 2 + (pw * i) / d.mull, 0, 0, p);
        if (d.sill) {
          const sg = d.pos[2] > 0 ? 1 : -1;
          box(w.w + 0.12, 0.05, 0.16, M.sill, 0, -w.h / 2 - 0.025, sg * (TH / 2 + 0.04), p);
        }
        panes.push(p);
      }
    }
  }
  addPanes(lowerDefs, F0, M.glass);
  addPanes(upperDefs, U0, M.glassUp);
  for (const x of [-6.88, -2.5, 2.5, 6.88]) {
    const p = new THREE.Group(); p.position.set(x, F0 + 2.25, LD / 2 + 0.06); house.add(p);
    box(0.1, 0.26, 0.08, M.metal, 0, 0, 0, p); box(0.07, 0.05, 0.05, M.lamp, 0, -0.14, 0.01, p);
    panes.push(p);
  }

  // interior
  const inner = new THREE.Group(); house.add(inner);
  box(LW - 0.62, 0.02, LD - 0.62, M.floor, 0, F0 + 0.012, 0, inner).castShadow = false;
  const fur = [];
  const F = (x, z, fn, ry = 0) => { const g = new THREE.Group(); g.position.set(x, F0, z); g.rotation.y = ry; fn(g); house.add(g); fur.push(g); return g; };
  F(-3.4, 0.2, (g) => { box(4.4, 0.015, 3.2, M.rug, 0, 0.025, 0, g); });
  F(-3.4, -1.3, (g) => {
    box(3.4, 0.38, 1.0, M.fab, 0, 0.2, 0, g); box(3.4, 0.55, 0.22, M.fab, 0, 0.6, -0.39, g);
    box(0.22, 0.6, 1, M.fab, -1.6, 0.3, 0, g); box(0.22, 0.6, 1, M.fab, 1.6, 0.3, 0, g);
    for (const cx of [-1.05, 0, 1.05]) box(1.0, 0.14, 0.75, M.fab, cx, 0.45, 0.06, g);
    box(0.6, 0.42, 0.14, M.fab2, -1.0, 0.65, -0.22, g); box(0.6, 0.42, 0.14, M.fab2, 1.0, 0.65, -0.22, g);
  });
  F(-4.9, 1.8, (g) => { box(0.95, 0.4, 0.9, M.fab2, 0, 0.2, 0, g); box(0.95, 0.5, 0.18, M.fab2, 0, 0.6, -0.36, g); box(0.85, 0.12, 0.7, M.fab2, 0, 0.44, 0.06, g); }, Math.PI * 0.8);
  F(-3.4, 0.35, (g) => { cyl(0.55, 0.55, 0.06, M.walnut, 0, 0.36, 0, g, 32); cyl(0.3, 0.3, 0.33, M.walnut, 0, 0.165, 0, g, 24); box(0.35, 0.06, 0.26, M.art, 0.15, 0.42, 0.1, g); });
  F(-6.42, 0.2, (g) => {
    box(0.5, 1.1, 2.2, std({ color: 0x2b2926, roughness: 0.8 }), 0, 0.55, 0, g);
    box(0.05, 0.42, 1.2, M.fire, 0.26, 0.42, 0, g);
    box(0.62, 0.08, 2.4, M.marble, 0, 1.14, 0, g);
    box(0.04, 1.0, 1.5, M.art, 0.05, 2.05, 0, g);
  });
  F(3.6, -3.36, (g) => {
    box(4.8, 0.88, 0.62, M.oak, 0, 0.44, 0, g); box(4.85, 0.04, 0.66, M.marble, 0, 0.9, 0, g);
    box(0.95, 2.7, 0.64, M.oak, 2.6, 1.35, 0, g); box(0.9, 0.5, 0.4, M.frame, -1.2, 2.1, 0.1, g);
  });
  F(3.4, -1.1, (g) => { box(2.8, 0.88, 1.0, M.oak, 0, 0.44, 0, g); box(2.9, 0.05, 1.1, M.marble, 0, 0.905, 0, g); });
  for (let i = 0; i < 3; i++) F(2.5 + i * 0.9, -0.3, (g) => { cyl(0.19, 0.19, 0.05, M.walnut, 0, 0.7, 0, g, 24); cyl(0.015, 0.015, 0.68, M.frame, 0, 0.34, 0, g, 8); cyl(0.17, 0.17, 0.015, M.frame, 0, 0.01, 0, g, 24); });
  F(3.4, -1.1, (g) => { for (let i = -1; i <= 1; i++) { box(0.008, 0.9, 0.008, M.frame, i * 0.9, H1 - 0.45, 0, g); ball(0.15, M.lamp, i * 0.9, H1 - 0.98, 0, g); } });
  F(3.8, 1.9, (g) => {
    box(2.4, 0.05, 1.0, M.walnut, 0, 0.75, 0, g);
    box(0.06, 0.72, 0.8, M.walnut, -1.0, 0.36, 0, g); box(0.06, 0.72, 0.8, M.walnut, 1.0, 0.36, 0, g);
    for (const cx of [-0.75, 0, 0.75]) for (const sz of [1, -1]) { box(0.44, 0.05, 0.44, M.fab2, cx, 0.46, sz * 0.75, g); box(0.44, 0.48, 0.04, M.fab2, cx, 0.72, sz * 0.96, g); box(0.03, 0.44, 0.03, M.frame, cx, 0.22, sz * 0.75, g); }
    ball(0.12, M.pot, 0, 0.86, 0, g, 1, 1.4, 1);
  });
  const plantGeo = shrubGeo(0.9, 1.3, 0.9, [srgb(56, 88, 40), srgb(70, 102, 46), srgb(46, 74, 34)], 12);
  const plantMat = foliageMat(0.004);
  for (const [x, z] of [[-6.1, -3.1], [6.2, 3.2], [-6.2, 3.2]]) F(x, z, (g) => { cyl(0.28, 0.22, 0.5, M.pot, 0, 0.25, 0, g); const m = new THREE.Mesh(plantGeo, plantMat); m.position.y = 0.4; m.castShadow = true; g.add(m); });
  F(-5.5, -1.6, (g) => { box(0.025, 1.6, 0.025, M.frame, 0, 0.8, 0, g); cyl(0.22, 0.28, 0.32, M.lamp, 0, 1.7, 0, g, 24); });
  for (const [x, z] of [[-3.4, -0.2], [-0.2, 0], [1.6, 1.9], [5.8, 1.9], [-3.4, 2.4], [5.2, -2.6]]) { const d = cyl(0.07, 0.07, 0.015, M.lamp, x, F1 - 0.008, z, inner, 16); d.castShadow = false; }

  const iLights = [[-3.4, F1 - 0.5, 0.2], [3.4, F1 - 0.6, -1.1], [3.8, F1 - 0.6, 2.2], [0, U0 + 2.2, 0]].map(([x, y, z]) => {
    const l = new THREE.PointLight(0xffb36b, 0, 13, 2); l.position.set(x, y, z); scene.add(l); return l;
  });
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 7, 2); fireLight.position.set(-5.9, F0 + 0.6, 0.2); scene.add(fireLight);
  const porch = new THREE.PointLight(0xffb36b, 0, 9, 2); porch.position.set(0, F0 + 2.4, LD / 2 + 1.2); scene.add(porch);
  await tick();

  /* ================================================================ construction site */
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(21, 72), M.dirt);
  dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.03; dirt.receiveShadow = true; dirt.renderOrder = 1;
  toLayer1(dirt);
  scene.add(dirt);
  const site = [];
  const S = (x, z, fn, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; fn(g); scene.add(g); site.push(g); return g; };
  for (const [x, z, r] of [[9.8, 5.5, 0.3], [10.6, -3, 0], [-9.6, 6.5, -0.4], [11.5, 8, 0.6]]) S(x, z, (g) => { box(1.2, 0.14, 1, M.timber, 0, 0.07, 0, g); box(1.1, 0.75, 0.9, M.brick, 0, 0.52, 0, g); box(1.14, 0.78, 0.94, std({ color: 0xe8eef2, roughness: 0.2, transparent: true, opacity: 0.25 }), 0, 0.53, 0, g); }, r);
  S(-10.5, -1, (g) => { for (let l = 0; l < 3; l++) for (let k = 0; k < 5; k++) box(4.2, 0.1, 0.18, M.timber, 0, 0.07 + l * 0.11, -0.5 + k * 0.24, g); }, 0.25);
  S(8.2, 10.5, (g) => { for (let l = 0; l < 3; l++) for (let k = 0; k < 3; k++) box(1.2, 0.2, 0.4, M.concrete, 0, 0.1 + l * 0.2, -0.45 + k * 0.45, g); });
  S(11.5, 1.2, (g) => { const d = cyl(0.45, 0.7, 1.3, std({ color: 0xd4552b, roughness: 0.45, metalness: 0.2 }), 0, 1.1, 0, g); d.rotation.z = 0.6; box(1.2, 0.5, 0.6, M.frame, 0, 0.25, 0, g); });
  S(-13, -11, (g) => { box(5.2, 2.5, 2.3, std({ color: 0xe9e6e0, roughness: 0.5, metalness: 0.2 }), 0, 1.25, 0, g); box(5.22, 0.3, 2.32, std({ color: 0x2c4d7a }), 0, 2.3, 0, g); box(3, 0.7, 2.34, M.glassUp, 0.6, 1.5, 0, g); }, 0.4);
  S(9, -8.5, (g) => { const c = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.2, 28), std({ color: 0xc9a77a, roughness: 1, ...tx(T.dirt, 0.8), map: null })); c.position.y = 0.6; c.castShadow = c.receiveShadow = true; g.add(c); });

  const crane = new THREE.Group(); crane.position.set(-12.5, 0, -7.5); scene.add(crane);
  {
    const Y = M.yellow;
    const lattice = (len, axis, w, parent, ox = 0, oy = 0) => { // real lattice: 4 chords + zigzag braces
      const g = new THREE.Group(); g.position.set(ox, oy, 0); parent.add(g);
      const n = Math.round(len / w);
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const m = axis === 'y' ? box(0.07, len, 0.07, Y, a * w / 2, len / 2, b * w / 2, g) : box(len, 0.07, 0.07, Y, len / 2, a * w / 2, b * w / 2, g);
        m.castShadow = true;
      }
      for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
        const diag = Math.hypot(w, w), m = box(0.04, diag, 0.04, Y, 0, 0, 0, g);
        if (axis === 'y') { m.position.set(0, (i + 0.5) * w, side * w / 2); m.rotation.z = (i % 2 ? 1 : -1) * Math.PI / 4; }
        else { m.position.set((i + 0.5) * w, 0, side * w / 2); m.rotation.z = (i % 2 ? 1 : -1) * Math.PI / 4; }
      }
      return g;
    };
    lattice(25, 'y', 1, crane);
    box(3, 0.6, 3, M.concrete, 0, 0.3, 0, crane);
    const jib = new THREE.Group(); jib.position.y = 25; crane.add(jib); crane.userData.jib = jib;
    lattice(20, 'x', 0.8, jib, 0, 0.4);
    lattice(6, 'x', 0.8, jib, -6, 0.4);
    box(2.4, 1.4, 1.3, M.concrete, -5, -0.2, 0, jib);
    lattice(4.2, 'y', 0.6, jib, 0, 0.8);
    box(1.4, 1.4, 1.4, Y, 0.9, -0.7, 0.9, jib);
    box(0.03, 11.5, 0.03, M.frame, 13, -5.75, 0, jib);
    box(0.5, 0.7, 0.4, Y, 13, -11.8, 0, jib);
    const tie = new THREE.LineBasicMaterial({ color: 0x222222 });
    jib.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6, 0.9, 0), new THREE.Vector3(0, 5, 0), new THREE.Vector3(19.5, 0.9, 0)]), tie));
  }
  toLayer1(crane);

  /* ================================================================ garden, terrace & pool */
  const terrace = new THREE.Group(); scene.add(terrace);
  {
    const D = F0;
    box(20, D, 3, M.stone, 0, D / 2, 5.5, terrace);
    box(20, D, 2, M.stone, 0, D / 2, 12, terrace);
    box(3.5, D, 4, M.stone, -8.25, D / 2, 9, terrace);
    box(5.5, D, 4, M.stone, 7.25, D / 2, 9, terrace);
    box(11, 0.04, 4, M.poolTile, -1, 0.06, 9, terrace);
    for (const [w, d, x, z] of [[11.3, 0.15, -1, 6.95], [11.3, 0.15, -1, 11.05], [0.15, 4, -6.575, 9], [0.15, 4, 4.575, 9]]) box(w, 0.04, d, M.marble, x, D + 0.02, z, terrace);
    box(3.2, D * 0.66, 0.6, M.stone, 7, D * 0.33, 13.3, terrace);
    box(3.2, D * 0.33, 0.6, M.stone, 7, D * 0.165, 13.9, terrace);
  }
  const waterGeo = new THREE.BoxGeometry(11, 1, 4); waterGeo.translate(0, 0.5, 0);
  { const uv = waterGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 11, uv.getY(i) * 4); }
  const water = new THREE.Mesh(waterGeo, M.water); water.position.set(-1, 0.08, 9); water.receiveShadow = true; toLayer1(water); scene.add(water);
  const poolLight = new THREE.PointLight(0x5fd0ff, 0, 10, 2); poolLight.position.set(-1, 0.3, 9); scene.add(poolLight);

  const garden = [];
  const G = (x, z, fn, ry = 0, y = F0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; fn(g); scene.add(g); garden.push(g); return g; };
  const hedgePal = [srgb(44, 66, 34), srgb(54, 78, 40), srgb(38, 58, 30)];
  const hedgeGeo = shrubGeo(1.5, 0.5, 0.42, hedgePal, 12), bushGeo = shrubGeo(1.8, 1.3, 1.6, hedgePal, 16);
  const lavGeo = shrubGeo(0.7, 0.55, 0.7, [srgb(128, 110, 168), srgb(112, 96, 150), srgb(96, 110, 70)], 9);
  const gMat = foliageMat(0.01);
  const mesh = (geo, mat, x, y, z, g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  for (const x of [5.6, 7.0, 8.4]) G(x, 9.2, (g) => {
    box(0.7, 0.08, 1.5, M.linen, 0, 0.32, 0.2, g);
    const b = box(0.7, 0.07, 0.75, M.linen, 0, 0.55, -0.82, g); b.rotation.x = 0.7;
    box(0.74, 0.04, 2.2, M.frame, 0, 0.26, -0.05, g);
    for (const [lx, lz] of [[-0.32, 0.9], [0.32, 0.9], [-0.32, -0.9], [0.32, -0.9]]) box(0.04, 0.24, 0.04, M.frame, lx, 0.12, lz, g);
  });
  G(9.3, 11.9, (g) => { cyl(0.025, 0.025, 2.4, M.frame, 0, 1.2, 0, g, 8); const c = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.45, 16, 1, true), M.linen); c.position.y = 2.45; c.castShadow = true; g.add(c); cyl(0.3, 0.3, 0.08, M.frame, 0, 0.04, 0, g); });
  G(-5, 5.6, (g) => { box(3, 0.36, 0.9, M.fab, 0, 0.2, 0, g); box(3, 0.45, 0.2, M.fab, 0, 0.5, -0.36, g); box(2.9, 0.12, 0.7, M.linen, 0, 0.42, 0.06, g); box(1.2, 0.3, 0.7, M.walnut, 0, 0.15, 1.2, g); });
  G(5.6, 5.5, (g) => {
    box(2.2, 0.05, 0.95, M.walnut, 0, 0.75, 0, g); box(0.06, 0.72, 0.8, M.frame, -0.95, 0.36, 0, g); box(0.06, 0.72, 0.8, M.frame, 0.95, 0.36, 0, g);
    for (const cx of [-0.7, 0, 0.7]) for (const sz of [1, -1]) { box(0.44, 0.05, 0.44, M.linen, cx, 0.45, sz * 0.75, g); box(0.44, 0.45, 0.04, M.linen, cx, 0.7, sz * 0.96, g); box(0.03, 0.45, 0.03, M.frame, cx, 0.22, sz * 0.75, g); }
  });
  for (const x of [-9, -6, -3, 0, 3]) G(x, 12.7, (g) => { box(1.6, 0.45, 0.5, std({ color: 0x3a3836, roughness: 0.7 }), 0, 0.22, 0, g); mesh(hedgeGeo, gMat, 0, 0.42, 0, g); });
  for (const [x, z, s] of [[-9, -5.6, 1], [-9.5, 0, 0.9], [9, -5.8, 1.1], [9.6, 1.8, 0.8], [-11.5, 4, 1.2], [12, 12, 1], [-11, 13.5, 0.9], [4.2, -5.6, 0.8], [-2, -5.6, 0.9]]) G(x, z, (g) => { const m = mesh(bushGeo, gMat, 0, 0, 0, g); m.scale.setScalar(s); }, rnd() * 6, 0);
  G(0, 14.2, (g) => { for (let r = 0; r < 2; r++) for (let i = 0; i < 13; i++) mesh(lavGeo, gMat, -9 + i * 0.68 + (r ? 0.34 : 0), 0, r * 0.75, g); }, 0, 0);
  const tGeo = oliveTrunkGeo(), cGeo = oliveCanopyGeo(), bark = std({ color: 0x6a5d50, roughness: 1 }), cMat = foliageMat(0.012);
  for (const [x, z, s] of [[-12.8, 9, 1.05], [13, 5, 0.95]]) G(x, z, (g) => { mesh(tGeo, bark, 0, 0, 0, g); mesh(cGeo, cMat, 0, 0, 0, g); g.userData.s = s; }, rnd() * 6, 0);
  const cGeoSingle = cypressGeo(), cypM = foliageMat(0.04);
  for (const [x, z] of [[-11.5, -3], [11.5, -3.5], [-11.8, 16.5]]) G(x, z, (g) => { const m = mesh(cGeoSingle, cypM, 0, -0.2, 0, g); m.scale.set(1.6, 9, 1.6); }, rnd() * 6, 0);
  for (const [x, z] of [[5.2, 14.5], [8.8, 14.5], [-10, 11], [10, 6.5], [-10, 5]]) G(x, z, (g) => { box(0.12, 0.6, 0.12, M.frame, 0, 0.3, 0, g); box(0.1, 0.1, 0.1, M.lamp, 0, 0.62, 0, g); }, 0, 0);
  for (let i = 0; i < 6; i++) G(7 + Math.sin(i * 0.6) * 1.2, 15 + i * 1.3, (g) => { box(1.1, 0.06, 0.7, M.stone, 0, 0.03, 0, g); }, i * 0.2, 0);

  /* ================================================================ lights */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
  sun.shadow.camera.layers.enable(1);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
  sun.target.position.set(0, 0, 3);
  scene.add(sun, sun.target);

  // light keyframes per stage. dir = sun light, sky = sun position in the sky (can be below horizon)
  const hex = (h) => new THREE.Color(h);
  const K = [
    { dir: [0.62, 0.34, 0.7], sky: null, sun: 0xffd9b0, si: 3.2, hs: 0xa3b2c9, hg: 0x4a3a2c, hi: 0.15, ex: 0.62, fog: 0xc9b9a5, turb: 5, ray: 2.2, mie: 0.005, gain: 1.0, inside: 0, pool: 0 },
    { dir: [-0.45, 0.62, 0.64], sky: null, sun: 0xfff1de, si: 3.6, hs: 0xaec3dc, hg: 0x52412f, hi: 0.15, ex: 0.55, fog: 0xc4cfd8, turb: 3, ray: 1.6, mie: 0.004, gain: 1.0, inside: 0, pool: 0 },
    { dir: [-0.74, 0.24, 0.63], sky: null, sun: 0xffc382, si: 3.6, hs: 0xb8c8dc, hg: 0x5a4632, hi: 0.15, ex: 0.62, fog: 0xe0c3a0, turb: 7, ray: 2.6, mie: 0.006, gain: 1.0, inside: 0.25, pool: 0 },
    { dir: [0.45, 0.62, 0.4], sky: [-0.7, -0.06, -0.7], sun: 0x9fb4ff, si: 0.35, hs: 0x5a6a90, hg: 0x221a14, hi: 0.25, ex: 0.9, fog: 0x2e3546, turb: 4, ray: 3.0, mie: 0.004, gain: 2.5, inside: 1, pool: 0 },
    { dir: [-0.78, 0.13, -0.6], sky: [-0.78, 0.02, -0.6], sun: 0xff9f6a, si: 1.6, hs: 0x8094c0, hg: 0x3a2c22, hi: 0.25, ex: 0.78, fog: 0x9b8c94, turb: 8, ray: 3.0, mie: 0.006, gain: 1.3, inside: 0.9, pool: 1 },
    { dir: [-0.84, 0.12, -0.52], sky: [-0.84, 0.06, -0.52], sun: 0xff9a52, si: 2.8, hs: 0x93a2c8, hg: 0x3a2a1e, hi: 0.2, ex: 0.72, fog: 0xd09a74, turb: 9, ray: 2.6, mie: 0.008, gain: 1.0, inside: 1, pool: 1 },
  ].map((k) => ({ ...k, sun: hex(k.sun), hs: hex(k.hs), hg: hex(k.hg), fog: hex(k.fog), dir: new THREE.Vector3(...k.dir).normalize(), sky: new THREE.Vector3(...(k.sky || k.dir)).normalize() }));

  /* ================================================================ camera path */
  const V = (a) => new THREE.Vector3(...a);
  const camPos = new THREE.CatmullRomCurve3([[19, 12, 26], [-21, 9, 22], [-9.5, 2.2, 21], [5.6, 1.75, 3.0], [11, 1.9, 17.5], [24, 8.5, 31]].map(V), false, 'centripetal');
  const camTgt = new THREE.CatmullRomCurve3([[0, 0.6, 0], [0, 3.0, 0], [-0.5, 3.4, 0], [-4, 1.55, -2.2], [-2, 1.6, 4], [0, 3.2, 1.5]].map(V), false, 'centripetal');

  /* ================================================================ post-processing */
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: Q.samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(Q.dpr);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (Q.ao) {
    gtao = new GTAOPass(scene, aoCam, 2, 2);
    gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
      float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5;
        vec3 c;
        c.r = texture2D(tDiffuse, vUv + d * 0.0016).r;
        c.g = texture2D(tDiffuse, vUv).g;
        c.b = texture2D(tDiffuse, vUv - d * 0.0016).b;
        c *= 1.0 - dot(d, d) * 0.55;
        c += (rand(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.028;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(finish);

  /* ================================================================ frame update */
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3(), tmpV = new THREE.Vector3();
  let aspect = 1, slow = 0, lastT = 0;

  function render(s, time, px, py) {
    s = clamp(s, 0, 5);
    timeU.value = time;

    // build sequence
    rebar.visible = s < 1.05;
    clip.bl.constant = lerp(F0 - 0.01, F1 + 0.05, smooth(s, 0.2, 0.7));
    clip.bu.constant = lerp(F1 - 0.01, RIDGE + 0.05, smooth(s, 0.65, 1.15));
    const tR = easeIO(smooth(s, 1.1, 1.5));
    roof.visible = tR > 0.001; roof.position.y = (1 - tR) * 6;
    clip.re.constant = lerp(F0 - 0.02, U0 + 0.06, smooth(s, 1.45, 1.85));
    clip.wo.constant = lerp(U0 - 0.05, RIDGE + 0.1, smooth(s, 1.6, 1.95));
    panes.forEach((p, i) => { p.visible = s > 1.85 + i * 0.008; });
    inner.visible = s > 1.85;
    const tC = smooth(s, 1.45, 1.8);
    crane.visible = tC < 0.999; crane.position.y = -tC * 27;
    crane.userData.jib.rotation.y = -0.52 + Math.sin(time * 0.2) * 0.35 * (1 - smooth(s, 1.0, 1.3)) + Math.PI * easeIO(smooth(s, 1.0, 1.4));
    site.forEach((g, i) => { const k = 1 - smooth(s, 1.7 + i * 0.025, 1.95 + i * 0.025); g.visible = k > 0.001; g.scale.setScalar(Math.max(0.0001, k)); });
    popIn(fur, s, 2.35, 0.025);
    M.dirt.opacity = 1 - smooth(s, 3.1, 3.6); dirt.visible = M.dirt.opacity > 0.001;
    lawnGrow.value = Math.max(0.001, smooth(s, 3.15, 3.75)); lawn.visible = lawnGrow.value > 0.002;
    const tT = smooth(s, 3.2, 3.6); terrace.visible = tT > 0.001; terrace.scale.y = Math.max(0.001, tT);
    const tW = smooth(s, 3.5, 3.95); water.visible = tW > 0.001; water.scale.y = Math.max(0.001, tW * 0.37);
    popIn(garden, s, 3.6, 0.014);
    garden.forEach((g) => { if (g.userData.s && g.visible) g.scale.multiplyScalar(g.userData.s); });

    // light, sky & atmosphere
    const i = Math.min(4, Math.floor(s)), f = easeIO(clamp(s - i)), a = K[i], b = K[i + 1];
    const u = sky.material.uniforms;
    u.sunPosition.value.copy(a.sky).lerp(b.sky, f).normalize();
    u.turbidity.value = lerp(a.turb, b.turb, f);
    u.rayleigh.value = lerp(a.ray, b.ray, f);
    u.mieCoefficient.value = lerp(a.mie, b.mie, f);
    u.mieDirectionalG.value = 0.8;
    u.skyGain.value = lerp(a.gain, b.gain, f);
    const dir = tmpV.copy(a.dir).lerp(b.dir, f).normalize();
    sun.color.lerpColors(a.sun, b.sun, f);
    sun.intensity = lerp(a.si, b.si, f);
    sun.position.copy(dir).multiplyScalar(80).add(sun.target.position);
    hemi.color.lerpColors(a.hs, b.hs, f); hemi.groundColor.lerpColors(a.hg, b.hg, f); hemi.intensity = lerp(a.hi, b.hi, f);
    scene.fog.color.lerpColors(a.fog, b.fog, f);
    renderer.toneMappingExposure = lerp(a.ex, b.ex, f);
    updateEnv(s, time, false);

    const inside = lerp(a.inside, b.inside, f) * smooth(s, 2.3, 2.9);
    iLights.forEach((l, k) => { l.intensity = inside * (k === 3 ? 16 : 24); });
    porch.intensity = inside * smooth(s, 3.4, 4) * 6;
    M.glassUp.emissiveIntensity = inside * 1.1;
    M.lamp.emissiveIntensity = inside * 4;
    const flicker = 0.82 + 0.18 * Math.sin(time * 13.1) * Math.sin(time * 7.3);
    M.fire.emissiveIntensity = inside * 4 * flicker;
    fireLight.intensity = inside * 10 * flicker;
    const pool = lerp(a.pool, b.pool, f) * tW;
    poolLight.intensity = pool * 12;
    M.water.emissiveIntensity = 0.04 + pool * 0.5;
    T.water.normalMap.offset.set(time * 0.012, time * 0.007);
    if (gtao) { gtao.enabled = s > 1.5; gtao.blendIntensity = smooth(s, 1.5, 1.95); }

    // camera
    const uu = (i + easeIO(clamp(s - i))) / 5;
    camPos.getPoint(uu, pos); camTgt.getPoint(uu, tgt);
    const near3 = 1 - smooth(Math.abs(s - 3), 0, 1);
    if (aspect < 1) {
      pos.sub(tgt).multiplyScalar(lerp(1.45, 1.0, near3)).add(tgt);
      const fin = easeIO(smooth(s, 4.3, 4.95));
      tgt.y -= 5.5 * fin; pos.y -= 2 * fin;
    }
    const par = 1 - near3 * 0.8;
    pos.x += px * 0.9 * par; pos.y -= py * 0.4 * par;
    pos.y = Math.max(pos.y, hh(pos.x, pos.z) + 0.6);
    camera.position.copy(pos); camera.lookAt(tgt);
    camera.fov = (aspect < 1 ? 50 : 36) + 16 * easeIO(near3);
    camera.updateProjectionMatrix();
    aoCam.position.copy(camera.position); aoCam.quaternion.copy(camera.quaternion); aoCam.fov = camera.fov; aoCam.aspect = camera.aspect; aoCam.updateProjectionMatrix();
    sky.position.copy(camera.position);

    finish.uniforms.uTime.value = time;
    composer.render();

    // adaptive quality: drop ambient occlusion, then resolution, if the device struggles
    const dt = time - lastT; lastT = time;
    if (dt > 0 && dt < 1) {
      slow = dt > 0.05 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 45) {
        slow = 0;
        if (gtao) { composer.removePass(gtao); gtao = null; }
        else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); composer.setPixelRatio(1); resize(lastW, lastH); }
      }
    }
  }

  let lastW = 2, lastH = 2;
  function resize(w, h) {
    if (!w || !h) return;
    lastW = w; lastH = h;
    aspect = w / h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    finish.uniforms.uRes.value.set(w, h);
  }

  return { render, resize };
}

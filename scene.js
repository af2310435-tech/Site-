// The house that builds itself. Everything is procedural (no image assets):
// geometry, canvas textures, trees and the sky are generated at load time.
// render(s) takes the build progress s in [0, 5]:
//   0 ground · 1 structure · 2 finish · 3 inside · 4 living · 5 home
import * as THREE from 'three';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
let _seed = 20261111;
const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1400);
  scene.fog = new THREE.Fog(0xc4ab8f, 70, 330);

  /* ================================================================ textures */
  function tex(size, draw, srgb = true) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }
  function speckle(g, s, n, a, size = 2) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a * rnd()})` : `rgba(255,255,255,${a * rnd()})`;
      const w = size * (0.5 + rnd());
      g.fillRect(rnd() * s, rnd() * s, w, w);
    }
  }
  const T = {
    brick: tex(512, (g, s) => {
      g.fillStyle = '#b9ab9b'; g.fillRect(0, 0, s, s);
      const rows = 14, rh = s / rows, bw = s / 4;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * bw / 2;
        for (let i = -1; i < 5; i++) {
          g.fillStyle = `hsl(${10 + rnd() * 12},${40 + rnd() * 18}%,${30 + rnd() * 14}%)`;
          g.fillRect(i * bw + off + 2, r * rh + 2, bw - 4, rh - 4);
        }
      }
      speckle(g, s, 3000, 0.12);
    }),
    wood: tex(512, (g, s) => {
      const n = 8, w = s / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = `hsl(${24 + rnd() * 6},${38 + rnd() * 12}%,${31 + rnd() * 10}%)`;
        g.fillRect(i * w, 0, w, s);
        for (let k = 0; k < 26; k++) { g.fillStyle = `rgba(40,20,8,${0.05 + rnd() * 0.12})`; g.fillRect(i * w + rnd() * w, 0, 1 + rnd() * 1.5, s); }
        g.fillStyle = 'rgba(15,8,3,.85)'; g.fillRect(i * w, 0, 3, s);
      }
      speckle(g, s, 1500, 0.06);
    }),
    render: tex(256, (g, s) => { g.fillStyle = '#ece7de'; g.fillRect(0, 0, s, s); speckle(g, s, 4000, 0.05); }),
    concrete: tex(256, (g, s) => {
      g.fillStyle = '#a4a19b'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 60 : 210},${rnd() < 0.5 ? 60 : 210},${rnd() < 0.5 ? 60 : 210},.05)`; g.beginPath(); g.arc(rnd() * s, rnd() * s, 10 + rnd() * 40, 0, 7); g.fill(); }
      speckle(g, s, 5000, 0.12);
    }),
    stone: tex(512, (g, s) => {
      g.fillStyle = '#b3a58d'; g.fillRect(0, 0, s, s);
      const rows = [0, 171, 342, 512];
      for (let r = 0; r < 3; r++) {
        let x = -(r * 90);
        while (x < s) { const w = 150 + rnd() * 110; g.fillStyle = `hsl(${36 + rnd() * 6},${20 + rnd() * 10}%,${73 + rnd() * 8}%)`; g.fillRect(x + 2, rows[r] + 2, w - 4, rows[r + 1] - rows[r] - 4); x += w; }
      }
      speckle(g, s, 4000, 0.08);
    }),
    roof: tex(256, (g, s) => {
      g.fillStyle = '#2b3850'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 4; i++) { g.fillStyle = '#4a5c80'; g.fillRect(i * s / 4, 0, 4, s); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * s / 4 + 4, 0, 3, s); }
      speckle(g, s, 1200, 0.05);
    }),
    floor: tex(512, (g, s) => {
      const rows = 8, h = s / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rnd() * s * 0.6;
        while (x < s) { const w = s * 0.6; g.fillStyle = `hsl(${32 + rnd() * 5},${32 + rnd() * 10}%,${55 + rnd() * 8}%)`; g.fillRect(x, r * h, w, h); g.fillStyle = 'rgba(60,40,20,.5)'; g.fillRect(x, r * h, 2, h); x += w; }
        g.fillStyle = 'rgba(60,40,20,.45)'; g.fillRect(0, r * h, s, 2);
      }
      speckle(g, s, 2000, 0.05);
    }),
    dirt: tex(256, (g, s) => {
      g.fillStyle = '#6a4f3b'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 40 : 150},${rnd() < 0.5 ? 28 : 120},${rnd() < 0.5 ? 18 : 90},.12)`; g.beginPath(); g.arc(rnd() * s, rnd() * s, 6 + rnd() * 30, 0, 7); g.fill(); }
      speckle(g, s, 5000, 0.25, 2.5);
    }),
    radial: tex(256, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s / 2);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.75, '#bbb'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false),
    lattice: tex(128, (g, s) => {
      g.clearRect(0, 0, s, s); g.strokeStyle = '#fff';
      g.lineWidth = 14; g.strokeRect(0, 0, s, s);
      g.lineWidth = 8; g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
    }),
    caustic: tex(256, (g, s) => {
      g.fillStyle = '#3aa9d8'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(210,248,255,.4)'; g.lineWidth = 2;
      for (let i = 0; i < 70; i++) {
        const x = rnd() * s, y = rnd() * s;
        g.beginPath(); g.moveTo(x, y);
        g.bezierCurveTo(x + rnd() * 40 - 20, y + rnd() * 40 - 20, x + rnd() * 40 - 20, y + rnd() * 40 - 20, x + rnd() * 60 - 30, y + rnd() * 60 - 30);
        g.stroke();
      }
    }),
  };
  T.dirt.repeat.set(9, 9);
  T.caustic.repeat.set(0.3, 0.3);

  /* ================================================================ materials */
  const plane = () => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // keeps y <= constant
  const clip = { bl: plane(), bu: plane(), re: plane(), wo: plane() };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));
  const clipped = (o, p) => std(Object.assign(o, { clippingPlanes: [p], clipShadows: true }));
  const M = {
    concrete: std({ map: T.concrete, roughness: 0.95 }),
    concreteU: clipped({ map: T.concrete, roughness: 0.95 }, clip.bu),
    brick: std({ map: T.brick, roughness: 0.9 }),
    brickL: clipped({ map: T.brick, roughness: 0.9 }, clip.bl),
    brickU: clipped({ map: T.brick, roughness: 0.9 }, clip.bu),
    render: clipped({ map: T.render, roughness: 0.85 }, clip.re),
    wood: clipped({ map: T.wood, roughness: 0.72 }, clip.wo),
    roof: std({ map: T.roof, roughness: 0.42, metalness: 0.55 }),
    dark: std({ color: 0x18191b, roughness: 0.45, metalness: 0.6 }),
    white: std({ map: T.render, roughness: 0.8 }),
    glass: std({ color: 0x1e2a36, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, emissive: 0xffb066, emissiveIntensity: 0, depthWrite: false, side: THREE.DoubleSide }),
    glassWarm: std({ color: 0x141c26, roughness: 0.08, metalness: 0.6, emissive: 0xffa85a, emissiveIntensity: 0 }),
    stone: std({ map: T.stone, roughness: 0.9 }),
    floor: std({ map: T.floor, roughness: 0.55 }),
    rebar: std({ color: 0x6b3b22, roughness: 0.7, metalness: 0.5 }),
    timber: std({ color: 0xb58a5a, roughness: 0.9 }),
    yellow: std({ color: 0xe9b02f, roughness: 0.55, metalness: 0.2 }),
    lattice: std({ color: 0xe9b02f, map: T.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.2 }),
    dirt: std({ map: T.dirt, alphaMap: T.radial, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    water: std({ color: 0x7fd6f0, map: T.caustic, emissive: 0x1a8cc2, emissiveMap: T.caustic, emissiveIntensity: 0.2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.93 }),
    poolTile: std({ color: 0x9ed2dc, roughness: 0.4 }),
    leaf: std({ color: 0x4e6b3a, roughness: 0.95 }),
    hedge: std({ color: 0x34492a, roughness: 1 }),
    lavender: std({ color: 0x8c7ab8, roughness: 1 }),
    fab: std({ color: 0xd8cdbc, roughness: 1 }),
    fab2: std({ color: 0x8c7b68, roughness: 1 }),
    walnut: std({ color: 0x4b3426, roughness: 0.55 }),
    oak: std({ color: 0xa27c53, roughness: 0.6 }),
    marble: std({ color: 0xf1eee8, roughness: 0.25 }),
    cream: std({ color: 0xeee4d0, roughness: 0.9, side: THREE.DoubleSide }),
    pot: std({ color: 0xc9b8a0, roughness: 0.9 }),
    lamp: std({ color: 0xfff0d8, emissive: 0xffc27a, emissiveIntensity: 0 }),
    fire: std({ color: 0x331100, emissive: 0xff6a1a, emissiveIntensity: 0 }),
    art: std({ color: 0xc46a3c, roughness: 0.9 }),
  };

  /* ================================================================ helpers */
  // Box with UVs in metres (+ world offset) so textures tile at real scale.
  function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const ox = x - w / 2, oy = y - h / 2, oz = z - d / 2;
    const dims = [[d, h, oz, oy], [d, h, oz, oy], [w, d, ox, oz], [w, d, ox, oz], [w, h, ox, oy], [w, h, ox, oy]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v, D = dims[f];
      uv.setXY(i, uv.getX(i) * D[0] + D[2], uv.getY(i) * D[1] + D[3]);
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg = 16) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function ball(r, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  // Wall along local x from y=0..h, thickness along z, with rectangular openings.
  // ext/thick > 0 builds a slightly larger "cladding shell" around the masonry.
  function wall(len, h, t, wins, mat, ext = 0, thick = 0) {
    const g = new THREE.Group();
    const L = len + ext * 2, H = h + (thick ? 0.03 : 0), Tk = t + thick * 2, inset = thick ? 0.03 : 0;
    const piece = (x0, x1, y0, y1) => { if (x1 - x0 > 0.005 && y1 - y0 > 0.005) box(x1 - x0, y1 - y0, Tk, mat, (x0 + x1) / 2, (y0 + y1) / 2, 0, g); };
    let c = -L / 2;
    for (const w of [...wins].sort((a, b) => a.x - b.x)) {
      const a = w.x - w.w / 2 + inset, b = w.x + w.w / 2 - inset;
      piece(c, a, 0, H);
      piece(a, b, 0, w.y + inset);
      piece(a, b, w.y + w.h - inset, H);
      c = b;
    }
    piece(c, L / 2, 0, H);
    return g;
  }
  function gable(width, rise, thick, mat, x, y) {
    const sh = new THREE.Shape();
    sh.moveTo(-width / 2, 0); sh.lineTo(width / 2, 0); sh.lineTo(0, rise); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
    geo.translate(0, 0, -thick / 2);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = Math.PI / 2; m.position.set(x, y, 0);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  const popIn = (list, s, start, step, dur = 0.25) => list.forEach((o, i) => {
    const t = clamp((s - start - i * step) / dur);
    const k = t <= 0 ? 0 : easeOutBack(t);
    o.visible = t > 0;
    o.scale.setScalar(Math.max(0.0001, k));
  });

  /* ================================================================ sky */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.5));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.45 + pow(s, 3.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  /* ================================================================ terrain */
  function hh(x, z) {
    const r = Math.hypot(x, z);
    const k = smooth(r, 26, 80);
    let h = Math.sin(x * 0.031 + 0.6) * 7 + Math.cos(z * 0.027 + 1.1) * 8 + Math.sin((x + z) * 0.061) * 3 + Math.sin(x * 0.13 - z * 0.07) * 1.1 + 6;
    h += Math.max(0, r - 120) * 0.17;
    return h * k;
  }
  {
    const geo = new THREE.PlaneGeometry(800, 800, 220, 220);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), cA = new THREE.Color(0x4a5e2e), cB = new THREE.Color(0x7d7d44), cC = new THREE.Color(0xa38f58), cLawn = new THREE.Color(0x58783a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, hh(x, z));
      const n = (Math.sin(x * 0.05) * Math.cos(z * 0.043) + Math.sin(x * 0.11 + z * 0.07) * 0.5) * 0.5 + 0.5;
      c.copy(cA).lerp(cB, clamp(n));
      const field = Math.sin(x * 0.012 + 2) * Math.cos(z * 0.015 - 1);
      if (field > 0.35) c.lerp(cC, 0.65);
      c.lerp(cLawn, 1 - smooth(Math.hypot(x, z), 18, 42));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, std({ vertexColors: true, roughness: 1 }));
    terrain.receiveShadow = true;
    scene.add(terrain);
  }

  /* ================================================================ trees */
  {
    const keepOut = (x, z) => x > -17 && x < 17 && z > -12 && z < 22;
    const cyp = [], oli = [];
    for (let i = 0; i < 15; i++) cyp.push([-34 + i * 4.8 + rnd(), -26 + rnd()]);
    for (let i = 0; i < 30; i++) { const t = i / 29; cyp.push([38 + Math.sin(t * 3) * 10 + (i % 2 ? 2.3 : -2.3), 16 - t * 140]); }
    for (let i = 0; i < 26; i++) { const t = i / 25; cyp.push([-48 - t * 90 + (i % 2 ? 2.2 : -2.2), 30 - t * 60 + Math.sin(t * 4) * 6]); }
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, r = 34 + rnd() * 230, n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) { const x = Math.cos(a) * r + k * 2.4, z = Math.sin(a) * r + rnd() * 2; if (!keepOut(x, z)) cyp.push([x, z]); }
    }
    const groves = [[-46, 6], [44, -34], [-66, -60], [16, -86], [-28, 44], [70, 34], [-96, -14], [100, -80], [-20, -120]];
    for (const [cx, cz] of groves) for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      const x = cx + i * 6.5 + rnd() * 1.5, z = cz + j * 6.5 + rnd() * 1.5;
      if (!keepOut(x, z)) oli.push([x, z]);
    }
    oli.push([-21, -6], [-19, 12], [22, -4], [21, -15], [-8, -19], [9, -21], [-26, 18]);
    cyp.push([-18, -14], [-15.5, -16], [16, -16], [18.5, -13.5]);

    const prof = [[0, 0], [0.32, 0.04], [0.5, 0.22], [0.5, 0.45], [0.38, 0.72], [0.18, 0.93], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y));
    const cypGeo = new THREE.LatheGeometry(prof, 9);
    const cypMesh = new THREE.InstancedMesh(cypGeo, std({ color: 0x2a3a23, roughness: 1 }), cyp.length);
    const dummy = new THREE.Object3D();
    cyp.forEach(([x, z], i) => {
      const h = 7 + rnd() * 5, w = 1.1 + rnd() * 0.6;
      dummy.position.set(x, hh(x, z) - 0.2, z); dummy.scale.set(w, h, w); dummy.rotation.set(0, rnd() * 6, 0); dummy.updateMatrix();
      cypMesh.setMatrixAt(i, dummy.matrix);
    });
    cypMesh.castShadow = cypMesh.receiveShadow = true;
    scene.add(cypMesh);

    const canGeo = new THREE.IcosahedronGeometry(1, 1);
    { const p = canGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.85 + rnd() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } canGeo.computeVertexNormals(); }
    const canopy = new THREE.InstancedMesh(canGeo, std({ color: 0x77855a, roughness: 1, flatShading: true }), oli.length * 2);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.24, 1, 6), std({ color: 0x4a3b2c }), oli.length);
    oli.forEach(([x, z], i) => {
      const y = hh(x, z), s = 0.8 + rnd() * 0.5;
      dummy.rotation.set(0, rnd() * 6, 0);
      dummy.position.set(x, y + 0.8 * s, z); dummy.scale.set(s, 1.6 * s, s); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, y + 2.1 * s, z); dummy.scale.set(2.1 * s, 1.35 * s, 2.0 * s); dummy.updateMatrix(); canopy.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(x + 0.8 * s, y + 2.6 * s, z - 0.4 * s); dummy.scale.set(1.4 * s, 1.0 * s, 1.4 * s); dummy.updateMatrix(); canopy.setMatrixAt(i * 2 + 1, dummy.matrix);
    });
    canopy.castShadow = canopy.receiveShadow = trunks.castShadow = true;
    scene.add(canopy, trunks);
  }

  /* ================================================================ the house */
  const F0 = 0.5, H1 = 3.2, F1 = F0 + H1, U0 = F1 + 0.3, H2 = 3.0, U1 = U0 + H2, RISE = 1.8, RIDGE = U1 + RISE;
  const LW = 14, LD = 8, UW = 12, UD = 7.2, TH = 0.3;
  const house = new THREE.Group();
  scene.add(house);

  // ground stage: slab + starter bars
  box(LW + 1, F0, LD + 1, M.concrete, 0, F0 / 2, 0, house);
  const rebar = new THREE.Group(); house.add(rebar);
  for (let x = -LW / 2 + 0.15; x <= LW / 2; x += 1.4) for (const z of [-LD / 2 + 0.15, LD / 2 - 0.15]) cyl(0.03, 0.03, 1.4 + rnd() * 1.2, M.rebar, x, F0 + 0.9, z, rebar, 5);
  for (let z = -LD / 2 + 1.5; z < LD / 2 - 1; z += 1.4) for (const x of [-LW / 2 + 0.15, LW / 2 - 0.15]) cyl(0.03, 0.03, 1.4 + rnd() * 1.2, M.rebar, x, F0 + 0.9, z, rebar, 5);

  const lowerDefs = [
    { len: LW, pos: [0, F0, LD / 2 - TH / 2], rot: 0, end: true, mull: 3, wins: [{ x: -4.7, w: 4.1, y: 0, h: 2.75 }, { x: 0, w: 4.7, y: 0, h: 2.75 }, { x: 4.7, w: 4.1, y: 0, h: 2.75 }] },
    { len: LW, pos: [0, F0, -LD / 2 + TH / 2], rot: 0, end: true, mull: 1, wins: [{ x: -3.6, w: 2.2, y: 0.9, h: 1.7 }, { x: 3.4, w: 1.4, y: 1.2, h: 1.2 }] },
    { len: LD - 2 * TH, pos: [LW / 2 - TH / 2, F0, 0], rot: Math.PI / 2, end: false, mull: 1, wins: [{ x: 0.6, w: 1.6, y: 0.9, h: 1.7 }] },
    { len: LD - 2 * TH, pos: [-LW / 2 + TH / 2, F0, 0], rot: Math.PI / 2, end: false, mull: 1, wins: [{ x: -2.2, w: 1.2, y: 0.9, h: 1.7 }] },
  ];
  const upperDefs = [
    { len: UW, pos: [0, U0, UD / 2 - TH / 2], rot: 0, end: true, mull: 1, wins: [{ x: -3.8, w: 1.6, y: 0.5, h: 2 }, { x: 0, w: 1.6, y: 0.5, h: 2 }, { x: 3.8, w: 1.6, y: 0.5, h: 2 }] },
    { len: UW, pos: [0, U0, -UD / 2 + TH / 2], rot: 0, end: true, mull: 1, wins: [{ x: -2.6, w: 1.4, y: 0.8, h: 1.5 }, { x: 2.6, w: 1.4, y: 0.8, h: 1.5 }] },
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
  // masonry
  buildWalls(lowerDefs, H1, M.brickL, false);
  box(LW + 0.4, 0.3, LD + 0.4, M.concreteU, 0, F1 + 0.15, 0, house);
  buildWalls(upperDefs, H2, M.brickU, false);
  for (const sx of [1, -1]) house.add(gable(UD, RISE, TH, M.brickU, sx * (UW / 2 - TH / 2), U1));
  // finishes (shells that rise over the masonry)
  buildWalls(lowerDefs, H1, M.render, true);
  box(LW + 0.5, 0.34, LD + 0.5, M.render, 0, F1 + 0.15, 0, house);
  buildWalls(upperDefs, H2, M.wood, true);
  for (const sx of [1, -1]) house.add(gable(UD + 0.08, RISE + 0.04, TH + 0.08, M.wood, sx * (UW / 2 - TH / 2), U1 - 0.01));

  // roof
  const roof = new THREE.Group(); house.add(roof);
  {
    const a = Math.atan(RISE / (UD / 2)), d = UD / 2 + 0.55, Ls = d / Math.cos(a);
    for (const sg of [1, -1]) {
      const p = box(UW + 1, 0.2, Ls, M.roof, 0, 0, 0, roof);
      p.position.set(0, RIDGE - (d / 2) * Math.tan(a) + 0.12, sg * d / 2);
      p.rotation.x = sg * a;
      const fa = box(UW + 1.02, 0.26, 0.1, M.dark, 0, RIDGE - d * Math.tan(a) + 0.08, sg * (d + 0.02), roof);
      fa.castShadow = false;
    }
    box(UW + 1.05, 0.16, 0.36, M.dark, 0, RIDGE + 0.2, 0, roof);
    box(0.8, 1.6, 0.8, M.white, 3.4, RIDGE - 0.15, -1.3, roof);
    box(0.95, 0.12, 0.95, M.dark, 3.4, RIDGE + 0.7, -1.3, roof);
  }

  // glazing
  const panes = [];
  function addPanes(defs, baseY, mat) {
    for (const d of defs) {
      const g = new THREE.Group(); g.position.set(d.pos[0], baseY, d.pos[2]); g.rotation.y = d.rot; house.add(g);
      for (const w of d.wins) {
        const pw = w.w - 0.06, ph = w.h - 0.06;
        const p = new THREE.Group(); p.position.set(w.x, w.y + w.h / 2, 0); g.add(p);
        p.add(new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat));
        const fr = 0.07;
        box(pw, fr, 0.12, M.dark, 0, ph / 2 - fr / 2, 0, p); box(pw, fr, 0.12, M.dark, 0, -ph / 2 + fr / 2, 0, p);
        box(fr, ph, 0.12, M.dark, -pw / 2 + fr / 2, 0, 0, p); box(fr, ph, 0.12, M.dark, pw / 2 - fr / 2, 0, 0, p);
        for (let i = 1; i < d.mull; i++) box(0.05, ph, 0.09, M.dark, -pw / 2 + (pw * i) / d.mull, 0, 0, p);
        panes.push(p);
      }
    }
  }
  addPanes(lowerDefs, F0, M.glass);
  addPanes(upperDefs, U0, M.glassWarm);

  // interior
  const inner = new THREE.Group(); house.add(inner);
  box(LW - 0.62, 0.02, LD - 0.62, M.floor, 0, F0 + 0.012, 0, inner).castShadow = false;
  const fur = [];
  const F = (x, z, fn, ry = 0) => { const g = new THREE.Group(); g.position.set(x, F0, z); g.rotation.y = ry; fn(g); house.add(g); fur.push(g); return g; };
  F(-3.4, 0.2, (g) => { box(4.4, 0.02, 3.2, std({ color: 0xbfae94, roughness: 1 }), 0, 0.025, 0, g); });
  F(-3.4, -1.3, (g) => {
    box(3.4, 0.42, 1.0, M.fab, 0, 0.21, 0, g); box(3.4, 0.55, 0.25, M.fab, 0, 0.6, -0.38, g);
    box(0.25, 0.62, 1, M.fab, -1.58, 0.31, 0, g); box(0.25, 0.62, 1, M.fab, 1.58, 0.31, 0, g);
    box(0.7, 0.4, 0.14, M.fab2, -0.9, 0.62, -0.22, g); box(0.7, 0.4, 0.14, M.fab2, 0.9, 0.62, -0.22, g);
  });
  F(-4.9, 1.8, (g) => { box(1, 0.42, 0.9, M.fab2, 0, 0.21, 0, g); box(1, 0.5, 0.2, M.fab2, 0, 0.6, -0.35, g); }, Math.PI * 0.8);
  F(-3.4, 0.35, (g) => { box(1.5, 0.36, 0.8, M.walnut, 0, 0.18, 0, g); box(0.4, 0.08, 0.3, M.art, 0.3, 0.4, 0, g); });
  F(-6.42, 0.2, (g) => {
    box(0.5, 1.1, 2.2, std({ color: 0x2b2926, roughness: 0.8 }), 0, 0.55, 0, g);
    box(0.05, 0.42, 1.2, M.fire, 0.26, 0.42, 0, g);
    box(0.62, 0.08, 2.4, M.marble, 0, 1.14, 0, g);
    box(0.04, 1.0, 1.5, M.art, 0.05, 2.05, 0, g);
  });
  F(3.6, -3.36, (g) => {
    box(4.8, 0.88, 0.62, M.oak, 0, 0.44, 0, g); box(4.85, 0.05, 0.66, M.marble, 0, 0.905, 0, g);
    box(0.95, 2.7, 0.64, M.oak, 2.6, 1.35, 0, g);
  });
  F(3.4, -1.1, (g) => { box(2.8, 0.9, 1.0, M.oak, 0, 0.45, 0, g); box(2.9, 0.06, 1.1, M.marble, 0, 0.93, 0, g); });
  for (let i = 0; i < 3; i++) F(2.5 + i * 0.9, -0.3, (g) => { cyl(0.2, 0.2, 0.06, M.walnut, 0, 0.7, 0, g); cyl(0.02, 0.02, 0.68, M.dark, 0, 0.34, 0, g, 6); });
  F(3.4, -1.1, (g) => { for (let i = -1; i <= 1; i++) { box(0.012, 0.9, 0.012, M.dark, i * 0.9, H1 - 0.45, 0, g); ball(0.15, M.lamp, i * 0.9, H1 - 0.98, 0, g); } });
  F(3.8, 1.9, (g) => {
    box(2.4, 0.06, 1.0, M.walnut, 0, 0.75, 0, g);
    box(0.08, 0.72, 0.8, M.walnut, -1.0, 0.36, 0, g); box(0.08, 0.72, 0.8, M.walnut, 1.0, 0.36, 0, g);
    for (const cx of [-0.75, 0, 0.75]) for (const sz of [1, -1]) { box(0.45, 0.06, 0.45, M.fab2, cx, 0.46, sz * 0.75, g); box(0.45, 0.5, 0.06, M.fab2, cx, 0.72, sz * 0.97, g); box(0.04, 0.44, 0.04, M.dark, cx, 0.22, sz * 0.75, g); }
  });
  F(-6.1, -3.1, (g) => { cyl(0.28, 0.22, 0.5, M.pot, 0, 0.25, 0, g); ball(0.55, M.leaf, 0, 1.0, 0, g, 1, 1.3, 1); });
  F(6.2, 3.2, (g) => { cyl(0.28, 0.22, 0.5, M.pot, 0, 0.25, 0, g); ball(0.5, M.leaf, 0, 1.0, 0, g, 1, 1.5, 1); });
  F(-5.5, -1.6, (g) => { box(0.03, 1.6, 0.03, M.dark, 0, 0.8, 0, g); cyl(0.22, 0.28, 0.32, M.lamp, 0, 1.7, 0, g); });

  const iLights = [[-3.4, F1 - 0.5, 0.2], [3.4, F1 - 0.6, -1.1], [3.8, F1 - 0.6, 2.2], [0, U0 + 2.2, 0]].map(([x, y, z]) => {
    const l = new THREE.PointLight(0xffb36b, 0, 13, 2); l.position.set(x, y, z); scene.add(l); return l;
  });
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 7, 2); fireLight.position.set(-5.9, F0 + 0.6, 0.2); scene.add(fireLight);

  /* ================================================================ construction site */
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(21, 64), M.dirt);
  dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.03; dirt.receiveShadow = true; dirt.renderOrder = 1;
  scene.add(dirt);
  const site = [];
  const S = (x, z, fn, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; fn(g); scene.add(g); site.push(g); return g; };
  for (const [x, z, r] of [[9.8, 5.5, 0.3], [10.6, -3, 0], [-9.6, 6.5, -0.4], [11.5, 8, 0.6]]) S(x, z, (g) => { box(1.2, 0.14, 1, M.timber, 0, 0.07, 0, g); box(1.1, 0.75, 0.9, M.brick, 0, 0.52, 0, g); }, r);
  S(-10.5, -1, (g) => { for (let l = 0; l < 3; l++) for (let k = 0; k < 5; k++) box(4.2, 0.12, 0.18, M.timber, 0, 0.08 + l * 0.13, -0.5 + k * 0.24, g); }, 0.25);
  S(8.2, 10.5, (g) => { for (let l = 0; l < 3; l++) for (let k = 0; k < 3; k++) box(1.2, 0.2, 0.4, M.concrete, 0, 0.1 + l * 0.2, -0.45 + k * 0.45, g); });
  S(11.5, 1.2, (g) => { const d = cyl(0.45, 0.7, 1.3, std({ color: 0xd4552b, roughness: 0.5 }), 0, 1.1, 0, g); d.rotation.z = 0.6; box(1.2, 0.5, 0.6, M.dark, 0, 0.25, 0, g); });
  S(-13, -11, (g) => { box(5.2, 2.5, 2.3, std({ color: 0xe9e6e0 }), 0, 1.25, 0, g); box(5.22, 0.3, 2.32, std({ color: 0x2c4d7a }), 0, 2.3, 0, g); box(3, 0.7, 2.34, M.dark, 0.6, 1.5, 0, g); }, 0.4);
  S(9, -8.5, (g) => { const c = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.2, 20), std({ color: 0xc9a77a, roughness: 1 })); c.position.y = 0.6; c.castShadow = c.receiveShadow = true; g.add(c); });

  const crane = new THREE.Group(); crane.position.set(-12.5, 0, -7.5); scene.add(crane);
  box(1, 25, 1, M.lattice, 0, 12.5, 0, crane);
  box(3, 0.6, 3, M.concrete, 0, 0.3, 0, crane);
  const jib = new THREE.Group(); jib.position.y = 25; crane.add(jib);
  box(25, 0.9, 0.9, M.lattice, 7, 0.45, 0, jib);
  box(2.4, 1.4, 1.3, M.concrete, -4.6, -0.2, 0, jib);
  box(0.6, 4.2, 0.6, M.lattice, 0, 3, 0, jib);
  box(1.4, 1.4, 1.4, M.yellow, 0.9, -0.7, 0.9, jib);
  box(0.04, 11.5, 0.04, M.dark, 13, -5.75, 0, jib);
  box(0.5, 0.7, 0.4, M.yellow, 13, -11.8, 0, jib);
  const tieMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  jib.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5, 0.9, 0), new THREE.Vector3(0, 5, 0), new THREE.Vector3(19, 0.9, 0)]), tieMat));

  /* ================================================================ garden, terrace & pool */
  const terrace = new THREE.Group(); scene.add(terrace);
  {
    const D = F0;
    box(20, D, 3, M.stone, 0, D / 2, 5.5, terrace);
    box(20, D, 2, M.stone, 0, D / 2, 12, terrace);
    box(3.5, D, 4, M.stone, -8.25, D / 2, 9, terrace);
    box(5.5, D, 4, M.stone, 7.25, D / 2, 9, terrace);
    box(11, 0.04, 4, M.poolTile, -1, 0.06, 9, terrace);
    box(3.2, D * 0.66, 0.6, M.stone, 7, D * 0.33, 13.3, terrace);
    box(3.2, D * 0.33, 0.6, M.stone, 7, D * 0.165, 13.9, terrace);
  }
  const waterGeo = new THREE.BoxGeometry(11, 1, 4); waterGeo.translate(0, 0.5, 0);
  { const uv = waterGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 11, uv.getY(i) * 4); }
  const water = new THREE.Mesh(waterGeo, M.water); water.position.set(-1, 0.08, 9); water.receiveShadow = true; scene.add(water);
  const poolLight = new THREE.PointLight(0x5fd0ff, 0, 10, 2); poolLight.position.set(-1, 0.6, 9); scene.add(poolLight);

  const garden = [];
  const G = (x, z, fn, ry = 0, y = F0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; fn(g); scene.add(g); garden.push(g); return g; };
  for (const x of [5.6, 7.0, 8.4]) G(x, 9.2, (g) => {
    box(0.7, 0.1, 1.5, M.cream, 0, 0.32, 0.2, g);
    const b = box(0.7, 0.08, 0.75, M.cream, 0, 0.55, -0.82, g); b.rotation.x = 0.7;
    box(0.06, 0.28, 0.06, M.dark, -0.3, 0.14, 0.8, g); box(0.06, 0.28, 0.06, M.dark, 0.3, 0.14, 0.8, g);
    box(0.06, 0.28, 0.06, M.dark, -0.3, 0.14, -0.5, g); box(0.06, 0.28, 0.06, M.dark, 0.3, 0.14, -0.5, g);
  });
  G(9.3, 11.9, (g) => { cyl(0.03, 0.03, 2.4, M.dark, 0, 1.2, 0, g, 6); const c = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.5, 10, 1, true), M.cream); c.position.y = 2.45; c.castShadow = true; g.add(c); });
  G(-5, 5.6, (g) => { box(3, 0.4, 0.9, M.fab, 0, 0.2, 0, g); box(3, 0.45, 0.22, M.fab, 0, 0.5, -0.35, g); box(1.2, 0.3, 0.7, M.walnut, 0, 0.15, 1.2, g); });
  G(5.6, 5.5, (g) => {
    box(2.2, 0.06, 0.95, M.walnut, 0, 0.75, 0, g); box(0.08, 0.72, 0.8, M.dark, -0.95, 0.36, 0, g); box(0.08, 0.72, 0.8, M.dark, 0.95, 0.36, 0, g);
    for (const cx of [-0.7, 0, 0.7]) for (const sz of [1, -1]) { box(0.45, 0.45, 0.45, M.cream, cx, 0.23, sz * 0.75, g); }
  });
  for (const x of [-9, -6, -3, 0, 3]) G(x, 12.7, (g) => { box(1.6, 0.45, 0.5, M.dark, 0, 0.22, 0, g); box(1.5, 0.45, 0.42, M.hedge, 0, 0.66, 0, g); });
  for (const [x, z, s] of [[-9, -5.5, 1], [-9.5, 0, 0.9], [9, -5.8, 1.1], [9.6, 1.8, 0.8], [-11.5, 4, 1.2], [12, 12, 1], [-11, 13.5, 0.9], [4.2, -5.6, 0.8], [-2, -5.6, 0.9]]) G(x, z, (g) => { ball(0.9 * s, M.hedge, 0, 0.6 * s, 0, g, 1.2, 0.8, 1.1); }, 0, 0);
  G(0, 14.2, (g) => { for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) ball(0.32, M.lavender, -9 + i * 0.7, 0.26, r * 0.8, g, 1, 0.8, 1); }, 0, 0);
  G(-12.8, 9, (g) => { cyl(0.18, 0.26, 2, std({ color: 0x4a3b2c }), 0, 1, 0, g, 7); ball(1.4, std({ color: 0x77855a, roughness: 1, flatShading: true }), 0, 2.6, 0, g, 1.4, 0.9, 1.3); }, 0, 0);
  G(13, 5, (g) => { cyl(0.16, 0.24, 1.8, std({ color: 0x4a3b2c }), 0, 0.9, 0, g, 7); ball(1.3, std({ color: 0x77855a, roughness: 1, flatShading: true }), 0, 2.4, 0, g, 1.3, 0.9, 1.4); }, 0, 0);
  const gLamps = [];
  for (const [x, z] of [[5.2, 14.5], [8.8, 14.5], [-10, 11], [10, 6.5], [-10, 5]]) G(x, z, (g) => { box(0.12, 0.6, 0.12, M.dark, 0, 0.3, 0, g); gLamps.push(box(0.1, 0.12, 0.1, M.lamp, 0, 0.62, 0, g)); }, 0, 0);
  for (let i = 0; i < 6; i++) G(7 + Math.sin(i * 0.6) * 1.2, 15 + i * 1.3, (g) => { box(1.1, 0.06, 0.7, M.stone, 0, 0.03, 0, g); }, i * 0.2, 0);

  /* ================================================================ lights */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 220 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 3);
  scene.add(sun, sun.target);

  const hex = (h) => new THREE.Color(h);
  const K = [
    { top: 0x22314c, hor: 0xc2a98d, sun: 0xffd6a8, si: 2.0, dir: [0.7, 0.42, 0.55], hs: 0xa3b2c9, hg: 0x4a3a2c, hi: 1.15, ex: 1.15, inside: 0, pool: 0 },
    { top: 0x2a4c78, hor: 0xe0c9a6, sun: 0xffe3bf, si: 2.5, dir: [-0.5, 0.55, 0.62], hs: 0xaec3dc, hg: 0x52412f, hi: 1.0, ex: 1.0, inside: 0, pool: 0 },
    { top: 0x3a6aa0, hor: 0xf1cf9f, sun: 0xffcf8c, si: 2.8, dir: [-0.72, 0.36, 0.66], hs: 0xb8c8dc, hg: 0x5a4632, hi: 1.0, ex: 1.0, inside: 0.25, pool: 0 },
    { top: 0x121c33, hor: 0x5d6680, sun: 0xa9bbff, si: 0.5, dir: [0.45, 0.6, 0.4], hs: 0x5a6a90, hg: 0x221a14, hi: 0.55, ex: 1.15, inside: 1, pool: 0 },
    { top: 0x1b3463, hor: 0xd09a78, sun: 0xffb27a, si: 1.4, dir: [-0.75, 0.22, -0.55], hs: 0x8094c0, hg: 0x3a2c22, hi: 0.75, ex: 1.05, inside: 0.9, pool: 1 },
    { top: 0x243a68, hor: 0xff9e58, sun: 0xffa25a, si: 2.4, dir: [-0.85, 0.17, -0.55], hs: 0x93a2c8, hg: 0x3a2a1e, hi: 1.05, ex: 1.05, inside: 1, pool: 1 },
  ].map((k) => ({ ...k, top: hex(k.top), hor: hex(k.hor), sun: hex(k.sun), hs: hex(k.hs), hg: hex(k.hg), dir: new THREE.Vector3(...k.dir).normalize() }));

  /* ================================================================ camera path */
  const V = (a) => new THREE.Vector3(...a);
  const camPos = new THREE.CatmullRomCurve3([[20, 13, 27], [-22, 12, 24], [-7, 5.5, 23], [5.6, 2.1, 3.0], [11, 2.8, 17.5], [23, 8.5, 31]].map(V), false, 'centripetal');
  const camTgt = new THREE.CatmullRomCurve3([[0, 0.8, 0], [0, 3.2, 0], [0, 4.2, 0], [-4, 1.6, -2.2], [-2, 1.4, 4], [0, 3.2, 1.5]].map(V), false, 'centripetal');

  /* ================================================================ frame update */
  const tmpC = new THREE.Color(), tmpV = new THREE.Vector3(), pos = new THREE.Vector3(), tgt = new THREE.Vector3();
  let aspect = 1;

  function render(s, time, px, py) {
    s = clamp(s, 0, 5);

    // --- build sequence
    rebar.visible = s < 1.05;
    clip.bl.constant = lerp(F0 - 0.01, F1 + 0.05, smooth(s, 0.2, 0.7));
    clip.bu.constant = lerp(F1 - 0.01, RIDGE + 0.05, smooth(s, 0.65, 1.15));
    const tR = easeIO(smooth(s, 1.1, 1.5));
    roof.visible = tR > 0.001; roof.position.y = (1 - tR) * 6;
    clip.re.constant = lerp(F0 - 0.02, U0 + 0.06, smooth(s, 1.45, 1.85));
    clip.wo.constant = lerp(U0 - 0.05, RIDGE + 0.1, smooth(s, 1.6, 1.95));
    panes.forEach((p, i) => { p.visible = s > 1.85 + i * 0.008; });
    inner.visible = s > 1.85;
    // the crane swings its jib away from the house, then is dismantled (sinks)
    const tC = smooth(s, 1.45, 1.8);
    crane.visible = tC < 0.999; crane.position.y = -tC * 27;
    jib.rotation.y = -0.52 + Math.sin(time * 0.2) * 0.35 * (1 - smooth(s, 1.0, 1.3)) + Math.PI * easeIO(smooth(s, 1.0, 1.4));
    site.forEach((g, i) => { const k = 1 - smooth(s, 1.7 + i * 0.025, 1.95 + i * 0.025); g.visible = k > 0.001; g.scale.setScalar(Math.max(0.0001, k)); });
    popIn(fur, s, 2.4, 0.03);
    M.dirt.opacity = 1 - smooth(s, 3.1, 3.6); dirt.visible = M.dirt.opacity > 0.001;
    const tT = smooth(s, 3.2, 3.6); terrace.visible = tT > 0.001; terrace.scale.y = Math.max(0.001, tT);
    const tW = smooth(s, 3.5, 3.95); water.visible = tW > 0.001; water.scale.y = Math.max(0.001, tW * 0.37);
    popIn(garden, s, 3.6, 0.018);

    // --- light & sky
    const i = Math.min(4, Math.floor(s)), f = easeIO(clamp(s - i)), a = K[i], b = K[i + 1];
    skyMat.uniforms.top.value.lerpColors(a.top, b.top, f);
    skyMat.uniforms.horizon.value.lerpColors(a.hor, b.hor, f);
    scene.fog.color.copy(skyMat.uniforms.horizon.value);
    const sunDir = tmpV.copy(a.dir).lerp(b.dir, f).normalize();
    skyMat.uniforms.sunDir.value.copy(sunDir);
    sun.color.lerpColors(a.sun, b.sun, f);
    skyMat.uniforms.sunColor.value.copy(sun.color);
    sun.intensity = lerp(a.si, b.si, f);
    sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position);
    hemi.color.lerpColors(a.hs, b.hs, f);
    hemi.groundColor.lerpColors(a.hg, b.hg, f);
    hemi.intensity = lerp(a.hi, b.hi, f);
    renderer.toneMappingExposure = lerp(a.ex, b.ex, f);

    const inside = lerp(a.inside, b.inside, f) * smooth(s, 2.3, 2.9);
    iLights.forEach((l, k) => { l.intensity = inside * (k === 3 ? 18 : 26); });
    M.glass.emissiveIntensity = inside * 0.35;
    M.glassWarm.emissiveIntensity = inside * 1.5;
    M.lamp.emissiveIntensity = inside * 2.2;
    const flicker = 0.82 + 0.18 * Math.sin(time * 13.1) * Math.sin(time * 7.3);
    M.fire.emissiveIntensity = inside * 3 * flicker;
    fireLight.intensity = inside * 10 * flicker;
    const pool = lerp(a.pool, b.pool, f) * tW;
    poolLight.intensity = pool * 14;
    M.water.emissiveIntensity = 0.15 + pool * 0.55;
    T.caustic.offset.set(time * 0.015, time * 0.01);
    M.lamp.emissiveIntensity = Math.max(M.lamp.emissiveIntensity, pool * 2);

    // --- camera
    const u = (i + easeIO(clamp(s - i))) / 5;
    camPos.getPoint(u, pos); camTgt.getPoint(u, tgt);
    const near3 = 1 - smooth(Math.abs(s - 3), 0, 1);
    if (aspect < 1) { // portrait: pull back so the house fits
      const k = lerp(1.45, 1.0, near3);
      pos.sub(tgt).multiplyScalar(k).add(tgt);
      // final card on mobile only shows the top half of the screen: lift the house into it
      const fin = easeIO(smooth(s, 4.3, 4.95));
      tgt.y -= 5.5 * fin; pos.y -= 2 * fin;
    }
    const par = 1 - near3 * 0.8;
    pos.x += px * 0.9 * par; pos.y -= py * 0.45 * par;
    camera.position.copy(pos); camera.lookAt(tgt);
    camera.fov = (aspect < 1 ? 50 : 36) + 16 * easeIO(near3);
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h) return;
    aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  return { render, resize };
}

// UI, scroll and i18n. The 3D scene lives in scene.js and is loaded on demand,
// so the page still works (text, HUD, forms) if WebGL or the CDN is unavailable.

const STAGES = 5; // keyframes 0..5 (six stages)
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------ i18n */
const I18N = {
  en: {
    loading: 'Laying the foundations…',
    'nav.build': 'The build', 'nav.services': 'Services', 'nav.studio': 'Studio', 'nav.contact': 'Contact',
    'cta.quote': 'Request a quote', 'cta.projects': 'Our projects',
    'st.0': 'Ground', 'st.1': 'Structure', 'st.2': 'Finish', 'st.3': 'Inside', 'st.4': 'Living', 'st.5': 'Handover',
    'h.0': 'Every home starts <em>from the ground up.</em>',
    'p.0': 'Foundations poured, steel set, the first line drawn on the land. Scroll and watch it rise.',
    'h.1': 'Brick by brick, <em>floor by floor.</em>',
    'p.1': 'Load-bearing masonry, reinforced concrete and a roof that closes the shell — built by our own crews.',
    'h.2': 'Built to <em>the last detail.</em>',
    'p.2': 'Lime render, larch cladding, standing-seam metal and triple glazing. Materials chosen to age well.',
    'h.3': 'Step inside <em>your next chapter.</em>',
    'p.3': 'Open-plan living, a kitchen made for long dinners and light that follows you from morning to night.',
    'h.4': 'Spaces made <em>for the light.</em>',
    'p.4': 'Terraces, pools and gardens designed together with the house, so inside and outside become one place.',
    'h.5': 'Welcome <em>home.</em>',
    'p.5': 'From the first stone to the keys in your hand. One team, one promise.',
    'hud.day': 'Build day', 'hud.complete': 'Complete', 'hud.stage': 'Stage',
    'dot.0': 'Ground', 'dot.1': 'Structure', 'dot.2': 'Finish', 'dot.3': 'Inside', 'dot.4': 'Living', 'dot.5': 'Home',
    'plan.label': 'Plan · Ground floor · 1:100',
    'tab.0': 'Ground', 'tab.1': 'Frame', 'tab.2': 'Roof', 'tab.3': 'Keys',
    hint: 'Scroll to build',
    stageNames: ['Foundations', 'Structure', 'Roof & finish', 'Interiors', 'Landscape', 'Handover'],
    'srv.kicker': 'Services', 'srv.title': 'What we <em>build.</em>',
    'srv.lead': 'One contract, one team — from permits to the final walkthrough.',
    'srv.1.t': 'New homes', 'srv.1.d': 'Turnkey villas and family homes, designed and built on your land.',
    'srv.2.t': 'Renovation', 'srv.2.d': 'Farmhouses and apartments restored with structural upgrades and new systems.',
    'srv.3.t': 'Interiors', 'srv.3.d': 'Kitchens, bathrooms, joinery and lighting, made to measure in our workshop.',
    'srv.4.t': 'Pools &amp; landscape', 'srv.4.d': 'Pools, terraces and gardens planned with the house, not after it.',
    'std.kicker': 'Studio', 'std.title': 'A family of builders <em>since 1987.</em>',
    'std.text': 'Three generations of builders, surveyors and craftspeople working from Siena across Tuscany. Every trade stays in-house, so the person who quotes your home is the person who hands you the keys.',
    'std.f1': 'years on site', 'std.f2': 'homes delivered', 'std.f3': 'months average build', 'std.f4': 'year structural warranty',
    'std.quote': '“They gave us a fixed price and a date. They kept both.”',
    'std.who': 'Giulia &amp; Marco — villa near Montalcino',
    'ct.kicker': 'Contact', 'ct.title': 'Let’s build <em>yours.</em>',
    'ct.lead': 'Tell us about your land and your idea. We reply within two working days with a first estimate.',
    'ct.studio': 'Studio', 'ct.phone': 'Phone',
    'f.name': 'Name', 'f.phone': 'Phone', 'f.project': 'Project', 'f.msg': 'Tell us about your project',
    'f.send': 'Send request', 'f.ok': 'Thank you — we’ll be in touch within two working days.',
    'foot.top': 'Back to top ↑',
  },
  it: {
    loading: 'Gettiamo le fondamenta…',
    'nav.build': 'Il cantiere', 'nav.services': 'Servizi', 'nav.studio': 'Studio', 'nav.contact': 'Contatti',
    'cta.quote': 'Richiedi un preventivo', 'cta.projects': 'I nostri progetti',
    'st.0': 'Terreno', 'st.1': 'Struttura', 'st.2': 'Finiture', 'st.3': 'Interni', 'st.4': 'Esterni', 'st.5': 'Consegna',
    'h.0': 'Ogni casa nasce <em>dalle fondamenta.</em>',
    'p.0': 'Getto delle fondazioni, ferri posati, la prima linea tracciata sul terreno. Scorri e guardala crescere.',
    'h.1': 'Mattone dopo mattone, <em>piano dopo piano.</em>',
    'p.1': 'Muratura portante, cemento armato e un tetto che chiude l’involucro — costruiti dalle nostre squadre.',
    'h.2': 'Costruita <em>fino all’ultimo dettaglio.</em>',
    'p.2': 'Intonaco alla calce, rivestimento in larice, lamiera aggraffata e triplo vetro. Materiali scelti per invecchiare bene.',
    'h.3': 'Entra nel <em>tuo nuovo capitolo.</em>',
    'p.3': 'Living open space, una cucina pensata per le cene lunghe e una luce che ti segue dalla mattina alla sera.',
    'h.4': 'Spazi fatti <em>per la luce.</em>',
    'p.4': 'Terrazze, piscine e giardini progettati insieme alla casa, perché dentro e fuori diventino un unico luogo.',
    'h.5': 'Benvenuti <em>a casa.</em>',
    'p.5': 'Dalla prima pietra alle chiavi in mano. Una squadra, una promessa.',
    'hud.day': 'Giorno', 'hud.complete': 'Completato', 'hud.stage': 'Fase',
    'dot.0': 'Terreno', 'dot.1': 'Struttura', 'dot.2': 'Finiture', 'dot.3': 'Interni', 'dot.4': 'Esterni', 'dot.5': 'Casa',
    'plan.label': 'Pianta · Piano terra · 1:100',
    'tab.0': 'Terreno', 'tab.1': 'Telaio', 'tab.2': 'Tetto', 'tab.3': 'Chiavi',
    hint: 'Scorri per costruire',
    stageNames: ['Fondazioni', 'Struttura', 'Tetto e finiture', 'Interni', 'Paesaggio', 'Consegna'],
    'srv.kicker': 'Servizi', 'srv.title': 'Cosa <em>costruiamo.</em>',
    'srv.lead': 'Un solo contratto, una sola squadra — dai permessi al sopralluogo finale.',
    'srv.1.t': 'Nuove costruzioni', 'srv.1.d': 'Ville e case unifamiliari chiavi in mano, progettate e costruite sul tuo terreno.',
    'srv.2.t': 'Ristrutturazioni', 'srv.2.d': 'Casali e appartamenti recuperati con adeguamento strutturale e nuovi impianti.',
    'srv.3.t': 'Interni', 'srv.3.d': 'Cucine, bagni, falegnameria e illuminazione su misura, realizzati nel nostro laboratorio.',
    'srv.4.t': 'Piscine ed esterni', 'srv.4.d': 'Piscine, terrazze e giardini pensati insieme alla casa, non dopo.',
    'std.kicker': 'Studio', 'std.title': 'Una famiglia di costruttori <em>dal 1987.</em>',
    'std.text': 'Tre generazioni di costruttori, geometri e artigiani che lavorano da Siena in tutta la Toscana. Ogni lavorazione resta interna, così chi ti fa il preventivo è la stessa persona che ti consegna le chiavi.',
    'std.f1': 'anni in cantiere', 'std.f2': 'case consegnate', 'std.f3': 'mesi di cantiere in media', 'std.f4': 'anni di garanzia strutturale',
    'std.quote': '“Ci hanno dato un prezzo fisso e una data. Li hanno rispettati entrambi.”',
    'std.who': 'Giulia e Marco — villa vicino a Montalcino',
    'ct.kicker': 'Contatti', 'ct.title': 'Costruiamo <em>la tua.</em>',
    'ct.lead': 'Raccontaci del tuo terreno e della tua idea. Rispondiamo entro due giorni lavorativi con una prima stima.',
    'ct.studio': 'Studio', 'ct.phone': 'Telefono',
    'f.name': 'Nome', 'f.phone': 'Telefono', 'f.project': 'Progetto', 'f.msg': 'Raccontaci il tuo progetto',
    'f.send': 'Invia richiesta', 'f.ok': 'Grazie — ti ricontatteremo entro due giorni lavorativi.',
    'foot.top': 'Torna su ↑',
  },
};
let lang = (navigator.language || '').toLowerCase().startsWith('it') ? 'it' : 'en';
try { const saved = localStorage.getItem('terra-lang'); if (saved && I18N[saved]) lang = saved; } catch (e) { /* storage blocked */ }

function applyLang(l) {
  lang = l;
  document.documentElement.lang = l;
  const dict = I18N[l];
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = dict[el.dataset.i18n];
    if (v !== undefined) el.innerHTML = v;
  });
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === l));
  lastStage = -1; // force HUD refresh
  try { localStorage.setItem('terra-lang', l); } catch (e) { /* ignore */ }
}
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));

/* ------------------------------------------------------------------ elements */
const $ = (id) => document.getElementById(id);
const build = $('build'), frame = $('frame'), shade = $('shade'), nav = $('nav'), hint = $('hint');
const panels = [...document.querySelectorAll('.panel')];
const dots = [...document.querySelectorAll('#dots li')];
const planPaths = [...document.querySelectorAll('#plan path')];
const planTabs = [...document.querySelectorAll('#planTabs span')];
const elDay = $('day'), elPct = $('pct'), elStage = $('stageName'), elBar = $('planBar');

dots.forEach((li) => li.querySelector('button').addEventListener('click', (e) => {
  const i = +e.currentTarget.dataset.go;
  const top = build.offsetTop + (i / STAGES) * (build.offsetHeight - innerHeight);
  window.scrollTo({ top, behavior: 'smooth' });
}));

/* ------------------------------------------------------------------ scroll state */
let target = 0, s = 0;
function readScroll() {
  const r = build.getBoundingClientRect();
  const total = r.height - innerHeight;
  target = clamp(-r.top / total) * STAGES;
  nav.classList.toggle('solid', r.bottom < 80);
}
addEventListener('scroll', readScroll, { passive: true });
readScroll();
s = target;

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  pointer.tx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ty = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

/* ------------------------------------------------------------------ HUD / overlay */
let lastStage = -1, lastDay = -1;
function ui(s) {
  // copy panels
  panels.forEach((p, i) => {
    const d = s - i;
    let o = 1 - smooth(Math.abs(d), 0.2, 0.46);
    if ((i === 0 && d < 0) || (i === STAGES && d > 0)) o = 1;
    p.style.opacity = o.toFixed(3);
    p.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    const y = (-d * 36).toFixed(1);
    p.style.transform = innerWidth > 900 ? `translateY(calc(-50% + ${y}px))` : `translateY(${y}px)`;
    p.classList.toggle('live', o > 0.6);
  });

  // final framing: the scene shrinks into a card
  const f = easeIO(smooth(s, 4.3, 4.95));
  if (innerWidth > 900) {
    const k = lerp(1, 0.6, f);
    frame.style.transform = `translate(${(innerWidth * 0.17 * f).toFixed(1)}px, ${(-innerHeight * 0.045 * f).toFixed(1)}px) scale(${k.toFixed(4)})`;
    frame.style.borderRadius = `${((16 * f) / k).toFixed(1)}px`;
    frame.style.clipPath = '';
  } else {
    frame.style.transform = '';
    frame.style.borderRadius = '';
    // photo mode: shrink the photos into the card too, so the whole villa stays in view
    frame.style.setProperty('--mt', `${lerp(0, 11, f).toFixed(2)}vh`);
    frame.style.setProperty('--mh', `${lerp(100, 42, f).toFixed(2)}%`);
    frame.style.clipPath = f > 0.001
      ? `inset(${lerp(0, 11, f)}vh ${lerp(0, 4, f)}vw ${lerp(0, 47, f)}vh ${lerp(0, 4, f)}vw round ${lerp(0, 14, f)}px)`
      : '';
  }
  frame.style.boxShadow = f > 0.01 ? `0 40px 120px -40px rgba(0,0,0,${0.9 * f})` : '';
  shade.style.opacity = (1 - f * 0.85).toFixed(3);
  hint.style.opacity = (0.8 * (1 - smooth(s, 0.05, 0.25))).toFixed(3);

  // stats
  const p = s / STAGES;
  const day = Math.round(p * 240);
  if (day !== lastDay) {
    lastDay = day;
    elDay.textContent = String(day).padStart(3, '0');
    elPct.textContent = Math.round(p * 100) + '%';
  }
  const stage = clamp(Math.round(s), 0, STAGES);
  if (stage !== lastStage) {
    lastStage = stage;
    elStage.textContent = I18N[lang].stageNames[stage];
    dots.forEach((d, i) => d.classList.toggle('on', i === stage));
  }

  // plan: drawn during the ground stage, bar follows the whole build
  const draw = smooth(s, 0, 1.1);
  planPaths.forEach((path, i) => { path.style.strokeDashoffset = (1 - clamp(draw * 1.6 - i * 0.07)).toFixed(3); });
  elBar.style.width = (p * 100).toFixed(1) + '%';
  const tab = s < 0.7 ? 0 : s < 1.6 ? 1 : s < 4.4 ? 2 : 3;
  planTabs.forEach((t, i) => t.classList.toggle('on', i === tab));
}

/* ------------------------------------------------------------------ 3D scene */
let world = null;
const loader = $('loader');
const hideLoader = () => loader.classList.add('done');
setTimeout(hideLoader, 6000); // never block the page

/* Visual source, in order of preference:
   1. assets/build.mp4        a video of the whole build, scrubbed by the scroll
   2. assets/stages/1..6.jpg  one photo per stage, cross-faded by the scroll
   3. the procedural 3D scene (scene.js), used when no media is present.
   See PROMPTS.md for how to generate the photos / video. */
const MEDIA = {
  frames: 'assets/frames/manifest.json',
  video: 'assets/build.mp4',
  images: ['1-ground', '2-structure', '3-finish', '4-inside', '5-living', '6-home'].map((n) => `assets/stages/${n}.jpg`),
};
const okMedia = (r) => r.ok && !(r.headers.get('content-type') || '').includes('text/html');
const exists = (url) => fetch(url, { method: 'HEAD' })
  .then((r) => okMedia(r) || (r.status === 405 && fetch(url).then(okMedia)))
  .catch(() => false);

let media = null; // { update(s) }
// Scroll position (stage) → time in assets/build.mp4. The montage is six 10 s clips joined by
// 0.4 s fades; each stage lands on the join where that stage's photo is, and the last stretch
// (4.55 → 5) plays the orbit around the finished villa inside the final card.
const VIDEO_KNOTS = [[0, 0], [1, 9.84], [2, 19.48], [3, 29.13], [4, 38.77], [4.55, 48.41], [5, 58.2]];
function stageToTime(s, duration) {
  const k = VIDEO_KNOTS;
  for (let i = 1; i < k.length; i++) {
    if (s <= k[i][0]) return Math.min(duration - 0.05, lerp(k[i - 1][1], k[i][1], (s - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  }
  return duration - 0.05;
}
// Frame-sequence player (the technique Apple uses on its product pages): the drone video is
// cut into stills packed in WebP atlases; the canvas draws the exact frame for the scroll
// position, blending the two nearest frames, so there is no video seeking and no stutter.
async function useFrames() {
  const r = await fetch(MEDIA.frames).catch(() => null);
  if (!r || !okMedia(r)) return null;
  const m = await r.json();
  const small = innerWidth < 900 || matchMedia('(pointer: coarse)').matches;
  const set = m.sets[small ? 'sd' : 'hd'];
  const per = set.cols * set.rows;
  const cv = document.createElement('canvas');
  cv.className = 'media';
  frame.prepend(cv);
  $('scene').hidden = true;
  const ctx = cv.getContext('2d', { alpha: false });
  const atlas = new Array(set.files).fill(null); // null = not requested, false = loading, Image = ready
  let active = 0, want = 0, dirty = true, lastKey = '';
  const url = (i) => set.pattern.replace('{n}', String(i + 1).padStart(3, '0'));
  const coarse = [];
  for (let i = 0; i < set.files; i += 8) coarse.push(i);
  function next() {
    for (const i of coarse) if (atlas[i] === null) return i;
    for (let d = 0; d < set.files; d++) {
      for (const i of [want + d, want - d]) if (i >= 0 && i < set.files && atlas[i] === null) return i;
    }
    return -1;
  }
  function pump() {
    while (active < 6) {
      const i = next(); if (i < 0) return;
      atlas[i] = false; active++;
      const im = new Image();
      im.src = url(i);
      im.decode().then(() => { atlas[i] = im; dirty = true; }).catch(() => { atlas[i] = null; })
        .finally(() => { active--; pump(); });
    }
  }
  function frameAt(n) {
    n = Math.max(0, Math.min(m.count - 1, n));
    const im = atlas[Math.floor(n / per)];
    if (!im) return null;
    const k = n % per;
    return { im, sx: (k % set.cols) * set.w, sy: Math.floor(k / set.cols) * set.h };
  }
  function nearest(n) {
    for (let d = 0; d < m.count; d++) { const f = frameAt(n - d) || frameAt(n + d); if (f) return f; }
    return null;
  }
  function draw(f, alpha) {
    const cw = cv.width, ch = cv.height, sc = Math.max(cw / set.w, ch / set.h);
    const dw = set.w * sc, dh = set.h * sc;
    ctx.globalAlpha = alpha;
    ctx.drawImage(f.im, f.sx, f.sy, set.w, set.h, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.max(2, Math.round(cv.clientWidth * dpr));
    cv.height = Math.max(2, Math.round(cv.clientHeight * dpr));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    dirty = true;
  };
  addEventListener('resize', fit);
  fit();
  pump();
  // wait for the first images so the page never opens on an empty frame
  await new Promise((ok) => { const t0 = performance.now(); (function w() { if (frameAt(0) || performance.now() - t0 > 4000) ok(); else setTimeout(w, 50); })(); });
  return {
    update(s) {
      if (cv.clientHeight && Math.abs(cv.height - cv.clientHeight * Math.min(devicePixelRatio || 1, 2)) > 2) fit();
      const fr = stageToTime(s, m.duration) * m.fps;
      const n0 = Math.floor(fr), a = fr - n0;
      want = Math.floor(n0 / per);
      const key = fr.toFixed(3);
      if (key === lastKey && !dirty) return;
      lastKey = key; dirty = false;
      const f0 = frameAt(n0), f1 = frameAt(n0 + 1);
      if (f0) { draw(f0, 1); if (f1 && a > 0.02) draw(f1, a); }
      else { const f = nearest(n0); if (f) draw(f, 1); }
      ctx.globalAlpha = 1;
      pump();
    },
  };
}
function useVideo() {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.poster = MEDIA.images[0];
  v.src = MEDIA.video;
  v.className = 'media';
  frame.prepend(v);
  $('scene').hidden = true;
  let seeking = false, pending = null;
  const seek = (t) => { seeking = true; v.currentTime = t; };
  v.addEventListener('seeked', () => { seeking = false; if (pending !== null) { const t = pending; pending = null; if (Math.abs(v.currentTime - t) > 0.02) seek(t); } });
  // iOS only paints seeks after the video has been "played" once
  const unlock = () => { v.play().then(() => v.pause()).catch(() => {}); };
  addEventListener('touchstart', unlock, { once: true, passive: true });
  return new Promise((ok) => {
    v.addEventListener('loadeddata', () => { unlock(); ok({
      update(s) {
        const t = stageToTime(s, v.duration || 58.25);
        if (Math.abs(v.currentTime - t) < 1 / 48 && pending === null) return;
        if (seeking) pending = t; else seek(t);
      },
    }); }, { once: true });
    v.addEventListener('error', () => ok(null), { once: true });
    v.load();
  });
}
function useImages() {
  const imgs = MEDIA.images.map((src, i) => {
    const im = new Image();
    im.src = src; im.alt = ''; im.className = 'media'; im.decoding = 'async';
    im.style.zIndex = i;
    frame.prepend(im);
    return im;
  });
  $('scene').hidden = true;
  return Promise.all(imgs.map((im) => im.decode().catch(() => {}))).then(() => ({
    update(s, px = 0, py = 0) {
      cameraMove(s, px, py).forEach((L, i) => {
        const im = imgs[i];
        im.style.visibility = L.o < 0.002 ? 'hidden' : 'visible';
        if (L.o < 0.002) return;
        im.style.opacity = L.o.toFixed(3);
        im.style.transform = `translate(${L.t.x.toFixed(3)}%, ${L.t.y.toFixed(3)}%) scale(${L.t.k.toFixed(4)})`;
        const blur = L.blur || 0, light = L.light || 0;
        im.style.filter = blur > 0.15 || light > 0.01 ? `blur(${blur.toFixed(1)}px) brightness(${(1 + light).toFixed(3)})` : '';
        const m = L.mask === undefined ? '' : `linear-gradient(to top, #000 ${L.mask.toFixed(1)}%, transparent ${(L.mask + 18).toFixed(1)}%)`;
        im.style.webkitMaskImage = m; im.style.maskImage = m;
      });
    },
  }));
}

/* Camera choreography for the six photos.
   A transform is { k, x, y }: a point p (in % of the frame) is drawn at k·p + (x, y).
   Instead of cross-fades, the "camera" flies: the drone pushes in while the building
   rises out of the ground, then dives through the glass into the living room, walks out
   through the window to the terrace and finally pulls back up above the pool. */
const easeIn = (t) => t * t * t, easeOut = (t) => 1 - Math.pow(1 - t, 3);
const T0 = { k: 1, x: 0, y: 0 };
const about = (t, k, ox, oy) => ({ k: t.k * k, x: k * t.x + ox * (1 - k), y: k * t.y + oy * (1 - k) }); // then zoom k around (ox, oy)
const shift = (t, dx, dy) => ({ k: t.k, x: t.x + dx, y: t.y + dy });
const then = (a, b) => ({ k: a.k * b.k, x: b.k * a.x + b.x, y: b.k * a.y + b.y }); // a, then b
const at = (t, px, py) => [t.k * px + t.x, t.k * py + t.y];
const rise = (s, a, b) => (s >= b ? undefined : lerp(-18, 100, easeIO(clamp((s - a) / (b - a)))));
// lines the "finish" photo up with the two construction photos (it was framed a little wider)
const CAL_FINISH = about(T0, 1.3, 35, 22);

function cameraMove(s, px, py) {
  const L = [];
  const look = (t, k = 1) => shift(t, -px * 0.8 * k, -py * 0.6 * k); // tiny pointer parallax
  // 1-3: same drone position; slow push-in and pan, the house rises from the ground
  const d = Math.min(s, 2.1);
  const drone = shift(about(T0, 1.04 + 0.06 * d, 52, 58), -0.8 * d, 0);
  L[0] = { o: s < 0.97 ? 1 : 0, t: look(drone) };
  L[1] = { o: s >= 0.4 && s < 1.97 ? 1 : 0, t: look(drone), mask: rise(s, 0.4, 0.97) };
  // 3 → 4: dive into the ground-floor glazing
  let t2 = then(CAL_FINISH, drone);
  const z2 = easeIn(clamp((s - 2.05) / 0.72));
  const [dx, dy] = at(t2, 49, 66);
  t2 = about(t2, 1 + 3.2 * z2, dx, dy);
  L[2] = { o: s >= 1.4 ? 1 - smooth(s, 2.6, 2.78) : 0, t: look(t2), mask: rise(s, 1.4, 1.97), blur: 9 * z2 * z2, light: 0.3 * z2 };
  // 4: land in the living room, drift, then fly toward the window
  const a3 = easeOut(clamp((s - 2.55) / 0.55)), z3 = easeIn(clamp((s - 3.08) / 0.68));
  let t3 = about(T0, 1.74 - 0.7 * a3, 50, 58);
  t3 = shift(t3, -1.6 * clamp(s - 2.9, 0, 0.6), 0);
  t3 = about(t3, 1 + 2.2 * z3, ...at(t3, 42, 44));
  L[3] = { o: smooth(s, 2.55, 2.74) * (1 - smooth(s, 3.58, 3.76)), t: look(t3, 0.6), blur: 9 * (1 - a3) * (1 - a3) + 9 * z3 * z3, light: 0.25 * (1 - a3) + 0.35 * z3 };
  // 5: step out onto the terrace (arrive from the right), then glide toward the pool
  const a4 = easeOut(clamp((s - 3.58) / 0.55)), z4 = easeIn(clamp((s - 4.08) / 0.6));
  let t4 = shift(about(T0, 1.59 - 0.55 * a4, 62, 50), 7 * (1 - a4), 0);
  t4 = about(t4, 1 + 1.4 * z4, ...at(t4, 32, 70));
  L[4] = { o: smooth(s, 3.58, 3.76) * (1 - smooth(s, 4.5, 4.66)), t: look(t4, 0.6), blur: 8 * (1 - a4) * (1 - a4) + 7 * z4 * z4, light: 0.2 * (1 - a4) + 0.2 * z4 };
  // 6: drone rises and pulls back from the pool to reveal the villa
  const a5 = easeOut(clamp((s - 4.5) / 0.5));
  L[5] = { o: smooth(s, 4.5, 4.66), t: look(about(T0, 2.64 - 1.6 * a5, 52, 70), 0.4 * (1 - a5)), blur: 8 * (1 - a5) * (1 - a5), light: 0.2 * (1 - a5) };
  return L;
}
function use3D() {
  return import('./scene.js').then(async (m) => {
    world = await m.createScene($('scene'));
    const resize = () => world.resize(frame.clientWidth, frame.clientHeight);
    addEventListener('resize', resize);
    resize();
    world.render(s, 0, 0, 0);
  });
}
(async () => {
  try {
    media = await useFrames();
    if (!media && (await exists(MEDIA.video))) media = await useVideo();
    if (!media && (await Promise.all(MEDIA.images.map(exists))).every(Boolean)) media = await useImages();
    if (!media) await use3D();
  } catch (err) {
    console.warn('Visual unavailable:', err);
    frame.classList.add('fallback');
  }
  requestAnimationFrame(hideLoader);
})();

/* ------------------------------------------------------------------ loop */
// ?still renders only when the scroll moves (used for automated screenshots)
const STILL = new URLSearchParams(location.search).has('still');
let stillFrames = 3;
addEventListener('scroll', () => { stillFrames = 3; }, { passive: true });
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  s = STILL ? target : s + (target - s) * (1 - Math.exp(-dt * 6));
  if (Math.abs(target - s) < 1e-4) s = target;
  pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
  pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
  ui(s);
  const r = build.getBoundingClientRect();
  if (media) media.update(s, pointer.x, pointer.y);
  const moving = Math.abs(target - s) > 1e-4 || stillFrames > 0;
  if (world && r.bottom > 0 && r.top < innerHeight && (!STILL || moving)) {
    world.render(s, now / 1000, pointer.x, pointer.y);
    if (STILL && stillFrames > 0) stillFrames--;
  }
  requestAnimationFrame(loop);
}
applyLang(lang);
requestAnimationFrame(loop);

/* ------------------------------------------------------------------ reveals, counters, form */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    const dt = e.target.querySelector('dt[data-count]');
    if (dt) countUp(dt);
    io.unobserve(e.target);
  });
}, { threshold: 0.2 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

function countUp(el) {
  const end = +el.dataset.count, suffix = el.dataset.suffix || '';
  const t0 = performance.now();
  const step = (t) => {
    const k = easeIO(clamp((t - t0) / 1400));
    el.textContent = Math.round(end * k) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Front-end only: plug in your form endpoint (Formspree, Netlify Forms, your API…) here.
const form = $('quoteForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  let ok = true;
  form.querySelectorAll('[required]').forEach((input) => {
    const valid = input.value.trim() && (input.type !== 'email' || /\S+@\S+\.\S+/.test(input.value));
    input.classList.toggle('invalid', !valid);
    if (!valid) ok = false;
  });
  if (!ok) return;
  form.reset();
  $('formOk').hidden = false;
});

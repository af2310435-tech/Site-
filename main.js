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

import('./scene.js')
  .then(async (m) => {
    world = await m.createScene($('scene'));
    const resize = () => world.resize(frame.clientWidth, frame.clientHeight);
    addEventListener('resize', resize);
    resize();
    world.render(s, 0, 0, 0);
    requestAnimationFrame(hideLoader);
  })
  .catch((err) => {
    console.warn('3D scene unavailable:', err);
    frame.classList.add('fallback');
    hideLoader();
  });

/* ------------------------------------------------------------------ loop */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  s += (target - s) * (1 - Math.exp(-dt * 6));
  if (Math.abs(target - s) < 1e-4) s = target;
  pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
  pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
  ui(s);
  const r = build.getBoundingClientRect();
  if (world && r.bottom > 0 && r.top < innerHeight) world.render(s, now / 1000, pointer.x, pointer.y);
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

// Scroll-scrubbed drone flight decoded frame by frame with WebCodecs.
// The video is split into short MP4 segments (H.264, a keyframe every 12 frames, no B-frames).
// For a scroll position we decode the needed frames on the GPU, keep a small window of them as
// ImageBitmaps and draw the exact frame on a canvas: 24 fps, no video seeking, no stutter.
// Returns null when WebCodecs or the codec is unavailable, so the caller can fall back.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------------- minimal MP4 parser (single video track, as produced by ffmpeg) */
function parseMP4(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const type = (p) => String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
  function children(start, end) {
    const out = {};
    for (let p = start; p + 8 <= end;) {
      let size = dv.getUint32(p), hdr = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16; } else if (size === 0) size = end - p;
      (out[type(p)] ||= []).push({ start: p + hdr, end: p + size });
      p += size;
    }
    return out;
  }
  const top = children(0, buf.byteLength);
  const moov = top.moov[0], trak = children(moov.start, moov.end).trak[0];
  const mdia = children(trak.start, trak.end).mdia[0];
  const minf = children(mdia.start, mdia.end).minf[0];
  const stbl = children(minf.start, minf.end).stbl[0];
  const t = children(stbl.start, stbl.end);
  // sample description
  const stsd = t.stsd[0], entry = stsd.start + 8, eSize = dv.getUint32(entry), eType = type(entry);
  const width = dv.getUint16(entry + 8 + 24), height = dv.getUint16(entry + 8 + 26);
  const sub = children(entry + 8 + 78, entry + eSize);
  let codec, description;
  if (eType === 'avc1' || eType === 'avc3') {
    const c = sub.avcC[0];
    description = u8.slice(c.start, c.end);
    const h = (n) => n.toString(16).padStart(2, '0');
    codec = `avc1.${h(description[1])}${h(description[2])}${h(description[3])}`;
  } else if (eType === 'vp09') {
    const c = sub.vpcC[0], b = c.start + 4;
    const pad = (n) => String(n).padStart(2, '0');
    codec = `vp09.${pad(u8[b])}.${pad(u8[b + 1])}.${pad(u8[b + 2] >> 4)}`;
  } else throw new Error('unsupported codec ' + eType);
  // sample table
  const stsz = t.stsz[0], fixed = dv.getUint32(stsz.start + 4), count = dv.getUint32(stsz.start + 8);
  const sizes = Array.from({ length: count }, (_, i) => fixed || dv.getUint32(stsz.start + 12 + i * 4));
  let offsets = [];
  if (t.stco) { const b = t.stco[0].start, n = dv.getUint32(b + 4); for (let i = 0; i < n; i++) offsets.push(dv.getUint32(b + 8 + i * 4)); }
  else { const b = t.co64[0].start, n = dv.getUint32(b + 4); for (let i = 0; i < n; i++) offsets.push(Number(dv.getBigUint64(b + 8 + i * 8))); }
  const sc = t.stsc[0].start, scN = dv.getUint32(sc + 4), runs = [];
  for (let i = 0; i < scN; i++) runs.push([dv.getUint32(sc + 8 + i * 12), dv.getUint32(sc + 12 + i * 12)]);
  const keys = new Set();
  if (t.stss) { const b = t.stss[0].start, n = dv.getUint32(b + 4); for (let i = 0; i < n; i++) keys.add(dv.getUint32(b + 8 + i * 4) - 1); }
  else for (let i = 0; i < count; i++) keys.add(i);
  const samples = [];
  for (let c = 0, s = 0; c < offsets.length && s < count; c++) {
    let r = runs.length - 1; while (r > 0 && runs[r][0] > c + 1) r--;
    let off = offsets[c];
    for (let k = 0; k < runs[r][1] && s < count; k++, s++) { samples.push({ offset: off, size: sizes[s], key: keys.has(s) }); off += sizes[s]; }
  }
  return { codec, description, width, height, samples, data: u8 };
}

/* ---------------- player */
export async function createFlight({ manifestUrl, canvas, timeAt, onReady }) {
  if (!('VideoDecoder' in window) || !('createImageBitmap' in window)) return null;
  const r = await fetch(manifestUrl).catch(() => null);
  if (!r || !r.ok || (r.headers.get('content-type') || '').includes('text/html')) return null;
  const m = await r.json();
  let busy = false, dirty = true, lastKey = '', dir = 1, lastF = 0;
  const segs = m.files.map(() => null); // parsed segments
  const loading = new Set();
  const loadSeg = (i) => {
    if (segs[i] || loading.has(i) || i < 0 || i >= segs.length) return;
    loading.add(i);
    fetch(m.files[i]).then((res) => res.arrayBuffer()).then((b) => { segs[i] = parseMP4(b); dirty = true; })
      .catch((e) => console.warn('segment', i, e)).finally(() => { loading.delete(i); prefetch(); });
  };
  let cur = 0;
  function prefetch() { // current segment first, then the next ones, then the rest
    if (loading.size >= 2) return;
    const s = Math.floor(cur / m.segment);
    for (const i of [s, s + 1, s + 2, s - 1, ...m.files.map((_, k) => k)]) { if (i >= 0 && i < segs.length && !segs[i] && !loading.has(i)) { loadSeg(i); if (loading.size >= 2) return; } }
  }
  // first segment decides whether this browser can decode the codec at all
  loadSeg(0);
  await new Promise((ok) => { (function w() { if (segs[0] || !loading.has(0)) ok(); else setTimeout(w, 30); })(); });
  if (!segs[0]) return null;
  const cfg = (s) => ({ codec: s.codec, codedWidth: s.width, codedHeight: s.height, description: s.description, optimizeForLatency: true });
  const sup = await VideoDecoder.isConfigSupported(cfg(segs[0])).catch(() => ({ supported: false }));
  if (!sup.supported) return null;

  const ctx = canvas.getContext('2d', { alpha: false });
  const cache = new Map(); // global frame -> ImageBitmap

  async function decode(si, from, to) {
    busy = true;
    const s = segs[si], base = si * m.segment, pending = [];
    try {
      await new Promise((resolve, reject) => {
        const dec = new VideoDecoder({
          output: (f) => {
            const g = base + Math.round(f.timestamp / 1000);
            pending.push(createImageBitmap(f).then((b) => { if (cache.has(g)) cache.get(g).close(); cache.set(g, b); dirty = true; }).finally(() => f.close()));
          },
          error: reject,
        });
        dec.configure(cfg(s));
        for (let i = from; i <= to; i++) {
          const x = s.samples[i];
          dec.decode(new EncodedVideoChunk({ type: x.key ? 'key' : 'delta', timestamp: i * 1000, data: s.data.subarray(x.offset, x.offset + x.size) }));
        }
        dec.flush().then(() => { dec.close(); resolve(); }, reject);
      });
      await Promise.all(pending);
    } catch (e) { console.warn('decode', e); }
    busy = false;
  }
  function schedule(g) {
    if (busy) return;
    const ahead = 20, behind = 6;
    for (let d = 0; d <= ahead; d++) {
      for (const n of d === 0 ? [g] : [g + d * dir, g - d * dir]) {
        if (n < 0 || n >= m.count || cache.has(n)) continue;
        if (Math.abs(n - g) > (Math.sign(n - g) === dir ? ahead : behind)) continue;
        const si = Math.floor(n / m.segment), s = segs[si];
        if (!s) { loadSeg(si); continue; }
        const local = n - si * m.segment;
        let k = local; while (k > 0 && !s.samples[k].key) k--;
        let end = k + 1; while (end < s.samples.length && !s.samples[end].key) end++;
        end = Math.min(s.samples.length - 1, end + 11); // this GOP and the next one
        decode(si, k, end).then(() => schedule(Math.round(lastF)));
        return;
      }
    }
  }
  function evict(g) {
    for (const [n, b] of cache) if (Math.abs(n - g) > 48) { b.close(); cache.delete(n); }
  }
  function nearest(n) {
    for (let d = 0; d < 400; d++) { if (cache.has(n - d)) return cache.get(n - d); if (cache.has(n + d)) return cache.get(n + d); }
    return null;
  }
  function draw(b, alpha) {
    const cw = canvas.width, ch = canvas.height, sc = Math.max(cw / b.width, ch / b.height);
    const dw = b.width * sc, dh = b.height * sc;
    ctx.globalAlpha = alpha;
    ctx.drawImage(b, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    dirty = true;
  };
  addEventListener('resize', fit);
  fit();
  prefetch();
  schedule(0);
  await new Promise((ok) => { const t0 = performance.now(); (function w() { if (cache.has(0) || performance.now() - t0 > 5000) ok(); else setTimeout(w, 30); })(); });
  onReady?.();
  console.info('flight: WebCodecs player ready', segs[0].codec);

  return {
    update(s) {
      if (canvas.clientHeight && Math.abs(canvas.height - canvas.clientHeight * Math.min(devicePixelRatio || 1, 2)) > 2) fit();
      const f = clamp(timeAt(s, m.duration) * m.fps, 0, m.count - 1);
      if (f !== lastF) dir = f > lastF ? 1 : -1;
      lastF = f; cur = Math.round(f);
      schedule(Math.floor(f));
      prefetch();
      evict(cur);
      const key = f.toFixed(3);
      if (key === lastKey && !dirty) return;
      lastKey = key; dirty = false;
      const n0 = Math.floor(f), a = f - n0, b0 = cache.get(n0), b1 = cache.get(n0 + 1);
      if (b0) { draw(b0, 1); if (b1 && a > 0.04) draw(b1, a); }
      else { const b = nearest(n0); if (b) draw(b, 1); }
      ctx.globalAlpha = 1;
    },
  };
}

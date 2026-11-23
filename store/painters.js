// ---------- seeded random so the store looks the same every visit ----------
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const RATINGS = ['G', 'PG', 'PG'];

const SPINE_STYLES = [
  { bg: '#111114', fg: '#f2efe8', band: '#b23a2e' }, { bg: '#f2efe6', fg: '#1a1a1a', band: '#2b4f86' },
  { bg: '#1d2b4a', fg: '#f2efe6', band: '#c9a24a' }, { bg: '#6e1f24', fg: '#f2efe6', band: '#e8dcc4' },
  { bg: '#1f3b2c', fg: '#f2efe6', band: '#c9a24a' }, { bg: '#e8dcc4', fg: '#3a2a1a', band: '#7a2a24' },
  { bg: '#2a2a2e', fg: '#e8c46a', band: '#e8c46a' }, { bg: '#3b4f6b', fg: '#ffffff', band: '#f2efe6' },
  { bg: '#ffffff', fg: '#b23a2e', band: '#b23a2e' }, { bg: '#a8492b', fg: '#ffffff', band: '#1a1a1a' },
  { bg: '#4a3a5e', fg: '#f2efe6', band: '#d8c08a' }, { bg: '#0f0f10', fg: '#9fc4d0', band: '#9fc4d0' },
  { bg: '#121212', fg: '#ffffff', band: '#8a8a8a' }, { bg: '#f4f1e8', fg: '#2a2a2a', band: '#2a2a2a' }
];
const FONTS = ['900 {s}px "Arial Black", Impact, sans-serif', 'bold {s}px Georgia, serif', 'bold {s}px "Trebuchet MS", sans-serif', '900 {s}px Impact, "Arial Narrow", sans-serif', 'bold {s}px "Helvetica Neue", Arial, sans-serif'];

// a tape is either a real catalog title (object) or a display copy (just a name)
function makeTape(x) {
  const it = typeof x === 'string' ? { title: x, demo: true } : x;
  const look = { style: pick(SPINE_STYLES), font: pick(FONTS), variant: Math.floor(rand() * 4), wear: rand() };
  const r = pick(RATINGS);
  return { ...it, ...look, title: it.title, rating: it.demo ? r : (it.rating || 'NR') };
}
// draw an image to fill a box, cropping the overflow
function drawFill(ctx, im, x, y, w, h) {
  const s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
}

// ---------- canvas painters ----------
function fitFont(ctx, tpl, text, maxW, start) {
  let s = start;
  ctx.font = tpl.replace('{s}', s);
  while (ctx.measureText(text).width > maxW && s > 6) { s -= 1; ctx.font = tpl.replace('{s}', s); }
  return s;
}

function drawSpine(ctx, x0, w, h, t) {
  const st = t.style;
  ctx.fillStyle = st.bg; ctx.fillRect(x0, 0, w, h);
  if (t.variant === 1) { ctx.fillStyle = st.band; ctx.fillRect(x0, h * 0.82, w, h * 0.18); }
  if (t.variant === 2) { ctx.fillStyle = st.band; ctx.fillRect(x0 + w * 0.08, 0, w * 0.12, h); }
  if (t.variant === 3) { ctx.fillStyle = st.band; ctx.fillRect(x0, 0, w, h * 0.06); ctx.fillRect(x0, h * 0.94, w, h * 0.06); }
  // small studio mark at the top
  ctx.strokeStyle = st.band; ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.beginPath(); ctx.arc(x0 + w / 2, h * 0.04 + w * 0.32, w * 0.22, 0, Math.PI * 2); ctx.stroke();
  // title, reading top to bottom
  ctx.save();
  ctx.translate(x0 + w / 2, h * 0.04 + w * 0.8);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = st.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const maxLen = h * 0.72 - w * 0.8;
  fitFont(ctx, t.font, t.title.toUpperCase(), maxLen, Math.round(w * 0.56));
  ctx.fillText(t.title.toUpperCase(), 0, 0);
  ctx.restore();
  // rating box
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x0 + w * 0.14, h * 0.86, w * 0.72, h * 0.08);
  ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(w * 0.36)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t.rating, x0 + w / 2, h * 0.9);
  // plastic sleeve sheen and edge shading
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.12, 'rgba(0,0,0,0.05)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.22)'); g.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  g.addColorStop(0.88, 'rgba(0,0,0,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(x0, 0, w, h);
  // scuffs
  const n = Math.floor(t.wear * 6);
  for (let i = 0; i < n; i++) { ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.1})`; ctx.fillRect(x0 + rand() * w, rand() * h, 1 + rand() * 2, 2 + rand() * 10); }
}

function drawCover(ctx, w, h, t, im) {
  const st = t.style;
  im = im || t.img;
  if (im) {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    drawFill(ctx, im, 0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(w * 0.06, h * 0.88, w * 0.2, h * 0.075);
    ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(w * 0.075)}px Arial, sans-serif`; ctx.fillText(t.rating, w * 0.16, h * 0.918);
    const sh = ctx.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0, 'rgba(255,255,255,0.0)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = st.bg; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.45, h * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = st.band; ctx.fillRect(0, h * 0.06, w, h * 0.012); ctx.fillRect(0, h * 0.8, w, h * 0.012);
  ctx.fillStyle = st.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(w * 0.06)}px Arial, sans-serif`; ctx.fillText('MACKEYTV VIDEO', w / 2, h * 0.035);
  const words = t.title.toUpperCase().split(' ');
  const lines = []; let cur = '';
  ctx.font = t.font.replace('{s}', Math.round(w * 0.16));
  for (const wd of words) { const test = cur ? cur + ' ' + wd : wd; if (ctx.measureText(test).width > w * 0.86 && cur) { lines.push(cur); cur = wd; } else cur = test; }
  lines.push(cur);
  const size = Math.min(Math.round(w * 0.16), Math.round((h * 0.5) / lines.length));
  lines.forEach((ln, i) => {
    const s = fitFont(ctx, t.font, ln, w * 0.88, size);
    ctx.fillText(ln, w / 2, h * 0.42 - ((lines.length - 1) * size * 0.55) + i * size * 1.1);
  });
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(w * 0.06, h * 0.86, w * 0.18, h * 0.08);
  ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(w * 0.08)}px Arial, sans-serif`; ctx.fillText(t.rating, w * 0.15, h * 0.9);
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.0)'); sheen.addColorStop(0.35, 'rgba(255,255,255,0.14)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
}


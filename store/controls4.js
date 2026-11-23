// =================== controls: Chromecast remote + pointer ===================
// Remote: D-pad → ArrowUp/Down/Left/Right, OK → Enter, Back → Escape (forwarded by the launcher app).
const totalOf = (a) => SEGS * LAYOUT[a].per;
const STOPS = [
  { kind: 'nr', label: 'New Releases', x: -HALFW + 1.3, z: 2.55, yaw: Math.PI / 2 },
  ...GENRES.flatMap((g, i) => {
    const a = { kind: 'aisle', ai: i, label: `Aisle ${i + 1} · ${g.name}`, x: aisleX(i), z: LANE_Z, yaw: 0 };
    if (i === N - 1 || !CAPS[i]) return [a];
    return [a, { kind: 'cap', gi: i, label: 'Endcap', x: (aisleX(i) + aisleX(i + 1)) / 2, z: LANE_Z, yaw: 0 }];
  }),
  { kind: 'counter', label: 'Store Computer', x: PC.x, z: PC.z - 0.85, yaw: Math.PI }
];
const aisleStop = (i) => STOPS.findIndex((s) => s.kind === 'aisle' && s.ai === i);
const START = aisleStop(2);
const state = { x: STOPS[START].x, z: LANE_Z + 1.2, yaw: 0, pitch: -0.06, phase: 0, moving: 0 };
const target = { x: state.x, z: state.z, yaw: 0, pitch: -0.06 };
let mode = 'lane';          // lane | aisle | shelf | wall | held | travel | menu | term
let stopIdx = START, ai = 2;
const cur = { side: -1, row: 3, g: 0 };
const wcur = { wall: 0, r: 2, c: 8 };
const keys = {}, holdKeys = {};
let dirty = true;
const card = document.getElementById('card');
const aisleLabel = (i) => GENRES[i].name;
const stopsEl = document.getElementById('stops');
const SHORT = { FAMILY: 'Family', ANIMATED: 'Animated', FAITH: 'Faith', CLASSICS: 'Classics', 'SPORTS & TRUE STORIES': 'Sports', DOCUMENTARIES: 'Docs' };
function renderStops() {
  const show = mode === 'lane' || mode === 'aisle';
  stopsEl.classList.toggle('show', show);
  if (!show) return;
  const here = mode === 'aisle' ? aisleStop(ai) : stopIdx;
  stopsEl.innerHTML = STOPS.map((st, i) => {
    if (st.kind === 'cap') return `<span class="capdot${i === here ? ' on' : ''}"></span>`;
    const label = st.kind === 'nr' ? 'New Releases' : st.kind === 'counter' ? 'Search' : SHORT[GENRES[st.ai].name];
    const num = '';
    return `<button type="button" class="st${i === here ? ' on' : ''}" data-i="${i}">${num}${label}</button>`;
  }).join('');
}
stopsEl.addEventListener('click', (e) => { const b = e.target.closest('.st'); if (!b || mode === 'travel') return; goStop(+b.dataset.i, arrive); });

// ---------- lookups ----------
function tapeAt(a, side, row, g) {
  const L = LAYOUT[a], k = Math.floor(g / L.per), j = g % L.per;
  const pk = planeIndex.get(`${a}:${side}:${row}:${k}`); if (!pk) return null;
  const i = side < 0 ? j : L.per - 1 - j;
  const tape = pk.userData.tapes[i]; if (!tape) return null;
  return { tape, z: SEG_START - k * SEG_STEP - (j + 0.5) * L.pitch, y: pk.userData.y, a, side, row, g };
}
// the nearest filled slot to (row, g) on a side; the end of the alphabet leaves the last shelves bare
function nearestFilled(a, side, row, g) {
  for (let d = 0; d < totalOf(a); d++) for (const gg of [g - d, g + d]) if (gg >= 0 && gg < totalOf(a) && tapeAt(a, side, row, gg)) return { row, g: gg };
  for (let dr = 1; dr < ROWS; dr++) for (const rr of [row - dr, row + dr]) if (rr >= 0 && rr < ROWS) { const h = nearestFilled1(a, side, rr, g); if (h) return h; }
  return null;
}
function nearestFilled1(a, side, row, g) { for (let d = 0; d < totalOf(a); d++) for (const gg of [g - d, g + d]) if (gg >= 0 && gg < totalOf(a) && tapeAt(a, side, row, gg)) return { row, g: gg }; return null; }
const wallCell = (w, r, c) => walls[w].cells[r][c];
const wallWorld = (w, lx, ly, lz = 0) => walls[w].grp.localToWorld(new THREE.Vector3(lx, ly, lz));

// catalog: one entry per title, pointing at a real copy on a shelf or the New Releases wall
const catalog = new Map();
for (const [key, pk] of planeIndex) {
  const [a, side, row, k] = key.split(':').map(Number);
  const per = LAYOUT[a].per;
  pk.userData.tapes.forEach((tape, i) => {
    if (!tape) return;
    const j = side < 0 ? i : per - 1 - i;
    if (!catalog.has(tape.title)) catalog.set(tape.title, { tape, title: tape.title, rating: tape.rating, loc: { type: 'shelf', a, side, row, g: k * per + j }, where: GENRES[a].name });
  });
}
walls.forEach((w, wi) => w.cells.forEach((row, r) => row.forEach((cell, c) => {
  if (!catalog.has(cell.tape.title)) catalog.set(cell.tape.title, { tape: cell.tape, title: cell.tape.title, rating: cell.tape.rating, loc: { type: 'wall', wall: wi, r, c }, where: w.name });
})));
const sortKey = (t) => t.replace(/^the /i, '');
const CATALOG = [...catalog.values()].sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));

// ---------- highlight / in-hand ----------
let hl = null;
function clearHighlight() { if (hl) { hl.parent.remove(hl); hl = null; dirty = true; } }
const outline = (m) => m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xe07a63 })));
function spineMat(tape) { const c = makeCanvas(COL_W * 2, CAN_H * 2); drawSpine(c.getContext('2d'), 0, COL_W * 2, CAN_H * 2, tape); return new THREE.MeshBasicMaterial({ map: canvasTexture(c) }); }
const darkMat = new THREE.MeshBasicMaterial({ color: 0x151518 });
function showSpine(t) {
  clearHighlight();
  if (LAYOUT[t.a].face) {
    const mats = [darkMat, darkMat, darkMat, darkMat, darkMat, darkMat];
    const face = new THREE.MeshBasicMaterial({ map: coverTexture(t.tape) });
    mats[t.side < 0 ? 0 : 1] = face;
    // sharper art for the one you're looking at
    if (t.tape.poster_path && !t.tape._hi) loadImg(TMDB_IMG + 'w185' + t.tape.poster_path, 10000).then((im) => { if (!im) return; t.tape._hi = im; t.tape.img = im; coverCache.delete(t.tape.title); if (hl && hl.material && hl.material.includes && hl.material.includes(face)) { face.map = coverTexture(t.tape); face.needsUpdate = true; dirty = true; } });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, TAPE_H + 0.012, COVER_W + 0.01), mats);
    const f = aisleX(t.a) + t.side * HALF_A;
    m.position.set(f + t.side * 0.035 - t.side * 0.06, t.y + TAPE_H / 2 + 0.006, t.z); m.scale.setScalar(1.12);
    outline(m);
    const g = glow(0.26, 0.4, new THREE.Color('#c8553d'), 0.7, 0, 0, 0); scene.remove(g);
    g.position.set(t.side < 0 ? -0.02 : 0.02, 0, 0); g.rotation.set(0, t.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0); m.add(g);
    scene.add(m); hl = m; dirty = true; return;
  }
  const mats = [darkMat, darkMat, darkMat, darkMat, darkMat, darkMat];
  mats[t.side < 0 ? 0 : 1] = spineMat(t.tape);
  const m = new THREE.Mesh(new THREE.BoxGeometry(TAPE_D, TAPE_H + 0.004, TAPE_W + 0.003), mats);
  const f = aisleX(t.a) + t.side * HALF_A;
  m.position.set(f + t.side * (0.012 + TAPE_D / 2) - t.side * 0.03, t.y + TAPE_H / 2 + 0.003, t.z);
  outline(m);
  const g = glow(0.18, 0.4, new THREE.Color('#c8553d'), 0.75, 0, 0, 0); scene.remove(g);
  g.position.set(t.side < 0 ? TAPE_D / 2 + 0.003 : -TAPE_D / 2 - 0.003, 0, 0); g.rotation.set(0, t.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0); m.add(g);
  scene.add(m); hl = m; dirty = true;
}
function showWallCell(wi, r, c) {
  clearHighlight();
  const w = walls[wi], cell = wallCell(wi, r, c);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.19, 0.03), [darkMat, darkMat, darkMat, darkMat, new THREE.MeshBasicMaterial({ map: coverTexture(cell.tape) }), darkMat]);
  m.position.copy(wallWorld(wi, cell.lx, cell.ly + 0.03, 0.22)); m.rotation.set(-0.04, w.ry, 0, 'YXZ'); m.scale.setScalar(1.7);
  outline(m);
  const g = glow(0.3, 0.42, new THREE.Color('#c8553d'), 0.6, 0, 0, 0); scene.remove(g); g.position.set(0, 0, -0.02); g.renderOrder = 0; m.add(g);
  scene.add(m); hl = m; dirty = true;
}
function inHand(tape) {
  clearHighlight();
  const sm = spineMat(tape);
  const m = new THREE.Mesh(new THREE.BoxGeometry(TAPE_D, TAPE_H, TAPE_W), [sm, sm, darkMat, darkMat, new THREE.MeshBasicMaterial({ map: coverTexture(tape) }), darkMat]);
  m.position.set(0.02, -0.015, -0.34); m.rotation.set(0.06, -0.32, 0.04);
  const g = glow(0.34, 0.46, new THREE.Color('#c8553d'), 0.45, 0, 0, 0); scene.remove(g); g.position.set(0, 0, -0.03); g.renderOrder = 0; m.add(g);
  camera.add(m); hl = m; dirty = true;
}
function tapeMeta(t) {
  const bits = [`Rated ${t.rating}`];
  if (t.demo) bits.push('display copy');
  else if (t.source) bits.push(t.source.service);
  else bits.push('not on your services right now');
  return bits.join(' · ');
}
// phones browse from the card: the highlighted movie's details and Play / See more live here, no Back needed
const TOUCH = window.matchMedia('(pointer: coarse)').matches && !(window.MackeyTV && window.MackeyTV.play);
let cardTape = null;
const cardOv = card.querySelector('.ov'), cardActs = card.querySelector('.acts');
function cardFrom() { return mode === 'held' ? heldFrom : mode === 'wall' ? 'wall' : mode === 'poster' ? 'poster' : mode === 'lane' ? 'cap' : 'shelf'; }
function seeMore() { const t = cardTape; if (!t) return; if (mode !== 'held') hold(t, cardFrom()); openCover(); }
function playNow() {
  const t = cardTape; if (!t || !t.source) return;
  const back = mode;
  if (mode !== 'held') { heldFrom = cardFrom(); heldTape = t; heldWhere = card.querySelector('.k').textContent; }
  beginPlay(t, false);
  show.saved.returnTo = back === 'held' ? (heldFrom === 'cap' ? 'lane' : heldFrom) : back;
}
card.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { e.stopPropagation(); if (b.dataset.a === 'play') playNow(); else seeMore(); return; }
  if (TOUCH && cardTape) seeMore(); else if (mode === 'held') openCover();
});
function setCard(kicker, title, meta, tape) {
  card.querySelector('.k').textContent = kicker;
  card.querySelector('.t').textContent = tape && tape.year ? `${title} (${tape.year})` : title;
  card.querySelector('.m').textContent = meta;
  cardTape = tape && !tape.demo ? tape : null;
  const rich = TOUCH && !!cardTape;
  card.classList.toggle('rich', rich);
  cardOv.hidden = !rich || !cardTape.overview;
  cardActs.hidden = !rich;
  if (rich) {
    cardOv.textContent = cardTape.overview || '';
    cardActs.innerHTML = (cardTape.source ? `<button type="button" data-a="play" class="go">▶ Play</button>` : '') + `<button type="button" data-a="more">See more</button>`;
    enrichTape(cardTape);
  }
  card.hidden = false;
}

// ---------- camera targets per mode ----------
// turn the head to look straight at a point, the way a person scanning a shelf would
function aimAt(x, z, px, py, pz) {
  const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(py - 1.62, d) };
}
function shelfView(t) {
  const f = aisleX(t.a) + t.side * HALF_A;
  const x = aisleX(t.a) - t.side * 0.12;                                   // stand across the aisle a little, for room to look
  const z = Math.min(Z0 + 0.3, Math.max(Z1 + 0.3, t.z));
  return { x, z, ...aimAt(x, z, f + t.side * 0.035, t.y + TAPE_H / 2, t.z) };
}
function wallView(wi, r, c) {
  // stand back far enough to see the whole wall; drift gently toward the highlighted tape
  const w = walls[wi], cell = wallCell(wi, r, c), D = 2.1;
  const p = wallWorld(wi, cell.lx * 0.35, cell.ly, D);
  const midY = w.y0 + (w.rows * w.sy) / 2;
  const q = wallWorld(wi, cell.lx, cell.ly + 0.03, 0);
  return { x: p.x, z: p.z, ...aimAt(p.x, p.z, q.x, q.y, q.z) };
}
function setTarget(v) { target.x = v.x; target.z = v.z; target.yaw = state.yaw + angDiff(state.yaw, v.yaw); target.pitch = v.pitch; dirty = true; }

// ---------- shelf mode ----------
const EMPTY_MSG = 'Add movies at the store computer: MGR, then your PIN';
function enterShelf(side) {
  const L = LAYOUT[ai];
  const want = Math.max(0, Math.min(totalOf(ai) - 1, Math.round((SEG_START - Math.min(Z0 - 0.1, state.z - 0.4)) / L.pitch)));
  const at = nearestFilled(ai, side, cur.row, want) || nearestFilled(ai, -side, cur.row, want);
  if (!at) { setCard(aisleLabel(ai), 'Nothing on this aisle yet', EMPTY_MSG); return; }
  if (!nearestFilled(ai, side, cur.row, want)) side = -side;           // this side is past the end of the alphabet
  mode = 'shelf'; renderStops(); cur.side = side; cur.row = at.row; cur.g = at.g;
  focusShelf();
}
function focusShelf() {
  const t = tapeAt(ai, cur.side, cur.row, cur.g); if (!t) return;
  showSpine(t); setTarget(shelfView(t));
  setCard(`${aisleLabel(ai)} · SHELF ${ROWS - cur.row}`, t.tape.title, tapeMeta(t.tape), t.tape);
}
function moveShelf(dRight, dUp) {
  const g = Math.max(0, Math.min(totalOf(ai) - 1, cur.g + (cur.side < 0 ? dRight : -dRight)));
  const row = Math.max(0, Math.min(ROWS - 1, cur.row + dUp));
  if (dUp) { const h = nearestFilled1(ai, cur.side, row, g); if (!h) return; cur.row = h.row; cur.g = h.g; }
  else { if (!tapeAt(ai, cur.side, row, g)) return; cur.g = g; }
  focusShelf();
}
function leaveShelf() { mode = 'aisle'; setTimeout(renderStops, 0); clearHighlight(); card.hidden = true; setTarget({ x: aisleX(ai), z: state.z, yaw: 0, pitch: -0.06 }); }

// ---------- wall mode (face-out displays) ----------
function enterWall(wi) {
  if (!walls[wi].cells[0] || !walls[wi].cells[0].length) { setCard(walls[wi].name, 'Nothing here yet', EMPTY_MSG); return; }
  mode = 'wall'; renderStops(); wcur.wall = wi; focusWall(); }
function focusWall() {
  const w = walls[wcur.wall], cell = wallCell(wcur.wall, wcur.r, wcur.c);
  showWallCell(wcur.wall, wcur.r, wcur.c); setTarget(wallView(wcur.wall, wcur.r, wcur.c));
  setCard(w.name, cell.tape.title, tapeMeta(cell.tape), cell.tape);
}
function moveWall(dRight, dUp) {
  const w = walls[wcur.wall];
  wcur.c = Math.max(0, Math.min(w.cols - 1, wcur.c + dRight));
  wcur.r = Math.max(0, Math.min(w.rows - 1, wcur.r + dUp));
  focusWall();
}
function leaveWall() { mode = 'lane'; setTimeout(renderStops, 0); clearHighlight(); card.hidden = true; const s = STOPS[stopIdx]; setTarget({ x: s.x, z: s.z, yaw: s.yaw, pitch: -0.06 }); }

// ---------- poster mode (end of each aisle) ----------
const pcur = { ai: 0, k: 0 };
const posterOf = (a, k) => POSTERS.find((p) => p.ai === a && p.k === k);
function posterView(p) { const D = 1.9; return { x: aisleX(p.ai) * 0.6 + p.x * 0.4, z: p.z + D, yaw: 0, pitch: Math.atan2(p.y - 1.62, D) }; }
function showPoster(p) {
  clearHighlight();
  const g = new THREE.Group(), bar = new THREE.MeshBasicMaterial({ color: 0xe07a63 });
  const W = p.w + 0.18, H = p.h + 0.18, T = 0.025;
  [[0, H / 2, W + T, T], [0, -H / 2, W + T, T], [W / 2, 0, T, H + T], [-W / 2, 0, T, H + T]].forEach(([x, y, w, h]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bar); m.position.set(x, y, 0.02); g.add(m);
  });
  const gl = glow(p.w * 2.0, p.h * 1.5, new THREE.Color('#c8553d'), 0.5, 0, 0, 0); scene.remove(gl); gl.position.z = -0.058; g.add(gl);
  g.position.set(p.x, p.y, p.z); scene.add(g); hl = g; dirty = true;
}
function enterPoster(a, k) {
  if (!posterOf(a, k)) return;
  mode = 'poster'; pcur.ai = a; pcur.k = k; renderStops();
  const p = posterOf(a, k); showPoster(p); setTarget(posterView(p));
  setCard(`${aisleLabel(a)} \u00b7 ON THE WALL`, p.tape.title, tapeMeta(p.tape), p.tape);
}
function capView(p) { const D = 1.9; return { x: p.x + 0.1, z: p.z + D, yaw: 0.05, pitch: Math.atan2(p.y - 1.62, D) }; }
function focusCap(gi) {
  const p = CAPS[gi]; showPoster(p); setTarget(capView(p));
  setCard('ENDCAP \u00b7 NEW ON VIDEO', p.tape.title, tapeMeta(p.tape), p.tape);
}
function refocus() {
  if (mode === 'shelf') focusShelf(); else if (mode === 'wall') focusWall(); else if (mode === 'poster') enterPoster(pcur.ai, pcur.k);
  else if (mode === 'lane' && STOPS[stopIdx] && STOPS[stopIdx].kind === 'cap') focusCap(STOPS[stopIdx].gi);
  else { mode = 'lane'; card.hidden = true; renderStops(); }
}
function leavePoster() { mode = 'aisle'; clearHighlight(); card.hidden = true; setTarget({ x: aisleX(ai), z: Z1 + 0.45, yaw: 0, pitch: -0.06 }); renderStops(); }

// ---------- holding a tape ----------
let heldFrom = 'shelf', heldTape = null, heldWhere = '';
function hold(tape, from) {
  heldFrom = from; heldTape = tape; heldWhere = from === 'shelf' ? `${aisleLabel(ai)} \u00b7 SHELF ${ROWS - cur.row}` : from === 'poster' ? `${aisleLabel(pcur.ai)} \u00b7 ON THE WALL` : from === 'cap' ? 'ENDCAP \u00b7 NEW ON VIDEO' : 'NEW RELEASES';
  mode = 'held'; renderStops(); enrichTape(tape);
  openCover();
}
function putBack() { if (heldFrom === 'shelf') { mode = 'shelf'; focusShelf(); } else if (heldFrom === 'poster') enterPoster(pcur.ai, pcur.k); else if (heldFrom === 'cap') { mode = 'lane'; focusCap(STOPS[stopIdx].gi); renderStops(); } else { mode = 'wall'; focusWall(); } }

// ---------- back cover ----------
const coverEl = document.getElementById('cover');
let coverBtn = 0, coverActs = [];
function renderCoverBtns() { coverEl.querySelectorAll('.cb').forEach((b, i) => b.classList.toggle('on', i === coverBtn)); }
function flagNote(t) {
  const cf = t.content_flags;
  if (!cf) return t.enriched_at ? 'Not checked' : 'Checking…';
  if (!cf.found) return 'Not in the database';
  return cf.flags.length ? `${cf.flags.length} noted` : 'None reported';
}
// details (trailer, play link, content notes) are filled in the first time a movie is picked up
function enrichTape(t) {
  if (t.demo || t.enriched_at || t._enriching || !t.tmdb_id) return;
  t._enriching = true;
  fetch(ADMIN_FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'enrich', tmdb_id: t.tmdb_id }) })
    .then((r) => r.json()).then((j) => {
      const row = j && j.title; if (!row) return;
      Object.assign(t, row, { origin: row.source, rating: row.certification || t.rating });
      t.source = pickSource(t);
      if (row.status !== 'approved') t.pulled = true;
      if (mode === 'cover' && heldTape === t) openCover();
      else if (cardTape === t && !card.hidden) setCard(card.querySelector('.k').textContent, t.title, tapeMeta(t), t);
    }).catch(() => {}).finally(() => { t._enriching = false; if (mode === 'cover' && heldTape === t) coverEl.querySelector('.cnote').textContent = !t.source ? 'Not streaming on your services right now.' : ''; });
}
function openCover() {
  const t = heldTape; if (!t) return;
  enrichTape(t);
  const img = coverEl.querySelector('img');
  if (t.poster_path) img.src = TMDB_IMG + 'w342' + t.poster_path;
  else { const c = makeCanvas(320, 576); drawCover(c.getContext('2d'), 320, 576, t); img.src = c.toDataURL(); }
  coverEl.querySelector('.cwhere').textContent = heldWhere;
  coverEl.querySelector('.ctitle').textContent = t.title + (t.year ? ` (${t.year})` : '');
  coverEl.querySelector('.sum').textContent = t.demo ? 'Display copy. Real movies go on the shelves from the store computer.' : (t.overview || '').slice(0, 260) + ((t.overview || '').length > 260 ? '…' : '');
  coverEl.querySelector('.report').innerHTML = [
    ['Rated', t.rating],
    ['Plays on', t.demo ? '—' : t.source ? t.source.service : 'Not on yours'],
    ['Content', t.demo ? '—' : flagNote(t)]
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  coverActs = [];
  if (t.demo) coverActs.push({ label: '▶ Test the projector', go: () => playIt() });
  else if (t.pulled) { /* re-rated: no play */ }
  else if (t.source) coverActs.push({ label: `▶ Play on ${t.source.service}`, go: () => playIt() });
  if (t.trailer_youtube) coverActs.push({ label: 'Trailer', go: () => playTrailer(t) });
  coverActs.push({ label: 'Back to the shelf', go: () => closeCover() });
  coverEl.querySelector('.btns').innerHTML = coverActs.map((a, i) => `<button type="button" class="cb" data-i="${i}">${a.label}</button>`).join('');
  coverEl.querySelector('.cnote').textContent = t.pulled ? 'Taken off the shelf: its rating changed.' : !t.demo && !t.source ? 'Not streaming on your services right now.' : t._enriching ? 'Checking details…' : '';
  coverBtn = 0; renderCoverBtns();
  card.hidden = true;
  mode = 'cover'; coverEl.hidden = false; requestAnimationFrame(() => coverEl.classList.add('show'));
}
function closeCover() { coverEl.classList.remove('show'); coverEl.hidden = true; mode = 'held'; putBack(); }
function playIt() { if (!heldTape) return; beginPlay(heldTape, false); show.saved.returnTo = heldFrom === 'cap' ? 'lane' : heldFrom; }
coverEl.addEventListener('click', (e) => { const b = e.target.closest('.cb'); if (!b) { if (e.target === coverEl) closeCover(); return; } coverBtn = +b.dataset.i; renderCoverBtns(); coverActs[coverBtn].go(); });

// ---------- handing off to the streaming app ----------
// On the TV, the MackeyTV launcher app provides window.MackeyTV; in a browser we just open the link.
const onTV = () => !!(window.MackeyTV && window.MackeyTV.play);
function launchTitle(t) {
  const src = t.source; if (!src) return false;
  if (onTV()) { try { return !!window.MackeyTV.play(src.search ? '' : (src.url || ''), src.service, t.title); } catch (e) { return false; } }
  return !!(show && show.prelaunched);
}
function beginPlay(tape, fromMenu) {
  let pre = false;
  if (!tape.demo && !onTV() && tape.source && tape.source.url) { try { pre = !!window.open(tape.source.url, '_blank'); } catch (e) { pre = false; } }
  testVideo = tape.demo ? reelVideo() : null;
  startShow(tape, fromMenu);
  show.prelaunched = pre;
}
function playTrailer(t) {
  if (!t.trailer_youtube) return;
  const back = mode === 'cover' ? (heldFrom === 'cap' ? 'lane' : heldFrom) : mode;
  startShow(t, false, { trailer: true });
  show.saved.returnTo = back;
}
// coming back from the streaming app
function resumeFromApp() { if (show && show.stage === 'away') endShow(); }
window.mtvResume = resumeFromApp;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(resumeFromApp, 300); });


// ---------- the screening room show (Play) ----------
const fadeEl = document.getElementById('fade'), endEl = document.getElementById('endcard');
const sctx = screenCanvas2.getContext('2d');
let show = null;
function screenOff() { sctx.fillStyle = '#121214'; sctx.fillRect(0, 0, 1024, 430); screenTex.needsUpdate = true; }
function screenLeader(n, frac) {
  const W = 1024, H = 430, cx = W / 2, cy = H / 2;
  sctx.fillStyle = '#8c8c86'; sctx.fillRect(0, 0, W, H);
  sctx.fillStyle = '#b4b4ac'; sctx.beginPath(); sctx.moveTo(cx, cy); sctx.arc(cx, cy, 420, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); sctx.closePath(); sctx.fill();
  sctx.strokeStyle = '#f2f2ec'; sctx.lineWidth = 6;
  [150, 120].forEach((r) => { sctx.beginPath(); sctx.arc(cx, cy, r, 0, Math.PI * 2); sctx.stroke(); });
  sctx.lineWidth = 3; sctx.beginPath(); sctx.moveTo(0, cy); sctx.lineTo(W, cy); sctx.moveTo(cx, 0); sctx.lineTo(cx, H); sctx.stroke();
  sctx.fillStyle = '#111'; sctx.font = 'bold 190px "Helvetica Neue", Arial, sans-serif'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle'; sctx.fillText(String(n), cx, cy + 8);
  for (let i = 0; i < 40; i++) { sctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`; sctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 6); }
  screenTex.needsUpdate = true;
}
function screenTitle(t) {
  const W = 1024, H = 430, st = t.style;
  const g = sctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, st.bg); g.addColorStop(1, '#050506');
  sctx.fillStyle = g; sctx.fillRect(0, 0, W, H);
  const sun = sctx.createRadialGradient(W * 0.7, H * 0.4, 4, W * 0.7, H * 0.4, H * 0.6);
  sun.addColorStop(0, 'rgba(255,236,200,0.7)'); sun.addColorStop(1, 'rgba(255,236,200,0)'); sctx.fillStyle = sun; sctx.fillRect(0, 0, W, H);
  sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
  sctx.fillStyle = 'rgba(255,255,255,0.8)'; sctx.font = 'bold 22px "Helvetica Neue", Arial, sans-serif'; sctx.fillText('NOW SHOWING', W / 2, H * 0.24);
  sctx.fillStyle = '#fbf6ea'; fitFont(sctx, 'bold {s}px Georgia, serif', t.title.toUpperCase(), W * 0.86, 92); sctx.fillText(t.title.toUpperCase(), W / 2, H * 0.52);
  sctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 2; i++) { const lw = W * (0.4 - i * 0.1); sctx.fillRect((W - lw) / 2, H * (0.74 + i * 0.05), lw, 4); }
  screenTex.needsUpdate = true;
}
// built-in test reel: color bars, then a little animated sunrise with a running timecode
let testVideo = null;
// the real test reel (a video file shipped next to the page): bars and tone, then a short title piece
function reelVideo() {
  const v = document.createElement('video');
  v.src = 'test-reel.mp4'; v.playsInline = true; v.preload = 'auto'; v.loop = false;
  v.addEventListener('ended', () => { if (show && show.stage === 'reel') finishShow(); });
  // unlock sound while the button press is still "fresh"
  const pp = v.play(); if (pp) pp.then(() => { v.pause(); v.currentTime = 0; }).catch(() => {});
  return v;
}
function drawReel(rt) {
  const W = 1024, H = 430, x = sctx;
  if (testVideo && testVideo.readyState >= 2) {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const vw = testVideo.videoWidth || 16, vh = testVideo.videoHeight || 9, s = Math.min(W / vw, H / vh);
    x.drawImage(testVideo, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
  } else if (rt < 3) {
    const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    bars.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * W / 7, 0, W / 7 + 1, H * 0.7); });
    ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i * W / 7, H * 0.7, W / 7 + 1, H * 0.08); });
    x.fillStyle = '#0b0b0b'; x.fillRect(0, H * 0.78, W, H * 0.22);
    x.fillStyle = '#f2f2ec'; x.font = 'bold 34px "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('MACKEYTV · PROJECTOR TEST REEL', W / 2, H * 0.89);
  } else {
    const k = rt - 3, day = Math.min(1, k / 14);
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgb(${Math.round(30 + 90 * day)},${Math.round(40 + 120 * day)},${Math.round(80 + 140 * day)})`);
    sky.addColorStop(1, `rgb(${Math.round(240 - 20 * day)},${Math.round(150 + 60 * day)},${Math.round(90 + 110 * day)})`);
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    const sy = H * (0.95 - 0.6 * day);
    const sun = x.createRadialGradient(W * 0.68, sy, 6, W * 0.68, sy, 120);
    sun.addColorStop(0, 'rgba(255,246,214,1)'); sun.addColorStop(0.25, 'rgba(255,226,160,0.9)'); sun.addColorStop(1, 'rgba(255,210,140,0)');
    x.fillStyle = sun; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 260 + k * (18 + i * 6)) % (W + 300)) - 150, cy = 50 + i * 34;
      x.fillStyle = 'rgba(255,255,255,0.6)';
      [[0, 0, 46], [40, 8, 36], [-38, 10, 30], [10, 18, 40]].forEach(([dx, dy, r]) => { x.beginPath(); x.ellipse(cx + dx, cy + dy, r, r * 0.55, 0, 0, Math.PI * 2); x.fill(); });
    }
    [['#3d5a3a', 0.72, 1.3, 0], ['#2c4430', 0.8, 2.1, 1.7], ['#1d2e22', 0.88, 3.0, 0.6]].forEach(([col, base, f, ph]) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
      for (let px = 0; px <= W; px += 16) x.lineTo(px, H * base - Math.sin(px / W * Math.PI * f + ph) * 26);
      x.lineTo(W, H); x.closePath(); x.fill();
    });
    x.strokeStyle = '#1a1a1a'; x.lineWidth = 3;
    for (let b = 0; b < 4; b++) {
      const bx = ((k * 60 + b * 46) % (W + 200)) - 100, by = 120 + b * 14 + Math.sin(k * 3 + b) * 6, flap = Math.sin(k * 10 + b) * 6;
      x.beginPath(); x.moveTo(bx - 12, by - flap); x.quadraticCurveTo(bx - 5, by - 6, bx, by); x.quadraticCurveTo(bx + 5, by - 6, bx + 12, by - flap); x.stroke();
    }
    if (k < 5) { x.globalAlpha = Math.max(0, Math.min(1, k, 5 - k)); x.fillStyle = '#fbf6ea'; x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Test Reel', W / 2, H * 0.3); x.globalAlpha = 1; }
  }
  // film grain, scratches and a running timecode
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.22})`; x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  if (Math.random() < 0.3) { x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(Math.random() * W, 0, 1, H); }
  const fr = Math.floor(rt * 24), tc = (n) => String(n).padStart(2, '0');
  x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(W - 170, H - 40, 156, 28);
  x.fillStyle = '#f2f2ec'; x.font = '18px "Courier New", monospace'; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText(`${tc(Math.floor(fr / 1440) % 60)}:${tc(Math.floor(fr / 24) % 60)}:${tc(fr % 24)}`, W - 160, H - 26);
  screenTex.needsUpdate = true;
}
const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'video/*'; fileIn.style.display = 'none'; document.body.appendChild(fileIn);
let pendingMode = 'lane';
fileIn.addEventListener('change', () => {
  const f = fileIn.files && fileIn.files[0]; if (!f) return;
  if (testVideo) { testVideo.pause(); URL.revokeObjectURL(testVideo.src); }
  testVideo = document.createElement('video'); testVideo.src = URL.createObjectURL(f); testVideo.loop = true; testVideo.playsInline = true;
  mode = pendingMode; startShow(makeTape(f.name.replace(/\.[^.]+$/, '')), true);
});
// the screening room: walk in, take a seat, the projector rolls a countdown, then the trailer plays on the
// big screen (YouTube allows that) or the movie's own app takes over (streaming services only play in their apps)
const SEAT = { x: -0.75, z: TH.z1 + 3.4 + 3 * 1.15 + 0.12, rise: 0.6 };
const T_SEAT = 3.4, T_COUNT = 3.9, T_TITLE = 6.9, T_ROLL = 8.3;
function startShow(tape, fromMenu, opts) {
  if (!coverEl.hidden) { coverEl.classList.remove('show'); coverEl.hidden = true; }
  mode = 'show';
  show = { t: 0, tape, trailer: !!(opts && opts.trailer), saved: { x: state.x, z: state.z, yaw: state.yaw, pitch: state.pitch, fromMenu: !!fromMenu }, stage: '', ended: false };
  card.hidden = true; if (hl) hl.visible = false;
  fadeEl.classList.add('on');
  setTimeout(() => { screenOff(); BEAM.material.opacity = 0; placeInTheater(0); dirty = true; fadeEl.classList.remove('on'); }, 350);
}
// camera position for any moment of the walk-in, so skipping ahead just works
function placeInTheater(t) {
  const start = { x: 0, z: TH.z0 - 2.9, y: 1.62 }, aisleEnd = { x: 0, z: SEAT.z, y: SEAT.rise + 1.62 }, seated = { x: SEAT.x, z: SEAT.z, y: SEAT.rise + 1.12 };
  let x, z, y, bob = 0;
  if (t < 2.4) { const e = ease(Math.min(1, t / 2.4)); x = 0; z = start.z + (aisleEnd.z - start.z) * e; y = start.y + (aisleEnd.y - start.y) * e; bob = Math.sin(t * 9) * 0.025 * (1 - e); }
  else if (t < T_SEAT) { const e = ease((t - 2.4) / (T_SEAT - 2.4)); x = aisleEnd.x + (seated.x - aisleEnd.x) * e; z = SEAT.z; y = aisleEnd.y + (seated.y - aisleEnd.y) * Math.max(0, (e - 0.35) / 0.65); }
  else { x = seated.x; z = seated.z; y = seated.y; }
  state.x = x; state.z = z; show.camY = y + bob;
  state.yaw = t > 2.4 && t < T_SEAT ? Math.sin(((t - 2.4) / (T_SEAT - 2.4)) * Math.PI) * 0.35 : 0;   // a glance down the row while sitting
  state.pitch = Math.atan2(SCREEN.y - show.camY, z - SCREEN.z) * (t < 2.4 ? 0.5 : 1);
  Object.assign(target, { x: state.x, z: state.z, yaw: state.yaw, pitch: state.pitch });
}
function stepShow(dt) {
  show.t += dt;
  const t = show.t - 0.35;
  if (t < 0 || show.ended) return;
  if (show.stage !== 'trailer' && show.stage !== 'away') placeInTheater(t);
  const spin = t < T_SEAT ? 0 : Math.min(1, (t - T_SEAT) / 0.6);
  REELS.forEach((r, i) => { r.rotation.x -= dt * 7 * spin * (i ? 0.8 : 1); });
  if (t >= T_SEAT && t < T_SEAT + 0.5) BEAM.material.opacity = 0.03 * ((t - T_SEAT) / 0.5) * (0.7 + Math.random() * 0.3);
  else if (t >= T_SEAT + 0.5) BEAM.material.opacity = (show.stage === 'trailer' ? 0.018 : 0.03) + Math.random() * 0.008;   // seen from a seat, the beam is a soft haze overhead
  if (t >= T_COUNT && t < T_TITLE) { const k = t - T_COUNT; screenLeader(3 - Math.floor(k), k % 1); show.stage = 'leader'; }
  else if (t >= T_TITLE && t < T_ROLL) { if (show.stage !== 'title') { screenTitle(show.tape); show.stage = 'title'; } }
  else if (t >= T_ROLL && show.trailer) {
    if (show.stage !== 'trailer') { show.stage = 'trailer'; openTrailer(show.tape); }
    placeTrailer();
  }
  else if (t >= T_ROLL && !show.tape.demo) {
    if (show.stage !== 'away' && show.stage !== 'failed') {
      if (launchTitle(show.tape)) { show.stage = 'away'; show.awayAt = performance.now(); }
      else { show.stage = 'failed'; finishShow(`Couldn't open ${show.tape.source ? show.tape.source.service : 'the app'}. Check that it's installed and signed in.`); }
    }
  }
  else if (t >= T_ROLL) {
    if (show.stage !== 'reel') { show.stage = 'reel'; if (testVideo) { testVideo.currentTime = 0; testVideo.play().catch(() => {}); } }
    drawReel(t - T_ROLL);
  }
}
// ---- trailers on the big screen: a YouTube player laid exactly over the theater screen ----
const ytEl = document.getElementById('yt');
let ytFrame = null, ytPaused = false;
function openTrailer(t) {
  screenOff(); sctx.fillStyle = '#000'; sctx.fillRect(0, 0, 1024, 430); screenTex.needsUpdate = true;
  const origin = encodeURIComponent(location.origin && location.origin !== 'null' ? location.origin : 'https://mackeytv.vercel.app');
  ytEl.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.trailer_youtube)}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&enablejsapi=1&origin=${origin}" allow="autoplay; encrypted-media" frameborder="0" title="Trailer"></iframe>`;
  ytFrame = ytEl.querySelector('iframe'); ytPaused = false;
  ytFrame.addEventListener('load', () => ytSend('addEventListener', ['onStateChange']));
  ytEl.hidden = false; placeTrailer();
}
function placeTrailer() {
  if (!ytFrame) return;
  const pts = [[-1, 1], [1, -1]].map(([sx, sy]) => new THREE.Vector3(sx * SCREEN.w / 2, SCREEN.y + sy * SCREEN.h / 2, SCREEN.z).project(camera));
  const W = window.innerWidth, H = window.innerHeight;
  const l = (pts[0].x + 1) / 2 * W, tp = (1 - pts[0].y) / 2 * H, r = (pts[1].x + 1) / 2 * W, b = (1 - pts[1].y) / 2 * H;
  Object.assign(ytEl.style, { left: l + 'px', top: tp + 'px', width: (r - l) + 'px', height: (b - tp) + 'px' });
}
function ytSend(func, args) { try { ytFrame && ytFrame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*'); } catch (e) { /* not ready */ } }
function closeTrailer() { if (!ytFrame) return; ytEl.innerHTML = ''; ytEl.hidden = true; ytFrame = null; }
addEventListener('message', (e) => {
  if (!ytFrame || !/youtube/.test(e.origin)) return;
  let d = e.data; try { if (typeof d === 'string') d = JSON.parse(d); } catch (err) { return; }
  if (d && (d.event === 'onStateChange' || (d.event === 'infoDelivery' && d.info && d.info.playerState !== undefined))) {
    const st = d.event === 'onStateChange' ? d.info : d.info.playerState;
    if (st === 0 && show && show.stage === 'trailer') endShow();           // trailer finished: back to the store
  }
});
function toggleTrailer() { ytPaused = !ytPaused; ytSend(ytPaused ? 'pauseVideo' : 'playVideo'); }
function finishShow(msg) {
  if (show.ended) return;
  show.ended = true; if (testVideo) testVideo.pause();
  endEl.querySelector('.et').textContent = show.tape.title;
  endEl.querySelector('.ek').textContent = msg ? 'SORRY' : 'THAT WAS THE TEST REEL';
  endEl.querySelector('.es').textContent = msg || 'Display copies play the test reel. Real movies open in their app.';
  fadeEl.classList.add('on'); endEl.hidden = false; requestAnimationFrame(() => endEl.classList.add('show'));
}
function endShow() {
  if (!show) return;
  const sv = show.saved; show = null; if (testVideo) testVideo.pause(); closeTrailer();
  fadeEl.classList.add('on'); endEl.classList.remove('show'); endEl.hidden = true;
  setTimeout(() => {
    BEAM.material.opacity = 0; screenOff();
    camera.fov = baseFov(); camera.updateProjectionMatrix();
    Object.assign(state, sv); Object.assign(target, sv);
    if (sv.returnTo && sv.returnTo !== 'held') { mode = sv.returnTo; if (hl) hl.visible = true; refocus(); }
    else if (sv.fromMenu || !hl) { mode = 'lane'; card.hidden = true; renderStops(); } else { mode = 'held'; hl.visible = true; setCard('YOU PICKED UP', heldTape.title, tapeMeta(heldTape), heldTape); }
    dirty = true; fadeEl.classList.remove('on');
  }, 300);
}
screenOff();

// ---------- Now Playing: five picks every night, shown on the theater marquee ----------
const marqEl = document.getElementById('marquee');
function tonightKey() { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function tonightPicks() {
  let h = 2166136261; for (const ch of tonightKey()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296; };
  const real = CATALOG.filter((c) => !c.tape.demo && c.tape.source);
  const pool = (real.length ? real : CATALOG).slice(), picks = [];
  while (picks.length < 5 && pool.length) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const times = ['5:00', '6:30', '7:15', '8:00', '9:30'];
  return picks.map((it, i) => ({ ...it, time: times[i] }));
}
let marq = null;
function renderMarquee() {
  const night = new Date(tonightKey() + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  marqEl.querySelector('.mnight').textContent = `TONIGHT · ${night.toUpperCase()}`;
  marqEl.querySelector('.mlist').innerHTML = marq.picks.map((p, i) => `<button type="button" class="mrow${i === marq.sel ? ' on' : ''}" data-i="${i}"><span class="mtime">${p.time}</span><span class="mtitle">${p.title.toUpperCase()}</span><span class="mrate">${p.rating}</span></button>`).join('');
}
function openMarquee() {
  closeMenu(true);
  marq = { picks: tonightPicks(), sel: 0, saved: { x: state.x, z: state.z, yaw: state.yaw, pitch: state.pitch } };
  mode = 'marquee'; clearHighlight(); card.hidden = true; renderStops();
  fadeEl.classList.add('on');
  setTimeout(() => {
    screenOff(); BEAM.material.opacity = 0;
    Object.assign(state, { x: BOOTH.x, z: BOOTH.z, yaw: 0, pitch: Math.atan2(SCREEN.y - BOOTH.y, BOOTH.z - SCREEN.z) - 0.04 });
    Object.assign(target, { x: state.x, z: state.z, yaw: state.yaw, pitch: state.pitch });
    show = null; dirty = true; renderMarquee();
    marqEl.hidden = false; requestAnimationFrame(() => marqEl.classList.add('show'));
    fadeEl.classList.remove('on');
  }, 350);
}
function closeMarquee(toStore) {
  marqEl.classList.remove('show'); marqEl.hidden = true;
  if (!toStore) return;
  const sv = marq.saved;
  fadeEl.classList.add('on');
  setTimeout(() => { Object.assign(state, sv); Object.assign(target, sv); mode = 'lane'; renderStops(); dirty = true; fadeEl.classList.remove('on'); }, 300);
}
function playFromMarquee(i) {
  const p = marq.picks[i]; if (!p) return;
  const sv = marq.saved;
  closeMarquee(false);
  beginPlay(p.tape, true);
  show.saved = { ...sv, fromMenu: true };
}
marqEl.addEventListener('click', (e) => { const b = e.target.closest('.mrow'); if (!b) return; marq.sel = +b.dataset.i; playFromMarquee(marq.sel); });

// ---------- walking on rails ----------
let travel = null;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function prepSeg() {
  const p = travel.pts[travel.i], f = travel.from;
  const d = Math.hypot(p.x - f.x, p.z - f.z);
  if (p.dur === undefined) p.dur = Math.max(0.35, d / 3.0);
  const face = p.yaw !== undefined ? p.yaw : (d > 0.05 ? Math.atan2(-(p.x - f.x), -(p.z - f.z)) : f.yaw);
  p._yaw = f.yaw + angDiff(f.yaw, face);
  if (p.pitch === undefined) p.pitch = -0.06;
  travel.t = 0;
}
function travelTo(pts, done) {
  const keepBar = mode === 'lane';
  mode = 'travel'; clearHighlight(); card.hidden = true;
  if (!keepBar) stopsEl.classList.remove('show');
  travel = { pts, i: 0, t: 0, from: { x: state.x, z: state.z, yaw: state.yaw, pitch: state.pitch }, done };
  prepSeg(); dirty = true;
}
function stepTravel(dt) {
  const p = travel.pts[travel.i], f = travel.from;
  travel.t = Math.min(1, travel.t + dt / p.dur);
  const e = ease(travel.t);
  state.x = f.x + (p.x - f.x) * e; state.z = f.z + (p.z - f.z) * e;
  state.yaw = f.yaw + (p._yaw - f.yaw) * Math.min(1, e * 1.7);
  state.pitch = f.pitch + (p.pitch - f.pitch) * e;
  state.moving = Math.hypot(p.x - f.x, p.z - f.z) > 0.05 ? 1 : 0;
  if (travel.t >= 1) {
    travel.from = { x: p.x, z: p.z, yaw: p._yaw, pitch: p.pitch };
    travel.i++;
    if (travel.i < travel.pts.length) prepSeg();
    else { Object.assign(target, { x: state.x, z: state.z, yaw: state.yaw, pitch: state.pitch }); state.moving = 0; const d = travel.done; travel = null; if (d) d(); }
  }
}
// path from wherever you are back onto the front lane
function toLane() {
  const pts = [];
  if (state.z < LANE_Z - 0.15) { const ax = (mode === 'shelf' || mode === 'aisle' || mode === 'held') ? aisleX(ai) : state.x; pts.push({ x: ax, z: state.z + 0.01 }, { x: ax, z: LANE_Z }); }
  else if (state.z > LANE_Z + 0.15) pts.push({ x: state.x, z: LANE_Z });
  return pts;
}
function goStop(idx, then) {
  const s = STOPS[idx];
  const pts = toLane();
  pts.push({ x: s.x, z: LANE_Z, yaw: Math.abs(s.x - state.x) > 0.2 ? undefined : s.yaw });
  pts.push({ x: s.x, z: s.z, yaw: s.yaw, pitch: -0.06, dur: 0.45 });
  travelTo(pts, () => { stopIdx = idx; if (s.kind === 'cap') { mode = 'lane'; focusCap(s.gi); renderStops(); if (then) then(); return; } mode = 'lane'; setTarget({ x: s.x, z: s.z, yaw: s.yaw, pitch: -0.06 }); renderStops(); if (then) then(); });
}
function stepLane(dir) {
  // never blocks: every press moves the target one stop, the camera glides after it
  const ni = Math.max(0, Math.min(STOPS.length - 1, stopIdx + dir));
  if (ni === stopIdx) return;
  stopIdx = ni;
  const s = STOPS[ni];
  if (s.kind === 'nr') { enterWall(0); return; }
  if (s.kind === 'counter') { mode = 'lane'; goSearch(); return; }
  mode = 'lane'; clearHighlight(); card.hidden = true;
  if (s.kind === 'cap') { focusCap(s.gi); renderStops(); return; }
  setTarget({ x: s.x, z: LANE_Z, yaw: 0, pitch: -0.06 }); renderStops();
}
function renderStopsFor(i) { stopsEl.querySelectorAll('.st').forEach((b) => b.classList.toggle('on', +b.dataset.i === i)); }
function arrive() {
  const s = STOPS[stopIdx];
  if (s.kind === 'nr') enterWall(0);
  else if (s.kind === 'counter') goSearch();
  else renderStops();
}
function laneSelect() {
  const s = STOPS[stopIdx];
  if (s.kind === 'cap') { hold(CAPS[s.gi].tape, 'cap'); return; }
  if (s.kind === 'aisle') { ai = s.ai; mode = 'aisle'; renderStops(); }
  else if (s.kind === 'nr') enterWall(0);
  else if (s.kind === 'counter') goSearch();
}
function goSearch() {
  closeMenu(true);
  const idx = STOPS.length - 1;
  const zoom = () => travelTo([{ x: PC.x, z: PC.z - 0.62, yaw: Math.PI, pitch: -0.52, dur: 0.5 }], openTerm);
  if (stopIdx === idx && mode === 'lane') zoom(); else goStop(idx, zoom);
}
function fetchItem(item) {
  const fromTerm = mode === 'term';
  closeTerm(true);
  const L = item.loc;
  const back = fromTerm ? [{ x: PC.x, z: LANE_Z, yaw: 0 }] : toLane();
  if (L.type === 'shelf') {
    const t = tapeAt(L.a, L.side, L.row, L.g), v = shelfView(t);
    travelTo([...back, { x: aisleX(L.a), z: LANE_Z }, { x: aisleX(L.a), z: v.z, yaw: 0 }, { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch, dur: 0.5 }], () => {
      ai = L.a; stopIdx = aisleStop(L.a); cur.side = L.side; cur.row = L.row; cur.g = L.g;
      mode = 'shelf'; focusShelf();
      if (!TOUCH) setTimeout(() => { if (mode === 'shelf') { hold(t.tape, 'shelf'); } }, 450);
    });
  } else {
    const v = wallView(L.wall, L.r, L.c);
    travelTo([...back, { x: v.x, z: LANE_Z }, { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch, dur: 0.5 }], () => {
      stopIdx = 0; wcur.wall = L.wall; wcur.r = L.r; wcur.c = L.c; mode = 'wall'; focusWall();
      if (!TOUCH) setTimeout(() => { if (mode === 'wall') { hold(wallCell(L.wall, L.r, L.c).tape, 'wall'); } }, 450);
    });
  }
}

// ---------- menu ----------
const menuEl = document.getElementById('menu');
const MENU = [
  { label: 'Search', sub: 'Walk to the store computer', go: () => goSearch() },
  { label: "What's Playing", sub: 'Tonight in the screening room', go: () => openMarquee() },
  { label: 'New Releases', sub: 'The wall up front', go: () => { closeMenu(true); stopIdx = 0; enterWall(0); } },
  ...GENRES.map((g, i) => ({ label: g.name.charAt(0) + g.name.slice(1).toLowerCase().replace('&', '&amp;'), sub: 'Walk to the aisle', go: () => { closeMenu(true); goStop(aisleStop(i), () => { ai = i; }); } }))
];
let menuIdx = 0, menuReturn = 'lane';
function renderMenu() { menuEl.querySelector('.items').innerHTML = MENU.map((m, i) => `<button type="button" class="mi${i === menuIdx ? ' on' : ''}" data-i="${i}"><span>${m.label}</span><small>${m.sub}</small></button>`).join(''); }
function openMenu() { menuReturn = mode; mode = 'menu'; renderStops(); menuIdx = 0; renderMenu(); menuEl.hidden = false; requestAnimationFrame(() => menuEl.classList.add('show')); }
function closeMenu(silent) { if (menuEl.hidden) return; menuEl.classList.remove('show'); menuEl.hidden = true; if (!silent) { mode = menuReturn; renderStops(); } }
menuEl.addEventListener('click', (e) => { const b = e.target.closest('.mi'); if (b) { menuIdx = +b.dataset.i; MENU[menuIdx].go(); } else if (e.target === menuEl) closeMenu(); });

// ---------- store computer ----------
// Regular search looks through what's in the store. MGR + the family PIN switches to manager mode,
// which searches every movie and lets you put one on the shelf (or say no) right there.
const termEl = document.getElementById('term');
const qEl = document.getElementById('tq'), qLabel = document.getElementById('tql'), resEl = document.getElementById('tres'), countEl = document.getElementById('tcount'), kbdEl = document.getElementById('kbd'), colsEl = document.getElementById('tcols'), hdrEl = document.getElementById('thdr');
const KROWS = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'DEL'], ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '’', '-'], ['SPACE', 'CLEAR', 'GO', 'MGR', 'EXIT']];
const tstate = { q: '', zone: 'kbd', kr: 1, kc: 0, sel: 0, top: 0, matches: CATALOG, mgr: null };
const VISIBLE = 9;
const AISLES = GENRES.map((g) => g.name);
kbdEl.innerHTML = KROWS.map((row, r) => `<div class="krow">${row.map((k, c) => `<button type="button" class="key${k.length > 1 ? ' wide' : ''}${k === 'SPACE' ? ' space' : ''}" data-r="${r}" data-c="${c}">${k}</button>`).join('')}</div>`).join('');
const escT = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STARTER_ROW = { starter: true, title: `Stock starter shelves (${STARTER.length} titles)`, certification: '', status: '' };
const curList = () => {
  const M = tstate.mgr;
  if (!M || M.stage !== 'search') return tstate.matches;
  return M.results.length || tstate.q ? M.results : [STARTER_ROW];
};
async function mgrApi(action, body = {}) {
  const r = await fetch(ADMIN_FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mtv-pin': tstate.mgr.pin }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({ error: 'NO RESPONSE' }));
  if (r.status === 401) throw new Error('ACCESS DENIED');
  if (!r.ok || j.error) throw new Error(String(j.error || 'ERROR ' + r.status).toUpperCase());
  return j;
}
function statusWord(it) { return it.status === 'approved' ? 'ON SHELF' : it.status === 'rejected' ? 'SAID NO' : ''; }
function renderTerm() {
  const M = tstate.mgr;
  hdrEl.textContent = M ? 'MACKEYTV VIDEO · MANAGER MODE' : 'MACKEYTV VIDEO · INVENTORY SYSTEM v1.0';
  kbdEl.querySelectorAll('.key').forEach((b) => b.classList.toggle('focus', tstate.zone === 'kbd' && +b.dataset.r === tstate.kr && +b.dataset.c === tstate.kc));
  kbdEl.querySelector('.key[data-r="4"][data-c="3"]').textContent = M ? 'LOG OUT' : 'MGR';
  if (M && M.stage === 'pin') {
    qLabel.textContent = 'MANAGER PIN > '; qEl.textContent = '*'.repeat(M.pin.length);
    colsEl.innerHTML = ''; countEl.textContent = '';
    resEl.innerHTML = `<div class="none">${escT(M.msg || 'TYPE THE FAMILY PIN, THEN PRESS GO.')}</div>`;
    return;
  }
  if (M && M.stage === 'report') { renderReport(); return; }
  if (M && M.stage === 'stocking') { renderStock(); return; }
  qLabel.textContent = M ? 'FIND ANY MOVIE > ' : 'SEARCH > ';
  qEl.textContent = tstate.q;
  const m = curList();
  if (tstate.sel < tstate.top) tstate.top = tstate.sel;
  if (tstate.sel >= tstate.top + VISIBLE) tstate.top = tstate.sel - VISIBLE + 1;
  colsEl.innerHTML = M ? '<span>TITLE</span><span>RATED</span><span>STATUS</span>' : '<span>TITLE</span><span>RATED</span><span>LOCATION</span>';
  if (M && M.busy) { resEl.innerHTML = `<div class="none">${escT(M.busy)}</div>`; countEl.textContent = ''; return; }
  resEl.innerHTML = m.slice(tstate.top, tstate.top + VISIBLE).map((it, i) => {
    const idx = tstate.top + i, on = tstate.zone === 'res' && idx === tstate.sel;
    const cols = it.starter ? ['▶ ' + it.title, '', 'NO R-RATED'] : M ? [`${it.title}${it.year ? ' (' + it.year + ')' : ''}`, it.certification || 'NR', statusWord(it)] : [it.title, it.rating, it.where];
    return `<button type="button" class="tr${on ? ' on' : ''}" data-idx="${idx}"><span>${escT(cols[0].toUpperCase())}</span><span>${escT(cols[1])}</span><span>${escT(cols[2])}</span></button>`;
  }).join('') || `<div class="none">${M ? escT(M.msg || (tstate.q ? 'PRESS GO TO SEARCH.' : 'TYPE A TITLE, THEN PRESS GO.')) : 'NO MATCHES IN STOCK'}</div>`;
  countEl.textContent = M ? (M.results.length ? `${M.results.length} FOUND` : '') : tstate.q ? `${m.length} MATCH${m.length === 1 ? '' : 'ES'}` : `${CATALOG.length} TITLES IN STOCK`;
}
// ---- manager: one title's record ----
function repOptions() {
  const M = tstate.mgr, it = M.rep, on = it.status === 'approved';
  return [
    { label: `AISLE: ${AISLES[M.genreIdx]}`, go: () => { M.genreIdx = (M.genreIdx + 1) % AISLES.length; renderTerm(); } },
    { label: on ? 'ON SHELF ✓ (SAVE AISLE)' : 'ADD TO SHELF', go: () => decideRep('approve') },
    { label: on ? 'PULL IT' : 'SAY NO', go: () => decideRep('reject') },
    { label: 'BACK', go: () => { M.stage = 'search'; tstate.zone = 'res'; renderTerm(); } }
  ];
}
function renderReport() {
  const M = tstate.mgr, r = M.report, it = M.rep;
  qLabel.textContent = 'RECORD > '; qEl.textContent = (it.title || '').toUpperCase();
  colsEl.innerHTML = ''; countEl.textContent = statusWord(it);
  if (!r) { resEl.innerHTML = `<div class="none">${escT(M.busy || 'PULLING UP RECORD...')}</div>`; return; }
  const gate = r.gate === 'pass' ? `RATED ${r.certification} · PASSES THE RATING CHECK` : r.gate === 'check' ? `RATED ${r.certification} · ABOVE PG — LOOK CLOSELY` : 'NOT RATED · LOOK CLOSELY';
  const mine = (n) => MY_SERVICES.some((s) => s.re.test(n));
  const where = r.providers.length ? r.providers.map((p) => (mine(p.name) ? '[' + p.name + ']' : p.name)).join(', ') : 'NOT STREAMING ANYWHERE RIGHT NOW';
  const cf = r.content_flags;
  const flags = !cf ? 'CONTENT DATABASE UNAVAILABLE' : !cf.found ? 'NOT IN THE CONTENT DATABASE YET' : cf.flags.length ? cf.flags.slice(0, 7).map((f) => `${f.topic} (${f.yes})`).join(' · ') : 'NO WARNINGS REPORTED';
  const ov = (r.overview || '').slice(0, 170) + ((r.overview || '').length > 170 ? '…' : '');
  const opts = repOptions();
  resEl.innerHTML = `<div class="rep">
    <div>${escT(`${r.title} (${r.year ?? '?'})${r.runtime ? ' · ' + r.runtime + ' MIN' : ''}`.toUpperCase())}</div>
    <div class="g-${r.gate}">${escT(gate)}</div>
    <div>PLAYS ON: ${escT(where.toUpperCase())}</div>
    <div class="flags">CONTENT: ${escT(flags.toUpperCase())}</div>
    <div class="ov">${escT(ov.toUpperCase())}</div>
    ${M.msg ? `<div class="msg">${escT(M.msg)}</div>` : ''}
    <div class="opts">${opts.map((o, i) => `<button type="button" class="op${tstate.zone === 'rep' && i === M.opt ? ' on' : ''}" data-op="${i}">${escT(o.label)}</button>`).join('')}</div>
  </div>`;
}
async function openRecord(item) {
  const M = tstate.mgr;
  M.stage = 'report'; M.rep = item; M.report = null; M.msg = ''; M.opt = 1; M.busy = '';
  tstate.zone = 'rep'; renderTerm();
  try {
    const { report } = await mgrApi('report', { tmdb_id: item.tmdb_id });
    if (M.rep !== item) return;
    M.report = report;
    const saved = CAT.find((c) => c.tmdb_id === item.tmdb_id);
    M.genreIdx = Math.max(0, AISLES.indexOf(saved ? saved.genre : report.suggested_genre));
  } catch (e) { M.busy = e.message; }
  renderTerm();
}
async function decideRep(decision) {
  const M = tstate.mgr, it = M.rep; if (!M.report || M.saving) return;
  M.saving = true; M.msg = 'SAVING...'; renderTerm();
  try {
    const { title } = await mgrApi('decide', { tmdb_id: it.tmdb_id, who: 'tv', decision, genre: AISLES[M.genreIdx] });
    it.status = title.status; M.changed = true;
    M.msg = title.status === 'approved' ? `ON THE ${AISLES[M.genreIdx]} AISLE. RESTOCKS WHEN YOU LEAVE THE COMPUTER.` : 'KEPT OUT OF THE STORE.';
  } catch (e) { M.msg = e.message; }
  M.saving = false; renderTerm();
}
// ---- manager: stock the starter shelves in batches (paced for the content database's rate limit) ----
function renderStock() {
  const S = tstate.mgr.stock;
  qLabel.textContent = 'STOCKING > '; qEl.textContent = `${S.done} / ${STARTER.length}`;
  colsEl.innerHTML = ''; countEl.textContent = '';
  const pct = Math.round((S.done / STARTER.length) * 40);
  resEl.innerHTML = `<div class="rep">
    <div>[${'#'.repeat(pct)}${'.'.repeat(40 - pct)}]</div>
    <div>ADDED ${S.added} · SKIPPED R ${S.skipped} · ALREADY IN ${S.already} · NOT FOUND ${S.missing}${S.errors ? ' · ERRORS ' + S.errors : ''}</div>
    <div class="ov">${escT(S.last)}</div>
    <div class="msg">${escT(S.finished ? 'DONE. PRESS BACK TO RESTOCK THE STORE.' : S.cancel ? 'STOPPING...' : 'LEAVE IT RUNNING. PRESS BACK TO STOP.')}</div>
  </div>`;
}
async function runStock() {
  const M = tstate.mgr;
  M.stage = 'stocking'; tstate.zone = 'kbd';
  const S = M.stock = { done: 0, added: 0, skipped: 0, already: 0, missing: 0, errors: 0, last: 'STARTING...', cancel: false, finished: false };
  renderTerm();
  for (let i = 0; i < STARTER.length && !S.cancel && tstate.mgr === M; i += 8) {
    const t0 = performance.now();
    try {
      const { results } = await mgrApi('stock', { items: STARTER.slice(i, i + 8) });
      for (const r of results) {
        if (r.result === 'added') S.added++;
        else if (r.result.startsWith('skipped')) S.skipped++;
        else if (r.result.startsWith('already')) S.already++;
        else if (r.result === 'not found') S.missing++;
        else S.errors++;
        S.last = `${(r.matched || r.title).toUpperCase()}: ${r.result.toUpperCase()}`;
      }
      if (S.added) M.changed = true;
    } catch (e) { S.errors += Math.min(8, STARTER.length - i); S.last = e.message; }
    S.done = Math.min(STARTER.length, i + 8);
    if (tstate.mgr === M && M.stage === 'stocking') renderTerm();
    const wait = 30000 - (performance.now() - t0);
    if (wait > 0 && S.done < STARTER.length && !S.cancel && tstate.mgr === M) await new Promise((r) => setTimeout(r, wait));
  }
  S.finished = true;
  if (tstate.mgr === M && M.stage === 'stocking') renderTerm();
}

// ---- manager: login / search ----
function startManager() { tstate.mgr = { pin: '', stage: 'pin', results: [], msg: '', changed: false }; tstate.zone = 'kbd'; tstate.kr = 0; tstate.kc = 0; renderTerm(); }
function endManager() { const ch = tstate.mgr && tstate.mgr.changed; tstate.mgr = null; tstate.sel = 0; tstate.top = 0; setQuery(''); return ch; }
async function mgrGo() {
  const M = tstate.mgr;
  if (M.stage === 'pin') {
    if (!M.pin) return;
    M.msg = 'CHECKING...'; renderTerm();
    try { await mgrApi('status'); M.stage = 'search'; M.msg = ''; tstate.q = ''; tstate.zone = 'kbd'; tstate.kr = 1; }
    catch (e) { M.pin = ''; M.msg = e.message === 'ACCESS DENIED' ? 'ACCESS DENIED. TRY AGAIN.' : e.message; }
    renderTerm(); return;
  }
  const q = tstate.q.trim(); if (!q) return;
  M.busy = 'SEARCHING...'; M.results = []; renderTerm();
  try { const { results } = await mgrApi('search', { q }); M.results = results; M.msg = results.length ? '' : 'NOTHING BY THAT NAME.'; }
  catch (e) { M.msg = e.message; }
  M.busy = ''; tstate.sel = 0; tstate.top = 0;
  if (M.results.length) tstate.zone = 'res';
  renderTerm();
}
function setQuery(q) {
  tstate.q = q.slice(0, 24);
  if (tstate.mgr) { tstate.sel = 0; tstate.top = 0; renderTerm(); return; }
  const s = tstate.q.toLowerCase().trim();
  tstate.matches = s ? CATALOG.filter((it) => it.title.toLowerCase().includes(s)).sort((a, b) => (sortKey(a.title).toLowerCase().startsWith(s) ? 0 : 1) - (sortKey(b.title).toLowerCase().startsWith(s) ? 0 : 1)) : CATALOG;
  tstate.sel = 0; tstate.top = 0; renderTerm();
}
function pressKey(k, btn) {
  click(k.length > 1);
  if (btn) { btn.classList.add('down'); setTimeout(() => btn.classList.remove('down'), 110); }
  const M = tstate.mgr;
  if (k === 'EXIT') { closeTerm(); return; }
  if (k === 'MGR') { startManager(); return; }
  if (k === 'LOG OUT') { const ch = endManager(); if (ch) restock(); return; }
  if (M && (M.stage === 'report' || M.stage === 'stocking')) return;
  if (M && M.stage === 'pin') {
    if (k === 'GO') mgrGo();
    else if (k === 'DEL') M.pin = M.pin.slice(0, -1);
    else if (k === 'CLEAR') M.pin = '';
    else if (k.length === 1) { M.pin = (M.pin + k).slice(0, 12); M.msg = ''; }
    renderTerm(); return;
  }
  if (k === 'GO') { if (M) mgrGo(); else if (tstate.matches.length) { tstate.zone = 'res'; tstate.sel = 0; renderTerm(); } return; }
  if (k === 'DEL') setQuery(tstate.q.slice(0, -1));
  else if (k === 'CLEAR') setQuery('');
  else if (k === 'SPACE') setQuery(tstate.q + ' ');
  else setQuery(tstate.q + k);
}
function restock() {
  resEl.innerHTML = '<div class="none">RESTOCKING THE SHELVES...</div>'; qLabel.textContent = ''; qEl.textContent = '';
  setTimeout(() => location.reload(), 700);
}
function openTerm() { mode = 'term'; termEl.hidden = false; tstate.zone = 'kbd'; tstate.kr = 1; tstate.kc = 0; setQuery(tstate.q); requestAnimationFrame(() => termEl.classList.add('show')); }
function closeTerm(silent) {
  if (!silent && tstate.mgr && tstate.mgr.changed) { endManager(); restock(); return; }
  if (tstate.mgr) endManager();
  termEl.classList.remove('show'); termEl.hidden = true;
  if (!silent) { const s = STOPS[STOPS.length - 1]; travelTo([{ x: s.x, z: s.z, yaw: s.yaw, pitch: -0.06, dur: 0.45 }], () => { stopIdx = STOPS.length - 1; mode = 'lane'; renderStops(); }); }
}
function pickResult(idx) {
  const it = curList()[idx]; if (!it) return;
  click(true);
  if (it.starter) { runStock(); return; }
  if (tstate.mgr) openRecord(it); else fetchItem(it);
}
function termNav(key) {
  const M = tstate.mgr;
  if (M && M.stage === 'stocking') {
    if (key === 'Escape') {
      if (M.stock.finished || M.stock.cancel) { const ch = endManager(); if (ch) restock(); return; }
      M.stock.cancel = true; renderTerm();
    }
    return;
  }
  if (tstate.zone === 'rep') {
    const n = repOptions().length;
    if (key === 'ArrowLeft') M.opt = Math.max(0, M.opt - 1);
    else if (key === 'ArrowRight') M.opt = Math.min(n - 1, M.opt + 1);
    else if (key === 'Enter') { if (M.report) { click(true); repOptions()[M.opt].go(); } return; }
    else if (key === 'Escape') { M.stage = 'search'; tstate.zone = M.results.length ? 'res' : 'kbd'; }
    renderTerm(); return;
  }
  if (tstate.zone === 'kbd') {
    const row = KROWS[tstate.kr];
    if (key === 'ArrowLeft') tstate.kc = Math.max(0, tstate.kc - 1);
    else if (key === 'ArrowRight') tstate.kc = Math.min(row.length - 1, tstate.kc + 1);
    else if (key === 'ArrowUp' || key === 'ArrowDown') {
      const nr = tstate.kr + (key === 'ArrowDown' ? 1 : -1);
      if (nr < 0) { const L = curList(); if (L.length && !(M && M.stage === 'pin')) { tstate.zone = 'res'; tstate.sel = Math.min(L.length - 1, tstate.top + VISIBLE - 1); } }
      else if (nr < KROWS.length) { tstate.kc = Math.round(tstate.kc * (KROWS[nr].length - 1) / Math.max(1, row.length - 1)); tstate.kr = nr; }
    } else if (key === 'Enter') { const b = kbdEl.querySelector(`.key[data-r="${tstate.kr}"][data-c="${tstate.kc}"]`); pressKey(b.textContent, b); return; }
    else if (key === 'Escape') { if (M) { const ch = endManager(); if (ch) restock(); } else closeTerm(); return; }
  } else {
    const L = curList();
    if (key === 'ArrowUp') tstate.sel = Math.max(0, tstate.sel - 1);
    else if (key === 'ArrowDown') { if (tstate.sel >= L.length - 1) { tstate.zone = 'kbd'; tstate.kr = 0; } else tstate.sel++; }
    else if (key === 'Enter') { pickResult(tstate.sel); return; }
    else if (key === 'Escape') tstate.zone = 'kbd';
  }
  renderTerm();
}
kbdEl.addEventListener('click', (e) => { const b = e.target.closest('.key'); if (!b) return; tstate.zone = 'kbd'; tstate.kr = +b.dataset.r; tstate.kc = +b.dataset.c; pressKey(b.textContent, b); });
resEl.addEventListener('click', (e) => {
  const op = e.target.closest('.op'); if (op) { tstate.zone = 'rep'; tstate.mgr.opt = +op.dataset.op; click(true); repOptions()[tstate.mgr.opt].go(); return; }
  const b = e.target.closest('.tr'); if (b) pickResult(+b.dataset.idx);
});

// ---------- key sounds, synthesized ----------
let actx = null;
function click(heavy) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, len = heavy ? 0.07 : 0.04;
    const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * len), actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, heavy ? 3 : 6);
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (heavy ? 1100 : 2600) * (0.88 + Math.random() * 0.24); f.Q.value = 1.4;
    const g = actx.createGain(); g.gain.value = heavy ? 0.8 : 0.55;
    src.connect(f).connect(g).connect(actx.destination); src.start(t);
    const o = actx.createOscillator(), og = actx.createGain();
    o.frequency.value = (heavy ? 120 : 190) * (0.95 + Math.random() * 0.1);
    og.gain.setValueAtTime(heavy ? 0.35 : 0.18, t); og.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.08 : 0.04));
    o.connect(og).connect(actx.destination); o.start(t); o.stop(t + 0.1);
  } catch (e) { /* no audio */ }
}

// ---------- remote ----------
const REPEAT_DELAY = 280, REPEAT_RATE = 70;
function press(key) {
  if (mode === 'travel') return;
  if (mode === 'show') {
    if (!show) return;
    if (key === 'Escape' || (key === 'Enter' && show.ended)) endShow();
    else if (key === 'Enter' && show.stage === 'trailer') toggleTrailer();
    else if (key === 'Enter' && show.t < T_COUNT + 0.35) show.t = T_COUNT + 0.35;   // skip the walk to the seat
    else if (key === 'Enter' && testVideo) { if (testVideo.paused) testVideo.play().catch(() => {}); else testVideo.pause(); }
    return;
  }
  if (mode === 'marquee') {
    if (!marq || marqEl.hidden) return;
    if (key === 'ArrowUp') marq.sel = (marq.sel + 4) % 5;
    else if (key === 'ArrowDown') marq.sel = (marq.sel + 1) % 5;
    else if (key === 'Enter') { playFromMarquee(marq.sel); return; }
    else if (key === 'Escape') { closeMarquee(true); return; }
    renderMarquee(); return;
  }
  if (mode === 'term') { termNav(key); return; }
  if (mode === 'menu') {
    if (key === 'ArrowUp') menuIdx = (menuIdx + MENU.length - 1) % MENU.length;
    else if (key === 'ArrowDown') menuIdx = (menuIdx + 1) % MENU.length;
    else if (key === 'Enter') { MENU[menuIdx].go(); return; }
    else if (key === 'Escape') { closeMenu(); return; }
    renderMenu(); return;
  }
  switch (mode) {
    case 'lane':
      if (key === 'ArrowLeft') stepLane(-1);
      else if (key === 'ArrowRight') stepLane(1);
      else if (key === 'ArrowUp' || key === 'Enter') laneSelect();
      else if (key === 'Escape') openMenu();
      break;
    case 'aisle':
      if (key === 'ArrowUp' && state.z <= Z1 + 0.7) enterPoster(ai, 0);
      else if (key === 'ArrowLeft') enterShelf(-1);
      else if (key === 'ArrowRight') enterShelf(1);
      else if (key === 'Escape') openMenu();
      break;
    case 'shelf':
      if (key === 'ArrowLeft') moveShelf(-1, 0);
      else if (key === 'ArrowRight') moveShelf(1, 0);
      else if (key === 'ArrowUp') moveShelf(0, 1);
      else if (key === 'ArrowDown') { if (cur.row === 0) leaveShelf(); else moveShelf(0, -1); }
      else if (key === 'Enter') hold(tapeAt(ai, cur.side, cur.row, cur.g).tape, 'shelf');
      else if (key === 'Escape') leaveShelf();
      break;
    case 'wall':
      if (key === 'ArrowLeft') moveWall(-1, 0);
      else if (key === 'ArrowRight') { if (wcur.c === walls[wcur.wall].cols - 1) { stopIdx = 0; stepLane(1); } else moveWall(1, 0); }
      else if (key === 'ArrowUp') moveWall(0, 1);
      else if (key === 'ArrowDown') { if (wcur.r === 0) { stopIdx = 0; stepLane(1); } else moveWall(0, -1); }
      else if (key === 'Enter') hold(wallCell(wcur.wall, wcur.r, wcur.c).tape, 'wall');
      else if (key === 'Escape') { stopIdx = 0; stepLane(1); }
      break;
    case 'poster':
      if (key === 'ArrowLeft') enterPoster(pcur.ai, 0);
      else if (key === 'ArrowRight') enterPoster(pcur.ai, 1);
      else if (key === 'Enter') hold(posterOf(pcur.ai, pcur.k).tape, 'poster');
      else if (key === 'ArrowDown' || key === 'Escape') leavePoster();
      break;
    case 'held':
      if (key === 'Escape') putBack();
      else if (key === 'Enter') openCover();
      break;
    case 'cover':
      if (key === 'ArrowUp' || key === 'ArrowDown' || (key === 'ArrowLeft' && coverBtn === 0) || (key === 'ArrowRight' && coverBtn === coverActs.length - 1)) { closeCover(); press(key); return; }
      if (key === 'ArrowLeft') { coverBtn = Math.max(0, coverBtn - 1); renderCoverBtns(); }
      else if (key === 'ArrowRight') { coverBtn = Math.min(coverActs.length - 1, coverBtn + 1); renderCoverBtns(); }
      else if (key === 'Enter') coverActs[coverBtn].go();
      else if (key === 'Escape') closeCover();
      break;
  }
  dirty = true;
}
const KEYMAP = { w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight', ' ': 'Enter', Backspace: 'Escape', GoBack: 'Escape', BrowserBack: 'Escape', m: 'Escape' };
addEventListener('keydown', (e) => {
  if (mode === 'term' && e.key.length === 1 && /[a-z0-9'\- ]/i.test(e.key)) { e.preventDefault(); pressKey(e.key === ' ' ? 'SPACE' : e.key.toUpperCase()); return; }
  if (mode === 'term' && e.key === 'Backspace') { e.preventDefault(); pressKey('DEL'); return; }
  const key = KEYMAP[e.key] || e.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(key)) return;
  e.preventDefault(); keys[key] = true; dirty = true;
  if (e.repeat && mode !== 'term') return;
  press(key);
  if (!e.repeat && (mode === 'shelf' || mode === 'wall') && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    clearTimeout(holdKeys[key]);
    const tick = () => { if (!keys[key] || (mode !== 'shelf' && mode !== 'wall')) return; press(key); holdKeys[key] = setTimeout(tick, REPEAT_RATE); };
    holdKeys[key] = setTimeout(tick, REPEAT_DELAY);
  }
});
addEventListener('keyup', (e) => { const key = KEYMAP[e.key] || e.key; keys[key] = false; clearTimeout(holdKeys[key]); dirty = true; });

// ---------- pointer (mouse, touch, or an air-mouse remote) ----------
const ray = new THREE.Raycaster();
const ndcOf = (e) => new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
function pickAt(ndc, far) {
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...pickRoot.children, crt, ...POSTERS.map((p) => p.mesh), ...CAPS.map((p) => p.mesh)], true);
  if (!hits.length || hits[0].distance > (far ? 16 : 6)) return null;
  const h = hits[0], d = h.object.userData;
  if (d.kind === 'computer') return { kind: 'computer' };
  if (d.kind === 'poster') return { kind: 'poster', ai: d.ai, k: d.k };
  if (d.kind === 'cap') return { kind: 'cap', gi: d.gi };
  if (d.kind === 'spine') {
    const per = LAYOUT[d.ai].per, i = Math.min(per - 1, Math.floor(h.uv.x * per));
    if (!d.tapes[i]) return null;
    return { kind: 'spine', a: d.ai, side: d.side, row: d.r, g: d.k * per + (d.side < 0 ? i : per - 1 - i) };
  }
  if (d.kind === 'wall') {
    const w = walls[d.wall], lp = w.grp.worldToLocal(h.point.clone());
    const c = Math.floor((lp.x + w.width / 2) / w.sx), r = Math.floor((lp.y - (w.y0 - 0.05)) / w.sy);
    if (c < 0 || c >= w.cols || r < 0 || r >= w.rows) return null;
    return { kind: 'wall', wall: d.wall, r, c };
  }
  return null;
}
function activate(p) {
  if (!p) return false;
  if (p.kind === 'computer') { goSearch(); return true; }
  if (p.kind === 'cap') {
    const si = STOPS.findIndex((s) => s.kind === 'cap' && s.gi === p.gi);
    if (mode === 'lane' && stopIdx === si) { if (TOUCH) focusCap(p.gi); else hold(CAPS[p.gi].tape, 'cap'); }
    else goStop(si, () => { if (TOUCH) focusCap(p.gi); else hold(CAPS[p.gi].tape, 'cap'); });
    return true;
  }
  if (p.kind === 'poster') {
    const P = posterOf(p.ai, p.k), v = posterView(P);
    if ((mode === 'aisle' || mode === 'poster' || mode === 'held') && ai === p.ai) { ai = p.ai; enterPoster(p.ai, p.k); if (!TOUCH) hold(P.tape, 'poster'); }
    else travelTo([...toLane(), { x: aisleX(p.ai), z: LANE_Z }, { x: aisleX(p.ai), z: v.z, yaw: 0 }], () => { ai = p.ai; stopIdx = aisleStop(p.ai); enterPoster(p.ai, p.k); if (!TOUCH) hold(P.tape, 'poster'); });
    return true;
  }
  if (p.kind === 'spine') {
    const item = { loc: { type: 'shelf', a: p.a, side: p.side, row: p.row, g: p.g } };
    if ((mode === 'shelf' || mode === 'aisle' || mode === 'held') && ai === p.a) { cur.side = p.side; cur.row = p.row; cur.g = p.g; mode = 'shelf'; focusShelf(); if (!TOUCH) hold(tapeAt(ai, p.side, p.row, p.g).tape, 'shelf'); }
    else { stopIdx = STOPS.length - 1; fetchItem(item); }
    return true;
  }
  if (p.kind === 'wall') { wcur.wall = p.wall; wcur.r = p.r; wcur.c = p.c; mode = 'wall'; focusWall(); if (!TOUCH) hold(wallCell(p.wall, p.r, p.c).tape, 'wall'); return true; }
  return false;
}
let drag = null, hoverTimer = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { if (mode === 'travel') return; drag = { x: e.clientX, y: e.clientY, yaw: target.yaw, pitch: target.pitch, moved: false, touch: e.pointerType !== 'mouse' }; });
addEventListener('pointerup', (e) => {
  if (drag && !drag.moved && mode === 'cover') { const p = pickAt(ndcOf(e), drag.touch); if (p) { closeCover(); activate(p); } }
  else if (drag && !drag.moved && ['lane', 'aisle', 'shelf', 'wall', 'held', 'poster'].includes(mode)) {
    if (!activate(pickAt(ndcOf(e), drag.touch)) && mode === 'held') putBack();
  }
  drag = null;
});
addEventListener('pointermove', (e) => {
  if (drag) {
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > (drag.touch ? 16 : 6)) drag.moved = true;
    if (drag.moved) { target.yaw = drag.yaw - (e.clientX - drag.x) * 0.004; target.pitch = Math.max(-0.8, Math.min(0.5, drag.pitch - (e.clientY - drag.y) * 0.004)); dirty = true; }
    return;
  }
  if (!['lane', 'aisle', 'shelf', 'wall', 'poster'].includes(mode)) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    const p = pickAt(ndcOf(e));
    renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    if (p && p.kind === 'spine') {
      const t = tapeAt(p.a, p.side, p.row, p.g); showSpine(t);
      setCard(`${aisleLabel(p.a)} · SHELF ${ROWS - p.row}`, t.tape.title, tapeMeta(t.tape), t.tape);
    } else if (p && p.kind === 'wall') {
      showWallCell(p.wall, p.r, p.c); const cell = wallCell(p.wall, p.r, p.c);
      setCard(walls[p.wall].name, cell.tape.title, tapeMeta(cell.tape), cell.tape);
    } else if (p && p.kind === 'cap') {
      const P = CAPS[p.gi]; showPoster(P);
      setCard('ENDCAP \u00b7 NEW ON VIDEO', P.tape.title, tapeMeta(P.tape), P.tape);
    } else if (p && p.kind === 'poster') {
      const P = posterOf(p.ai, p.k); showPoster(P);
      setCard(`${aisleLabel(p.ai)} \u00b7 ON THE WALL`, P.tape.title, tapeMeta(P.tape), P.tape);
    } else if (p && p.kind === 'computer') { clearHighlight(); setCard('STORE COMPUTER', 'Search the catalog', `${CATALOG.length} titles in stock`); }
    else if (mode === 'lane' || mode === 'aisle') { clearHighlight(); card.hidden = true; }
  }, 30);
});

// ---------- loop: draw only when something changes ----------
const fpsEl = document.getElementById('fps');
let frames = 0, lastFps = performance.now(), last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  let changed = false;
  if (mode === 'show' && show) { stepShow(dt); changed = true; }
  else if (mode === 'travel' && travel) { stepTravel(dt); changed = true; }
  else if (mode !== 'term' && mode !== 'menu') {
    let v = 0;
    if (mode === 'aisle') {
      if (keys.ArrowUp) v -= 1;
      if (keys.ArrowDown) v += 1;
      if (v !== 0) {
        target.z = Math.max(Z1 + 0.4, Math.min(LANE_Z, target.z + v * 1.7 * dt));
        target.x = aisleX(ai); target.yaw = state.yaw + angDiff(state.yaw, 0); target.pitch = -0.06;
        if (v < 0 && target.z <= Z1 + 0.401) { enterPoster(ai, 0); }
        else if (v > 0 && target.z >= LANE_Z - 0.001) { mode = 'lane'; stopIdx = aisleStop(ai); renderStops(); }
      }
    }
    const before = state.x + state.z + state.yaw + state.pitch;
    const k = mode === 'aisle' ? 1 : Math.min(1, dt * 6);
    state.x += (target.x - state.x) * Math.min(1, dt * 6);
    state.z += (target.z - state.z) * k;
    state.yaw += (target.yaw - state.yaw) * Math.min(1, dt * 7);
    state.pitch += (target.pitch - state.pitch) * Math.min(1, dt * 7);
    state.moving += ((v !== 0 ? 1 : 0) - state.moving) * Math.min(1, dt * 8);
    changed = Math.abs(state.x + state.z + state.yaw + state.pitch - before) > 1e-5 || state.moving > 0.01;
  }
  state.phase += dt * 9 * state.moving;
  if (dirty || changed) {
    const bob = Math.sin(state.phase) * 0.022 * state.moving, sway = Math.cos(state.phase / 2) * 0.012 * state.moving;
    camera.position.set(state.x + sway, (mode === 'show' && show && show.camY !== undefined ? show.camY : (mode === 'show' ? BOOTH.y : 1.62)) + bob, state.z);
    camera.rotation.set(state.pitch, state.yaw, 0);
    renderer.render(scene, camera);
    frames++; dirty = false;
  }
  if (now - lastFps > 1000) { const fps = Math.round(frames * 1000 / (now - lastFps)); fpsEl.textContent = fps > 0 ? `${fps} fps` : 'idle'; frames = 0; lastFps = now; }
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { if (mode !== 'show') camera.fov = baseFov(); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(pr()); renderer.setSize(window.innerWidth, window.innerHeight); dirty = true; });
// entrance: you start a step back from the aisle signs, then settle onto the lane
setTarget({ x: STOPS[START].x, z: LANE_Z, yaw: 0, pitch: -0.06 });
window.__press = (k) => press(k);
// stay current: the TV app keeps one page open for days, so check for a newer store and reload while nobody's mid-choice
{
  let newer = false;
  const idle = () => ['lane', 'aisle'].includes(mode) && document.visibilityState === 'visible';
  const check = () => {
    if (!/^https?:/.test(location.protocol) || !window.MTV_VERSION || window.MTV_VERSION.includes('VERSION')) return;
    fetch('/version.txt?' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((v) => {
      v = v.trim(); if (v && v !== window.MTV_VERSION) newer = true;
      if (newer && idle()) location.reload();
    }).catch(() => {});
  };
  setInterval(check, 5 * 60 * 1000);
  setInterval(() => { if (newer && idle()) location.reload(); }, 20 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
// on-screen arrows for phones: same as the remote's D-pad, hold to repeat
{
  const dp = document.getElementById('dpad');
  let rep = null;
  const stop = () => { clearTimeout(rep); clearInterval(rep); rep = null; dp.querySelectorAll('.down').forEach((b) => b.classList.remove('down')); };
  dp.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); stop(); b.classList.add('down');
    const k = b.dataset.k; press(k); dirty = true;
    if (k !== 'Enter') rep = setTimeout(() => { rep = setInterval(() => { press(k); dirty = true; }, 110); }, 320);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => dp.addEventListener(ev, stop));
  // show it wherever the arrows do something; the computer, cover and theater have their own buttons
  const sync = () => { const on = ['lane', 'aisle', 'shelf', 'wall', 'poster', 'held', 'menu', 'marquee'].includes(mode); if (dp.hidden === on) dp.hidden = !on; requestAnimationFrame(sync); };
  sync();
}
// on-screen Back and Menu for phones and tablets
{
  const tb = document.getElementById('touchbar');
  if (tb) {
    tb.querySelector('.tback').addEventListener('click', (e) => { e.stopPropagation(); press('Escape'); dirty = true; });
    tb.querySelector('.tmenu').addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'menu') closeMenu(); else if (mode === 'lane' || mode === 'aisle') { clearHighlight(); card.hidden = true; openMenu(); } else press('Escape'); dirty = true; });
  }
}
window.__redraw = () => { dirty = true; };
window.__type = (s) => { for (const ch of s) pressKey(ch === ' ' ? 'SPACE' : ch.toUpperCase()); };
window.__mode = () => mode;
window.__cat = () => CATALOG.map((c) => [c.title, !!c.tape.demo, c.where]);
window.__showT = () => (show ? show.t : -1);
window.__reel = () => (testVideo ? { t: testVideo.currentTime, rs: testVideo.readyState, paused: testVideo.paused, err: testVideo.error && testVideo.error.code } : null);
window.__view = (x, z, yaw, pitch) => { Object.assign(state, { x, z, yaw, pitch }); Object.assign(target, { x, z, yaw, pitch }); dirty = true; };
renderStops();
document.getElementById('loading').remove();
requestAnimationFrame(frame);

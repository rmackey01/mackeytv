// =================== MackeyTV store: 6 genre aisles + New Releases wall (TV mode) ===================
const GENRES = [
  { name: 'FAMILY', color: '#2f8f8a', titles: ['Paddington', 'Paddington 2', 'Babe', 'Heidi', 'Black Beauty', 'Old Yeller', 'Mary Poppins', 'Hook', 'Hugo', 'Elf', 'The Sandlot', 'Charlotte’s Web', 'Matilda', 'Nanny McPhee', 'Dolphin Tale', 'Because of Winn-Dixie', 'The Parent Trap', 'Holes', 'Swiss Family Robinson', 'Homeward Bound', 'Air Bud', 'Flight of the Navigator', 'The Muppets', 'Benji', 'Annie', 'Enchanted', 'Night at the Museum', 'Willy Wonka', 'Stuart Little', 'The Secret Garden'] },
  { name: 'ANIMATED', color: '#c8553d', titles: ['Toy Story', 'Toy Story 2', 'Toy Story 3', 'Finding Nemo', 'Finding Dory', 'Up', 'Wall-E', 'Ratatouille', 'Coco', 'Inside Out', 'Moana', 'Encanto', 'Zootopia', 'The Incredibles', 'Cars', 'Bolt', 'Tangled', 'Frozen', 'The Lion King', 'Bambi', 'Cinderella', 'Dumbo', 'Pinocchio', 'Kung Fu Panda', 'The Iron Giant', 'The Prince of Egypt', 'The Polar Express', 'Luca', 'Soul', 'Mulan', 'Brave', 'Monsters, Inc.', 'Lady and the Tramp', 'Sing', 'The Star', 'The King of Kings'] },
  { name: 'FAITH', color: '#b8892c', titles: ['The Chosen', 'I Can Only Imagine', 'The Case for Christ', 'Facing the Giants', 'War Room', 'Overcomer', 'Courageous', 'Fireproof', 'Jesus Revolution', 'The Nativity Story', 'Risen', 'Paul, Apostle of Christ', 'God’s Not Dead', 'Miracles from Heaven', 'Heaven Is for Real', 'Breakthrough', 'His Only Son', 'The Hiding Place', 'Amazing Grace', 'Bonhoeffer', 'Jesus', 'Ordinary Angels', 'Unsung Hero', 'Show Me the Father', 'Love Comes Softly', 'Silent Night', 'The Pilgrim’s Progress', 'Lord of the Streets'] },
  { name: 'CLASSICS', color: '#6e4a86', titles: ['It’s a Wonderful Life', 'The Sound of Music', 'Ben-Hur', 'The Ten Commandments', 'Singin’ in the Rain', 'Roman Holiday', 'The Wizard of Oz', 'Miracle on 34th Street', 'Mr. Smith Goes to Washington', 'Sergeant York', 'The Music Man', 'Anne of Green Gables', 'Little Women', 'Chariots of Fire', 'To Kill a Mockingbird', 'Shane', 'Rear Window', 'Fiddler on the Roof', 'My Fair Lady', 'Oliver!', 'The Quiet Man', 'Lassie Come Home', 'National Velvet', 'Bringing Up Baby'] },
  { name: 'SPORTS & TRUE STORIES', color: '#3d7a4c', titles: ['Miracle', 'Rudy', 'Hoosiers', 'Remember the Titans', 'The Rookie', 'Secretariat', 'Queen of Katwe', 'Hidden Figures', 'Woodlawn', 'Soul Surfer', 'Unbroken', '42', 'Glory Road', 'McFarland, USA', 'Cool Runnings', 'The Mighty Ducks', 'Big Dreams', 'Running the Bases', 'Invincible', 'The Express', 'Seabiscuit', 'Apollo 13', 'October Sky', 'Million Dollar Arm'] },
  { name: 'DOCUMENTARIES', color: '#3c6488', titles: ['The Jesus Music', 'March of the Penguins', 'Apollo 11', 'Won’t You Be My Neighbor?', 'Oceans', 'Earth', 'Born to Be Wild', 'Wings of Life', 'Bears', 'Chimpanzee', 'Penguins', 'Monkey Kingdom', 'African Cats', 'Is Genesis History?', 'The Riot and the Dance', 'Jane', 'Free to Play', 'The Biggest Little Farm', 'Fantastic Fungi', 'Our Planet', 'Planet Earth', 'Blue Planet', 'Frozen Planet', 'Life'] }
];
const NEW = ['Paddington 2', 'The King of Kings', 'Ordinary Angels', 'Unsung Hero', 'His Only Son', 'Big Dreams', 'Bonhoeffer', 'Jesus Revolution', 'The Biggest Little Farm', 'Wish', 'Moana', 'Encanto', 'Inside Out', 'Elf', 'Nanny McPhee', 'Hidden Figures', 'Queen of Katwe', 'The Chosen', 'Show Me the Father', 'Lord of the Streets', 'Running the Bases', 'Apollo 11', 'Our Planet', 'Jane', 'Little Women', 'Fiddler on the Roof', 'Matilda', 'Holes', 'Enchanted', 'Coco', 'Soul', 'Luca', 'Breakthrough', 'Overcomer', 'Courageous', '42', 'Invincible', 'Secretariat', 'The Rookie', 'Hugo'];

// the starter list (the display copies) is kept for manager mode's STOCK STARTER SHELVES
const STARTER = [];
GENRES.forEach((g) => g.titles.forEach((t) => STARTER.push({ title: t.replace(/’/g, "'"), genre: g.name })));
NEW.forEach((t) => { const tt = t.replace(/’/g, "'"); if (!STARTER.some((x) => x.title === tt)) STARTER.push({ title: tt }); });
GENRES.forEach((g) => { g.titles = CAT.filter((t) => t.genre === g.name); g.real = true; });
{
  const real = CAT.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || String(b.approved_at).localeCompare(String(a.approved_at)));
  NEW.splice(0, NEW.length, ...real.slice(0, 100));
}

// ---------- renderer ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const pr = () => Math.min(window.devicePixelRatio || 1, 1920 / window.innerWidth);
renderer.setPixelRatio(pr());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080c);
// keep the same sideways view on a tall phone screen by widening the lens
const baseFov = () => { const a = window.innerWidth / window.innerHeight; return a >= 1.2 ? 62 : Math.min(96, 2 * Math.atan(Math.tan(31 * Math.PI / 180) * 1.2 / a) * 180 / Math.PI); };
const camera = new THREE.PerspectiveCamera(baseFov(), window.innerWidth / window.innerHeight, 0.02, 45);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- layout (meters) ----------
const N = GENRES.length, AISLE_W = 2.4, HALF_A = AISLE_W / 2, UNIT_D = 0.47, PITCH_X = AISLE_W + UNIT_D * 2;
const aisleX = (i) => (i - (N - 1) / 2) * PITCH_X;
const HALFW = aisleX(N - 1) + HALF_A + UNIT_D + 0.03;
const Z0 = 0, Z1 = -6, BACKWALL = -6.6, FRONT = 5.4, CEIL = 3.0, LANE_Z = 3.0;
const TAPE_H = 0.19, TAPE_D = 0.105, TAPE_W = 0.03;
const ROWS = 6, ROW0 = 0.24, ROW_STEP = 0.29;
// tapes stop short of the end panels at both ends of every shelf
const SEG_START = Z0 - 0.07, SEG_STEP = 1.96, SEG_LEN = 1.92, PER_SEG = Math.floor(SEG_LEN / TAPE_W), TAPE_PITCH = SEG_LEN / PER_SEG;
const SEGS = 3;
const COL_W = 34, CAN_W = COL_W * PER_SEG, CAN_H = Math.round(COL_W * TAPE_H / TAPE_W);
const COUNTER = { x: 7.3, z: 4.6 }, PC = { x: 6.8, y: 1.25, z: 4.488 };

// ---------- baked lighting ----------
const LIGHTS = [];
const addDown = (x, z, i = 2.1) => LIGHTS.push({ p: new THREE.Vector3(x, CEIL - 0.05, z), c: new THREE.Color(1.0, 0.95, 0.86), i, kind: 'down' });
const addPoint = (x, y, z, color, i) => LIGHTS.push({ p: new THREE.Vector3(x, y, z), c: new THREE.Color(color), i, kind: 'point' });
for (let i = 0; i < N; i++) [-1.0, -3.0, -5.0].forEach((z) => addDown(aisleX(i), z));
for (let x = -8.6; x <= 9; x += 3.45) addDown(x, LANE_Z + 0.2);
addDown(-8.8, 0.9); addDown(-8.8, 4.0); addDown(7.0, 3.6);
const tv3 = new THREE.Vector3();
function lightAt(p, n) {
  let r = 0.16 + 0.04 * n.y, g = 0.155 + 0.04 * n.y, b = 0.15 + 0.04 * n.y;
  for (const L of LIGHTS) {
    tv3.subVectors(L.p, p);
    const d2 = tv3.lengthSq(); if (d2 > 64) continue;
    const d = Math.sqrt(d2), ndl = n.dot(tv3) / d;
    if (ndl <= 0) continue;
    const e = L.kind === 'down' ? L.i * ndl * Math.max(0, tv3.y / d) / (1 + d2 * 0.45) : L.i * ndl / (1 + d2 * 2.5);
    r += L.c.r * e; g += L.c.g * e; b += L.c.b * e;
  }
  let ao = 1;
  if (p.z < Z0 && p.z > Z1) {
    const rel = Math.abs(((p.x - aisleX(0)) % PITCH_X + PITCH_X) % PITCH_X - PITCH_X / 2);
    // rel: distance from the middle of a gondola (0) to an aisle center (PITCH_X/2)
    const intoUnit = UNIT_D - rel;
    if (intoUnit > 0 && p.y > 0.02 && p.y < 2.3) ao *= 1 - 0.55 * Math.min(1, intoUnit / UNIT_D);
  }
  if (p.y < 0.02) { const wall = Math.min(HALFW - Math.abs(p.x), FRONT - p.z, p.z - BACKWALL); ao *= 0.62 + 0.38 * Math.min(1, Math.max(0, wall) / 0.7); }
  const tone = (v) => 1 - Math.exp(-v * ao * 1.35);
  return [tone(r), tone(g), tone(b)];
}
const nrm = new THREE.Vector3(), pw = new THREE.Vector3();
function bakeGeom(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    pw.fromBufferAttribute(pos, i); nrm.fromBufferAttribute(nor, i);
    const c = lightAt(pw, nrm); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---------- static geometry, merged per region + material ----------
const lit = (opts) => new THREE.MeshBasicMaterial({ ...opts, vertexColors: true });
const segs = (len, per = 0.3, max = 40) => Math.max(1, Math.min(max, Math.ceil(len / per)));
const buckets = new Map();
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), ONE = new THREE.Vector3(1, 1, 1);
function put(geom, mat, region, pos, rot, parent) {
  tmpE.set(rot ? rot[0] : 0, rot ? rot[1] : 0, 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
  tmpM.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), tmpQ, ONE);
  if (parent) tmpM.premultiply(parent);
  geom.applyMatrix4(tmpM);
  const key = region + '|' + mat.uuid;
  if (!buckets.has(key)) buckets.set(key, { mat, geoms: [] });
  buckets.get(key).geoms.push(geom);
  return geom;
}
const sBox = (w, h, d, mat, region, x, y, z, rot, parent) => put(new THREE.BoxGeometry(w, h, d, segs(w), segs(h), segs(d)), mat, region, [x, y, z], rot, parent);
const sPlane = (w, h, mat, region, x, y, z, ry = 0, rx = 0, sw, sh, parent) => put(new THREE.PlaneGeometry(w, h, sw ?? segs(w), sh ?? segs(h)), mat, region, [x, y, z], [rx, ry], parent);
function flush() {
  for (const { mat, geoms } of buckets.values()) {
    if (mat.vertexColors) geoms.forEach(bakeGeom);
    const merged = mergeGeometries(geoms, false);
    merged.computeBoundingSphere();
    scene.add(new THREE.Mesh(merged, mat));
    geoms.forEach((g) => g.dispose());
  }
  buckets.clear();
}

function canvasTexture(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

// ---------- materials ----------
function woodCanvas() {
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#c49a68'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(${110 + rand() * 40},${70 + rand() * 20},30,${0.12 + rand() * 0.18})`; x.lineWidth = 1 + rand() * 2; x.beginPath(); const y = rand() * 256; x.moveTo(0, y); x.bezierCurveTo(85, y + rand() * 8 - 4, 170, y + rand() * 8 - 4, 256, y + rand() * 6 - 3); x.stroke(); }
  return c;
}
const woodMat = lit({ map: canvasTexture(woodCanvas(), [4, 1]) });
const shelfMetal = lit({ color: 0xcfcdc6 });
const kickMat = lit({ color: 0x45474e });
const tapeBody = lit({ color: 0x18181c });
const wallMat = lit({ color: 0xd6cdbb });
function carpetCanvas() {
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#4a5163'; x.fillRect(0, 0, 256, 256);
  const tones = ['#3f4657', '#565e71', '#444b5c', '#5d6577', '#3a4050'];
  for (let i = 0; i < 9000; i++) { x.fillStyle = tones[Math.floor(rand() * tones.length)]; x.fillRect(rand() * 256, rand() * 256, 1 + rand() * 1.5, 1 + rand() * 1.5); }
  for (let y = 0; y < 256; y += 4) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(0, y, 256, 1); }
  return c;
}
const DEPTH = FRONT - BACKWALL, MIDZ = (FRONT + BACKWALL) / 2;
const floorMat = lit({ map: canvasTexture(carpetCanvas(), [HALFW * 2 / 0.6, DEPTH / 0.6]) });
function tileCanvas() {
  const c = makeCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#e4dfcf'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(80,70,50,${rand() * 0.22})`; x.fillRect(rand() * 128, rand() * 128, 1 + rand(), 1 + rand()); }
  x.fillStyle = '#a49e90'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 0, 3, 128);
  return c;
}
const ceilMat = lit({ map: canvasTexture(tileCanvas(), [HALFW * 2 / 0.6, DEPTH / 0.6]) });

// ---------- room ----------
sPlane(HALFW * 2, DEPTH, floorMat, 'room', 0, 0, MIDZ, 0, -Math.PI / 2, 60, 36);
sPlane(HALFW * 2, DEPTH, ceilMat, 'room', 0, CEIL, MIDZ, 0, Math.PI / 2, 60, 36);
sPlane(DEPTH, CEIL, wallMat, 'room', -HALFW, CEIL / 2, MIDZ, Math.PI / 2);
sPlane(DEPTH, CEIL, wallMat, 'room', HALFW, CEIL / 2, MIDZ, -Math.PI / 2);
sPlane(HALFW * 2, CEIL, wallMat, 'room', 0, CEIL / 2, FRONT, Math.PI);
sPlane(HALFW * 2, CEIL, wallMat, 'room', 0, CEIL / 2, BACKWALL);

// ---------- spines ----------
function buildPool(titles, count, inOrder) {
  const pool = [];
  if (!titles.length) return pool;
  for (let p = 0; p < count; p++) {
    const c = makeCanvas(CAN_W, CAN_H), x = c.getContext('2d');
    const tapes = [];
    for (let i = 0; i < PER_SEG; i++) {
      const idx = inOrder ? p * PER_SEG + i : p * 11 + i + Math.floor(rand() * 2);
      if (inOrder && idx >= titles.length) { tapes.push(null); continue; }
      const t = makeTape(titles[idx % titles.length]);
      tapes.push(t); drawSpine(x, i * COL_W, COL_W, CAN_H, t);
      x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(i * COL_W, 0, 2, CAN_H);
    }
    pool.push({ mat: lit({ map: canvasTexture(c) }), tapes });
  }
  return pool;
}
const pickRoot = new THREE.Group();
const pickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const planeIndex = new Map();
function shelfFace(ai, side) {
  const L = LAYOUT[ai];
  const region = 'a' + ai;
  const f = aisleX(ai) + side * HALF_A;                 // shelf front
  const len = Z0 - Z1, cz = (Z0 + Z1) / 2, ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const inner = len - 0.11;   // stops inside the end panels so nothing pokes through
  sBox(UNIT_D - 0.01, 0.16, inner, kickMat, region, f + side * UNIT_D / 2, 0.08, cz);
  sBox(UNIT_D + 0.02, 2.3, 0.05, shelfMetal, region, f + side * (UNIT_D / 2 - 0.01), 1.15, Z0 - 0.025);
  sBox(UNIT_D + 0.02, 2.3, 0.05, shelfMetal, region, f + side * (UNIT_D / 2 - 0.01), 1.15, Z1 + 0.025);
  sBox(0.02, 2.3, inner, shelfMetal, region, f + side * (UNIT_D - 0.01), 1.15, cz);
  sBox(UNIT_D + 0.02, 0.04, len + 0.02, shelfMetal, region, f + side * UNIT_D / 2, 2.32, cz);
  for (let r = 0; r < ROWS; r++) {
    const y = ROW0 + r * ROW_STEP;
    sBox(UNIT_D - 0.01, 0.022, inner, woodMat, region, f + side * UNIT_D / 2, y - 0.011, cz);
    sBox(0.012, 0.035, inner, woodMat, region, f + side * 0.006, y - 0.004, cz);
    for (let k = 0; k < SEGS; k++) {
      const zc = SEG_START - SEG_LEN / 2 - k * SEG_STEP;
      const si = segIndex(side, r, k);
      const tapes = L.segTapes[si];
      if (!tapes || !tapes.some(Boolean)) continue;               // past the end of the alphabet: bare shelf
      if (L.face) faceOut(L, ai, side, r, k, f, y, zc);
      else {
        sBox(TAPE_D, TAPE_H, SEG_LEN, tapeBody, region, f + side * (0.012 + TAPE_D / 2), y + TAPE_H / 2, zc);
        sPlane(SEG_LEN, TAPE_H, L.mats[si], region, f + side * 0.0115, y + TAPE_H / 2, zc, ry, 0, 10, 1);
      }
      const entry = { tapes };
      const pk = new THREE.Mesh(new THREE.PlaneGeometry(SEG_LEN, TAPE_H), pickMat);
      pk.position.set(f + side * 0.0115, y + TAPE_H / 2, zc); pk.rotation.y = ry;
      pk.userData = { kind: 'spine', ai, side, r, k, y, tapes: entry.tapes };
      pickRoot.add(pk); planeIndex.set(`${ai}:${side}:${r}:${k}`, pk);
    }
  }
  // genre name along the top fascia
  const g = GENRES[ai];
  const c = makeCanvas(1024, 64), x = c.getContext('2d');
  x.fillStyle = g.color; x.fillRect(0, 0, 1024, 64);
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, 0, 1024, 6);
  x.font = 'bold 32px "Helvetica Neue", Arial, sans-serif'; x.textBaseline = 'middle'; x.fillStyle = '#f6f1e6';
  const w = x.measureText(g.name).width + 70;
  for (let px = 20; px < 1024; px += w) x.fillText(g.name, px, 34);
  sBox(0.05, 0.26, len, shelfMetal, region, f + side * 0.025, 2.2, cz);
  sPlane(len, 0.26, new THREE.MeshBasicMaterial({ map: canvasTexture(c) }), region, f - side * 0.002, 2.2, cz, ry, 0, 1, 1);
}
// real aisles: titles in A-Z order across the shelves, repeating like extra copies when there's room
// ---------- shelf layout: every movie exactly once, A to Z ----------
// Reading order: the left side first, top shelf to bottom, entrance to back; then the right side.
// Small aisles show covers face-out, spaced to fill the aisle; very big ones fall back to spines.
const SEG_COUNT = ROWS * SEGS * 2;
function segIndex(side, r, k) { return (side < 0 ? 0 : ROWS * SEGS) + (ROWS - 1 - r) * SEGS + k; }
const alphaKey = (t) => String(t).replace(/^(the|a|an)\s+/i, '').toLowerCase();
const COVER_W = 0.127, FO_W = 48, FO_H = 72, FO_COLS = 32;
const LAYOUT = GENRES.map((g, ai) => {
  const titles = g.titles.slice().sort((a, b) => alphaKey(a.title).localeCompare(alphaKey(b.title)));
  const n = titles.length, perFace = Math.ceil(n / SEG_COUNT);
  const L = { face: n > 0 && perFace <= 14, n, segTapes: [] };
  L.per = L.face ? Math.max(1, perFace) : PER_SEG;
  L.pitch = L.face ? SEG_LEN / L.per : TAPE_PITCH;
  const tapes = titles.map((t) => makeTape(t));
  for (let si = 0; si < SEG_COUNT; si++) {
    const side = si < ROWS * SEGS ? -1 : 1;
    const arr = [];
    for (let j = 0; j < L.per; j++) arr[side < 0 ? j : L.per - 1 - j] = tapes[si * L.per + j] || null;   // canvas order along the plane
    L.segTapes.push(arr);
  }
  if (L.face) {
    // one cover atlas per aisle; covers start as painted boxes and swap to real art as it downloads
    const rows = Math.max(1, Math.ceil(n / FO_COLS));
    L.atlas = makeCanvas(FO_COLS * FO_W, rows * FO_H);
    L.actx = L.atlas.getContext('2d');
    tapes.forEach((t, i) => { t._cell = i; drawCell(L, t); });
    L.tex = canvasTexture(L.atlas);
    L.mat = new THREE.MeshBasicMaterial({ map: L.tex, color: 0xe6e1d8 });
    L.quads = [];
    L.tapes = tapes;
  } else {
    const pool = buildPool(titles, Math.ceil(n / PER_SEG), true);
    L.mats = []; pool.forEach((p, si) => { L.mats[si] = p.mat; L.segTapes[si] = p.tapes; });
  }
  return L;
});
function drawCell(L, t, im) {
  const x = (t._cell % FO_COLS) * FO_W, y = Math.floor(t._cell / FO_COLS) * FO_H;
  L.actx.save(); L.actx.translate(x, y);
  if (im) { L.actx.fillStyle = '#111'; L.actx.fillRect(0, 0, FO_W, FO_H); drawFill(L.actx, im, 0, 0, FO_W, FO_H); }
  else drawCover(L.actx, FO_W, FO_H, t);
  L.actx.restore();
}
function faceOut(L, ai, side, r, k, f, y, zc) {
  const tapes = L.segTapes[segIndex(side, r, k)];
  for (let i = 0; i < L.per; i++) {
    const t = tapes[i]; if (!t) continue;
    const j = side < 0 ? i : L.per - 1 - i;
    const z = SEG_START - k * SEG_STEP - (j + 0.5) * L.pitch;
    L.quads.push({ t, x: f + side * 0.035, y: y + TAPE_H / 2 + 0.004, z, side });
  }
}
GENRES.forEach((g, i) => { shelfFace(i, -1); shelfFace(i, 1); });
// face-out covers: one merged mesh per aisle, leaning slightly back like a real rack
LAYOUT.forEach((L) => {
  if (!L.face || !L.quads.length) return;
  const geos = L.quads.map((q) => {
    const g = new THREE.PlaneGeometry(COVER_W, TAPE_H);
    const u0 = (q.t._cell % FO_COLS) / FO_COLS, v1 = 1 - Math.floor(q.t._cell / FO_COLS) * FO_H / L.atlas.height, v0 = v1 - FO_H / L.atlas.height;
    const uv = g.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u0 + 1 / FO_COLS, v1); uv.setXY(2, u0, v0); uv.setXY(3, u0 + 1 / FO_COLS, v0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.06));
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(q.side < 0 ? Math.PI / 2 : -Math.PI / 2));
    g.translate(q.x, q.y, q.z);
    return g;
  });
  scene.add(new THREE.Mesh(mergeGeometries(geos), L.mat));
});
// real cover art, nearest aisle first
(async () => {
  const order = [2, 1, 3, 0, 4, 5].filter((a) => LAYOUT[a] && LAYOUT[a].face);
  let pending = false;
  const flush = () => { pending = false; LAYOUT.forEach((L) => { if (L.face && L.dirty) { L.tex.needsUpdate = true; L.dirty = false; } }); if (window.__redraw) window.__redraw(); };
  for (const a of order) {
    const L = LAYOUT[a], list = L.tapes.filter((t) => t.poster_path);
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < list.length) {
        const t = list[i++];
        const im = await loadImg(TMDB_IMG + 'w92' + t.poster_path, 12000);
        if (im) { if (!t.img) t.img = im; drawCell(L, t, im); L.dirty = true; if (!pending) { pending = true; setTimeout(flush, 400); } }
      }
    }));
  }
})();

// ---------- glow + neon (unlit, few draw calls) ----------
function glowTexture() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();
function glow(w, h, color, opacity, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); m.renderOrder = 2; scene.add(m); return m;
}
function neon(text, sub, color, w, h, x, y, z, ry = 0, lightI = 0.8) {
  const c = makeCanvas(1024, Math.round(1024 * h / w)), g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const draw = (blur, fill) => {
    g.shadowColor = color; g.shadowBlur = blur; g.fillStyle = fill;
    fitFont(g, '900 {s}px "Arial Black", Impact, sans-serif', text, c.width * 0.9, Math.round(c.height * (sub ? 0.5 : 0.7)));
    g.fillText(text, c.width / 2, c.height * (sub ? 0.38 : 0.5));
  };
  draw(40, color); draw(18, color); draw(4, '#fff6f0');
  if (sub) { g.shadowColor = color; g.shadowBlur = 12; g.fillStyle = '#ffffff'; fitFont(g, 'bold {s}px Arial, sans-serif', sub, c.width * 0.9, Math.round(c.height * 0.26)); g.fillText(sub, c.width / 2, c.height * 0.8); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false }));
  m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; scene.add(m);
  const nx = Math.sin(ry) * 0.01, nz = Math.cos(ry) * 0.01;
  glow(w * 1.5, h * 2.4, new THREE.Color(color), 0.32, x + nx, y, z + nz, ry);
  addPoint(x + Math.sin(ry) * 0.4, y, z + Math.cos(ry) * 0.4, color, lightI);
}
function lightbox(text, sub, accent, w, h, x, y, z, ry = 0, dark = false) {
  const c = makeCanvas(1024, Math.round(1024 * h / w)), g = c.getContext('2d');
  const W = c.width, H = c.height;
  const grad = g.createLinearGradient(0, 0, 0, H);
  if (dark) { grad.addColorStop(0, '#24314f'); grad.addColorStop(1, '#1a243c'); } else { grad.addColorStop(0, '#fbf8f1'); grad.addColorStop(1, '#ece6d9'); }
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = accent; g.fillRect(0, 0, W, Math.round(H * (sub ? 0.3 : 0.12)));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (sub) {
    g.fillStyle = '#f6f1e6'; fitFont(g, 'bold {s}px "Helvetica Neue", Arial, sans-serif', text, W * 0.9, Math.round(H * 0.2));
    g.fillText(text, W / 2, H * 0.155);
    g.fillStyle = dark ? '#f6f1e6' : '#1f2433'; fitFont(g, 'bold {s}px "Helvetica Neue", Arial, sans-serif', sub, W * 0.88, Math.round(H * 0.4));
    g.fillText(sub, W / 2, H * 0.64);
  } else {
    g.fillStyle = dark ? '#f6f1e6' : '#1f2433'; fitFont(g, 'bold {s}px "Helvetica Neue", Arial, sans-serif', text, W * 0.88, Math.round(H * 0.56));
    g.fillText(text, W / 2, H * 0.56);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTexture(c) }));
  m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; scene.add(m);
  glow(w * 1.25, h * 1.6, new THREE.Color(dark ? '#7f95c8' : '#fff4e0'), 0.1, x + Math.sin(ry) * 0.01, y, z + Math.cos(ry) * 0.01, ry);
  addPoint(x + Math.sin(ry) * 0.4, y, z + Math.cos(ry) * 0.4, dark ? '#9fb0d8' : '#fff2dc', 0.35);
}
// hanging aisle signs
GENRES.forEach((g, i) => {
  const x = aisleX(i);
  sBox(1.9, 0.62, 0.08, lit({ color: 0x3a3d45 }), 'front', x, 2.55, Z0 + 0.25);
  sBox(0.02, 0.4, 0.02, shelfMetal, 'front', x - 0.7, 2.86, Z0 + 0.25);
  sBox(0.02, 0.4, 0.02, shelfMetal, 'front', x + 0.7, 2.86, Z0 + 0.25);
  lightbox(g.name, null, g.color, 1.8, 0.54, x, 2.55, Z0 + 0.295, 0);
});
sBox(0.06, 0.62, 3.5, lit({ color: 0x3a3d45 }), 'front', -HALFW + 0.03, 2.5, 2.55);
lightbox('NEW RELEASES', null, '#c8553d', 3.4, 0.54, -HALFW + 0.065, 2.5, 2.55, Math.PI / 2);
sBox(0.06, 0.66, 2.9, lit({ color: 0x3a3d45 }), 'front', HALFW - 0.03, 2.4, 1.8);
lightbox('MackeyTV VIDEO', null, '#c8553d', 2.8, 0.58, HALFW - 0.065, 2.4, 1.8, -Math.PI / 2, true);

// ---------- face-out walls (covers in one atlas, one draw call each) ----------
const ATLAS_COLS = 16, ATLAS_ROWS = 8, CELL_W = 128, CELL_H = 232;
const coverCache = new Map();
function coverTexture(t) {
  if (coverCache.has(t.title)) return coverCache.get(t.title);
  const c = makeCanvas(160, 288); drawCover(c.getContext('2d'), 160, 288, t);
  const tex = canvasTexture(c); coverCache.set(t.title, tex); return tex;
}
const walls = [];
function faceOutWall(name, titles, cols, rows, pos, ry) {
  const grp = new THREE.Group(); grp.position.set(pos[0], 0, pos[2]); grp.rotation.y = ry; grp.updateMatrixWorld(true);
  const M = grp.matrixWorld;
  const sx = 0.18, sy = 0.34, y0 = 0.62, width = cols * sx;
  const atlas = makeCanvas(CELL_W * ATLAS_COLS, CELL_H * ATLAS_ROWS), ax = atlas.getContext('2d');
  const coverMat = lit({ map: canvasTexture(atlas) });
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * sy;
    sBox(width + 0.1, 0.02, 0.09, woodMat, 'wall', 0, y - 0.01, 0.045, null, M);
    sBox(width + 0.1, 0.04, 0.012, woodMat, 'wall', 0, y + 0.01, 0.09, null, M);
    cells.push([]);
    for (let c = 0; c < cols && titles.length; c++) {
      const idx = r * cols + c;
      const t = makeTape(titles[idx % titles.length]);
      const lx = -width / 2 + sx / 2 + c * sx;
      sBox(0.105, 0.19, 0.03, tapeBody, 'wall', lx, y + 0.095, 0.04, [-0.1, 0], M);
      const ac = idx % ATLAS_COLS, ar = Math.floor(idx / ATLAS_COLS);
      ax.save(); ax.translate(ac * CELL_W, ar * CELL_H); drawCover(ax, CELL_W, CELL_H, t); ax.restore();
      const pg = new THREE.PlaneGeometry(0.103, 0.188);
      const uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (ac + uv.getX(i)) / ATLAS_COLS, 1 - (ar + 1 - uv.getY(i)) / ATLAS_ROWS);
      // cover sits on the front of the tilted case
      const tilt = new THREE.Matrix4().makeRotationX(-0.1);
      const off = new THREE.Matrix4().makeTranslation(lx, y + 0.095, 0.04);
      pg.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.0155)).applyMatrix4(tilt).applyMatrix4(off);
      put(pg, coverMat, 'wall', [0, 0, 0], null, M);
      cells[r].push({ tape: t, lx, ly: y + 0.095 });
    }
  }
  const pick = new THREE.Mesh(new THREE.PlaneGeometry(width, rows * sy), pickMat);
  pick.position.set(0, y0 - 0.05 + rows * sy / 2, 0.08);
  if (titles.length) { grp.add(pick); pick.userData = { kind: 'wall', wall: walls.length }; }
  pickRoot.add(grp);
  const w = { name, grp, cells, rows, cols, sx, sy, y0, width, ry };
  walls.push(w);
  return w;
}
const NR = faceOutWall('NEW RELEASES', NEW, 20, 5, [-HALFW + 0.01, 0, 2.55], Math.PI / 2);

// ---------- counter + store computer (right front corner) ----------
const beige = lit({ color: 0xe4dac2 });
sBox(2.2, 1.0, 0.7, lit({ color: 0x6a4428 }), 'front', COUNTER.x, 0.5, COUNTER.z);
sBox(2.32, 0.04, 0.8, lit({ color: 0xa8774c }), 'front', COUNTER.x, 1.02, COUNTER.z);
sBox(0.44, 0.36, 0.42, beige, 'front', PC.x, 1.24, PC.z + 0.212);
sBox(0.34, 0.12, 0.3, beige, 'front', PC.x, 1.1, PC.z + 0.212);
sBox(0.46, 0.025, 0.16, beige, 'front', PC.x, 1.055, PC.z - 0.14);
function screenCanvas(bg, fg, lines, font) {
  const c = makeCanvas(384, 288), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 384, 288);
  g.fillStyle = fg; g.shadowColor = fg; g.shadowBlur = 6; g.font = font;
  lines.forEach((l, i) => g.fillText(l, 22, 48 + i * 34));
  g.shadowBlur = 0; for (let y = 0; y < 288; y += 3) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 384, 1); }
  return c;
}
const crt = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshBasicMaterial({ map: canvasTexture(screenCanvas('#0d1208', '#ffb000', ['MACKEYTV VIDEO', 'INVENTORY SYSTEM v1.0', '', 'SEARCH > _'], '21px "Courier New", monospace')) }));
crt.position.set(PC.x, PC.y, PC.z); crt.rotation.y = Math.PI; scene.add(crt);
crt.userData = { kind: 'computer' };
glow(0.6, 0.5, new THREE.Color('#ffb000'), 0.18, PC.x, PC.y, PC.z - 0.003, Math.PI);
addPoint(PC.x, PC.y, PC.z - 0.5, '#ffb000', 0.25);

// ---------- backlit one-sheet posters on the back wall of every aisle ----------
// Original illustrated art for the prototype. In the real app these come from TMDB poster images.
function drawPoster(ctx, W, H, t, accent, im) {
  const st = t.style;
  im = im || t.img;
  if (im) {
    ctx.fillStyle = '#0d0e12'; ctx.fillRect(0, 0, W, H); drawFill(ctx, im, 0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(W * 0.08, H * 0.94, W * 0.12, H * 0.035);
    ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(W * 0.045)}px Arial, sans-serif`; ctx.fillText(t.rating, W * 0.14, H * 0.958);
    return;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, st.bg); sky.addColorStop(0.62, accent); sky.addColorStop(1, '#0d0e12');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // big soft sun/moon and layered hills: abstract key art
  const sun = ctx.createRadialGradient(W * 0.62, H * 0.36, 4, W * 0.62, H * 0.36, W * 0.34);
  sun.addColorStop(0, 'rgba(255,240,210,0.95)'); sun.addColorStop(0.45, 'rgba(255,220,170,0.45)'); sun.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  const hills = ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.65)'];
  hills.forEach((col, i) => {
    ctx.fillStyle = col; ctx.beginPath();
    const base = H * (0.55 + i * 0.07);
    ctx.moveTo(0, base);
    for (let x = 0; x <= W; x += W / 8) ctx.lineTo(x, base - Math.sin((x / W) * Math.PI * (1.5 + i) + i) * H * 0.04 - rand() * H * 0.02);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  });
  // tagline + title + billing block
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `bold ${Math.round(W * 0.04)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('NOW ON VIDEO', W / 2, H * 0.06);
  const words = t.title.toUpperCase().split(' '), lines = []; let cur = '';
  ctx.font = `bold ${Math.round(W * 0.13)}px Georgia, serif`;
  for (const wd of words) { const test = cur ? cur + ' ' + wd : wd; if (ctx.measureText(test).width > W * 0.86 && cur) { lines.push(cur); cur = wd; } else cur = test; }
  lines.push(cur);
  const size = Math.min(Math.round(W * 0.13), Math.round(H * 0.2 / lines.length));
  ctx.fillStyle = '#fbf6ea'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12;
  lines.forEach((ln, i) => { fitFont(ctx, 'bold {s}px Georgia, serif', ln, W * 0.88, size); ctx.fillText(ln, W / 2, H * 0.75 + i * size * 1.05 - (lines.length - 1) * size * 0.5); });
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 3; i++) { const lw = W * (0.7 - i * 0.12); ctx.fillRect((W - lw) / 2, H * (0.88 + i * 0.022), lw, H * 0.008); }
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(W * 0.08, H * 0.94, W * 0.12, H * 0.035);
  ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(W * 0.045)}px Arial, sans-serif`; ctx.fillText(t.rating, W * 0.14, H * 0.958);
}
const posterFrame = lit({ color: 0x2b2d34 });
const POSTERS = [];
function poster(t, accent, x, y, z, ai, k) {
  const W = 384, H = 576, PW = 0.68, PH = PW * 40 / 27;
  const c = makeCanvas(W, H); drawPoster(c.getContext('2d'), W, H, t, accent);
  if (!t.demo) hiResPoster(t, (im) => { drawPoster(c.getContext('2d'), W, H, t, accent, im); m.material.map.needsUpdate = true; if (window.__redraw) window.__redraw(); });
  sBox(PW + 0.1, PH + 0.1, 0.06, posterFrame, 'back', x, y, z + 0.03);
  sBox(PW + 0.03, PH + 0.03, 0.065, lit({ color: 0xb9b6ad }), 'back', x, y, z + 0.032);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: canvasTexture(c) }));
  m.position.set(x, y, z + 0.066); scene.add(m);
  m.userData = { kind: 'poster', ai, k };
  POSTERS.push({ ai, k, tape: t, x, y, z: z + 0.066, w: PW, h: PH, mesh: m });
  glow(PW * 1.7, PH * 1.35, new THREE.Color('#fff3df'), 0.1, x, y, z + 0.068);
  addPoint(x, y, z + 0.5, '#fff1da', 0.35);
}
GENRES.forEach((g, i) => {
  [0, 1].forEach((k) => {
    const src = g.titles.length ? g.titles : CAT;     // an empty aisle borrows a poster from the rest of the store
    if (!src.length) return;
    const t = makeTape(src[(k * 3 + i) % src.length]);
    poster(t, g.color, aisleX(i) + (k ? 0.52 : -0.52), 1.5, BACKWALL, i, k);
  });
});
const CAPS = [];
for (let gi = 0; gi < N - 1; gi++) {
  const gx = (aisleX(gi) + aisleX(gi + 1)) / 2;
  sBox(0.98, 2.3, 0.02, shelfMetal, 'back', gx, 1.15, Z0 + 0.01);   // one solid endcap face over the two end panels
  if (!NEW.length) continue;
  const t = makeTape(NEW[(gi * 7 + 3) % NEW.length]);
  poster(t, '#c8553d', gx, 1.4, Z0 + 0.02, -1, gi);
  const rec = POSTERS.pop(); rec.mesh.userData = { kind: 'cap', gi }; rec.gi = gi; CAPS.push(rec);
}

// ---------- screening room: where Play takes you ----------
const TH = { z0: -33, z1: -47, hw: 4.5, h: 5 };
const thMid = (TH.z0 + TH.z1) / 2, thLen = TH.z0 - TH.z1;
const SCREEN = { y: 2.7, z: TH.z1 + 0.18, w: 6.2, h: 2.6 };
function theaterCarpet() {
  const c = makeCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#3a1519'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${rand() * 0.25})`; x.fillRect(rand() * 128, rand() * 128, 1.5, 1.5); }
  x.strokeStyle = 'rgba(201,154,74,0.55)'; x.lineWidth = 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const cx = 32 + i * 64, cy = 32 + j * 64; x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 12, cy); x.lineTo(cx, cy + 12); x.lineTo(cx - 12, cy); x.closePath(); x.stroke(); }
  return c;
}
function curtainCanvas() {
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  for (let i = 0; i < 256; i++) { const v = 0.55 + 0.45 * Math.sin(i / 256 * Math.PI * 12); x.fillStyle = `rgb(${Math.round(120 * v + 20)},${Math.round(18 * v + 6)},${Math.round(24 * v + 8)})`; x.fillRect(i, 0, 1, 256); }
  return c;
}
const thWall = lit({ color: 0x2e2224 }), thCeil = lit({ color: 0x1c1618 }), velvet = lit({ color: 0x8a2229 }), thStep = lit({ color: 0x2a1a1c });
const thCarpet = lit({ map: canvasTexture(theaterCarpet(), [TH.hw * 2 / 0.7, thLen / 0.7]) });
const curtainMat = lit({ map: canvasTexture(curtainCanvas(), [2, 1]) });
sPlane(TH.hw * 2, thLen, thCarpet, 'th', 0, 0, thMid, 0, -Math.PI / 2, 24, 30);
sPlane(TH.hw * 2, thLen, thCeil, 'th', 0, TH.h, thMid, 0, Math.PI / 2, 20, 30);
sPlane(thLen, TH.h, thWall, 'th', -TH.hw, TH.h / 2, thMid, Math.PI / 2);
sPlane(thLen, TH.h, thWall, 'th', TH.hw, TH.h / 2, thMid, -Math.PI / 2);
sPlane(TH.hw * 2, TH.h, thWall, 'th', 0, TH.h / 2, TH.z0, Math.PI);
sPlane(TH.hw * 2, TH.h, thWall, 'th', 0, TH.h / 2, TH.z1);
// stadium seating: six rows climbing toward the booth
for (let r = 0; r < 6; r++) {
  const z = TH.z1 + 3.4 + r * 1.15, rise = r * 0.2;
  if (rise > 0) sBox(TH.hw * 2, rise, 1.15, thStep, 'th', 0, rise / 2, z - 0.1);
  for (let sIdx = 0; sIdx < 10; sIdx++) {
    const x = (sIdx < 5 ? -1 : 1) * (0.75 + (sIdx % 5) * 0.62);
    sBox(0.52, 0.14, 0.5, velvet, 'th', x, rise + 0.46, z);
    sBox(0.52, 0.62, 0.09, velvet, 'th', x, rise + 0.82, z + 0.26, [0.18, 0]);
    sBox(0.06, 0.28, 0.5, thStep, 'th', x + 0.31, rise + 0.55, z);
  }
}
// booth riser the projector sits on
sBox(TH.hw * 2, 1.4, 2.2, thStep, 'th', 0, 0.7, TH.z0 - 1.1);
// screen, masking and curtains
sBox(SCREEN.w + 0.6, SCREEN.h + 0.5, 0.08, lit({ color: 0x0c0c0e }), 'th', 0, SCREEN.y, TH.z1 + 0.06);
sPlane(1.5, 4.6, curtainMat, 'th', -(SCREEN.w / 2 + 0.9), 2.35, TH.z1 + 0.2, 0, 0, 8, 6);
sPlane(1.5, 4.6, curtainMat, 'th', SCREEN.w / 2 + 0.9, 2.35, TH.z1 + 0.2, 0, 0, 8, 6);
sPlane(SCREEN.w + 3.4, 0.6, curtainMat, 'th', 0, 4.4, TH.z1 + 0.22, 0, 0, 10, 2);
// wall sconces
for (let k = 0; k < 4; k++) {
  const z = TH.z0 - 2.5 - k * 2.9;
  [-1, 1].forEach((sd) => { glow(0.5, 0.7, new THREE.Color('#ffb36b'), 0.35, sd * (TH.hw - 0.02), 2.6, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2); addPoint(sd * (TH.hw - 0.4), 2.6, z, '#ffb36b', 0.35); });
}
addPoint(0, SCREEN.y, SCREEN.z + 2.5, '#c9d4ff', 0.6);
// the screen itself (texture redrawn during the show)
const screenCanvas2 = makeCanvas(1024, 430);
const screenTex = canvasTexture(screenCanvas2);
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: screenTex }));
screenMesh.position.set(0, SCREEN.y, SCREEN.z); scene.add(screenMesh);
// the projector
const PROJ = new THREE.Group();
const pGreen = new THREE.MeshBasicMaterial({ color: 0x3e4a42 }), pDark = new THREE.MeshBasicMaterial({ color: 0x1b1d1f }), pChrome = new THREE.MeshBasicMaterial({ color: 0x9aa0a6 });
const addP = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); PROJ.add(m); return m; };
addP(new THREE.BoxGeometry(0.42, 0.36, 0.62), pGreen, 0, 0, 0);
addP(new THREE.BoxGeometry(0.3, 0.3, 0.32), pDark, 0, 0.3, 0.12);
addP(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 12), pDark, 0, 0.5, 0.2);
const lens = addP(new THREE.CylinderGeometry(0.07, 0.08, 0.26, 20), pChrome, 0, 0.02, -0.43); lens.rotation.x = Math.PI / 2;
addP(new THREE.BoxGeometry(0.08, 0.9, 0.08), pDark, 0, -0.62, 0.0);
addP(new THREE.BoxGeometry(0.5, 0.05, 0.5), pDark, 0, -1.08, 0.0);
function reelCanvas() {
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#2a2c30'; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5a3a24'; x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#9aa0a6';
  for (let i = 0; i < 3; i++) { x.save(); x.translate(128, 128); x.rotate(i * Math.PI * 2 / 3); x.beginPath(); x.moveTo(-14, 0); x.arc(0, 0, 92, -0.35, 0.35); x.lineTo(14, 0); x.closePath(); x.fillStyle = '#16181a'; x.fill(); x.restore(); }
  x.fillStyle = '#c8c8c8'; x.beginPath(); x.arc(128, 128, 16, 0, Math.PI * 2); x.fill();
  return c;
}
const reelFace = new THREE.MeshBasicMaterial({ map: canvasTexture(reelCanvas()) });
const REELS = [[0, 0.62, -0.12], [0, 0.55, 0.42]].map(([x, y, z]) => {
  const g = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 40); g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, [pDark, reelFace, reelFace]); m.position.set(x, y, z); PROJ.add(m); return m;
});
PROJ.position.set(1.05, 2.0, TH.z0 - 1.55);
PROJ.rotation.y = Math.atan2(PROJ.position.x, PROJ.position.z - SCREEN.z) * 0.98;
scene.add(PROJ);
// light beam from lens to screen
const beamStart = new THREE.Vector3(); lens.updateMatrixWorld(true); PROJ.updateMatrixWorld(true); lens.getWorldPosition(beamStart);
const beamEnd = new THREE.Vector3(0, SCREEN.y, SCREEN.z);
const beamLen = beamStart.distanceTo(beamEnd);
// a rectangular beam that lands exactly on the screen
const beamGeo = new THREE.ConeGeometry(Math.SQRT2 * SCREEN.h / 2, beamLen, 4, 1, true);
beamGeo.rotateY(Math.PI / 4); beamGeo.scale(SCREEN.w / SCREEN.h, 1, 1);
beamGeo.translate(0, -beamLen / 2, 0); beamGeo.rotateX(-Math.PI / 2);
const BEAM = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
BEAM.position.copy(beamStart); BEAM.lookAt(beamEnd); BEAM.renderOrder = 4; scene.add(BEAM);
const BOOTH = { x: -0.35, y: 2.85, z: TH.z0 - 0.45 };

// ---------- troffers ----------
const panelMat = new THREE.MeshBasicMaterial({ color: 0xfffaf0 });
const frameMat = lit({ color: 0xe8e5dd });
for (const L of LIGHTS.filter((l) => l.kind === 'down')) {
  const along = L.p.z < Z0;
  const w = along ? 0.6 : 1.2, d = along ? 1.2 : 0.6;
  sBox(w + 0.06, 0.03, d + 0.06, frameMat, 'ceil', L.p.x, CEIL - 0.012, L.p.z);
  sBox(w, 0.02, d, panelMat, 'ceil', L.p.x, CEIL - 0.03, L.p.z);
  glow(w * 2.4, d * 2.4, new THREE.Color(1, 0.96, 0.88), 0.12, L.p.x, CEIL - 0.045, L.p.z, 0, Math.PI / 2);
}

flush();
pickRoot.updateMatrixWorld(true);
crt.updateMatrixWorld(true);

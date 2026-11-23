// ---------- live catalog: approved titles from Supabase (read-only key; RLS shows approved rows only) ----------
const SB_URL = 'https://ktltkaqokqxdhvelxepz.supabase.co';
const SB_KEY = 'sb_publishable_BbwYAESJ5wMfJatLUUrSPQ_NcES4V9W';
const ADMIN_FN = SB_URL + '/functions/v1/mtv-admin';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
// the family's services, in the order MackeyTV prefers them when a movie is on more than one
// search pages are the fallback when there's no direct link to the title yet
const MY_SERVICES = [
  { name: 'Disney+', re: /disney/i, search: 'https://www.disneyplus.com/search?q=' },
  { name: 'Hulu', re: /hulu/i, search: 'https://www.hulu.com/search?q=' },
  { name: 'Prime Video', re: /prime|amazon|freevee/i, search: 'https://www.amazon.com/s?i=instant-video&k=' },
  { name: 'Paramount+', re: /paramount/i, search: 'https://www.paramountplus.com/search/?q=' },
  { name: 'Minno', re: /minno/i, search: 'https://www.gominno.com/search?q=' },
  { name: 'Angel Studios', re: /angel/i, search: 'https://www.angel.com/search?q=' },
  { name: 'Pure Flix', re: /pure ?flix/i, search: 'https://www.greatamericanpureflix.com/search?q=' },
  { name: 'Max', re: /^max|hbo/i, search: 'https://play.max.com/search?q=' },
  { name: 'Peacock', re: /peacock/i, search: 'https://www.peacocktv.com/search?q=' },
  { name: 'Tubi', re: /tubi/i, search: 'https://tubitv.com/search/' },
  { name: 'Pluto TV', re: /pluto/i, search: 'https://pluto.tv/search/details?query=' },
  { name: 'YouTube TV', re: /youtube ?tv/i, search: 'https://tv.youtube.com/search/' }
];
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };

async function loadCatalog() {
  const cols = 'tmdb_id,title,year,certification,runtime,overview,genre,poster_path,backdrop_path,trailer_youtube,providers,watch_links,content_flags,approved_at,source,enriched_at';
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 15000);
    // the database hands out at most 1000 rows per request, so page through
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const r = await fetch(`${SB_URL}/rest/v1/mtv_titles?select=${cols}&status=eq.approved&order=tmdb_id.asc&offset=${from}&limit=1000`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: ctl.signal });
      if (!r.ok) throw new Error('catalog ' + r.status);
      const page = await r.json();
      rows.push(...page);
      if (page.length < 1000) break;
    }
    clearTimeout(to);
    lsSet('mtv_catalog', JSON.stringify(rows));
    return rows;
  } catch (e) {
    try { return JSON.parse(lsGet('mtv_catalog') || '[]'); } catch (e2) { return []; }
  }
}
// where a title plays for this family: a play link on a family service first, then any family service it's on
function pickSource(it) {
  const links = it.watch_links || {}, provs = (it.providers || []).map((p) => p.name);
  for (const s of MY_SERVICES) {
    const k = Object.keys(links).find((n) => s.re.test(n));
    if (k) return { service: s.name, url: links[k] };
  }
  for (const s of MY_SERVICES) if (provs.some((n) => s.re.test(n))) return { service: s.name, url: s.search + encodeURIComponent(it.title), search: true };
  return null;
}
function loadImg(src, ms) {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    const to = setTimeout(() => res(null), ms);
    im.onload = () => { clearTimeout(to); res(im); }; im.onerror = () => { clearTimeout(to); res(null); };
    im.src = src;
  });
}
// the server keeps the catalog in step with what's streaming; ask it to check (it does the real work at most once a day)
try { fetch(ADMIN_FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"sync"}', keepalive: true }).catch(() => {}); } catch (e) { /* offline */ }
// automatic titles that have left every family service drop off the shelves; hand-added ones stay
const CAT = (await loadCatalog())
  .map((it) => ({ ...it, origin: it.source || 'manual', rating: it.certification || 'NR', source: pickSource(it) }))
  .filter((it) => it.source || it.origin !== 'auto');
// cover art only for what's shown face-out (New Releases, endcaps, back-wall posters); spines are painted
{
  const want = new Set();
  CAT.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || String(b.approved_at).localeCompare(String(a.approved_at))).slice(0, 100).forEach((t) => want.add(t));
  const byGenre = {};
  CAT.forEach((t) => { (byGenre[t.genre] = byGenre[t.genre] || []).push(t); });
  Object.values(byGenre).forEach((list) => list.slice(0, 12).forEach((t) => want.add(t)));
  await Promise.all([...want].map(async (it) => { if (it.poster_path) it.img = await loadImg(TMDB_IMG + 'w185' + it.poster_path, 9000); }));
}
// sharper art for the few big posters, loaded after the store is up
function hiResPoster(it, cb) { if (it && it.poster_path) loadImg(TMDB_IMG + 'w500' + it.poster_path, 15000).then((im) => { if (im) cb(im); }); }

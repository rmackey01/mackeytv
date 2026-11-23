// MackeyTV admin function: search TMDB, build a content report, and approve/reject titles.
// Every call needs the family PIN. API keys live only here (Supabase secrets).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TMDB = "https://api.themoviedb.org/3";
const WATCHMODE = "https://api.watchmode.com/v1";
const DDD = "https://www.doesthedogdie.com/api/v3";
const GENRES = ["FAMILY", "ANIMATED", "FAITH", "CLASSICS", "SPORTS & TRUE STORIES", "DOCUMENTARIES"];
const PEOPLE = ["dad", "mom", "tv"];
const REQUIRED = Number(Deno.env.get("MTV_REQUIRED_APPROVALS") ?? "1");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-mtv-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// tolerate a pasted "Bearer ..." prefix, quotes or stray whitespace
const cleanToken = (v: string) => v.trim().replace(/^["']|["']$/g, "").replace(/^bearer\s+/i, "").replace(/\s+/g, "");
async function tmdb(path: string, params: Record<string, string> = {}) {
  const token = Deno.env.get("TMDB_TOKEN");
  if (!token) throw new Error("TMDB key not set yet");
  const u = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  // works with either TMDB credential: the long Read Access Token, or the short v3 API key
  const t = cleanToken(token);
  const long = t.length > 60;
  if (!long) u.searchParams.set("api_key", t);
  const r = await fetch(u, { headers: long ? { Authorization: `Bearer ${t}`, accept: "application/json" } : { accept: "application/json" } });
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

// ---------- lookups ----------
function usCertification(details: any): string | null {
  const us = details.release_dates?.results?.find((x: any) => x.iso_3166_1 === "US");
  const certs = (us?.release_dates ?? []).map((d: any) => d.certification).filter((c: string) => c);
  return certs[0] ?? null;
}
function guessGenre(details: any): string {
  const names = (details.genres ?? []).map((g: any) => g.name);
  const kw = (details.keywords?.keywords ?? []).map((k: any) => k.name.toLowerCase());
  if (names.includes("Documentary")) return "DOCUMENTARIES";
  if (names.includes("Animation")) return "ANIMATED";
  if (kw.some((k: string) => /christian|bible|jesus|faith|biblical|church/.test(k))) return "FAITH";
  if (kw.some((k: string) => /sport|football|baseball|basketball|based on true story|biography/.test(k)) || names.includes("History")) return "SPORTS & TRUE STORIES";
  const year = Number((details.release_date ?? "").slice(0, 4));
  if (year && year < 1975) return "CLASSICS";
  return "FAMILY";
}
async function watchLinks(tmdbId: number) {
  const key = Deno.env.get("WATCHMODE_KEY");
  if (!key) return { links: {}, note: "Watchmode key not set yet" };
  const s = await fetch(`${WATCHMODE}/search/?apiKey=${key}&search_field=tmdb_movie_id&search_value=${tmdbId}`).then((r) => r.json());
  const wid = s?.title_results?.[0]?.id;
  if (!wid) return { links: {}, note: "Not found on Watchmode" };
  const sources = await fetch(`${WATCHMODE}/title/${wid}/sources/?apiKey=${key}&regions=US`).then((r) => r.json());
  const links: Record<string, string> = {};
  for (const src of Array.isArray(sources) ? sources : []) {
    if (!["sub", "free", "tve"].includes(src.type)) continue;
    if (src.web_url && !links[src.name]) links[src.name] = src.web_url;
  }
  return { links, note: null };
}
async function contentFlags(title: string, year: number | null, tmdbId: number) {
  const key = Deno.env.get("DDD_KEY");
  if (!key) return null;
  const h = { "X-API-KEY": key, accept: "application/json" };
  const items = await fetch(`${DDD}/items?q=${encodeURIComponent(title)}`, { headers: h }).then((r) => r.json()).catch(() => []);
  const list = Array.isArray(items) ? items : items?.items ?? [];
  const hit = list.find((i: any) => i.tmdbId === tmdbId) ?? list.find((i: any) => i.name?.toLowerCase() === title.toLowerCase() && (!year || i.releaseYear === year));
  if (!hit) return { found: false, flags: [] };
  const detail = await fetch(`${DDD}/items/${hit.id}`, { headers: h }).then((r) => r.json()).catch(() => null);
  const stats = detail?.topicItemStats ?? [];
  const flags = stats
    .map((s: any) => ({ topic: s.topic?.name ?? s.topicName ?? s.name ?? "", yes: s.yesSum ?? 0, no: s.noSum ?? 0 }))
    .filter((f: any) => f.topic && f.yes > f.no)
    .sort((a: any, b: any) => b.yes - a.yes)
    .slice(0, 40);
  return { found: true, dddId: hit.id, flags };
}
async function buildReport(tmdbId: number) {
  const d = await tmdb(`/movie/${tmdbId}`, { append_to_response: "release_dates,watch/providers,videos,keywords" });
  const us = d["watch/providers"]?.results?.US ?? {};
  const providers = [...(us.flatrate ?? []), ...(us.free ?? []), ...(us.ads ?? [])]
    .filter((p: any, i: number, a: any[]) => a.findIndex((q) => q.provider_id === p.provider_id) === i)
    .map((p: any) => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
  const trailer = (d.videos?.results ?? []).find((v: any) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
    (d.videos?.results ?? []).find((v: any) => v.site === "YouTube" && v.type === "Trailer");
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : null;
  const certification = usCertification(d);
  const [wl, flags] = await Promise.all([watchLinks(tmdbId).catch((e) => ({ links: {}, note: String(e) })), contentFlags(d.title, year, tmdbId).catch(() => null)]);
  return {
    tmdb_id: tmdbId,
    title: d.title,
    year,
    certification,
    runtime: d.runtime ?? null,
    overview: d.overview ?? null,
    poster_path: d.poster_path ?? null,
    backdrop_path: d.backdrop_path ?? null,
    trailer_youtube: trailer?.key ?? null,
    providers,
    watch_links: wl.links,
    watch_note: wl.note,
    content_flags: flags,
    suggested_genre: guessGenre(d),
    gate: certification === "G" || certification === "PG" ? "pass" : certification ? "check" : "unrated",
    tmdb_link: us.link ?? `https://www.themoviedb.org/movie/${tmdbId}`,
  };
}

// ---------- automatic catalog: what's streaming now on the family's services ----------
const MY_SERVICES = [/disney/i, /hulu/i, /prime video|amazon prime/i, /paramount/i, /minno/i, /angel/i, /pure ?flix/i, /^max$|hbo max/i, /peacock/i, /tubi/i, /pluto/i, /freevee/i];
const CERTS = ["G", "PG", "PG-13"];
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
async function cfgGet(key: string) { const { data } = await db.from("mtv_config").select("value").eq("key", key).maybeSingle(); return data?.value ?? null; }
async function cfgSet(key: string, value: unknown) { await db.from("mtv_config").upsert({ key, value, updated_at: new Date().toISOString() }); }
async function keywordIds(queries: string[], names: string[]) {
  const ids = new Set<number>();
  for (const q of queries) {
    const r = await tmdb("/search/keyword", { query: q }).catch(() => ({ results: [] }));
    for (const k of r.results ?? []) if (names.includes(String(k.name).toLowerCase())) ids.add(k.id);
  }
  return [...ids];
}
function usProviders(wp: any) {
  const us = wp?.results?.US ?? {};
  return [...(us.flatrate ?? []), ...(us.free ?? []), ...(us.ads ?? [])]
    .filter((p: any, i: number, a: any[]) => a.findIndex((q) => q.provider_id === p.provider_id) === i)
    .map((p: any) => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
}
async function syncCatalog(force: boolean) {
  const prev: any = await cfgGet("sync");
  const now = Date.now();
  if (!force && prev?.at && now - Date.parse(prev.at) < 20 * 3600e3) return { skipped: "synced recently", last: prev };
  if (prev?.running && now - Date.parse(prev.running) < 8 * 60e3) return { skipped: "already running" };
  await cfgSet("sync", { ...(prev ?? {}), running: new Date().toISOString() });
  try {
    const pl = await tmdb("/watch/providers/movie", { watch_region: "US" });
    const provIds = (pl.results ?? []).filter((p: any) => MY_SERVICES.some((re) => re.test(p.provider_name))).map((p: any) => p.provider_id);
    const faith = await keywordIds(["christian", "christianity", "bible", "faith"], ["christian film", "christianity", "christian", "bible", "faith", "biblical", "jesus christ"]);
    const sports = await keywordIds(["sports", "based on true story", "biography", "sport"], ["sports", "sport", "based on true story", "biography", "true story", "sports film"]);
    // first aisle to claim a movie keeps it
    const AISLES: [string, Record<string, string>][] = [
      ["DOCUMENTARIES", { with_genres: "99" }],
      ["ANIMATED", { with_genres: "16" }],
      ["FAITH", { with_keywords: faith.join("|") }],
      ["SPORTS & TRUE STORIES", { with_keywords: sports.join("|") }],
      ["CLASSICS", { "primary_release_date.lte": "1975-12-31", sort_by: "vote_count.desc" }],
      ["FAMILY", { with_genres: "10751" }],
    ];
    const base = {
      watch_region: "US", with_watch_providers: provIds.join("|"), with_watch_monetization_types: "flatrate|free|ads",
      certification_country: "US", include_adult: "false", sort_by: "popularity.desc", "vote_count.gte": "15", language: "en-US",
    };
    const jobs: { genre: string; cert: string; params: Record<string, string> }[] = [];
    for (const [genre, extra] of AISLES) {
      if ((genre === "FAITH" && !faith.length) || (genre === "SPORTS & TRUE STORIES" && !sports.length)) continue;
      for (const cert of CERTS) for (const page of ["1", "2", "3"]) jobs.push({ genre, cert, params: { ...base, ...extra, certification: cert, page } });
    }
    const pages = await pool(jobs, 8, (j) => tmdb("/discover/movie", j.params).then((r) => ({ j, r })).catch(() => ({ j, r: { results: [] } })));
    const found = new Map<number, { m: any; genre: string; cert: string }>();
    for (const [genre] of AISLES) for (const { j, r } of pages) if (j.genre === genre) for (const m of r.results ?? []) if (!found.has(m.id)) found.set(m.id, { m, genre, cert: j.cert });

    const ids = [...found.keys()];
    const existing = new Map<number, any>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db.from("mtv_titles").select("tmdb_id,status,source").in("tmdb_id", ids.slice(i, i + 300));
      for (const e of data ?? []) existing.set(e.tmdb_id, e);
    }
    const { data: autoRows } = await db.from("mtv_titles").select("tmdb_id").eq("source", "auto").eq("status", "approved");
    // providers: every title found now, plus auto titles that dropped out of the top pages (did they leave the services?)
    const check = [...new Set([...ids, ...(autoRows ?? []).map((r: any) => r.tmdb_id)])].slice(0, 1100);
    const provs = new Map<number, any[]>();
    await pool(check, 20, async (id) => { const wp = await tmdb(`/movie/${id}/watch/providers`).catch(() => null); if (wp) provs.set(id, usProviders(wp)); });

    const stamp = new Date().toISOString();
    const inserts: any[] = [];
    let added = 0, refreshed = 0, left = 0;
    for (const [id, { m, genre, cert }] of found) {
      const ex = existing.get(id);
      if (ex) continue;                                  // manual titles and anything you pulled are left alone
      inserts.push({
        tmdb_id: id, title: m.title, year: m.release_date ? Number(m.release_date.slice(0, 4)) : null, certification: cert,
        overview: m.overview || null, genre, poster_path: m.poster_path, backdrop_path: m.backdrop_path,
        providers: provs.get(id) ?? [], watch_links: {}, status: "approved", approvals: ["auto"], approved_at: stamp,
        source: "auto", notes: "auto",
      });
    }
    for (let i = 0; i < inserts.length; i += 200) {
      const { error } = await db.from("mtv_titles").upsert(inserts.slice(i, i + 200), { onConflict: "tmdb_id", ignoreDuplicates: true });
      if (error) throw error;
      added += inserts.slice(i, i + 200).length;
    }
    await pool(autoRows ?? [], 10, async (r: any) => {
      const p = provs.get(r.tmdb_id); if (!p) return;
      await db.from("mtv_titles").update({ providers: p }).eq("tmdb_id", r.tmdb_id);
      refreshed++; if (!p.length) left++;
    });
    const result = { at: stamp, found: found.size, added, refreshed, left, providers: provIds.length };
    await cfgSet("sync", result);
    return result;
  } catch (e) {
    await cfgSet("sync", { ...(prev ?? {}), running: null, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
// fill in the slow details for one title the first time someone looks at it (trailer, runtime, play links, content notes)
async function enrich(tmdbId: number) {
  const { data: row } = await db.from("mtv_titles").select("*").eq("tmdb_id", tmdbId).maybeSingle();
  if (!row || row.status !== "approved") return { title: null };
  if (row.enriched_at && Date.now() - Date.parse(row.enriched_at) < 30 * 86400e3) return { title: row };
  const rep = await buildReport(tmdbId);
  const patch = {
    runtime: rep.runtime, overview: rep.overview ?? row.overview, trailer_youtube: rep.trailer_youtube, providers: rep.providers,
    watch_links: { ...rep.watch_links, ...(row.source === "manual" ? row.watch_links ?? {} : {}) },
    content_flags: rep.content_flags ?? row.content_flags, enriched_at: new Date().toISOString(),
    certification: rep.certification ?? row.certification,
  };
  // a re-rating to R takes it off the shelf
  const blocked = patch.certification === "R" || patch.certification === "NC-17";
  const { data } = await db.from("mtv_titles").update(blocked ? { ...patch, status: "rejected", notes: "auto: re-rated " + patch.certification } : patch).eq("tmdb_id", tmdbId).select().single();
  return { title: data };
}

// ---------- actions ----------
async function handle(body: any) {
  switch (body.action) {
    case "search": {
      const q = String(body.q ?? "").trim();
      if (!q) return { results: [] };
      const r = await tmdb("/search/movie", { query: q, include_adult: "false", region: "US" });
      const ids = (r.results ?? []).map((m: any) => m.id);
      const { data: existing } = await db.from("mtv_titles").select("tmdb_id,status,approvals").in("tmdb_id", ids.length ? ids : [0]);
      const st = new Map((existing ?? []).map((e: any) => [e.tmdb_id, e]));
      const top = (r.results ?? []).slice(0, 12);
      const certs = await Promise.all(top.map((m: any) => tmdb(`/movie/${m.id}/release_dates`).then((d) => usCertification({ release_dates: d })).catch(() => null)));
      return {
        results: top.map((m: any, i: number) => ({
          certification: certs[i],
          tmdb_id: m.id, title: m.title, year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
          poster_path: m.poster_path, overview: m.overview, status: st.get(m.id)?.status ?? null, approvals: st.get(m.id)?.approvals ?? [],
        })),
      };
    }
    case "report":
      return { report: await buildReport(Number(body.tmdb_id)) };
    case "decide": {
      const who = String(body.who ?? "tv");
      if (!PEOPLE.includes(who)) throw new Error("Pick who is deciding");
      const genre = String(body.genre ?? "");
      if (!GENRES.includes(genre)) throw new Error("Pick a genre");
      const rep = await buildReport(Number(body.tmdb_id));
      const { data: cur } = await db.from("mtv_titles").select("approvals,status").eq("tmdb_id", rep.tmdb_id).maybeSingle();
      let approvals: string[] = cur?.approvals ?? [];
      let status = cur?.status ?? "pending";
      if (body.decision === "reject") { status = "rejected"; approvals = []; }
      else {
        if (!approvals.includes(who)) approvals = [...approvals, who];
        status = approvals.length >= REQUIRED ? "approved" : "pending";
      }
      const row = {
        tmdb_id: rep.tmdb_id, title: rep.title, year: rep.year, certification: rep.certification, runtime: rep.runtime,
        overview: rep.overview, genre, poster_path: rep.poster_path, backdrop_path: rep.backdrop_path, trailer_youtube: rep.trailer_youtube,
        providers: rep.providers, watch_links: { ...rep.watch_links, ...(body.watch_links ?? {}) }, content_flags: rep.content_flags,
        notes: body.notes ?? null, status, approvals,
        approved_at: status === "approved" ? new Date().toISOString() : null, source: "manual", enriched_at: new Date().toISOString(),
      };
      const { data, error } = await db.from("mtv_titles").upsert(row, { onConflict: "tmdb_id" }).select().single();
      if (error) throw error;
      return { title: data };
    }
    case "list": {
      const status = String(body.status ?? "pending");
      const { data, error } = await db.from("mtv_titles").select("*").eq("status", status).order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return { titles: data };
    }
    case "update": {
      const patch: Record<string, unknown> = {};
      if (body.genre && GENRES.includes(body.genre)) patch.genre = body.genre;
      if (body.watch_links && typeof body.watch_links === "object") patch.watch_links = body.watch_links;
      if (typeof body.notes === "string") patch.notes = body.notes;
      const { data, error } = await db.from("mtv_titles").update(patch).eq("id", Number(body.id)).select().single();
      if (error) throw error;
      return { title: data };
    }
    case "remove": {
      const { error } = await db.from("mtv_titles").delete().eq("id", Number(body.id));
      if (error) throw error;
      return { ok: true };
    }
    case "stock": {
      // bulk-add a list of titles: best TMDB match for each, skip R / NC-17, file everything else on its aisle
      const items: { title: string; genre?: string }[] = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
      const out: { title: string; result: string; matched?: string }[] = [];
      const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      for (const it of items) {
        try {
          const r = await tmdb("/search/movie", { query: it.title, include_adult: "false", region: "US" });
          const res: any[] = r.results ?? [];
          const exact = res.filter((m) => norm(m.title) === norm(it.title)).sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
          const m = exact[0] ?? res[0];
          if (!m) { out.push({ title: it.title, result: "not found" }); continue; }
          const { data: cur } = await db.from("mtv_titles").select("status").eq("tmdb_id", m.id).maybeSingle();
          if (cur) { out.push({ title: it.title, result: "already " + cur.status, matched: m.title }); continue; }
          const rep = await buildReport(m.id);
          const blocked = rep.certification === "R" || rep.certification === "NC-17";
          const genre = it.genre && GENRES.includes(it.genre) ? it.genre : rep.suggested_genre;
          const { error } = await db.from("mtv_titles").upsert({
            tmdb_id: rep.tmdb_id, title: rep.title, year: rep.year, certification: rep.certification, runtime: rep.runtime,
            overview: rep.overview, genre, poster_path: rep.poster_path, backdrop_path: rep.backdrop_path, trailer_youtube: rep.trailer_youtube,
            providers: rep.providers, watch_links: rep.watch_links, content_flags: rep.content_flags,
            notes: blocked ? "starter shelves: skipped, rated " + rep.certification : "starter shelves",
            status: blocked ? "rejected" : "approved", approvals: blocked ? [] : ["tv"],
            approved_at: blocked ? null : new Date().toISOString(),
          }, { onConflict: "tmdb_id" });
          if (error) throw error;
          out.push({ title: it.title, result: blocked ? "skipped " + rep.certification : "added", matched: rep.title });
        } catch (e) {
          out.push({ title: it.title, result: "error: " + (e instanceof Error ? e.message : String(e)) });
        }
      }
      return { results: out };
    }
    case "resync":
      return await syncCatalog(true);
    case "status":
      return { tmdb: !!Deno.env.get("TMDB_TOKEN"), watchmode: !!Deno.env.get("WATCHMODE_KEY"), ddd: !!Deno.env.get("DDD_KEY"), required: REQUIRED };
    default:
      throw new Error("Unknown action");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ pin: !!Deno.env.get("MTV_ADMIN_PIN"), tmdbShape: ((t) => ({ len: t.length, clean: cleanToken(t).length, bearer: /^\s*bearer/i.test(t), quote: /["']/.test(t), dots: cleanToken(t).split(".").length - 1 }))(Deno.env.get("TMDB_TOKEN") ?? ""), tmdb: !!Deno.env.get("TMDB_TOKEN"), watchmode: !!Deno.env.get("WATCHMODE_KEY"), ddd: !!Deno.env.get("DDD_KEY") });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  // the TV calls these without the PIN: a daily catalog sync (throttled) and details for one approved title
  if (body.action === "diag") {
    // play-link service health check (never returns the key)
    const key = Deno.env.get("WATCHMODE_KEY") ?? "";
    const strip = (t: string) => t.split(key).join("***");
    const r1 = await fetch(`${WATCHMODE}/search/?apiKey=${key}&search_field=tmdb_movie_id&search_value=${Number(body.tmdb_id) || 862}`);
    const t1 = strip(await r1.text());
    let t2 = "", s2 = 0;
    try { const id = JSON.parse(t1)?.title_results?.[0]?.id; if (id) { const r2 = await fetch(`${WATCHMODE}/title/${id}/sources/?apiKey=${key}&regions=US`); s2 = r2.status; t2 = strip(await r2.text()).slice(0, 1500); } } catch { /* shown below */ }
    return json({ keyLen: key.trim().length, keyHasSpace: /\s/.test(key), search: { status: r1.status, body: t1.slice(0, 600) }, sources: { status: s2, body: t2 } });
  }
  if (body.action === "sync" || body.action === "enrich") {
    try { return json(body.action === "sync" ? await syncCatalog(false) : await enrich(Number(body.tmdb_id))); }
    catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 400); }
  }
  const pin = Deno.env.get("MTV_ADMIN_PIN");
  if (!pin || req.headers.get("x-mtv-pin") !== pin) { await new Promise((r) => setTimeout(r, 1200)); return json({ error: "Wrong PIN" }, 401); }
  try {
    return json(await handle(body));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

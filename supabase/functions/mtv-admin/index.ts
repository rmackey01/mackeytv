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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function tmdb(path: string, params: Record<string, string> = {}) {
  const token = Deno.env.get("TMDB_TOKEN");
  if (!token) throw new Error("TMDB key not set yet");
  const u = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } });
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
        approved_at: status === "approved" ? new Date().toISOString() : null,
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
    case "status":
      return { tmdb: !!Deno.env.get("TMDB_TOKEN"), watchmode: !!Deno.env.get("WATCHMODE_KEY"), ddd: !!Deno.env.get("DDD_KEY"), required: REQUIRED };
    default:
      throw new Error("Unknown action");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ pin: !!Deno.env.get("MTV_ADMIN_PIN"), tmdb: !!Deno.env.get("TMDB_TOKEN"), watchmode: !!Deno.env.get("WATCHMODE_KEY"), ddd: !!Deno.env.get("DDD_KEY") });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const pin = Deno.env.get("MTV_ADMIN_PIN");
  if (!pin || req.headers.get("x-mtv-pin") !== pin) { await new Promise((r) => setTimeout(r, 1200)); return json({ error: "Wrong PIN" }, 401); }
  try {
    return json(await handle(await req.json()));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

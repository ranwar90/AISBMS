/**
 * G8 Discipline Tracker — database API (Netlify Function + Netlify Blobs).
 *
 * Each collection (students, staff, points, config) is stored as ONE blob holding
 * { docs: { <id>: <data> } }. Every write is a conditional write (compare-and-swap on
 * the blob's etag), retried on conflict, so two teachers saving at the same moment
 * never overwrite each other's changes.
 *
 *   GET  /api/db?etags=students:<etag>,staff:<etag>,...   -> collections that changed
 *   POST /api/db  { op: "set"|"update"|"delete", path: "points/S170069", data: {...} }
 *
 * Semantics match the original app: set = replace the document; update = deep-merge
 * nested objects (arrays are replaced) and fails if the document doesn't exist;
 * delete = remove the document.
 *
 * Every request must carry the header  x-access-key: <ACCESS_KEY>  where ACCESS_KEY is
 * set in Netlify > Site configuration > Environment variables. With no ACCESS_KEY set,
 * the API refuses all requests, so student data is never exposed by accident.
 */
import { getStore } from "@netlify/blobs";
import seed from "../../data/seed-data.json" with { type: "json" };

const COLLECTIONS = ["students", "staff", "points", "config"];
const STORE_NAME = "g8-discipline-tracker";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
function deepMerge(target, src) {
  const out = isObj(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(src)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}

function envKey() {
  try { if (globalThis.Netlify && Netlify.env) return Netlify.env.get("ACCESS_KEY"); } catch (e) {}
  return process.env.ACCESS_KEY;
}

async function ensureSeeded(store) {
  // First run only: load the exported data. onlyIfNew makes this safe if two requests race.
  for (const c of COLLECTIONS) {
    const meta = await store.getMetadata(c);
    if (!meta) await store.setJSON(c, { docs: (seed && seed[c]) || {} }, { onlyIfNew: true });
  }
}

export default async (req) => {
  const expected = envKey();
  if (!expected) return json({ error: "ACCESS_KEY is not configured on this site. See README." }, 503);
  if (req.headers.get("x-access-key") !== expected) return json({ error: "Invalid access key" }, 401);

  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (req.method === "GET") {
    await ensureSeeded(store);
    const known = {};
    (new URL(req.url).searchParams.get("etags") || "").split(",").filter(Boolean).forEach(p => {
      const i = p.indexOf(":"); known[p.slice(0, i)] = p.slice(i + 1);
    });
    const collections = {};
    for (const c of COLLECTIONS) {
      const meta = await store.getMetadata(c);
      if (meta && known[c] && meta.etag === known[c]) continue; // unchanged since the client's last copy
      const res = await store.getWithMetadata(c, { type: "json" });
      collections[c] = { etag: res ? res.etag : "", docs: res && res.data ? res.data.docs || {} : {} };
    }
    return json({ collections });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "Bad JSON" }, 400); }
    const { op, path, data } = body || {};
    const [coll, id, ...rest] = String(path || "").split("/");
    if (!COLLECTIONS.includes(coll) || !id || rest.length) return json({ error: "Bad path" }, 400);
    if (!["set", "update", "delete"].includes(op)) return json({ error: "Bad op" }, 400);
    if (op !== "delete" && !isObj(data)) return json({ error: "Missing data" }, 400);

    await ensureSeeded(store);
    for (let attempt = 0; attempt < 12; attempt++) {
      const cur = await store.getWithMetadata(coll, { type: "json" });
      const docs = { ...((cur && cur.data && cur.data.docs) || {}) };
      if (op === "set") docs[id] = data;
      else if (op === "update") {
        if (!(id in docs)) return json({ error: "not_found", message: "Document does not exist" }, 404);
        docs[id] = deepMerge(docs[id], data);
      } else delete docs[id];
      const opts = cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
      const res = await store.setJSON(coll, { docs }, opts);
      // Older @netlify/blobs versions return nothing (no conditional support): treat as written.
      if (!res || res.modified !== false) {
        const after = await store.getMetadata(coll);
        return json({ collection: coll, etag: (res && res.etag) || (after && after.etag) || "", docs });
      }
      await new Promise(r => setTimeout(r, 40 + Math.random() * 120)); // someone else wrote first; re-read and retry
    }
    return json({ error: "Busy, please retry" }, 409);
  }

  return json({ error: "Method not allowed" }, 405);
};
export const config = { path: "/api/db" };

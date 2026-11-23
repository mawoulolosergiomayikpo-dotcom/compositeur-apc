import { getStore } from "@netlify/blobs";

export default async (req) => {
  const id = String(new URL(req.url).searchParams.get("id") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const H = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (!id) return new Response(JSON.stringify({ status: "error", error: "id manquant" }), { status: 400, headers: H });
  const store = getStore("resultats");
  const res = await store.get(id, { type: "json" });
  if (!res) return new Response(JSON.stringify({ status: "pending" }), { headers: H });
  if (res.status === "done" || res.status === "error") { try { await store.delete(id); } catch (_) {} }
  return new Response(JSON.stringify(res), { headers: H });
};

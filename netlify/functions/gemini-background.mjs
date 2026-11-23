import { getStore } from "@netlify/blobs";

// Fonction "background" : Netlify répond tout de suite 202 puis la laisse tourner (jusqu'à 15 min).
export default async (req) => {
  const store = getStore("resultats");
  let id = "";
  try {
    const body = await req.json();
    id = String(body.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (!id) return;

    const key = Netlify.env.get("GEMINI_API_KEY");
    if (!key) { await store.setJSON(id, { status: "error", error: "Clé GEMINI_API_KEY manquante sur le serveur." }); return; }

    const prompt = String(body.prompt || "");
    const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    if (!prompt || prompt.length > 60000) { await store.setJSON(id, { status: "error", error: "Prompt vide ou trop long." }); return; }

    const MODEL = Netlify.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
    const parts = [{ text: prompt }].concat(
      images.map((i) => ({ inline_data: { mime_type: i.mime || "image/png", data: i.data } }))
    );

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 32768, responseMimeType: "application/json" }
        })
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { await store.setJSON(id, { status: "error", error: data?.error?.message || ("Erreur Gemini " + r.status) }); return; }
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text) { await store.setJSON(id, { status: "error", error: "Réponse vide de Gemini." }); return; }
    await store.setJSON(id, { status: "done", text });
  } catch (e) {
    try { if (id) await store.setJSON(id, { status: "error", error: String(e && e.message || e) }); } catch (_) {}
  }
};

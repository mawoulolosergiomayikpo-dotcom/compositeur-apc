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

    const M1 = Netlify.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
    const M2 = Netlify.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-latest";
    const parts = [{ text: prompt }].concat(
      images.map((i) => ({ inline_data: { mime_type: i.mime || "image/png", data: i.data } }))
    );
    const payload = JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 32768, responseMimeType: "application/json" }
    });
    const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

    // Jusqu'à 6 essais, en alternant les modèles, avec attente croissante (surcharge Google fréquente).
    const plan = [M1, M1, M2, M1, M2, M1];
    let text = "", lastErr = "Erreur Gemini";
    for (let k = 0; k < plan.length; k++) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${plan[k]}:generateContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: payload }
      );
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
        if (text) break;
        lastErr = "Réponse vide de Gemini.";
      } else {
        lastErr = data?.error?.message || ("Erreur Gemini " + r.status);
        const retryable = [429, 500, 502, 503, 504].includes(r.status) || /high demand|overloaded|unavailable/i.test(lastErr);
        const modelGone = r.status === 404 || /no longer available|not found/i.test(lastErr);
        if (!retryable && !modelGone) break;
      }
      await sleep(4000 + k * 4000);
    }
    if (!text) { await store.setJSON(id, { status: "error", error: lastErr }); return; }
    await store.setJSON(id, { status: "done", text });
  } catch (e) {
    try { if (id) await store.setJSON(id, { status: "error", error: String(e && e.message || e) }); } catch (_) {}
  }
};

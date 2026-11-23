export default async (req) => {
  const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return J({ error: "Méthode non autorisée" }, 405);

  const key = Netlify.env.get("GEMINI_API_KEY");
  if (!key) return J({ error: "Clé GEMINI_API_KEY manquante sur le serveur." }, 500);

  let body;
  try { body = await req.json(); } catch { return J({ error: "Requête invalide." }, 400); }
  const prompt = String(body.prompt || "");
  const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
  if (!prompt || prompt.length > 60000) return J({ error: "Prompt vide ou trop long." }, 400);

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
  if (!r.ok) return J({ error: data?.error?.message || "Erreur Gemini" }, 502);
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) return J({ error: "Réponse vide de Gemini." }, 502);
  return J({ text });
};

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405 });
  }

  const key = Netlify.env.get("GEMINI_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "Clé GEMINI_API_KEY manquante sur le serveur." }), { status: 500 });
  }

  let body;
  try { body = await req.json(); } catch { 
    return new Response(JSON.stringify({ error: "Requête invalide." }), { status: 400 });
  }
  const prompt = String(body.prompt || "");
  const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
  if (!prompt || prompt.length > 60000) {
    return new Response(JSON.stringify({ error: "Prompt vide ou trop long." }), { status: 400 });
  }

  const MODEL = "gemini-2.5-flash"; // changez ici si besoin

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
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 32768,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const data = await r.json();
  if (!r.ok) {
    return new Response(JSON.stringify({ error: data?.error?.message || "Erreur Gemini" }), { status: 502 });
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) {
    return new Response(JSON.stringify({ error: "Réponse vide de Gemini." }), { status: 502 });
  }
  return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json" } });
};

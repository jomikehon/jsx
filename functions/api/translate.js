// functions/api/translate.js
// POST /api/translate — 서버사이드에서 Anthropic API 호출 (CORS 우회)
// 환경변수 ANTHROPIC_API_KEY 를 Cloudflare Pages 대시보드에서 설정해야 합니다.

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { title, content } = await request.json();
    if (!title || !content) {
      return new Response(
        JSON.stringify({ error: "title과 content가 필요합니다." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const prompt = `Translate the following Korean diary entry into natural, fluent English.
Return ONLY a valid JSON object with exactly two string fields: "title" and "content".
Do not include any explanation, markdown, or code fences.

Title: ${title}

Content:
${content}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(
        JSON.stringify({ error: "Anthropic API 오류: " + err }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "번역 처리 중 오류: " + e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

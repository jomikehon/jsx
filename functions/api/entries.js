// functions/api/entries.js
// 일기 텍스트 데이터만 처리 — 미디어는 /api/media 가 전담
// (SQLITE_TOOBIG 방지: 이 API에서 Base64 데이터를 절대 받지 않음)

async function getSessionUser(request, env) {
  const token = request.headers.get("X-Session-Token");
  if (!token) return null;
  const session = await env.DB.prepare(
    "SELECT user_id, username, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return session;
}

// GET /api/entries — 일기 목록 (미디어 미포함, 프론트에서 별도 조회)
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, date, title, content, mood, tags, created_at FROM diary_entries ORDER BY date DESC, created_at DESC"
    ).all();

    return new Response(JSON.stringify(
      results.map(item => ({ ...item, tags: item.tags || "", media: [] }))
    ), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// POST /api/entries — 일기 저장/수정 (텍스트 필드만, media 필드 무시)
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
    }

    // media 필드는 의도적으로 무시 — /api/media 에서 별도 처리
    const { id, date, title, content, mood, tags } = await request.json();

    if (!id || !title || !content) {
      return new Response(JSON.stringify({ error: "필수 항목이 누락되었습니다." }), { status: 400 });
    }

    const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");
    const existing = await env.DB.prepare(
      "SELECT user_id FROM diary_entries WHERE id = ?"
    ).bind(id).first();

    if (existing) {
      if (existing.user_id !== user.user_id) {
        return new Response(JSON.stringify({ error: "수정 권한이 없습니다." }), { status: 403 });
      }
      await env.DB.prepare(
        "UPDATE diary_entries SET date=?, title=?, content=?, mood=?, tags=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(date, title, content, mood, tagsStr, id).run();
      return new Response(JSON.stringify({ success: true, message: "수정되었습니다." }));
    } else {
      await env.DB.prepare(
        "INSERT INTO diary_entries (id, date, title, content, mood, tags, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, date, title, content, mood, tagsStr, user.user_id).run();
      return new Response(JSON.stringify({ success: true, message: "저장되었습니다." }), { status: 201 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

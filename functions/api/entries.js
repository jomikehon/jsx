// functions/api/entries.js

// ── 세션 토큰으로 로그인 유저 확인 ────────────────────────────────
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

// 1. GET /api/entries  — 전체 일기 목록 (공개)
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, date, title, content, mood, tags, media, created_at FROM diary_entries ORDER BY date DESC, created_at DESC"
    ).all();

    const parsed = results.map(item => ({
      ...item,
      media: (() => { try { return JSON.parse(item.media || "[]"); } catch { return []; } })(),
      tags: item.tags || "",
    }));

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// 2. POST /api/entries  — 저장 / 수정 (로그인 필요)
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    // 세션 인증
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
    }

    const data = await request.json();
    const { id, date, title, content, mood, tags, media } = data;

    if (!id || !title || !content) {
      return new Response(JSON.stringify({ error: "필수 항목이 누락되었습니다." }), { status: 400 });
    }

    const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");
    const mediaJson = JSON.stringify(Array.isArray(media) ? media : []);

    // 기존 글 확인
    const existing = await env.DB.prepare(
      "SELECT user_id FROM diary_entries WHERE id = ?"
    ).bind(id).first();

    if (existing) {
      // 본인 글인지 확인
      if (existing.user_id !== user.user_id) {
        return new Response(JSON.stringify({ error: "수정 권한이 없습니다." }), { status: 403 });
      }
      await env.DB.prepare(
        "UPDATE diary_entries SET title=?, content=?, mood=?, tags=?, media=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(title, content, mood, tagsStr, mediaJson, id).run();

      return new Response(JSON.stringify({ success: true, message: "수정되었습니다." }));
    } else {
      await env.DB.prepare(
        "INSERT INTO diary_entries (id, date, title, content, mood, tags, media, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, date, title, content, mood, tagsStr, mediaJson, user.user_id).run();

      return new Response(JSON.stringify({ success: true, message: "저장되었습니다." }), { status: 201 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

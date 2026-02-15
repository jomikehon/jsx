// functions/api/delete.js
// POST /api/delete  { id }  + Header: X-Session-Token
// [수정] diary_media 테이블도 함께 삭제 (ON DELETE CASCADE 보조)

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

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
    }

    const { id } = await request.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "id가 필요합니다." }), { status: 400 });
    }

    // 글 존재 및 소유자 확인
    const entry = await env.DB.prepare(
      "SELECT user_id FROM diary_entries WHERE id = ?"
    ).bind(id).first();

    if (!entry) {
      return new Response(JSON.stringify({ error: "이미 삭제된 글입니다." }), { status: 404 });
    }

    if (entry.user_id !== user.user_id) {
      return new Response(JSON.stringify({ error: "삭제 권한이 없습니다." }), { status: 403 });
    }

    // 미디어 먼저 삭제 후 일기 삭제 (FOREIGN KEY PRAGMA가 비활성화된 환경 대비)
    await env.DB.batch([
      env.DB.prepare("DELETE FROM diary_media WHERE entry_id = ?").bind(id),
      env.DB.prepare("DELETE FROM diary_entries WHERE id = ?").bind(id),
    ]);

    return new Response(JSON.stringify({ success: true }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

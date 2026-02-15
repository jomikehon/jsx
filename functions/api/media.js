// functions/api/media.js

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

// GET /api/media?entry_id=xxx
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id");
  if (!entryId) {
    return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
  }
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, sort_order, name, type, data FROM diary_media WHERE entry_id = ? ORDER BY sort_order ASC"
    ).bind(entryId).all();
    return new Response(JSON.stringify(results || []), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// POST /api/media  — 파일 1개 저장
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
    }

    const body = await request.json();
    const { entry_id, sort_order, name, type, data } = body;

    if (!entry_id || !data) {
      return new Response(JSON.stringify({ error: "entry_id와 data는 필수입니다." }), { status: 400 });
    }

    // 소유자 확인
    const entry = await env.DB.prepare(
      "SELECT user_id FROM diary_entries WHERE id = ?"
    ).bind(entry_id).first();

    if (!entry) {
      return new Response(JSON.stringify({ error: "일기를 찾을 수 없습니다." }), { status: 404 });
    }
    if (entry.user_id !== user.user_id) {
      return new Response(JSON.stringify({ error: "권한이 없습니다." }), { status: 403 });
    }

    // D1은 RETURNING을 지원하지 않으므로 .run() 사용
    await env.DB.prepare(
      "INSERT INTO diary_media (entry_id, sort_order, name, type, data) VALUES (?, ?, ?, ?, ?)"
    ).bind(entry_id, sort_order ?? 0, name || "", type || "", data).run();

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// DELETE /api/media?entry_id=xxx
export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
    }

    const url = new URL(request.url);
    const entryId = url.searchParams.get("entry_id");
    if (!entryId) {
      return new Response(JSON.stringify({ error: "entry_id가 필요합니다." }), { status: 400 });
    }

    const entry = await env.DB.prepare(
      "SELECT user_id FROM diary_entries WHERE id = ?"
    ).bind(entryId).first();

    if (entry && entry.user_id !== user.user_id) {
      return new Response(JSON.stringify({ error: "권한이 없습니다." }), { status: 403 });
    }

    await env.DB.prepare("DELETE FROM diary_media WHERE entry_id = ?").bind(entryId).run();
    return new Response(JSON.stringify({ success: true }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

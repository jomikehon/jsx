// functions/api/media.js
// 미디어 파일을 1개씩 업로드/조회/삭제하는 전용 API
// SQLITE_TOOBIG 방지: 절대 여러 파일을 한 요청에 묶지 않음

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

// GET /api/media?entry_id=xxx  — 특정 일기의 미디어 목록 반환
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id");
  if (!entryId) {
    return new Response(JSON.stringify({ error: "entry_id가 필요합니다." }), { status: 400 });
  }
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, sort_order, name, type, data FROM diary_media WHERE entry_id = ? ORDER BY sort_order"
    ).bind(entryId).all();
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// POST /api/media  — 미디어 1개 업로드 (로그인 필요)
// body: { entry_id, sort_order, name, type, data }
// data는 단일 파일의 Base64 data URL
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
    }

    const { entry_id, sort_order, name, type, data } = await request.json();

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

    const { results } = await env.DB.prepare(
      "INSERT INTO diary_media (entry_id, sort_order, name, type, data) VALUES (?, ?, ?, ?, ?) RETURNING id"
    ).bind(entry_id, sort_order ?? 0, name || "", type || "", data).all();

    return new Response(JSON.stringify({ success: true, id: results[0]?.id }), { status: 201 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// DELETE /api/media?entry_id=xxx  — 특정 일기의 미디어 전체 삭제 (로그인 필요)
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

    // 소유자 확인
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

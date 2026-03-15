// functions/api/comments.js
// GET    /api/comments?entry_id=xxx  — 댓글 목록 (인증 불필요)
// POST   /api/comments               — 댓글 작성 (인증 불필요, 닉네임 필수)
// DELETE /api/comments               — 댓글 삭제 (로그인 사용자만)

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

// GET: 댓글 목록
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id");
  if (!entryId) {
    return new Response(JSON.stringify({ error: "entry_id required" }), { status: 400 });
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, entry_id, content, author, user_id, created_at
       FROM diary_comments
       WHERE entry_id = ?
       ORDER BY created_at ASC`
    ).bind(entryId).all();
    return new Response(JSON.stringify(results || []), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// POST: 댓글 작성 (비로그인 허용)
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { entry_id, content, author, token: bodyToken } = body;

    if (!entry_id || !content?.trim()) {
      return new Response(JSON.stringify({ error: "entry_id와 content가 필요합니다." }), { status: 400 });
    }
    if (!author?.trim()) {
      return new Response(JSON.stringify({ error: "닉네임이 필요합니다." }), { status: 400 });
    }
    if (author.trim().length > 20) {
      return new Response(JSON.stringify({ error: "닉네임은 20자 이내로 입력해주세요." }), { status: 400 });
    }
    if (content.trim().length > 1000) {
      return new Response(JSON.stringify({ error: "댓글은 1000자 이내로 작성해주세요." }), { status: 400 });
    }

    // 로그인 사용자면 user_id 매핑 (선택)
    let userId = null;
    if (bodyToken) {
      try {
        const session = await env.DB.prepare(
          "SELECT user_id, expires_at FROM sessions WHERE token = ?"
        ).bind(bodyToken).first();
        if (session && new Date(session.expires_at) >= new Date()) {
          userId = session.user_id;
        }
      } catch {}
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO diary_comments (id, entry_id, user_id, author, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, entry_id, userId, author.trim(), content.trim(), now).run();

    return new Response(JSON.stringify({ ok: true, id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// DELETE: 댓글 삭제 (로그인 사용자만)
export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
    }

    const { id } = await request.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
    }

    const comment = await env.DB.prepare(
      "SELECT id FROM diary_comments WHERE id = ?"
    ).bind(id).first();
    if (!comment) {
      return new Response(JSON.stringify({ error: "댓글을 찾을 수 없습니다." }), { status: 404 });
    }

    await env.DB.prepare("DELETE FROM diary_comments WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

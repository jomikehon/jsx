// functions/api/comments.js
// GET    /api/comments?entry_id=xxx  — 댓글 목록 (인증 불필요)
// POST   /api/comments               — 댓글 작성 (인증 불필요, 닉네임 필수)
// DELETE /api/comments               — 댓글 삭제 (로그인 사용자만)

async function getSession(db, token) {
  if (!token) return null;
  const now = new Date().toISOString();
  return await db.prepare(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > ?"
  ).bind(token, now).first();
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.DB;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  // ── GET: 댓글 목록 ──
  if (method === "GET") {
    const entryId = url.searchParams.get("entry_id");
    if (!entryId) return Response.json({ error: "entry_id required" }, { status: 400 });
    try {
      const rows = await db.prepare(
        `SELECT id, entry_id, content, author, user_id, created_at
         FROM diary_comments
         WHERE entry_id = ?
         ORDER BY created_at ASC`
      ).bind(entryId).all();
      return Response.json(rows.results || []);
    } catch {
      return Response.json([]);
    }
  }

  // ── POST: 댓글 작성 (로그인 불필요) ──
  if (method === "POST") {
    let body;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

    const { entry_id, content, author, token } = body;
    if (!entry_id || !content?.trim()) {
      return Response.json({ error: "entry_id와 content가 필요합니다." }, { status: 400 });
    }
    if (!author?.trim()) {
      return Response.json({ error: "닉네임이 필요합니다." }, { status: 400 });
    }
    if (author.trim().length > 20) {
      return Response.json({ error: "닉네임은 20자 이내로 입력해주세요." }, { status: 400 });
    }
    if (content.length > 1000) {
      return Response.json({ error: "댓글은 1000자 이내로 작성해주세요." }, { status: 400 });
    }

    // 로그인 사용자라면 user_id 매핑 (선택적)
    let userId = null;
    if (token) {
      const session = await getSession(db, token);
      if (session) userId = session.user_id;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      "INSERT INTO diary_comments (id, entry_id, user_id, author, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, entry_id, userId, author.trim(), content.trim(), now).run();

    return Response.json({ ok: true, id });
  }

  // ── DELETE: 댓글 삭제 (로그인 사용자만) ──
  if (method === "DELETE") {
    const token = request.headers.get("X-Session-Token");
    const session = await getSession(db, token);
    if (!session) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

    let body;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

    const { id } = body;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const comment = await db.prepare("SELECT * FROM diary_comments WHERE id = ?").bind(id).first();
    if (!comment) return Response.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });

    await db.prepare("DELETE FROM diary_comments WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

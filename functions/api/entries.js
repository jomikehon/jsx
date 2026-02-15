// functions/api/entries.js
// [수정] SQLITE_TOOBIG 방지: 미디어(Base64)를 diary_media 테이블에 행 단위로 분리 저장

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
    // 일기 목록 조회
    const { results: entries } = await env.DB.prepare(
      "SELECT id, date, title, content, mood, tags, created_at FROM diary_entries ORDER BY date DESC, created_at DESC"
    ).all();

    if (entries.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 미디어를 별도 테이블에서 일괄 조회 (N+1 방지)
    const ids = entries.map(e => `'${e.id.replace(/'/g, "''")}'`).join(",");
    const { results: mediaRows } = await env.DB.prepare(
      `SELECT entry_id, sort_order, name, type, data FROM diary_media WHERE entry_id IN (${ids}) ORDER BY entry_id, sort_order`
    ).all();

    // entry_id 기준으로 미디어 그루핑
    const mediaMap = {};
    for (const m of mediaRows) {
      if (!mediaMap[m.entry_id]) mediaMap[m.entry_id] = [];
      mediaMap[m.entry_id].push({ name: m.name, type: m.type, data: m.data });
    }

    const parsed = entries.map(item => ({
      ...item,
      tags: item.tags || "",
      media: mediaMap[item.id] || [],
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
    const mediaList = Array.isArray(media) ? media : [];

    // 기존 글 확인
    const existing = await env.DB.prepare(
      "SELECT user_id FROM diary_entries WHERE id = ?"
    ).bind(id).first();

    if (existing) {
      // 본인 글인지 확인
      if (existing.user_id !== user.user_id) {
        return new Response(JSON.stringify({ error: "수정 권한이 없습니다." }), { status: 403 });
      }

      // 일기 본문 업데이트 (media 컬럼 없음)
      await env.DB.prepare(
        "UPDATE diary_entries SET title=?, content=?, mood=?, tags=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(title, content, mood, tagsStr, id).run();

      // 기존 미디어 전체 삭제 후 재삽입 (수정 시 미디어도 교체)
      await env.DB.prepare("DELETE FROM diary_media WHERE entry_id = ?").bind(id).run();

    } else {
      // 신규 일기 삽입 (media 컬럼 없음)
      await env.DB.prepare(
        "INSERT INTO diary_entries (id, date, title, content, mood, tags, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, date, title, content, mood, tagsStr, user.user_id).run();
    }

    // 미디어를 파일 1개 = 행 1개로 분리 저장
    // → 단일 컬럼 크기가 줄어 SQLITE_TOOBIG 방지
    if (mediaList.length > 0) {
      const stmt = env.DB.prepare(
        "INSERT INTO diary_media (entry_id, sort_order, name, type, data) VALUES (?, ?, ?, ?, ?)"
      );
      const inserts = mediaList.map((m, idx) =>
        stmt.bind(id, idx, m.name || "", m.type || "", m.data || "")
      );
      await env.DB.batch(inserts);
    }

    const isNew = !existing;
    return new Response(
      JSON.stringify({ success: true, message: isNew ? "저장되었습니다." : "수정되었습니다." }),
      { status: isNew ? 201 : 200 }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

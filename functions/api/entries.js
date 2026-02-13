// functions/api/entries.js

// 1. 전체 일기 목록 가져오기 (GET)
export async function onRequestGet(context) {
  const { env } = context;
  try {
    // 최신순으로 모든 일기 조회
    const { results } = await env.DB.prepare(
      "SELECT id, date, title, content, mood, tags, media, created_at FROM diary_entries ORDER BY date DESC, created_at DESC"
    ).all();

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// 2. 일기 저장 및 수정 (POST)
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    const { id, date, title, content, mood, tags, media, password_hash } = data;

    // 기존 게시글이 있는지 확인
    const existing = await env.DB.prepare(
      "SELECT password_hash FROM diary_entries WHERE id = ?"
    ).bind(id).first();

    if (existing) {
      // [보안 로직] 본인 확인: DB의 해시와 요청된 해시가 다르면 수정 거부
      if (existing.password_hash !== password_hash) {
        return new Response(JSON.stringify({ error: "수정 권한이 없습니다." }), { status: 403 });
      }

      // 수정 실행
      await env.DB.prepare(
        "UPDATE diary_entries SET title=?, content=?, mood=?, tags=?, media=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(title, content, mood, JSON.stringify(tags), JSON.stringify(media), id).run();
      
      return new Response(JSON.stringify({ success: true, message: "수정되었습니다." }));
    } else {
      // 새 글 작성 실행
      await env.DB.prepare(
        "INSERT INTO diary_entries (id, date, title, content, mood, tags, media, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, date, title, content, mood, JSON.stringify(tags), JSON.stringify(media), password_hash).run();

      return new Response(JSON.stringify({ success: true, message: "저장되었습니다." }), { status: 201 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
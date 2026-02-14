// functions/api/entries.js

// 1. 전체 일기 목록 가져오기 (GET)
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, date, title, content, mood, tags, media, created_at FROM diary_entries ORDER BY date DESC, created_at DESC"
    ).all();

    // media는 JSON 문자열 -> 파싱, tags는 문자열 그대로
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

// 2. 일기 저장 및 수정 (POST)
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    const { id, date, title, content, mood, tags, media, password_hash } = data;

    if (!id || !title || !content || !password_hash) {
      return new Response(JSON.stringify({ error: "필수 항목이 누락되었습니다." }), { status: 400 });
    }

    // tags는 문자열로, media는 JSON 직렬화
    const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");
    const mediaJson = JSON.stringify(Array.isArray(media) ? media : []);

    // 기존 게시글 확인
    const existing = await env.DB.prepare(
      "SELECT password_hash FROM diary_entries WHERE id = ?"
    ).bind(id).first();

    if (existing) {
      // 본인 확인
      if (existing.password_hash !== password_hash) {
        return new Response(JSON.stringify({ error: "수정 권한이 없습니다." }), { status: 403 });
      }
      // 수정
      await env.DB.prepare(
        "UPDATE diary_entries SET title=?, content=?, mood=?, tags=?, media=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(title, content, mood, tagsStr, mediaJson, id).run();

      return new Response(JSON.stringify({ success: true, message: "수정되었습니다." }));
    } else {
      // 신규 작성
      await env.DB.prepare(
        "INSERT INTO diary_entries (id, date, title, content, mood, tags, media, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, date, title, content, mood, tagsStr, mediaJson, password_hash).run();

      return new Response(JSON.stringify({ success: true, message: "저장되었습니다." }), { status: 201 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

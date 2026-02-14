// functions/api/delete.js
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { id, password_hash } = await request.json();

    if (!id || !password_hash) {
      return new Response(JSON.stringify({ error: "id와 password_hash가 필요합니다." }), { status: 400 });
    }

    // 먼저 해당 글이 존재하는지 확인
    const existing = await env.DB.prepare(
      "SELECT id, password_hash FROM diary_entries WHERE id = ?"
    ).bind(id).first();

    if (!existing) {
      return new Response(JSON.stringify({ error: "이미 삭제된 글입니다." }), { status: 404 });
    }

    // 비밀번호 해시 비교
    if (existing.password_hash !== password_hash) {
      return new Response(JSON.stringify({ error: "비밀번호가 맞지 않습니다." }), { status: 403 });
    }

    // 삭제 실행
    await env.DB.prepare("DELETE FROM diary_entries WHERE id = ?").bind(id).run();

    return new Response(JSON.stringify({ success: true }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

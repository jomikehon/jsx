// functions/api/delete.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const { id, password_hash } = await request.json();

  const result = await env.DB.prepare(
    "DELETE FROM diary_entries WHERE id = ? AND password_hash = ?"
  ).bind(id, password_hash).run();

  if (result.meta.changes === 0) {
    return new Response(JSON.stringify({ error: "권한이 없거나 이미 삭제되었습니다." }), { status: 403 });
  }
  return new Response(JSON.stringify({ success: true }));
}

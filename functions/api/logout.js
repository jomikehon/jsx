// functions/api/logout.js
// POST /api/logout  { token }
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { token } = await request.json();
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    }
    return new Response(JSON.stringify({ success: true }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// functions/api/login.js
// POST /api/login  { username, password }
// → DB의 users 테이블에서 username + password_hash 검증
// → 성공 시 session_token 반환 (랜덤 hex 32바이트)

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: "아이디와 비밀번호를 입력하세요." }), { status: 400 });
    }

    // SHA-256 해시 (클라이언트와 동일 방식)
    const pwHash = await sha256(password);

    // users 테이블에서 조회
    const user = await env.DB.prepare(
      "SELECT id, username FROM users WHERE username = ? AND password_hash = ?"
    ).bind(username, pwHash).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "아이디 또는 비밀번호가 맞지 않습니다." }), { status: 401 });
    }

    // 세션 토큰 생성 (랜덤 32바이트 hex)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7일

    // sessions 테이블에 저장
    await env.DB.prepare(
      "INSERT INTO sessions (token, user_id, username, expires_at) VALUES (?, ?, ?, ?)"
    ).bind(token, user.id, user.username, expiresAt).run();

    return new Response(JSON.stringify({ success: true, token, username: user.username }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

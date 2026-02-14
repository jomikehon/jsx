# 🌿 나의 하루 일기 - Cloudflare Pages + D1

## 인증 구조

```
[브라우저]  →  POST /api/login { username, password }
                ↓
[login.js]  →  D1 users 테이블에서 username + SHA-256(password) 비교
                ↓
            ←  { token: "랜덤64자hex" }  (세션 7일)
                ↓
[이후 요청]  →  Header: X-Session-Token: <token>
                ↓
[entries/delete.js]  →  sessions 테이블에서 token 검증 → user_id 확인
```

## D1 DB 설정 (초기 1회)

### 1. Cloudflare Dashboard → D1 → 데이터베이스 선택 → Console

`schema.sql` 내용을 붙여넣기 후 실행하세요.

### 2. 계정 등록

비밀번호의 SHA-256 해시를 구합니다:

```bash
# Python
python3 -c "import hashlib; print(hashlib.sha256(b'YOUR_PASSWORD').hexdigest())"

# Node.js
node -e "require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('hex') |> console.log"
```

D1 Console에서 INSERT:
```sql
INSERT INTO users (username, password_hash) VALUES ('admin', '해시값여기에');
```

## 로컬 개발

```bash
npm install
npm run dev
```

## Cloudflare Pages 배포

```bash
npm run build
wrangler pages deploy dist --project-name jsx
```

## 기술 스택

- React 18 + Vite 6
- Cloudflare Pages + D1 (SQLite)
- 세션 토큰 인증 (users/sessions 테이블)

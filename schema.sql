-- ============================================================
-- 나의 하루 일기 - Cloudflare D1 스키마
-- Cloudflare Dashboard > D1 > jsx DB > Console 에서 실행하세요
-- ============================================================

-- 1. 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- SHA-256 hex
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 2. 세션 테이블
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,       -- 랜덤 64자 hex
  user_id    INTEGER NOT NULL,
  username   TEXT NOT NULL,
  expires_at TEXT NOT NULL,          -- ISO 8601
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 일기 테이블 (기존 password_hash 컬럼 → user_id 로 변경)
CREATE TABLE IF NOT EXISTS diary_entries (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  mood       TEXT DEFAULT '😊',
  tags       TEXT DEFAULT '',
  media      TEXT DEFAULT '[]',
  user_id    INTEGER,                -- 작성자 (NULL 허용: 기존 데이터 호환)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- 계정 등록 예시 (비밀번호 SHA-256 해시를 직접 넣어야 합니다)
-- 아래 Python/Node 로 해시 생성:
--   Python:  import hashlib; print(hashlib.sha256(b"your_password").hexdigest())
--   Node:    require('crypto').createHash('sha256').update('your_password').digest('hex')
-- ============================================================
-- INSERT INTO users (username, password_hash) VALUES ('admin', '<SHA256_HASH_HERE>');

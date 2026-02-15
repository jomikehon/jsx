-- ============================================================
-- 나의 하루 일기 - Cloudflare D1 스키마 (v2 - 미디어 분리)
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

-- 3. 일기 테이블 (media 컬럼 제거 → diary_media 테이블로 분리)
CREATE TABLE IF NOT EXISTS diary_entries (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  mood       TEXT DEFAULT '😊',
  tags       TEXT DEFAULT '',
  user_id    INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. 미디어 테이블 (Base64 데이터를 행 단위로 분리 저장)
--    D1 단일 컬럼 크기 제한(~1MB)을 피하기 위해 파일 1개 = 행 1개
CREATE TABLE IF NOT EXISTS diary_media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id   TEXT NOT NULL,          -- diary_entries.id 참조
  sort_order INTEGER NOT NULL DEFAULT 0,
  name       TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL,          -- Base64 data URL (1파일씩 저장)
  FOREIGN KEY (entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
);

-- ============================================================
-- [마이그레이션] 기존 diary_entries 테이블이 이미 있다면:
--   diary_media 테이블만 추가로 CREATE 하세요.
--   기존 media 컬럼은 그대로 둬도 무방합니다.
-- ============================================================

-- ============================================================
-- 계정 등록 예시 (비밀번호 SHA-256 해시를 직접 넣어야 합니다)
--   Python:  import hashlib; print(hashlib.sha256(b"your_password").hexdigest())
--   Node:    require('crypto').createHash('sha256').update('your_password').digest('hex')
-- ============================================================
-- INSERT INTO users (username, password_hash) VALUES ('admin', '<SHA256_HASH_HERE>');

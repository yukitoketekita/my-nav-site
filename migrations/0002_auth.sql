-- 仅新增管理会话和限流表，不删除或重写现有表。
CREATE TABLE IF NOT EXISTS nav_sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, password_version TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS nav_sessions_expiry ON nav_sessions(expires_at);
CREATE TABLE IF NOT EXISTS nav_login_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS nav_attempts_expiry ON nav_login_attempts(expires_at);

-- Per-project settings for owner-only writes (write_scope) and a hard entry TTL (entry_ttl_s).
-- Defaults keep today's behavior: shared editing, entries never expire.
ALTER TABLE projects ADD COLUMN write_scope TEXT NOT NULL DEFAULT 'any' CHECK (write_scope IN ('any','owner'));
ALTER TABLE projects ADD COLUMN entry_ttl_s INTEGER CHECK (entry_ttl_s IS NULL OR entry_ttl_s > 0);

-- Set on insert when the project has entry_ttl_s; NULL = never expires.
ALTER TABLE entries ADD COLUMN expires_at TEXT;
CREATE INDEX ix_entries_expires_at ON entries (expires_at) WHERE expires_at IS NOT NULL;

-- "Delete my data" (per project) and the orphaned-user cleanup look entries up by author.
CREATE INDEX ix_entries_created_by ON entries (created_by_osm_uid, project_id);
CREATE INDEX ix_entries_updated_by ON entries (updated_by_osm_uid);
CREATE INDEX ix_verified_tokens_osm_uid ON verified_tokens (osm_uid);

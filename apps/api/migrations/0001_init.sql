CREATE TABLE projects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  api_key       TEXT NOT NULL UNIQUE,                          -- 'kv_' + 40 hex
  origins       TEXT NOT NULL CHECK (json_valid(origins)),     -- ["https://a.example", "http://localhost:*"]
  read_access   TEXT NOT NULL DEFAULT 'public'       CHECK (read_access IN ('public','osm_user')),
  write_access  TEXT NOT NULL DEFAULT 'any_osm_user' CHECK (write_access IN ('any_osm_user','allowlist')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  disabled_at   TEXT
);

CREATE TABLE osm_users (
  osm_uid       INTEGER PRIMARY KEY,
  display_name  TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE entries (
  pk                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_id            TEXT NOT NULL,
  data                TEXT NOT NULL CHECK (json_valid(data)),
  tags                TEXT NOT NULL CHECK (json_valid(tags)),  -- denormalized copy for fast reads
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  created_by_osm_uid  INTEGER NOT NULL,
  updated_by_osm_uid  INTEGER NOT NULL,
  UNIQUE (project_id, entry_id)
);
CREATE INDEX ix_entries_project_updated ON entries (project_id, updated_at, pk);

CREATE TABLE entry_tags (                                       -- normalized tag index
  entry_pk    INTEGER NOT NULL REFERENCES entries(pk) ON DELETE CASCADE,
  project_id  INTEGER NOT NULL,                                 -- denormalized for index locality
  tag         TEXT NOT NULL,
  PRIMARY KEY (entry_pk, tag)
);
CREATE INDEX ix_entry_tags_project_tag ON entry_tags (project_id, tag, entry_pk);

CREATE TABLE verified_tokens (                                  -- internal cache of OSM token checks
  token_hash   TEXT PRIMARY KEY,                                -- sha256 hex of the OSM access token
  osm_uid      INTEGER NOT NULL,
  verified_at  TEXT NOT NULL                                    -- last successful user/details.json call
);
CREATE INDEX ix_verified_tokens_verified_at ON verified_tokens (verified_at);

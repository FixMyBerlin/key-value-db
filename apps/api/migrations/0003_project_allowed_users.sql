-- Who may write to a project with write_access = 'allowlist'. Checked by osm_uid only.
-- display_name is the OSM name at the time the user was added: a note for admins, never used for the check.
-- Projects with write_access = 'any_osm_user' ignore this table.
CREATE TABLE project_allowed_users (
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  osm_uid       INTEGER NOT NULL,
  display_name  TEXT NOT NULL,
  added_at      TEXT NOT NULL,
  PRIMARY KEY (project_id, osm_uid)
);

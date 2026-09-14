-- SQLite schema for mock ShotGrid data (read-only provider).
-- Entity tables and junction tables for many-to-many relationships.

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    login TEXT
);

CREATE TABLE IF NOT EXISTS project_users (
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shots (
    id INTEGER PRIMARY KEY,
    name TEXT,
    description TEXT,
    project_id INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY,
    name TEXT,
    description TEXT,
    project_id INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    name TEXT,
    status TEXT,
    pipeline_step_id INTEGER,
    pipeline_step_name TEXT,
    project_id INTEGER NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY,
    name TEXT,
    description TEXT,
    status TEXT,
    user_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    movie_path TEXT,
    frame_path TEXT,
    thumbnail TEXT,
    project_id INTEGER NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    task_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY,
    code TEXT,
    description TEXT,
    project_id INTEGER NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS playlist_versions (
    playlist_id INTEGER NOT NULL,
    version_id INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, version_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id),
    FOREIGN KEY (version_id) REFERENCES versions(id)
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    subject TEXT,
    content TEXT,
    project_id INTEGER NOT NULL,
    author_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS note_links (
    note_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, entity_type, entity_id),
    FOREIGN KEY (note_id) REFERENCES notes(id)
);

CREATE TABLE IF NOT EXISTS version_statuses (
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    PRIMARY KEY (code, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_shots_project ON shots(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id);
CREATE INDEX IF NOT EXISTS idx_playlists_project ON playlists(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_playlist_versions_playlist ON playlist_versions(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_versions_version ON playlist_versions(version_id);
CREATE INDEX IF NOT EXISTS idx_note_links_note ON note_links(note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_entity ON note_links(entity_type, entity_id);

CREATE TABLE project_link_feedback (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    context TEXT NOT NULL,
    signal TEXT NOT NULL CHECK(signal IN ('attached', 'dismissed')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(project_id, item_id, context)
);
CREATE INDEX project_link_feedback_item ON project_link_feedback(item_id);
CREATE INDEX project_link_feedback_recent ON project_link_feedback(created_at DESC);

INSERT INTO project_link_feedback(project_id,item_id,context,signal,created_at)
SELECT p.id, i.id, trim(p.name || char(10) || p.goal || char(10) || p.description, char(9) || char(10) || char(13) || ' '), 'attached', i.updated_at
FROM items i JOIN projects p ON p.id = i.project_id AND p.user_id = i.user_id
WHERE i.canonical_url IS NOT NULL AND i.status <> 'archived';

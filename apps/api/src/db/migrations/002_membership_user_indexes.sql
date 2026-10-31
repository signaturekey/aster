-- Existing primary keys lead with the parent ID. User-scoped chat and project
-- listing also need an index that can find memberships without scanning others.
CREATE INDEX conversation_members_user_id_conversation_id_idx
    ON conversation_members(user_id, conversation_id);
CREATE INDEX project_members_user_id_project_id_idx
    ON project_members(user_id, project_id);

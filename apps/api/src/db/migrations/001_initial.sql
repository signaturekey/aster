-- Fresh-schema baseline, executed transactionally by Kysely Migrator. Do not
-- silently adopt existing tables: incompatible schemas must fail initialization.
-- Future schema changes belong in new migrations, not edits to an applied file.
CREATE TABLE specializations (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

CREATE TABLE experience_levels (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Better Auth owns authentication IDs. Unlike product records, these tables
-- deliberately have no SQL ID default. All timestamps are pg Date-compatible.
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ(3) NOT NULL,
    token TEXT NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    user_id TEXT NOT NULL,
    CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at TIMESTAMPTZ(3),
    refresh_token_expires_at TIMESTAMPTZ(3),
    scope TEXT,
    password TEXT,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE verifications (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ(3) NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Defaults apply at insertion only. Owning mutations explicitly set updated_at
-- on real changes; no trigger advances timestamps for empty/idempotent writes.
CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    specialization_id TEXT,
    experience_id TEXT,
    discoverable BOOLEAN NOT NULL DEFAULT false,
    portfolio_links TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT profiles_specialization_id_fkey FOREIGN KEY (specialization_id)
        REFERENCES specializations(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT profiles_experience_id_fkey FOREIGN KEY (experience_id)
        REFERENCES experience_levels(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE profile_skills (
    user_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    PRIMARY KEY (user_id, skill_id),
    CONSTRAINT profile_skills_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES profiles(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT profile_skills_skill_id_fkey FOREIGN KEY (skill_id)
        REFERENCES skills(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE profile_goals (
    user_id TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    PRIMARY KEY (user_id, goal_id),
    CONSTRAINT profile_goals_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES profiles(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT profile_goals_goal_id_fkey FOREIGN KEY (goal_id)
        REFERENCES goals(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE discovery_decisions (
    actor_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_id, target_id),
    CONSTRAINT discovery_decisions_actor_id_fkey FOREIGN KEY (actor_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT discovery_decisions_target_id_fkey FOREIGN KEY (target_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT decision_value CHECK (value IN ('interested', 'skipped')),
    CONSTRAINT decision_not_self CHECK (actor_id <> target_id)
);

-- Product UUID defaults remain TEXT so public IDs and shared user foreign-key
-- types stay strings. RETURNING supplies IDs/timestamps for dependent inserts.
CREATE TABLE matches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    low_id TEXT NOT NULL,
    high_id TEXT NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT matches_low_id_fkey FOREIGN KEY (low_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT matches_high_id_fkey FOREIGN KEY (high_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Match service ordering must not depend on the database's locale.
    CONSTRAINT match_canonical_pair CHECK (low_id COLLATE "C" < high_id COLLATE "C")
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    required_roles TEXT[] NOT NULL,
    owner_id TEXT NOT NULL,
    recruitment_open BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT projects_goal_id_fkey FOREIGN KEY (goal_id)
        REFERENCES goals(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE project_skills (
    project_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    PRIMARY KEY (project_id, skill_id),
    CONSTRAINT project_skills_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT project_skills_skill_id_fkey FOREIGN KEY (skill_id)
        REFERENCES skills(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE project_members (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Defer this circular reference until commit so project/owner membership can be
-- created atomically and ownership can transfer without an ownerless commit.
-- NO ACTION deliberately matches the original deferred FK (not CASCADE).
ALTER TABLE projects ADD CONSTRAINT project_owner_is_member
    FOREIGN KEY (id, owner_id) REFERENCES project_members(project_id, user_id)
    ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE applications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT applications_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT applications_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT application_state CHECK (state IN ('pending', 'accepted', 'rejected', 'withdrawn'))
);

CREATE TABLE conversations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    match_id TEXT,
    project_id TEXT,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Preserve SET NULL delete actions together with the source check: deleting
    -- a live source cannot leave a conversation without its durable provenance.
    CONSTRAINT conversations_match_id_fkey FOREIGN KEY (match_id)
        REFERENCES matches(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT conversations_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT conversation_one_source CHECK (
        (match_id IS NOT NULL)::int + (project_id IS NOT NULL)::int = 1
    )
);

CREATE TABLE conversation_members (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id)
        REFERENCES conversations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT conversation_members_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id)
        REFERENCES conversations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT message_nonblank CHECK (length(btrim(text)) > 0 AND length(text) <= 4000)
);

CREATE UNIQUE INDEX users_email_key ON users(email);
CREATE UNIQUE INDEX sessions_token_key ON sessions(token);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX accounts_user_id_idx ON accounts(user_id);
CREATE INDEX verifications_identifier_idx ON verifications(identifier);
CREATE INDEX profiles_created_at_user_id_idx ON profiles(created_at, user_id);
CREATE UNIQUE INDEX matches_low_id_high_id_key ON matches(low_id, high_id);
CREATE INDEX projects_created_at_id_idx ON projects(created_at, id);
CREATE INDEX applications_project_id_created_at_id_idx ON applications(project_id, created_at, id);
CREATE INDEX applications_user_id_created_at_id_idx ON applications(user_id, created_at, id);
-- Terminal history remains available while only one pending submission is
-- allowed for a given user/project, including under concurrent inserts.
CREATE UNIQUE INDEX applications_one_pending ON applications(project_id, user_id) WHERE state = 'pending';
CREATE UNIQUE INDEX conversations_match_id_key ON conversations(match_id);
CREATE UNIQUE INDEX conversations_project_id_key ON conversations(project_id);
CREATE INDEX conversations_created_at_id_idx ON conversations(created_at, id);
CREATE INDEX messages_conversation_id_created_at_id_idx ON messages(conversation_id, created_at, id);
-- Idempotency is scoped to a sender in a conversation, not global request IDs.
CREATE UNIQUE INDEX messages_conversation_id_sender_id_request_id_key ON messages(conversation_id, sender_id, request_id);

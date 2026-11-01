-- Provenance outlives deleted fictional records. Deliberately no foreign key:
-- rerunning the explicit seed must not resurrect a deleted account or scenario.
-- Ordinary migrations only create this empty ledger, never development data.
CREATE TABLE dev_seed_markers (
    version TEXT NOT NULL,
    group_key TEXT NOT NULL,
    record_id TEXT,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version, group_key)
);

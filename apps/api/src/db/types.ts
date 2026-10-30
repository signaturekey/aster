import type { ColumnType, Generated } from "kysely";

// The committed SQL migrations are schema authority. These handwritten types use
// physical snake_case names directly; public DTOs remain separate projections.
// pg returns timestamptz as Date, but inserts/updates may also pass ISO strings.
export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

// Omission invokes CURRENT_TIMESTAMP on insert only. There are no update
// triggers: mutations must set updated_at explicitly, and no-ops must leave it.
export type DefaultTimestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

export interface SpecializationTable {
  id: string;
  label: string;
}

export interface SkillTable {
  id: string;
  label: string;
}

export interface ExperienceLevelTable {
  id: string;
  label: string;
}

export interface GoalTable {
  id: string;
  label: string;
}

// Better Auth supplies authentication IDs; only product UUID IDs below have
// database defaults. Dictionary IDs and profile/join foreign keys are explicit.
export interface UserTable {
  id: string;
  name: string;
  email: string;
  email_verified: Generated<boolean>;
  image: string | null;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface SessionTable {
  id: string;
  expires_at: Timestamp;
  token: string;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
  ip_address: string | null;
  user_agent: string | null;
  user_id: string;
}

export interface AccountTable {
  id: string;
  account_id: string;
  provider_id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: NullableTimestamp;
  refresh_token_expires_at: NullableTimestamp;
  scope: string | null;
  password: string | null;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expires_at: Timestamp;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ProfileTable {
  user_id: string;
  display_name: Generated<string>;
  bio: Generated<string>;
  specialization_id: string | null;
  experience_id: string | null;
  discoverable: Generated<boolean>;
  portfolio_links: Generated<string[]>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ProfileSkillTable {
  user_id: string;
  skill_id: string;
}

export interface ProfileGoalTable {
  user_id: string;
  goal_id: string;
}

export interface DiscoveryDecisionTable {
  actor_id: string;
  target_id: string;
  value: "interested" | "skipped";
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface MatchTable {
  id: Generated<string>;
  low_id: string;
  high_id: string;
  created_at: DefaultTimestamp;
}

export interface ProjectTable {
  id: Generated<string>;
  title: string;
  description: string;
  goal_id: string;
  required_roles: string[];
  owner_id: string;
  recruitment_open: Generated<boolean>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ProjectSkillTable {
  project_id: string;
  skill_id: string;
}

export interface ProjectMemberTable {
  project_id: string;
  user_id: string;
  created_at: DefaultTimestamp;
}

export interface ApplicationTable {
  id: Generated<string>;
  project_id: string;
  user_id: string;
  text: string;
  state: Generated<"pending" | "accepted" | "rejected" | "withdrawn">;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ConversationTable {
  id: Generated<string>;
  match_id: string | null;
  project_id: string | null;
  created_at: DefaultTimestamp;
}

export interface ConversationMemberTable {
  conversation_id: string;
  user_id: string;
}

export interface MessageTable {
  id: Generated<string>;
  conversation_id: string;
  sender_id: string;
  request_id: string;
  text: string;
  created_at: DefaultTimestamp;
}

export interface DB {
  specializations: SpecializationTable;
  skills: SkillTable;
  experience_levels: ExperienceLevelTable;
  goals: GoalTable;
  users: UserTable;
  sessions: SessionTable;
  accounts: AccountTable;
  verifications: VerificationTable;
  profiles: ProfileTable;
  profile_skills: ProfileSkillTable;
  profile_goals: ProfileGoalTable;
  discovery_decisions: DiscoveryDecisionTable;
  matches: MatchTable;
  projects: ProjectTable;
  project_skills: ProjectSkillTable;
  project_members: ProjectMemberTable;
  applications: ApplicationTable;
  conversations: ConversationTable;
  conversation_members: ConversationMemberTable;
  messages: MessageTable;
}

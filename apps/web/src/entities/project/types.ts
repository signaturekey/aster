import type { api } from "@web/shared/api/client";

// Inference follows Eden's public response, never the backend's runtime/schema graph.
type ProjectsResult = Awaited<ReturnType<typeof api.api.v1.projects.get>>;
export type ProjectPage = NonNullable<ProjectsResult["data"]>;
export type Project = ProjectPage["items"][number];
type ProjectEndpoint = ReturnType<typeof api.api.v1.projects>;
export type ProjectCreate = Parameters<typeof api.api.v1.projects.post>[0];
export type ProjectPatch = Parameters<ProjectEndpoint["patch"]>[0];
export type MemberPage = NonNullable<
  Awaited<ReturnType<ProjectEndpoint["members"]["get"]>>["data"]
>;
export type Member = MemberPage["items"][number];
export type ApplicationPage = NonNullable<
  Awaited<ReturnType<typeof api.api.v1.me.applications.get>>["data"]
>;
export type Application = ApplicationPage["items"][number];
export type Dictionaries = NonNullable<
  Awaited<ReturnType<typeof api.api.v1.dictionaries.get>>["data"]
>;

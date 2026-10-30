import { Elysia } from "elysia";
import type { Database } from "../../db/client";
import { errorResponses } from "../../lib/errors";
import { pageQuerySchema } from "../../lib/pagination";
import { identityGuard } from "../identity/routes";
import type { Auth } from "../identity/service";
import {
  listApplications,
  submitApplication,
  transitionApplication,
} from "./applications";
import { removeMember, transferOwnership } from "./membership";
import {
  applicationCreateSchema,
  applicationPageSchema,
  applicationParamsSchema,
  applicationSchema,
  memberPageSchema,
  memberParamsSchema,
  projectCreateSchema,
  projectPageSchema,
  projectParamsSchema,
  projectPatchSchema,
  projectSchema,
  removedSchema,
  transferSchema,
} from "./schemas";
import {
  createProject,
  getProject,
  listMembers,
  listProjects,
  updateProject,
} from "./service";

/** Authenticated project catalogue, recruitment, private applications and teams.
 * Collections use {items,nextCursor}, newest (createdAt,id) first, default 20,
 * maximum 50. Roster cursors use userId as the membership's stable ID.
 * Creation always opens recruitment. PATCH is owner-only; applications require
 * a complete profile but no match. Membership changes preserve chat history.
 */
export function projectRoutes(
  db: Database,
  auth: Auth,
  trustedOrigins: string[],
) {
  return new Elysia({
    name: "project-routes",
    prefix: "/api/v1",
    normalize: false,
  })
    .use(identityGuard(auth, trustedOrigins))
    .get("/projects", ({ query }) => listProjects(db, query), {
      query: pageQuerySchema,
      response: { 200: projectPageSchema, ...errorResponses },
    })
    .post("/projects", ({ actor, body }) => createProject(db, actor.id, body), {
      body: projectCreateSchema,
      response: { 200: projectSchema, ...errorResponses },
    })
    .get(
      "/projects/:projectId",
      ({ params }) => getProject(db, params.projectId),
      {
        params: projectParamsSchema,
        response: { 200: projectSchema, ...errorResponses },
      },
    )
    .patch(
      "/projects/:projectId",
      ({ actor, params, body }) =>
        updateProject(db, actor.id, params.projectId, body),
      {
        params: projectParamsSchema,
        body: projectPatchSchema,
        response: { 200: projectSchema, ...errorResponses },
      },
    )
    .get(
      "/me/projects",
      ({ actor, query }) => listProjects(db, query, actor.id),
      {
        query: pageQuerySchema,
        response: { 200: projectPageSchema, ...errorResponses },
      },
    )
    .get(
      "/projects/:projectId/members",
      ({ params, query }) => listMembers(db, params.projectId, query),
      {
        params: projectParamsSchema,
        query: pageQuerySchema,
        response: { 200: memberPageSchema, ...errorResponses },
      },
    )
    .post(
      "/projects/:projectId/applications",
      ({ actor, params, body }) =>
        submitApplication(db, actor.id, params.projectId, body.text),
      {
        params: projectParamsSchema,
        body: applicationCreateSchema,
        response: { 200: applicationSchema, ...errorResponses },
      },
    )
    .get(
      "/projects/:projectId/applications",
      ({ actor, params, query }) =>
        listApplications(db, actor.id, query, params.projectId),
      {
        params: projectParamsSchema,
        query: pageQuerySchema,
        response: { 200: applicationPageSchema, ...errorResponses },
      },
    )
    .get(
      "/me/applications",
      ({ actor, query }) => listApplications(db, actor.id, query),
      {
        query: pageQuerySchema,
        response: { 200: applicationPageSchema, ...errorResponses },
      },
    )
    .post(
      "/applications/:applicationId/accept",
      ({ actor, params }) =>
        transitionApplication(db, actor.id, params.applicationId, "accepted"),
      {
        params: applicationParamsSchema,
        response: { 200: applicationSchema, ...errorResponses },
      },
    )
    .post(
      "/applications/:applicationId/reject",
      ({ actor, params }) =>
        transitionApplication(db, actor.id, params.applicationId, "rejected"),
      {
        params: applicationParamsSchema,
        response: { 200: applicationSchema, ...errorResponses },
      },
    )
    .post(
      "/applications/:applicationId/withdraw",
      ({ actor, params }) =>
        transitionApplication(db, actor.id, params.applicationId, "withdrawn"),
      {
        params: applicationParamsSchema,
        response: { 200: applicationSchema, ...errorResponses },
      },
    )
    .delete(
      "/projects/:projectId/members/me",
      ({ actor, params }) =>
        removeMember(db, actor.id, params.projectId, actor.id, true),
      {
        params: projectParamsSchema,
        response: { 200: removedSchema, ...errorResponses },
      },
    )
    .delete(
      "/projects/:projectId/members/:userId",
      ({ actor, params }) =>
        removeMember(db, actor.id, params.projectId, params.userId),
      {
        params: memberParamsSchema,
        response: { 200: removedSchema, ...errorResponses },
      },
    )
    .post(
      "/projects/:projectId/transfer-ownership",
      ({ actor, params, body }) =>
        transferOwnership(db, actor.id, params.projectId, body.userId),
      {
        params: projectParamsSchema,
        body: transferSchema,
        response: { 200: projectSchema, ...errorResponses },
      },
    );
}

import type { Database } from "@api/db/client";
import { errorResponses, ProductError } from "@api/lib/errors";
import { pageQuerySchema } from "@api/lib/pagination";
import { identityGuard } from "@api/modules/identity/routes";
import type { Auth } from "@api/modules/identity/service";
import {
  listApplications,
  submitApplication,
  transitionApplication,
} from "@api/modules/projects/applications";
import {
  removeMember,
  transferOwnership,
} from "@api/modules/projects/membership";
import {
  applicationCreateSchema,
  applicationPageSchema,
  applicationParamsSchema,
  applicationSchema,
  memberPageSchema,
  memberParamsSchema,
  projectCatalogueQuerySchema,
  projectCreateSchema,
  projectPageSchema,
  projectParamsSchema,
  projectPatchSchema,
  projectSchema,
  removedSchema,
  transferSchema,
} from "@api/modules/projects/schemas";
import {
  createProject,
  getProject,
  listMembers,
  listProjects,
  updateProject,
} from "@api/modules/projects/service";
import { Elysia } from "elysia";

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
    .get(
      "/projects",
      ({ query, request }) => {
        // Elysia keeps only one value for scalar query fields. Reject repeated
        // filters explicitly rather than silently accepting an ambiguous goal.
        const params = new URL(request.url).searchParams;
        if (params.getAll("q").length > 1 || params.getAll("goalId").length > 1)
          throw new ProductError(
            422,
            "VALIDATION_ERROR",
            "Supply at most one search text and goal.",
          );
        return listProjects(db, query);
      },
      {
        query: projectCatalogueQuerySchema,
        response: { 200: projectPageSchema, ...errorResponses },
      },
    )
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

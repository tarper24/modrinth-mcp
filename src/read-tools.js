/**
 * Read-only Modrinth endpoints (https://docs.modrinth.com/api/).
 *
 * Each tool maps 1:1 to an API operation and returns Modrinth's JSON as-is.
 * Tools that need a token say so in their description and use `auth: true`;
 * public-but-token-aware reads use `auth: "optional"` so drafts/private items
 * the token can see resolve instead of 404ing.
 */

import { z } from "zod";
import { api, ok, postJson, qs, enc } from "./client.js";

const idOrSlug = (what) => z.string().describe(`${what} slug or id.`);
const ids = (what) =>
  z.array(z.string()).min(1).max(100).describe(`${what} ids (max 100).`);
const algorithm = z
  .enum(["sha1", "sha512"])
  .default("sha1")
  .describe("Hash algorithm. Defaults to sha1.");
const hashes = z.array(z.string()).min(1).describe("File hashes, hex-encoded.");
const loaders = z.array(z.string()).describe("Loaders, e.g. ['fabric'].");
const gameVersions = z.array(z.string()).describe("Minecraft versions, e.g. ['1.21.8'].");
const versionTypes = z
  .array(z.enum(["release", "beta", "alpha"]))
  .optional()
  .describe("Restrict to these release channels.");

/** Define a read-only tool whose handler returns the API JSON untouched. */
function read(name, description, inputSchema, run, { needsToken = false } = {}) {
  return {
    name,
    description: needsToken
      ? `${description} Requires MODRINTH_TOKEN with the matching read scope.`
      : description,
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema,
    handler: async (input) => ok(await run(input)),
  };
}

const TAGS = {
  category: "/v2/tag/category",
  loader: "/v2/tag/loader",
  game_version: "/v2/tag/game_version",
  license: "/v2/tag/license",
  donation_platform: "/v2/tag/donation_platform",
  report_type: "/v2/tag/report_type",
  project_type: "/v2/tag/project_type",
  side_type: "/v2/tag/side_type",
};

export const readTools = [
  // ---- Projects ----------------------------------------------------------
  read(
    "modrinth_get_projects",
    "Get several projects at once by id or slug (full project objects).",
    z.object({ ids: ids("Project (id or slug)") }),
    ({ ids }) => api(`/v2/projects${qs({ ids })}`, { auth: "optional" }),
  ),
  read(
    "modrinth_random_projects",
    "Get a list of random projects (full project objects).",
    z.object({ count: z.number().int().min(1).max(100).describe("How many (1-100).") }),
    ({ count }) => api(`/v2/projects_random${qs({ count })}`),
  ),
  read(
    "modrinth_check_project",
    "Check whether a project slug or id exists/is valid. Returns its canonical id.",
    z.object({ id_or_slug: idOrSlug("Project") }),
    ({ id_or_slug }) => api(`/v2/project/${enc(id_or_slug)}/check`, { auth: "optional" }),
  ),
  read(
    "modrinth_get_project_dependencies",
    "Get all of a project's dependencies: the dependency projects and versions.",
    z.object({ id_or_slug: idOrSlug("Project") }),
    ({ id_or_slug }) =>
      api(`/v2/project/${enc(id_or_slug)}/dependencies`, { auth: "optional" }),
  ),
  read(
    "modrinth_get_project_team",
    "Get the members of a project's team (roles, permissions, users).",
    z.object({ id_or_slug: idOrSlug("Project") }),
    ({ id_or_slug }) => api(`/v2/project/${enc(id_or_slug)}/members`, { auth: "optional" }),
  ),

  // ---- Versions ----------------------------------------------------------
  read(
    "modrinth_get_version",
    "Get a single version by its id (full version object, including files and dependencies).",
    z.object({ version_id: z.string().describe("Version id.") }),
    ({ version_id }) => api(`/v2/version/${enc(version_id)}`, { auth: "optional" }),
  ),
  read(
    "modrinth_get_project_version",
    "Get a project's version by version id OR version number (e.g. '1.2.0').",
    z.object({
      id_or_slug: idOrSlug("Project"),
      version: z.string().describe("Version id or version_number."),
    }),
    ({ id_or_slug, version }) =>
      api(`/v2/project/${enc(id_or_slug)}/version/${enc(version)}`, { auth: "optional" }),
  ),
  read(
    "modrinth_get_versions",
    "Get several versions at once by id (full version objects).",
    z.object({ ids: ids("Version") }),
    ({ ids }) => api(`/v2/versions${qs({ ids })}`, { auth: "optional" }),
  ),

  // ---- Version files (lookup by hash) -------------------------------------
  read(
    "modrinth_get_version_from_hash",
    "Find the version that contains a file, given the file's hash.",
    z.object({
      hash: z.string().describe("Hex-encoded file hash."),
      algorithm,
      multiple: z
        .boolean()
        .optional()
        .describe("Return every version containing this hash instead of one."),
    }),
    ({ hash, algorithm, multiple }) =>
      api(`/v2/version_file/${enc(hash)}${qs({ algorithm, multiple })}`),
  ),
  read(
    "modrinth_get_latest_version_from_hash",
    "Given a file hash, get the latest version of the same project matching the " +
      "given loaders and game versions (the 'is there an update?' check).",
    z.object({
      hash: z.string().describe("Hex-encoded file hash."),
      algorithm,
      loaders,
      game_versions: gameVersions,
      version_types: versionTypes,
    }),
    ({ hash, algorithm, loaders, game_versions, version_types }) =>
      postJson(`/v2/version_file/${enc(hash)}/update${qs({ algorithm })}`, {
        loaders,
        game_versions,
        ...(version_types ? { version_types } : {}),
      }),
  ),
  read(
    "modrinth_get_versions_from_hashes",
    "Batch version lookup: returns a map of hash -> version for many file hashes.",
    z.object({ hashes, algorithm }),
    ({ hashes, algorithm }) => postJson("/v2/version_files", { hashes, algorithm }),
  ),
  read(
    "modrinth_get_latest_versions_from_hashes",
    "Batch update check: returns a map of hash -> latest matching version for many file hashes.",
    z.object({
      hashes,
      algorithm,
      loaders,
      game_versions: gameVersions,
      version_types: versionTypes,
    }),
    ({ hashes, algorithm, loaders, game_versions, version_types }) =>
      postJson("/v2/version_files/update", {
        hashes,
        algorithm,
        loaders,
        game_versions,
        ...(version_types ? { version_types } : {}),
      }),
  ),

  // ---- Users -------------------------------------------------------------
  read(
    "modrinth_get_user",
    "Get a user's public profile by id or username.",
    z.object({ id_or_username: z.string().describe("User id or username.") }),
    ({ id_or_username }) => api(`/v2/user/${enc(id_or_username)}`),
  ),
  read(
    "modrinth_get_users",
    "Get several users at once by id.",
    z.object({ ids: ids("User") }),
    ({ ids }) => api(`/v2/users${qs({ ids })}`),
  ),
  read(
    "modrinth_get_user_projects",
    "List a user's projects (full project objects).",
    z.object({ id_or_username: z.string().describe("User id or username.") }),
    ({ id_or_username }) =>
      api(`/v2/user/${enc(id_or_username)}/projects`, { auth: "optional" }),
  ),
  read(
    "modrinth_get_followed_projects",
    "List the projects a user follows.",
    z.object({ id_or_username: z.string().describe("User id or username.") }),
    ({ id_or_username }) => api(`/v2/user/${enc(id_or_username)}/follows`, { auth: true }),
    { needsToken: true },
  ),
  read(
    "modrinth_get_payout_history",
    "Get a user's payout history (balance, payouts). Private to the token's own user.",
    z.object({ id_or_username: z.string().describe("User id or username.") }),
    ({ id_or_username }) => api(`/v2/user/${enc(id_or_username)}/payouts`, { auth: true }),
    { needsToken: true },
  ),

  // ---- Notifications -----------------------------------------------------
  read(
    "modrinth_get_user_notifications",
    "List a user's notifications.",
    z.object({ id_or_username: z.string().describe("User id or username.") }),
    ({ id_or_username }) =>
      api(`/v2/user/${enc(id_or_username)}/notifications`, { auth: true }),
    { needsToken: true },
  ),
  read(
    "modrinth_get_notification",
    "Get one notification by id.",
    z.object({ notification_id: z.string().describe("Notification id.") }),
    ({ notification_id }) => api(`/v2/notification/${enc(notification_id)}`, { auth: true }),
    { needsToken: true },
  ),
  read(
    "modrinth_get_notifications",
    "Get several notifications at once by id.",
    z.object({ ids: ids("Notification") }),
    ({ ids }) => api(`/v2/notifications${qs({ ids })}`, { auth: true }),
    { needsToken: true },
  ),

  // ---- Reports & threads -------------------------------------------------
  read(
    "modrinth_get_open_reports",
    "List the open reports you have filed.",
    z.object({
      count: z.number().int().min(1).optional().describe("Max reports to return."),
    }),
    ({ count }) => api(`/v2/report${qs({ count })}`, { auth: true }),
    { needsToken: true },
  ),
  read(
    "modrinth_get_report",
    "Get one report by id.",
    z.object({ report_id: z.string().describe("Report id.") }),
    ({ report_id }) => api(`/v2/report/${enc(report_id)}`, { auth: true }),
    { needsToken: true },
  ),
  read(
    "modrinth_get_reports",
    "Get several reports at once by id.",
    z.object({ ids: ids("Report") }),
    ({ ids }) => api(`/v2/reports${qs({ ids })}`, { auth: true }),
    { needsToken: true },
  ),
  read(
    "modrinth_get_thread",
    "Get a message thread (project moderation or report discussion) by id.",
    z.object({ thread_id: z.string().describe("Thread id.") }),
    ({ thread_id }) => api(`/v2/thread/${enc(thread_id)}`, { auth: true }),
    { needsToken: true },
  ),
  read(
    "modrinth_get_threads",
    "Get several threads at once by id.",
    z.object({ ids: ids("Thread") }),
    ({ ids }) => api(`/v2/threads${qs({ ids })}`, { auth: true }),
    { needsToken: true },
  ),

  // ---- Teams -------------------------------------------------------------
  read(
    "modrinth_get_team_members",
    "Get the members of a team by team id (use modrinth_get_project_team for a project).",
    z.object({ team_id: z.string().describe("Team id.") }),
    ({ team_id }) => api(`/v2/team/${enc(team_id)}/members`, { auth: "optional" }),
  ),
  read(
    "modrinth_get_teams",
    "Get the members of several teams at once (array of member arrays).",
    z.object({ ids: ids("Team") }),
    ({ ids }) => api(`/v2/teams${qs({ ids })}`, { auth: "optional" }),
  ),

  // ---- Tags & misc ---------------------------------------------------------
  read(
    "modrinth_get_tags",
    "List a Modrinth tag set: valid categories, loaders, game versions, licenses, " +
      "donation platforms, report types, project types or side types. Use this to " +
      "find valid values for other tools.",
    z.object({
      kind: z.enum(Object.keys(TAGS)).describe("Which tag list to fetch."),
    }),
    ({ kind }) => api(TAGS[kind]),
  ),
  read(
    "modrinth_get_license_text",
    "Get the title and full text of a license by SPDX id.",
    z.object({ license_id: z.string().describe("SPDX id, e.g. 'MIT'.") }),
    ({ license_id }) => api(`/v2/tag/license/${enc(license_id)}`),
  ),
  read(
    "modrinth_get_forge_updates",
    "Get a project's Forge `updates.json` (promos for recommended/latest per game version).",
    z.object({ id_or_slug: idOrSlug("Project") }),
    ({ id_or_slug }) => api(`/v2/updates/${enc(id_or_slug)}/forge_updates.json`),
  ),
  read(
    "modrinth_get_statistics",
    "Get site-wide Modrinth statistics (project, version, file and author counts).",
    z.object({}),
    () => api("/v2/statistics"),
  ),
];

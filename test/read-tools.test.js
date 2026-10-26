import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { tools } from "../src/tools.js";
import { mockFetch, setEnv, callTool } from "./helpers.js";

const TOKEN = "mrp_test_token";

/**
 * One row per read endpoint from https://docs.modrinth.com/api/.
 * auth: "none" (no Authorization header), "optional" (sent only if a token is
 * configured) or "required" (errors without a token).
 */
const CASES = [
  // Projects
  { tool: "modrinth_get_projects", args: { ids: ["sodium", "AABBCCDD"] }, path: "/v2/projects", query: { ids: '["sodium","AABBCCDD"]' }, auth: "optional" },
  { tool: "modrinth_random_projects", args: { count: 5 }, path: "/v2/projects_random", query: { count: "5" }, auth: "none" },
  { tool: "modrinth_check_project", args: { id_or_slug: "sodium" }, path: "/v2/project/sodium/check", auth: "optional" },
  { tool: "modrinth_get_project_dependencies", args: { id_or_slug: "sodium" }, path: "/v2/project/sodium/dependencies", auth: "optional" },
  { tool: "modrinth_get_project_team", args: { id_or_slug: "sodium" }, path: "/v2/project/sodium/members", auth: "optional" },

  // Versions
  { tool: "modrinth_get_version", args: { version_id: "IIJJKKLL" }, path: "/v2/version/IIJJKKLL", auth: "optional" },
  { tool: "modrinth_get_project_version", args: { id_or_slug: "sodium", version: "0.5.8" }, path: "/v2/project/sodium/version/0.5.8", auth: "optional" },
  { tool: "modrinth_get_versions", args: { ids: ["IIJJKKLL", "MMNNOOPP"] }, path: "/v2/versions", query: { ids: '["IIJJKKLL","MMNNOOPP"]' }, auth: "optional" },

  // Version files
  { tool: "modrinth_get_version_from_hash", args: { hash: "abc123" }, path: "/v2/version_file/abc123", query: { algorithm: "sha1" }, auth: "none" },
  { tool: "modrinth_get_version_from_hash", args: { hash: "abc123", algorithm: "sha512", multiple: true }, path: "/v2/version_file/abc123", query: { algorithm: "sha512", multiple: "true" }, auth: "none" },
  {
    tool: "modrinth_get_latest_version_from_hash",
    args: { hash: "abc123", loaders: ["fabric"], game_versions: ["1.21.8"], version_types: ["release"] },
    method: "POST", path: "/v2/version_file/abc123/update", query: { algorithm: "sha1" },
    body: { loaders: ["fabric"], game_versions: ["1.21.8"], version_types: ["release"] }, auth: "none",
  },
  {
    tool: "modrinth_get_versions_from_hashes",
    args: { hashes: ["a", "b"], algorithm: "sha512" },
    method: "POST", path: "/v2/version_files", body: { hashes: ["a", "b"], algorithm: "sha512" }, auth: "none",
  },
  {
    tool: "modrinth_get_latest_versions_from_hashes",
    args: { hashes: ["a"], loaders: ["fabric", "quilt"], game_versions: ["1.21.8"] },
    method: "POST", path: "/v2/version_files/update",
    body: { hashes: ["a"], algorithm: "sha1", loaders: ["fabric", "quilt"], game_versions: ["1.21.8"] }, auth: "none",
  },

  // Users
  { tool: "modrinth_get_user", args: { id_or_username: "jellysquid3" }, path: "/v2/user/jellysquid3", auth: "none" },
  { tool: "modrinth_get_users", args: { ids: ["EEFFGGHH"] }, path: "/v2/users", query: { ids: '["EEFFGGHH"]' }, auth: "none" },
  { tool: "modrinth_get_user_projects", args: { id_or_username: "jellysquid3" }, path: "/v2/user/jellysquid3/projects", auth: "optional" },
  { tool: "modrinth_get_followed_projects", args: { id_or_username: "me" }, path: "/v2/user/me/follows", auth: "required" },
  { tool: "modrinth_get_payout_history", args: { id_or_username: "me" }, path: "/v2/user/me/payouts", auth: "required" },

  // Notifications
  { tool: "modrinth_get_user_notifications", args: { id_or_username: "me" }, path: "/v2/user/me/notifications", auth: "required" },
  { tool: "modrinth_get_notification", args: { notification_id: "NNOOPPQQ" }, path: "/v2/notification/NNOOPPQQ", auth: "required" },
  { tool: "modrinth_get_notifications", args: { ids: ["NNOOPPQQ"] }, path: "/v2/notifications", query: { ids: '["NNOOPPQQ"]' }, auth: "required" },

  // Reports & threads
  { tool: "modrinth_get_open_reports", args: {}, path: "/v2/report", auth: "required" },
  { tool: "modrinth_get_open_reports", args: { count: 20 }, path: "/v2/report", query: { count: "20" }, auth: "required" },
  { tool: "modrinth_get_report", args: { report_id: "RRSSTTUU" }, path: "/v2/report/RRSSTTUU", auth: "required" },
  { tool: "modrinth_get_reports", args: { ids: ["RRSSTTUU"] }, path: "/v2/reports", query: { ids: '["RRSSTTUU"]' }, auth: "required" },
  { tool: "modrinth_get_thread", args: { thread_id: "QQRRSSTT" }, path: "/v2/thread/QQRRSSTT", auth: "required" },
  { tool: "modrinth_get_threads", args: { ids: ["QQRRSSTT"] }, path: "/v2/threads", query: { ids: '["QQRRSSTT"]' }, auth: "required" },

  // Teams
  { tool: "modrinth_get_team_members", args: { team_id: "MMNNOOPP" }, path: "/v2/team/MMNNOOPP/members", auth: "optional" },
  { tool: "modrinth_get_teams", args: { ids: ["MMNNOOPP", "AABBCCDD"] }, path: "/v2/teams", query: { ids: '["MMNNOOPP","AABBCCDD"]' }, auth: "optional" },

  // Tags & misc
  ...Object.entries({
    category: "category",
    loader: "loader",
    game_version: "game_version",
    license: "license",
    donation_platform: "donation_platform",
    report_type: "report_type",
    project_type: "project_type",
    side_type: "side_type",
  }).map(([kind, seg]) => ({ tool: "modrinth_get_tags", args: { kind }, path: `/v2/tag/${seg}`, auth: "none" })),
  { tool: "modrinth_get_license_text", args: { license_id: "MIT" }, path: "/v2/tag/license/MIT", auth: "none" },
  { tool: "modrinth_get_forge_updates", args: { id_or_slug: "sodium" }, path: "/v2/updates/sodium/forge_updates.json", auth: "none" },
  { tool: "modrinth_get_statistics", args: {}, path: "/v2/statistics", auth: "none" },
];

const label = (c) => `${c.tool} ${JSON.stringify(c.args)}`;

describe("read tools: request shape", () => {
  let restoreEnv;
  beforeEach(() => {
    restoreEnv = setEnv({ MODRINTH_TOKEN: TOKEN, MODRINTH_STAGING: undefined });
  });
  afterEach(() => {
    mock.restoreAll();
    restoreEnv();
  });

  for (const c of CASES) {
    test(label(c), async () => {
      const payload = { sentinel: c.tool };
      const { calls } = mockFetch(() => ({ body: payload }));

      const result = await callTool(tools, c.tool, c.args);

      assert.equal(calls.length, 1);
      const call = calls[0];
      assert.equal(call.method, c.method || "GET");
      assert.equal(call.path, c.path);
      assert.deepEqual(call.query, c.query || {});
      if (c.body) {
        assert.deepEqual(JSON.parse(call.body), c.body);
        assert.equal(call.headers["Content-Type"], "application/json");
      } else {
        assert.equal(call.body, undefined);
      }
      assert.match(call.headers["User-Agent"], /^modrinth-mcp\//);
      if (c.auth === "none") {
        assert.equal(call.headers.Authorization, undefined);
      } else {
        // Modrinth takes the raw PAT, no "Bearer" prefix.
        assert.equal(call.headers.Authorization, TOKEN);
      }
      // Read tools return Modrinth's JSON untouched.
      assert.deepEqual(result, payload);
    });
  }
});

describe("read tools: auth handling", () => {
  let restoreEnv;
  beforeEach(() => {
    restoreEnv = setEnv({ MODRINTH_TOKEN: undefined, MODRINTH_STAGING: undefined });
  });
  afterEach(() => {
    mock.restoreAll();
    restoreEnv();
  });

  for (const c of CASES.filter((c) => c.auth === "required")) {
    test(`${label(c)} fails without a token, before any request`, async () => {
      const { calls } = mockFetch();
      await assert.rejects(callTool(tools, c.tool, c.args), /MODRINTH_TOKEN is not set/);
      assert.equal(calls.length, 0);
    });
  }

  for (const c of CASES.filter((c) => c.auth === "optional")) {
    test(`${label(c)} works anonymously without a token`, async () => {
      const { calls } = mockFetch();
      await callTool(tools, c.tool, c.args);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].headers.Authorization, undefined);
    });
  }
});

describe("read tools: validation and errors", () => {
  let restoreEnv;
  beforeEach(() => {
    restoreEnv = setEnv({ MODRINTH_TOKEN: TOKEN, MODRINTH_STAGING: undefined });
  });
  afterEach(() => {
    mock.restoreAll();
    restoreEnv();
  });

  test("surfaces Modrinth's error description on 404", async () => {
    mockFetch(() => ({ status: 404, body: { error: "not_found", description: "the requested route does not exist" } }));
    await assert.rejects(
      callTool(tools, "modrinth_get_version", { version_id: "nope" }),
      /Modrinth API 404 on GET \/v2\/version\/nope: the requested route does not exist/,
    );
  });

  test("URL-encodes path segments", async () => {
    const { calls } = mockFetch();
    await callTool(tools, "modrinth_get_user", { id_or_username: "a/b c" });
    assert.equal(calls[0].url.pathname, "/v2/user/a%2Fb%20c");
  });

  test("uses the staging host when MODRINTH_STAGING is set", async () => {
    const restore = setEnv({ MODRINTH_STAGING: "1" });
    try {
      const { calls } = mockFetch();
      await callTool(tools, "modrinth_get_statistics");
      assert.equal(calls[0].url.host, "staging-api.modrinth.com");
    } finally {
      restore();
    }
  });

  test("rejects empty and oversized id lists", () => {
    const t = tools.find((t) => t.name === "modrinth_get_projects");
    assert.throws(() => t.inputSchema.parse({ ids: [] }));
    assert.throws(() => t.inputSchema.parse({ ids: Array(101).fill("x") }));
  });

  test("rejects unknown tag kinds, hash algorithms and random counts", () => {
    const get = (n) => tools.find((t) => t.name === n).inputSchema;
    assert.throws(() => get("modrinth_get_tags").parse({ kind: "bogus" }));
    assert.throws(() => get("modrinth_get_version_from_hash").parse({ hash: "x", algorithm: "md5" }));
    assert.throws(() => get("modrinth_random_projects").parse({ count: 101 }));
  });

  test("latest-version lookups require loaders and game_versions", () => {
    const s = tools.find((t) => t.name === "modrinth_get_latest_version_from_hash").inputSchema;
    assert.throws(() => s.parse({ hash: "x" }));
  });
});

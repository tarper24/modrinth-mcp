import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tools } from "../src/tools.js";
import { mockFetch, setEnv, callTool } from "./helpers.js";

const TOKEN = "mrp_test_token";

describe("existing tools", () => {
  let restoreEnv;
  beforeEach(() => {
    restoreEnv = setEnv({ MODRINTH_TOKEN: TOKEN, MODRINTH_STAGING: undefined });
  });
  afterEach(() => {
    mock.restoreAll();
    restoreEnv();
  });

  test("search passes query/limit and the new offset/index, and compacts hits", async () => {
    const { calls } = mockFetch(() => ({
      body: {
        total_hits: 1,
        hits: [{ slug: "sodium", title: "Sodium", project_type: "mod", downloads: 5, latest_version: "x", description: "d", extra: 1 }],
      },
    }));
    const out = await callTool(tools, "modrinth_search_projects", {
      query: "sodium",
      limit: 100,
      offset: 20,
      index: "downloads",
    });
    assert.equal(calls[0].path, "/v2/search");
    assert.deepEqual(calls[0].query, { query: "sodium", limit: "100", offset: "20", index: "downloads" });
    assert.deepEqual(out.hits[0], { slug: "sodium", title: "Sodium", project_type: "mod", downloads: 5, latest_version: "x", description: "d" });
  });

  test("search defaults to limit=10 and omits unset params", async () => {
    const { calls } = mockFetch(() => ({ body: { total_hits: 0, hits: [] } }));
    await callTool(tools, "modrinth_search_projects", { query: "x" });
    assert.deepEqual(calls[0].query, { query: "x", limit: "10" });
  });

  test("get_project sends the token when configured (so drafts resolve)", async () => {
    const { calls } = mockFetch(() => ({ body: { id: "A", slug: "s", title: "T" } }));
    await callTool(tools, "modrinth_get_project", { id_or_slug: "s" });
    assert.equal(calls[0].headers.Authorization, TOKEN);
  });

  test("list_project_versions filters and omits changelogs", async () => {
    const { calls } = mockFetch(() => ({
      body: [{ id: "V1", version_number: "1.0.0", files: [{ primary: true, url: "https://cdn/x.jar" }] }],
    }));
    const out = await callTool(tools, "modrinth_list_project_versions", {
      id_or_slug: "sodium",
      loaders: ["fabric"],
      game_versions: ["1.21.8"],
      featured: true,
    });
    assert.deepEqual(calls[0].query, {
      loaders: '["fabric"]',
      game_versions: '["1.21.8"]',
      featured: "true",
      include_changelog: "false",
    });
    assert.equal(out[0].primary_file, "https://cdn/x.jar");
  });

  test("whoami requires a token", async () => {
    const restore = setEnv({ MODRINTH_TOKEN: undefined });
    try {
      const { calls } = mockFetch();
      await assert.rejects(callTool(tools, "modrinth_whoami"), /MODRINTH_TOKEN is not set/);
      assert.equal(calls.length, 0);
    } finally {
      restore();
    }
  });

  test("modify_version rejects an empty patch", async () => {
    mockFetch();
    await assert.rejects(
      callTool(tools, "modrinth_modify_version", { version_id: "V1" }),
      /Nothing to modify/,
    );
  });

  test("create_version resolves the slug, then posts multipart with `data` first", async () => {
    const dir = await mkdtemp(join(tmpdir(), "modrinth-mcp-"));
    try {
      const jar = join(dir, "mod-1.0.0.jar");
      await writeFile(jar, "PK-not-a-real-jar");
      const { calls } = mockFetch((c) =>
        c.method === "GET"
          ? { body: { id: "REALID01" } }
          : { body: { id: "VER1", version_number: "1.0.0", project_id: "REALID01", files: [] } },
      );
      const out = await callTool(tools, "modrinth_create_version", {
        project_id: "my-slug",
        version_number: "1.0.0",
        file_paths: [jar],
        game_versions: ["1.21.8"],
      });

      assert.equal(calls[0].path, "/v2/project/my-slug");
      assert.equal(calls[0].headers.Authorization, TOKEN);
      assert.equal(calls[1].method, "POST");
      assert.equal(calls[1].path, "/v2/version");

      const keys = [...calls[1].body.keys()];
      assert.deepEqual(keys, ["data", "file_0"]);
      const data = JSON.parse(calls[1].body.get("data"));
      assert.equal(data.project_id, "REALID01");
      assert.equal(data.primary_file, "file_0");
      assert.deepEqual(data.loaders, ["fabric"]);
      assert.equal(out.published, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("create_project always sends initial_versions and is_draft", async () => {
    const { calls } = mockFetch(() => ({ body: { id: "P1", slug: "new-mod", title: "New", status: "draft" } }));
    await callTool(tools, "modrinth_create_project", {
      slug: "new-mod",
      title: "New",
      description: "A mod",
    });
    const data = JSON.parse(calls[0].body.get("data"));
    assert.deepEqual(data.initial_versions, []);
    assert.equal(data.is_draft, true);
    assert.equal(data.requested_status, "draft");
  });
});

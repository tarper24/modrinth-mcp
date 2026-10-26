/**
 * Live smoke tests against the real Modrinth API (read-only, anonymous).
 * Skipped unless MODRINTH_LIVE=1 (e.g. `MODRINTH_LIVE=1 npm test`).
 * Point at staging with MODRINTH_STAGING=1 if you prefer.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tools } from "../src/tools.js";
import { callTool } from "./helpers.js";

const live = process.env.MODRINTH_LIVE === "1";

describe("live Modrinth API", { skip: !live && "set MODRINTH_LIVE=1 to run" }, () => {
  test("statistics", async () => {
    const s = await callTool(tools, "modrinth_get_statistics");
    assert.equal(typeof s.projects, "number");
  });

  test("tag lists", async () => {
    const loaders = await callTool(tools, "modrinth_get_tags", { kind: "loader" });
    assert.ok(loaders.some((l) => l.name === "fabric"));
    const cats = await callTool(tools, "modrinth_get_tags", { kind: "category" });
    assert.ok(Array.isArray(cats) && cats.length > 0);
    const mit = await callTool(tools, "modrinth_get_license_text", { license_id: "MIT" });
    assert.match(mit.body, /Permission is hereby granted/);
  });

  test("search -> project -> team -> versions -> hash lookup", async () => {
    const found = await callTool(tools, "modrinth_search_projects", { query: "sodium", limit: 5, index: "downloads" });
    assert.ok(found.hits.length > 0);

    const project = await callTool(tools, "modrinth_get_project", { id_or_slug: "sodium" });
    const check = await callTool(tools, "modrinth_check_project", { id_or_slug: "sodium" });
    assert.equal(check.id, project.id);

    const [many] = await callTool(tools, "modrinth_get_projects", { ids: ["sodium"] });
    assert.equal(many.id, project.id);

    const team = await callTool(tools, "modrinth_get_project_team", { id_or_slug: "sodium" });
    assert.ok(team.length > 0);
    const user = await callTool(tools, "modrinth_get_user", { id_or_username: team[0].user.id });
    assert.equal(user.id, team[0].user.id);

    const versions = await callTool(tools, "modrinth_list_project_versions", { id_or_slug: "sodium", loaders: ["fabric"] });
    assert.ok(versions.length > 0);
    const full = await callTool(tools, "modrinth_get_version", { version_id: versions[0].id });
    const byNumber = await callTool(tools, "modrinth_get_project_version", { id_or_slug: "sodium", version: full.version_number });
    assert.equal(byNumber.id, full.id);

    const hash = full.files[0].hashes.sha1;
    const viaHash = await callTool(tools, "modrinth_get_version_from_hash", { hash });
    assert.equal(viaHash.id, full.id);
    const batch = await callTool(tools, "modrinth_get_versions_from_hashes", { hashes: [hash] });
    assert.equal(batch[hash].id, full.id);
    const latest = await callTool(tools, "modrinth_get_latest_version_from_hash", {
      hash,
      loaders: ["fabric"],
      game_versions: full.game_versions,
    });
    assert.equal(latest.project_id, project.id);
  });

  test("random projects", async () => {
    const r = await callTool(tools, "modrinth_random_projects", { count: 3 });
    assert.equal(r.length, 3);
  });
});

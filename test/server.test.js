import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { tools } from "../src/tools.js";
import { mockFetch, setEnv } from "./helpers.js";

async function connect() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

describe("tool registry", () => {
  test("names are unique and namespaced", () => {
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
    for (const n of names) assert.match(n, /^modrinth_[a-z_]+$/);
  });

  test("every tool has a description, schema and handler", () => {
    for (const t of tools) {
      assert.ok(t.description.length > 10, t.name);
      assert.equal(typeof t.handler, "function", t.name);
      assert.ok(t.inputSchema._def.shape, `${t.name} must use z.object`);
    }
  });

  test("only the known write tools are not read-only", () => {
    const writes = tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name).sort();
    assert.deepEqual(writes, [
      "modrinth_create_project",
      "modrinth_create_version",
      "modrinth_modify_version",
    ]);
  });
});

describe("MCP server (in-memory transport)", () => {
  let restoreEnv;
  beforeEach(() => {
    restoreEnv = setEnv({ MODRINTH_TOKEN: "mrp_test_token", MODRINTH_STAGING: undefined });
  });
  afterEach(() => {
    mock.restoreAll();
    restoreEnv();
  });

  test("tools/list exposes every tool with a valid JSON schema", async () => {
    const { client, close } = await connect();
    try {
      const { tools: listed } = await client.listTools();
      assert.equal(listed.length, tools.length);
      for (const t of listed) {
        assert.equal(t.inputSchema.type, "object", t.name);
        for (const [key, prop] of Object.entries(t.inputSchema.properties)) {
          assert.ok(prop.type, `${t.name}.${key} has no JSON schema type`);
        }
        // `required` must only name real properties.
        for (const r of t.inputSchema.required || []) {
          assert.ok(r in t.inputSchema.properties, `${t.name}: required ${r}`);
        }
      }
      const byName = Object.fromEntries(listed.map((t) => [t.name, t]));
      assert.deepEqual(byName.modrinth_get_tags.inputSchema.properties.kind.enum.length, 8);
      assert.deepEqual(byName.modrinth_get_projects.inputSchema.required, ["ids"]);
      // Defaulted fields are not required.
      assert.equal(byName.modrinth_get_version_from_hash.inputSchema.required.includes("algorithm"), false);
    } finally {
      await close();
    }
  });

  test("tools/call round-trips a read tool", async () => {
    mockFetch(() => ({ body: { projects: 1, versions: 2 } }));
    const { client, close } = await connect();
    try {
      const res = await client.callTool({ name: "modrinth_get_statistics", arguments: {} });
      assert.notEqual(res.isError, true);
      assert.deepEqual(JSON.parse(res.content[0].text), { projects: 1, versions: 2 });
    } finally {
      await close();
    }
  });

  test("tools/call reports API errors as isError results, not protocol errors", async () => {
    mockFetch(() => ({ status: 404, body: { error: "not_found", description: "gone" } }));
    const { client, close } = await connect();
    try {
      const res = await client.callTool({ name: "modrinth_get_version", arguments: { version_id: "x" } });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /^Error: Modrinth API 404/);
    } finally {
      await close();
    }
  });

  test("tools/call reports invalid arguments and unknown tools as isError", async () => {
    mockFetch();
    const { client, close } = await connect();
    try {
      const bad = await client.callTool({ name: "modrinth_get_projects", arguments: { ids: [] } });
      assert.equal(bad.isError, true);
      const unknown = await client.callTool({ name: "modrinth_nope", arguments: {} });
      assert.equal(unknown.isError, true);
      assert.match(unknown.content[0].text, /Unknown tool/);
    } finally {
      await close();
    }
  });
});

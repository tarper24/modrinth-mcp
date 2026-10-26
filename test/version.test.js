import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { VERSION } from "../src/client.js";
import { createServer } from "../src/server.js";

const readJson = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
const pkgVersion = readJson("package.json").version;

describe("single-source version", () => {
  test("runtime VERSION comes from package.json", () => {
    assert.equal(VERSION, pkgVersion);
  });

  test("the MCP server reports package.json's version", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
    try {
      assert.equal(client.getServerVersion().version, pkgVersion);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  test("every manifest matches package.json (run `npm run sync-version` if this fails)", () => {
    execFileSync(process.execPath, ["scripts/sync-version.js", "--check"], {
      cwd: new URL("..", import.meta.url),
      stdio: "pipe",
    });
  });

  test("the lockfile matches package.json", () => {
    const lock = readJson("package-lock.json");
    assert.equal(lock.version, pkgVersion);
    assert.equal(lock.packages[""].version, pkgVersion);
  });
});

import { mock } from "node:test";

/**
 * Replace global fetch with a recorder. `responder(call)` returns
 * `{ status?, body? }`; body objects are JSON-encoded. Returns `{ calls }`.
 * Restore with `mock.restoreAll()` (call it in afterEach).
 */
export function mockFetch(responder = () => ({ body: {} })) {
  const calls = [];
  mock.method(globalThis, "fetch", async (url, init = {}) => {
    const u = new URL(url);
    const call = {
      method: init.method || "GET",
      url: u,
      path: u.pathname,
      query: Object.fromEntries(u.searchParams),
      headers: init.headers || {},
      body: init.body,
    };
    calls.push(call);
    const { status = 200, body = {} } = responder(call) || {};
    const text =
      body === null ? "" : typeof body === "string" ? body : JSON.stringify(body);
    return new Response(status === 204 ? null : text, { status });
  });
  return { calls };
}

/** Set env vars for a test and return a function that restores the originals. */
export function setEnv(vars) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

/** Run a tool by name via its handler, returning the parsed text payload. */
export async function callTool(tools, name, args = {}) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  const res = await tool.handler(tool.inputSchema.parse(args));
  const text = res.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

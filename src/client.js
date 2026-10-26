/**
 * Modrinth HTTP client helpers shared by the tool modules.
 */

export const VERSION = "0.1.2";

// Env is read per call (not at import) so tests and hosts can change it.
const baseUrl = () =>
  process.env.MODRINTH_STAGING
    ? "https://staging-api.modrinth.com"
    : "https://api.modrinth.com";
const userAgent = () =>
  process.env.MODRINTH_USER_AGENT ||
  `modrinth-mcp/${VERSION} (+https://github.com/tarper24/modrinth-mcp)`;
const token = () => process.env.MODRINTH_TOKEN || "";

export const describeConfig = () => ({
  base: baseUrl(),
  token: token() ? "set" : "MISSING",
});

/** Throw a clean, agent-actionable error if the token is missing. */
export function requireToken() {
  if (!token()) {
    throw new Error(
      "MODRINTH_TOKEN is not set. Create a Personal Access Token at " +
        "https://modrinth.com/settings/pats (scopes: read + create + write " +
        "versions) and set it in the MCP server env as MODRINTH_TOKEN.",
    );
  }
}

/**
 * Perform a Modrinth API request. Returns parsed JSON (or null for 204).
 * On non-2xx, throws an Error carrying Modrinth's own error description.
 *
 * auth: true       -> token required (throws if unset)
 * auth: "optional" -> token sent when configured, so private/draft items the
 *                     token can see resolve; anonymous otherwise
 */
export async function api(
  path,
  { method = "GET", body, auth = false, headers = {} } = {},
) {
  const h = { "User-Agent": userAgent(), ...headers };
  if (auth === true) requireToken();
  if (auth && token()) {
    h["Authorization"] = token(); // Modrinth uses the raw PAT, no "Bearer" prefix
  }
  const res = await fetch(`${baseUrl()}${path}`, { method, headers: h, body });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail =
      data && typeof data === "object"
        ? data.description || data.error || JSON.stringify(data)
        : data || res.statusText;
    throw new Error(`Modrinth API ${res.status} on ${method} ${path}: ${detail}`);
  }
  return data;
}

/** POST a JSON body (used by the read-only hash lookup endpoints). */
export const postJson = (path, payload) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/** Build a query string, skipping undefined values. Arrays become JSON, as Modrinth expects. */
export function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    sp.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const enc = encodeURIComponent;

/** Wrap a result object as an MCP text tool response. */
export function ok(obj) {
  const text = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: "text", text }] };
}


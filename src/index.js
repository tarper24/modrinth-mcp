#!/usr/bin/env node
/**
 * Modrinth MCP server
 *
 * A local (stdio) MCP server that wraps the Modrinth REST API so an MCP client
 * (Claude Code, Claude Desktop, Cursor, ...) can search projects, read project
 * and version metadata, and — the main point — publish new versions by
 * uploading built mod jars.
 *
 * Auth: set MODRINTH_TOKEN to a Modrinth Personal Access Token (PAT).
 *   Create one at https://modrinth.com/settings/pats with at least the
 *   scopes: Read projects, Read versions, Create versions, Write versions.
 *
 * Optional env:
 *   MODRINTH_STAGING=1   -> use https://staging-api.modrinth.com (safe testing)
 *   MODRINTH_USER_AGENT  -> override the User-Agent Modrinth asks clients to send
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION, describeConfig } from "./client.js";
import { createServer } from "./server.js";

const server = createServer();
await server.connect(new StdioServerTransport());
// stderr is safe for logs; stdout is reserved for the MCP protocol.
const { base, token } = describeConfig();
console.error(`modrinth-mcp ${VERSION} ready (base: ${base}, token: ${token})`);

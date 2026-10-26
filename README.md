# modrinth-mcp

An [MCP](https://modelcontextprotocol.io) server that wraps the [Modrinth](https://modrinth.com) API so an AI agent (Claude Code, Claude Desktop, Cursor, …) can search projects, read anything the public [Modrinth API](https://docs.modrinth.com/api/) exposes (projects, versions, hash lookups, users, teams, tags, and your private notifications/reports), and **publish Minecraft mods** — create projects and upload built jars as new versions.

> This is a fork of [justinscott12/modrinth-mcp](https://github.com/justinscott12/modrinth-mcp). It adds the full set of read endpoints and an automated test suite. The npm package and registry identifiers are still `@justinscott12/modrinth-mcp`, so `npx` installs below fetch the upstream release until this fork is published. To use this version now, [run it from source](#development).

## Tools

| Tool | Auth | What it does |
| --- | --- | --- |
| `modrinth_whoami` | ✅ | Verify your token; return the authenticated user. |
| `modrinth_search_projects` | – | Search public Modrinth projects. |
| `modrinth_get_project` | – | Get a project's metadata by slug or id. |
| `modrinth_list_project_versions` | – | List a project's published versions. |
| `modrinth_create_version` | ✅ | Publish a **new version** by uploading one or more jars. |
| `modrinth_create_project` | ✅ | Create a **new project** (as a draft). |
| `modrinth_modify_version` | ✅ | Edit metadata of an existing version. |

Every read endpoint in the [Modrinth API](https://docs.modrinth.com/api/) is also available. Auth: – none, ◐ token optional (lets you see your drafts/private items), ✅ token required.

| Area | Tools |
| --- | --- |
| Projects | `modrinth_get_projects` ◐, `modrinth_random_projects`, `modrinth_check_project` ◐, `modrinth_get_project_dependencies` ◐, `modrinth_get_project_team` ◐ |
| Versions | `modrinth_get_version` ◐, `modrinth_get_project_version` ◐, `modrinth_get_versions` ◐ |
| Version files (by hash) | `modrinth_get_version_from_hash`, `modrinth_get_latest_version_from_hash`, `modrinth_get_versions_from_hashes`, `modrinth_get_latest_versions_from_hashes` |
| Users | `modrinth_get_user`, `modrinth_get_users`, `modrinth_get_user_projects` ◐, `modrinth_get_followed_projects` ✅, `modrinth_get_payout_history` ✅ |
| Notifications | `modrinth_get_user_notifications` ✅, `modrinth_get_notification` ✅, `modrinth_get_notifications` ✅ |
| Reports & threads | `modrinth_get_open_reports` ✅, `modrinth_get_report` ✅, `modrinth_get_reports` ✅, `modrinth_get_thread` ✅, `modrinth_get_threads` ✅ |
| Teams | `modrinth_get_team_members` ◐, `modrinth_get_teams` ◐ |
| Tags & misc | `modrinth_get_tags` (categories, loaders, game versions, licenses, donation platforms, report/project/side types), `modrinth_get_license_text`, `modrinth_get_forge_updates`, `modrinth_get_statistics` |

Public reads work without a token. Anything that writes, or reads private data, needs a Modrinth **Personal Access Token** (private reads need the matching read scope, e.g. `NOTIFICATION_READ`, `PAYOUTS_READ`).

## Getting a token

Create a PAT at <https://modrinth.com/settings/pats> with these scopes for publishing:

- Read projects
- Read versions
- Create versions
- Write versions

Add scopes only for the private reads you want: notifications, reports/threads, payouts and followed projects each need their own read scope. Set the token as the `MODRINTH_TOKEN` environment variable.

## Install

### As a Claude Code plugin

```bash
/plugin marketplace add tarper24/modrinth-mcp
/plugin install modrinth-mcp@tarper24
```

It runs the published npm package under the hood via `npx`. Claude Code
plugins have no token-entry UI, so the server reads its token from the
`MODRINTH_TOKEN` **environment variable** in the environment Claude Code
runs in. Set it before launching Claude Code, e.g.:

```bash
# macOS/Linux (add to your shell profile to persist)
export MODRINTH_TOKEN=your-modrinth-pat

# Windows PowerShell (persist for your user)
setx MODRINTH_TOKEN "your-modrinth-pat"
```

Then restart Claude Code and run `modrinth_whoami` to confirm. Public read
tools work without a token; with one set, project, version and team reads can
also see your drafts and private projects.

### As an MCP server (any client)

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "modrinth": {
      "command": "npx",
      "args": ["-y", "@justinscott12/modrinth-mcp"],
      "env": {
        "MODRINTH_TOKEN": "your-modrinth-pat"
      }
    }
  }
}
```

Or in Claude Code directly:

```bash
claude mcp add modrinth --env MODRINTH_TOKEN=your-modrinth-pat -- npx -y @justinscott12/modrinth-mcp
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODRINTH_TOKEN` | – | Modrinth Personal Access Token. Required for write actions and private reads; optional for public reads. |
| `MODRINTH_LIVE` | unset | Test-only. Set to `1` to run the live smoke tests in `npm test`. |
| `MODRINTH_STAGING` | unset | Set to `1` to hit `https://staging-api.modrinth.com` for safe testing. |
| `MODRINTH_USER_AGENT` | `modrinth-mcp/<version> …` | Override the User-Agent sent to Modrinth. |

## Example flow

1. `modrinth_whoami` — confirm auth works.
2. `modrinth_create_project` — create the project page (created as a draft).
3. `modrinth_create_version` — upload your built jar(s) with the target `game_versions` and `loaders`.
4. Submit the project for review on the Modrinth site when ready.

> **Note:** `create_version` and `create_project` publish public content. Only call them when you actually intend to publish.

Read-only examples that need no token: `modrinth_search_projects` to find a mod, `modrinth_get_tags` with `kind: "loader"` to see valid loaders, and `modrinth_get_latest_version_from_hash` to check whether a jar you have is out of date.

## Development

Requires Node.js 20 or newer.

```bash
git clone https://github.com/tarper24/modrinth-mcp.git
cd modrinth-mcp
npm install
MODRINTH_STAGING=1 MODRINTH_TOKEN=your-staging-pat npm start
```

To use a local checkout from an MCP client, point it at the entry file:

```bash
claude mcp add modrinth --env MODRINTH_TOKEN=your-modrinth-pat -- node /path/to/modrinth-mcp/src/index.js
```

The server speaks MCP over stdio. `stdout` is reserved for the protocol; logs go to `stderr`.

### Tests

```bash
npm test                    # unit + in-memory MCP tests, fully offline (mocked fetch)
MODRINTH_LIVE=1 npm test    # also runs read-only smoke tests against the real API
```

Layout: `src/client.js` (HTTP helpers), `src/tools.js` (original + write tools), `src/read-tools.js` (read endpoints), `src/server.js` (MCP wiring). Tests are in `test/` and use Node's built-in runner, so there are no extra dependencies.

## License

[MIT](./LICENSE)

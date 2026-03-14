---
name: u301-url-shortener-cli
description: Help users install the `u301` package with npm, pnpm, yarn, or bun, then use the `u301` CLI to log in, verify config, create short links, manage links and domains, and fetch analytics. Trigger when users ask to install U301, shorten URLs, use branded short links, run `u301 login` or `u301 status`, manage domains, or inspect U301 analytics from AI.
---

# U301 URL Shortener CLI

Use this skill when the task is about installing or operating the current U301 short-link CLI from AI.


## Operating Rules

- The published package name is `u301` and the installed command is also `u301`.
- For end-user guidance, first make sure the CLI is installed with the user's own package manager: npm, pnpm, yarn, or bun.
- Infer the user's preferred package manager from their repo or prior messages when possible. If there is no signal, ask a short question or present the install commands for npm, pnpm, yarn, and bun.
- After installation, prefer the installed `u301 ...` command in user-facing instructions.

- Never invent current API state, domains, links, or analytics. If the user wants live data, run the CLI.
- Start setup checks with `u301 status --offline` when you only need local config. Use online `u301 status` when the user wants API verification too.
- Credential priority is: command flags > environment variables > `~/.u301/config.json`.
- Required auth values are `apiKey` and `workspaceId`. Optional defaults are `baseURL`, `apiVersion`, `domain`, and `debug`.
- Do not ask the user to paste secrets into chat unless there is no safer option. Prefer having them run `u301 login` locally or set `U301_API_KEY` and `U301_WORKSPACE_ID` in their shell.
- The stored config file lives at `~/.u301/config.json`.

## Install First

When the CLI may not already exist, guide the user to install `u301` with the package manager they actually use.

Examples:

- npm: `npm install -g u301`
- pnpm: `pnpm add -g u301`
- yarn: `yarn global add u301`
- bun: `bun add -g u301`

After install, confirm with:

- `u301 version`
- `u301 help`

## Workflow

1. Classify the request as install/setup, auth, short-link operations, domain operations, analytics, or CLI maintenance.
2. If the user may not have the CLI yet, start by giving the correct install command for their package manager.
3. For setup/auth, inspect local state with `u301 status --offline`, then use `u301 login` or env vars if credentials are missing.
4. For a single URL, use `u301 shorten <url>`. Add `--verbose` for a readable summary or `--json` for structured output.
5. For many URLs, use `u301 links create-many <url...>` with shared flags such as `--domain`, `--comment`, `--password`, `--expired-at`, and `--reuse-existing`.
6. For existing links, use `u301 links get`, `u301 links list`, or `u301 links delete`.
7. For domains, use `u301 domains list`, `create`, `details`, `active`, `wait-active`, `wait-change`, `set-random-code-length`, `set-home-page-redirect`, and `set-not-found-page-redirect`.
8. For analytics, use `u301 analytics clicks` or `u301 analytics top <metric>`.
9. When a command fails, preserve the CLI's real error message and give the next concrete step.

## Response Guidance

- If the user wants the agent to do the work, run the CLI and report the result.
- If the user wants instructions, give the exact install or CLI command with placeholders instead of a paraphrase.
- Do not assume `u301` is preinstalled for end users.
- `u301 shorten` prints only the short link by default. Use `--verbose` or `--json` when the user needs more fields.
- Most management and analytics reads return JSON. Summarize it for the user, but keep the original structure available when requested.
- `u301 links get` and `u301 links delete` accept either `go.example.com/slug` or a full `https://go.example.com/slug` because the CLI strips the protocol.
- `u301 links create-many` applies one shared option set to every URL in the batch.
- If public CLI behavior changes, keep `src/cli.ts`, `src/cli.test.ts`, and `README.md` in sync.

## Supported Analytics Values

- Click ranges: `24h`, `1d`, `3d`, `7d`, `14d`, `30d`, `60d`, `1m`
- Click granularities: `hour`, `day`
- Top metrics: `browsers`, `device-types`, `short-links`, `bots`, `device-vendors`, `operating-systems`, `countries`, `referers`, `languages`, `cities`

## Typical Requests

- "Shorten this URL on my default domain."
- "Install U301 with pnpm and create a short link."
- "Create the slug `launch` for this link."
- "Check whether my U301 CLI is logged in."
- "List my short links."
- "Create a branded domain and wait until it becomes active."
- "Show top countries for the last 30 days."

## Reference

- See `skills/u301-url-shortener-cli/references/cli-cheatsheet.md` for exact command examples and output notes.

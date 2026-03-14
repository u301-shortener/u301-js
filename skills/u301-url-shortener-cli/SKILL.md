---
name: u301-url-shortener-cli
description: Use the U301 CLI in this repository to log in, verify config, create short links, manage links and domains, and fetch analytics. Trigger when users ask to shorten URLs, use branded short links, run `u301 login` or `u301 status`, manage domains, or inspect U301 analytics from AI.
---

# U301 URL Shortener CLI

Use this skill when the task is about operating the current U301 short-link CLI from AI.

## Read First

Read only these files unless the task needs more detail:

- `src/cli.ts`
- `src/cli-config.ts`
- `src/analytics.ts`
- `skills/u301-url-shortener-cli/references/cli-cheatsheet.md`

## Operating Rules

- Prefer running the CLI over paraphrasing behavior. Inside this repo, use `bun ./dist/cli.mjs ...` or `node ./dist/cli.mjs ...` so the command does not depend on shell PATH setup.
- Never invent current API state, domains, links, or analytics. If the user wants live data, run the CLI.
- Start setup checks with `u301 status --offline` when you only need local config. Use online `u301 status` when the user wants API verification too.
- Credential priority is: command flags > environment variables > `~/.u301/config.json`.
- Required auth values are `apiKey` and `workspaceId`. Optional defaults are `baseURL`, `apiVersion`, `domain`, and `debug`.
- Do not ask the user to paste secrets into chat unless there is no safer option. Prefer having them run `u301 login` locally or set `U301_API_KEY` and `U301_WORKSPACE_ID` in their shell.
- The stored config file lives at `~/.u301/config.json`.

## Workflow

1. Classify the request as setup/auth, short-link operations, domain operations, analytics, or CLI maintenance.
2. For setup/auth, inspect local state with `u301 status --offline`, then use `u301 login` or env vars if credentials are missing.
3. For a single URL, use `u301 shorten <url>`. Add `--verbose` for a readable summary or `--json` for structured output.
4. For many URLs, use `u301 links create-many <url...>` with shared flags such as `--domain`, `--comment`, `--password`, `--expired-at`, and `--reuse-existing`.
5. For existing links, use `u301 links get`, `u301 links list`, or `u301 links delete`.
6. For domains, use `u301 domains list`, `create`, `details`, `active`, `wait-active`, `wait-change`, `set-random-code-length`, `set-home-page-redirect`, and `set-not-found-page-redirect`.
7. For analytics, use `u301 analytics clicks` or `u301 analytics top <metric>`.
8. When a command fails, preserve the CLI's real error message and give the next concrete step.

## Response Guidance

- If the user wants the agent to do the work, run the CLI and report the result.
- If the user wants instructions, give the exact command with placeholders instead of a paraphrase.
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
- "Create the slug `launch` for this link."
- "Check whether my U301 CLI is logged in."
- "List my short links."
- "Create a branded domain and wait until it becomes active."
- "Show top countries for the last 30 days."

## Reference

- See `skills/u301-url-shortener-cli/references/cli-cheatsheet.md` for exact command examples and output notes.

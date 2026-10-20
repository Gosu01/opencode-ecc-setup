# OpenCode + ECC + Automation Stack

Private, sanitized setup for replicating an OpenCode v2 configuration with ECC, persistent memory, browser/GitHub MCPs, and automation skills.

## Verified state (2026-10-21)

- OpenCode `v2.1.1`, background service on `127.0.0.1:49374`
- 56 agents reported by `opencode debug agents` (49 ECC markdown agents + 7 built-ins)
- 52 slash commands
- 341 skills advertised by `/api/skill` (339 on disk + 2 built-ins)
- Nine MCP servers connected: `chrome-devtools`, `context7`, `crw`, `firecrawl`, `github`, `memory`, `notion`, `playwright`, `upwork`
- Zero failed plugins; `ecc-barrel`, `ecc-hooks`, and `i-have-adhd` active
- Always-on ADHD output plugin and English/French natural-writing style
- Persistent memory via `@modelcontextprotocol/server-memory`
- GitHub MCP verified with `get_me`; Playwright verified against `https://example.com`
- ECC fork commit `a5d6d4d6` (type-only TypeScript 6 fix)

## Contents

- **`PROMPT.md`** — copy-paste runbook for a fresh machine. This is the main deliverable.
- **`AGENTS.md`** — global instruction template (workflow, ADHD, natural writing, memory, automation routing).
- **`opencode.example.json`** — sanitized reference config. Paths and tokens are placeholders.
- **`skills/natural-writing/SKILL.md`** — English/French prose style.
- **`skills/langflow-workflows/SKILL.md`** — LangFlow 1.x flows, custom components, API/webhooks, deployment.
- **`scripts/convert-ecc.js`** — converts ECC agents/commands to OpenCode v2 markdown and merges the base config.
- **`scripts/health-check.sh`** — verifies MCPs, plugins, skills, agents, and commands.

## How to use

1. Add the friend as a collaborator on this private repository, or send them `PROMPT.md` plus the `skills/` and `scripts/` folders.
2. They run the prompt on a fresh machine as their normal user.
3. They need their own OpenCode provider (OpenCode Go or another), their own `gh auth login`, and their own accounts for Notion, Firecrawl, and Upwork if they want those MCPs.

## Security

This repository intentionally contains **no**:

- GitHub tokens or `.github-mcp-token`
- `service.json` or the OpenCode service password
- `memory.jsonl` or personal memory entities
- CV, email, phone, or personal profile data
- Backups or session transcripts

Do not commit any of those. The GitHub token file on the target machine must stay mode `600`.

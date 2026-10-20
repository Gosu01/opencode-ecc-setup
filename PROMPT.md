# Replicate this OpenCode v2 setup

You are setting up OpenCode v2.1.1 on a fresh Linux machine with:

- ECC's OpenCode v2 adapter: 49 markdown agents and 52 slash commands
- Nine MCP servers: context7, upwork, notion, firecrawl, chrome-devtools, crw, memory, playwright, github
- 341 skills: ECC, Understand-Anything, ADHD output, natural writing, n8n, LangGraph, LangFlow
- Always-on ADHD output shaping and English/French natural-writing style
- Persistent cross-session memory via a local memory MCP
- LangGraph, LangFlow, and n8n automation skills

Run everything as the normal user. Do not use `sudo` except for OS packages. Stop and report on any failure instead of continuing.

## Prerequisites

Confirm:

```bash
opencode --version          # must be v2.x
node --version              # >= 22
npm --version
pnpm --version              # >= 10
python3 --version
git --version
gh auth status              # authenticated as your own GitHub account
command -v npx
command -v chromium || command -v chromium-browser || command -v brave || command -v google-chrome-stable
```

You also need:

- An OpenCode provider. This setup uses `opencode-go/deepseek-v4-pro` and `opencode-go/deepseek-v4.1-flash`; if you do not have OpenCode Go, substitute your own provider/model in the final config.
- Access to the private setup repo. Clone it (or ask the owner for the files):

```bash
gh repo clone Gosu01/opencode-ecc-setup "$HOME/opencode-ecc-setup"
SETUP="$HOME/opencode-ecc-setup"
```

- Optional accounts for Notion, Firecrawl, and Upwork OAuth.

## 1. Back up the current OpenCode config

```bash
BACKUP="$HOME/.config/opencode-backup-$(date +%Y%m%d-%H%M%S).tgz"
if [ -d "$HOME/.config/opencode" ]; then
  tar -czf "$BACKUP" -C "$HOME/.config" opencode
fi
printf '%s\n' "$BACKUP" > /tmp/opencode-backup-path
```

Do not modify `cli.json` or `service.json`; they hold UI settings and the local service password.

## 2. Clone ECC and build the v2 adapter

```bash
gh repo clone Gosu01/ECC "$HOME/Work/ECC"
cd "$HOME/Work/ECC"
git checkout fix/opencode-v2-plugin-adapter
git log -1 --oneline
git checkout -- .opencode
npm install
npm run build:opencode
```

The branch must contain the OpenCode v2 adapter (`plugins/ecc-hooks.ts` with `id: "ecc-hooks"` and `setup:`) and the TypeScript 6 type-only fix (commit `a5d6d4d6` or newer). If the branch is missing, stop and ask for the adapter patch. Do not install a v1-only adapter.

If the build fails on TypeScript 6 with errors at `ecc-hooks.ts` lines 148–150 or 375, apply the type-only fix:

- Cast the context passed to `mod.ECCHooksPlugin(...)` with `as any`.
- Cast the result to `Record<string, (...a: any[]) => any>`.
- Annotate `(id: string)` in the `ids.some(...)` callback.

Then rerun `npm run build:opencode` until it exits 0.

## 3. Install the ECC OpenCode payload

```bash
cd "$HOME/Work/ECC"
./install.sh --target opencode --modules platform-configs,hooks-runtime --enable-hooks
```

Verify:

```bash
CFG="$HOME/.config/opencode"
test -f "$CFG/opencode.json"
test -f "$CFG/instructions/INSTRUCTIONS.md"
test -f "$CFG/plugins/ecc-hooks.ts"
test -d "$CFG/prompts/agents"
```

## 4. Fix the v2 plugin barrel, SDK, and duplicate registration

The installer's barrel may be v1-shaped. Replace it with the inert v2 barrel:

```bash
cat > "$CFG/plugins/index.ts" <<'EOF'
export default {
  id: "ecc-barrel",
  setup: async () => undefined,
}
EOF
```

The custom tools need the runtime SDK at the config root:

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser('~/.config/opencode/package.json')
c = json.load(open(p))
c.setdefault('dependencies', {})['@opencode-ai/plugin'] = '1.18.34'
(c.get('devDependencies') or {}).pop('@opencode-ai/plugin', None)
json.dump(c, open(p, 'w'), indent=2)
PY
cd "$CFG" && npm install --omit=dev
```

V2 auto-discovers `plugins/*.ts`; the v1 `plugin` array is redundant and causes a duplicate `ecc-barrel` and a failed plugin. Remove it:

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser('~/.config/opencode/opencode.json')
c = json.load(open(p))
c.pop('plugin', None)
c.pop('plugins', None)
json.dump(c, open(p, 'w'), indent=2)
PY
```

## 5. Convert agents and commands, and merge the base config

```bash
node "$SETUP/scripts/convert-ecc.js" "$HOME/Work/ECC" "$CFG"
```

This writes 49 agent markdown files, 25 extra commands, and updates `opencode.json` with the model, permissions, compaction, watcher, and instructions. It removes the v1 `agent`, `command`, `permission`, and `skills` maps.

Copy the rules so commands that reference `../rules/...` resolve:

```bash
rm -rf "$CFG/rules"
cp -R "$HOME/Work/ECC/rules" "$CFG/rules"
```

Remove commands whose optional dependencies are not installed:

```bash
for c in evolve harness-audit instinct-export instinct-import instinct-status projects promote security-scan; do
  rm -f "$CFG/commands/$c.md"
done
```

Copy the global working agreement:

```bash
cp "$SETUP/AGENTS.md" "$CFG/AGENTS.md"
```

## 6. Install skills

Natural writing and LangFlow come from this repo:

```bash
mkdir -p "$HOME/.agents/skills"
cp -R "$SETUP/skills/natural-writing" "$HOME/.agents/skills/"
cp -R "$SETUP/skills/langflow-workflows" "$HOME/.agents/skills/"
```

Understand-Anything (9 skills):

```bash
curl -fsSL https://raw.githubusercontent.com/Egonex-AI/Understand-Anything/main/install.sh | bash -s opencode
cd "$HOME/.understand-anything/repo/understand-anything-plugin"
pnpm install --frozen-lockfile
pnpm --filter @understand-anything/core build
```

i-have-adhd (skill + always-on v2 plugin):

```bash
git clone --depth 1 https://github.com/ayghri/i-have-adhd /tmp/i-have-adhd
mkdir -p "$HOME/.agents/skills/i-have-adhd" "$CFG/plugins"
cp /tmp/i-have-adhd/skills/i-have-adhd/SKILL.md "$HOME/.agents/skills/i-have-adhd/"
cp /tmp/i-have-adhd/.opencode/plugins/i-have-adhd.mjs "$CFG/plugins/"
cp /tmp/i-have-adhd/.opencode/plugins/i-have-adhd.js "$CFG/plugins/"
cp /tmp/i-have-adhd/.opencode/command/i-have-adhd.md "$CFG/.i-have-adhd-command.md"

python3 - <<'PY'
import os
p = os.path.expanduser('~/.config/opencode/plugins/i-have-adhd.mjs')
s = open(p).read()
old = """const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '../../skills');
const skillPath = path.join(skillsDir, 'i-have-adhd', 'SKILL.md');
const commandPath = path.join(__dirname, '..', 'command', 'i-have-adhd.md');"""
new = """const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configRoot = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, 'opencode')
  : path.join(os.homedir(), '.config', 'opencode');
const skillsDir = path.join(os.homedir(), '.agents', 'skills');
const skillPath = path.join(skillsDir, 'i-have-adhd', 'SKILL.md');
const commandPath = path.join(configRoot, '.i-have-adhd-command.md');"""
assert old in s, 'ADHD path block not found'
open(p, 'w').write(s.replace(old, new))
PY

touch "$CFG/.i-have-adhd-always"
chmod 600 "$CFG/.i-have-adhd-always"
```

n8n (15 MIT skills) and LangGraph:

```bash
git clone --depth 1 https://github.com/czlonkowski/n8n-skills /tmp/n8n-skills
cp -R /tmp/n8n-skills/skills/n8n-* "$HOME/.agents/skills/"
cp -R /tmp/n8n-skills/skills/using-n8n-mcp-skills "$HOME/.agents/skills/"

git clone --depth 1 https://github.com/soba-labs/langchain-agent-skills /tmp/langchain-agent-skills
cp -R /tmp/langchain-agent-skills/skills/langgraph-agent-patterns "$HOME/.agents/skills/"
```

## 7. Configure the nine MCP servers

Resolve your own executable paths:

```bash
NPM_BIN="$(command -v npx)"
CHROMIUM="$(command -v chromium || command -v chromium-browser || command -v google-chrome-stable || true)"
BRAVE="$(command -v brave || command -v brave-browser || command -v google-chrome-stable || command -v chromium || true)"

[ -n "$NPM_BIN" ] || { echo "npx not found"; exit 1; }
[ -n "$CHROMIUM" ] || { echo "Chromium/Chrome not found"; exit 1; }
[ -n "$BRAVE" ] || { echo "Brave/Chrome not found"; exit 1; }
```

Remote servers:

```bash
opencode mcp add --global context7 --url https://mcp.context7.com/mcp
opencode mcp add --global upwork --url https://mcp.upwork.com/mcp
opencode mcp add --global notion --url https://mcp.notion.com/mcp
opencode mcp add --global firecrawl --url https://mcp.firecrawl.dev/v2/mcp-oauth
```

Local servers:

```bash
opencode mcp add --global chrome-devtools -- "$NPM_BIN" -y chrome-devtools-mcp@latest --executablePath "$BRAVE"
opencode mcp add --global crw -- "$NPM_BIN" -y crw-mcp@0.37.2
opencode mcp add --global memory --env MEMORY_FILE_PATH="$HOME/.local/share/opencode/memory.jsonl" -- "$NPM_BIN" -y @modelcontextprotocol/server-memory
opencode mcp add --global playwright -- "$NPM_BIN" -y @playwright/mcp@latest --browser chromium --executable-path "$CHROMIUM" --headless --isolated
```

GitHub remote MCP with a file-backed token:

```bash
gh auth status || gh auth login
gh auth token | tail -n 1 > "$CFG/.github-mcp-token"
chmod 600 "$CFG/.github-mcp-token"
opencode mcp add --global github --url https://api.githubcopilot.com/mcp/ \
  --header 'Authorization=Bearer {file:~/.config/opencode/.github-mcp-token}'
```

Post-process the config: expose memory tools directly, extend startup timeouts, and allow local memory tools:

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser('~/.config/opencode/opencode.json')
c = json.load(open(p))
m = c['mcp']['servers']
m['memory']['codemode'] = False
m['memory']['timeout'] = {'startup': 60000}
m['playwright']['timeout'] = {'startup': 60000}
perms = c.setdefault('permissions', [])
if not any(r.get('action') == 'memory_*' for r in perms):
    perms.append({'action': 'memory_*', 'resource': '*', 'effect': 'allow'})
json.dump(c, open(p, 'w'), indent=2)
PY
```

If you are not using OpenCode Go, edit `model` and `small_model` in `$CFG/opencode.json` to your provider/model.

## 8. OAuth servers

Run one at a time and complete the browser sign-in before moving on:

```bash
opencode mcp auth notion
opencode mcp auth firecrawl
opencode mcp auth upwork
```

Do not run `opencode reload` or `opencode service restart` while an OAuth flow is waiting; the integration is invalidated. If a link expires, rerun the command. Skip any server you do not need, then remove or disable it in the config.

## 9. Restart and verify

```bash
opencode service restart
sleep 8
```

Then check:

```bash
opencode api get /api/mcp
opencode api get /api/plugin
opencode api get /api/skill
opencode debug agents
ls "$CFG/commands" | wc -l
```

Expected:

- `/api/mcp`: nine servers `connected` (or fewer if you skipped OAuth servers).
- `/api/plugin`: zero failed; `ecc-barrel`, `ecc-hooks`, and `i-have-adhd` active.
- `/api/skill`: about 341 skills; `i-have-adhd`, `natural-writing`, `langflow-workflows`, `langgraph-agent-patterns`, and `n8n-workflow-patterns` present.
- `opencode debug agents`: 56 agents. If it returns `[]` immediately after restart, wait five seconds and rerun; the service is still starting.
- Commands: 52 files.

Run the smoke test:

```bash
cd /tmp
opencode run --standalone --auto --model <your-small-model> "Reply with exactly OK"
```

Expect `OK`. Then check:

```bash
tail -n 5 "$HOME/.cache/opencode/ecc-hooks.log"
```

Expect `v2 adapter active` and `Session started`.

Use `scripts/health-check.sh` for a compact version of these checks.

## 10. Report

Report:

- backup path
- agent count and missing IDs
- command count
- skill count
- MCP statuses
- failed plugin count
- smoke-test output
- any warnings from the converter or installer

## Rollback

```bash
BACKUP="$(cat /tmp/opencode-backup-path)"
rm -rf "$HOME/.config/opencode"
tar -xzf "$BACKUP" -C "$HOME/.config"
opencode reload
```

## Security

- Never commit `.github-mcp-token`, `service.json`, `memory.jsonl`, backups, session transcripts, or personal data.
- Keep the GitHub token file mode `600`; use a fine-grained PAT if you want least privilege.
- The setup repo is private. Invite only people you trust.
- Removing AI-provenance watermarks or making AI text evade detectors is not part of this setup.

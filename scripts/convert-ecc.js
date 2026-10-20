#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const repo = process.argv[2] || path.join(os.homedir(), 'Work/ECC');
const cfgRoot = process.argv[3] || path.join(os.homedir(), '.config/opencode');
const cfgPath = path.join(cfgRoot, 'opencode.json');
const agentsOut = path.join(cfgRoot, 'agents');
const commandsOut = path.join(cfgRoot, 'commands');
fs.mkdirSync(agentsOut, { recursive: true });
fs.mkdirSync(commandsOut, { recursive: true });

const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};

const EXTRA_AGENTS = [
  'react-reviewer', 'typescript-reviewer', 'vue-reviewer', 'react-build-resolver',
  'flutter-reviewer', 'dart-build-resolver', 'swift-reviewer', 'swift-build-resolver',
  'a11y-architect', 'seo-specialist', 'performance-optimizer',
  'silent-failure-hunter', 'pr-test-analyzer', 'commit-reviewer', 'type-design-analyzer',
  'code-simplifier', 'code-explorer', 'code-architect', 'comment-analyzer',
  'agent-evaluator', 'spec-miner', 'rag-pipeline-reviewer', 'mle-reviewer'
];

const EXTRA_COMMANDS = [
  'react-build', 'react-review', 'react-test', 'vue-review',
  'flutter-build', 'flutter-review', 'flutter-test',
  'kotlin-build', 'kotlin-review', 'kotlin-test', 'gradle-build',
  'fastapi-review', 'python-review',
  'feature-dev', 'plan-prd', 'prp-plan', 'prp-implement', 'review-pr',
  'orch-add-feature', 'orch-build-mvp', 'orch-change-feature', 'orch-fix-defect', 'orch-refine-code',
  'gan-build', 'gan-design'
];

const GUARDRAILS = [
  ['read', '*.env', 'ask'],
  ['read', '*.env.*', 'ask'],
  ['read', '*.env.example', 'allow'],
  ['read', '*/.ssh/*', 'deny'],
  ['read', '*id_rsa*', 'deny'],
  ['read', '*id_ed25519*', 'deny'],
  ['external_directory', '*', 'ask'],
  ['shell', 'sudo *', 'ask'],
  ['shell', 'rm -rf *', 'ask'],
  ['shell', 'rm -fr *', 'ask'],
  ['shell', 'git push *', 'ask'],
  ['shell', 'git reset --hard *', 'ask'],
  ['shell', 'git clean *', 'ask']
];

function parseFrontmatter(src) {
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { fm: {}, body: src };
  const fm = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const kv = rawLine.trimEnd().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { fm, body: src.slice(match[0].length) };
}

function quote(value) { return JSON.stringify(String(value || '')); }

function rulesForToolList(toolsRaw) {
  const tools = String(toolsRaw || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const all = tools.length === 0;
  const rules = [];
  if (!all && !tools.includes('read')) rules.push(['read', '*', 'deny']);
  if (!all && !tools.includes('write') && !tools.includes('edit')) rules.push(['edit', '*', 'deny']);
  if (!all && !tools.includes('bash')) rules.push(['shell', '*', 'deny']);
  return rules;
}

function rulesForToolObject(tools) {
  if (!tools || typeof tools !== 'object') return [];
  const rules = [];
  if (tools.read === false) rules.push(['read', '*', 'deny']);
  if (tools.write === false || tools.edit === false) rules.push(['edit', '*', 'deny']);
  if (tools.bash === false) rules.push(['shell', '*', 'deny']);
  return rules;
}

function renderAgent(description, body, toolRules, mode) {
  const lines = ['---', `description: ${quote(description)}`, `mode: ${mode || 'subagent'}`];
  const rules = [...GUARDRAILS, ...toolRules];
  if (rules.length) {
    lines.push('permissions:');
    for (const [action, resource, effect] of rules) {
      lines.push(`  - action: ${action}`);
      lines.push(`    resource: ${quote(resource)}`);
      lines.push(`    effect: ${effect}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n') + body.replace(/^\s+/, '').trimEnd() + '\n';
}

const installedIds = new Set();
let baseCount = 0;

for (const [id, def] of Object.entries(cfg.agent || {})) {
  if (id === 'build') continue;
  const raw = String(def.prompt || '');
  const fileRef = raw.match(/^\{file:(.+)\}$/);
  let body = raw;
  if (fileRef) {
    const promptPath = path.resolve(cfgRoot, fileRef[1].trim());
    if (!fs.existsSync(promptPath)) {
      console.warn(`skip base agent (missing prompt): ${id} -> ${promptPath}`);
      continue;
    }
    body = fs.readFileSync(promptPath, 'utf8');
  }
  if (!body.trim()) {
    console.warn(`skip base agent (empty prompt): ${id}`);
    continue;
  }
  const out = renderAgent(def.description || `${id} subagent`, body, rulesForToolObject(def.tools), def.mode);
  fs.writeFileSync(path.join(agentsOut, `${id}.md`), out);
  installedIds.add(id);
  baseCount += 1;
}

let extraCount = 0;
for (const id of EXTRA_AGENTS) {
  const source = path.join(repo, 'agents', `${id}.md`);
  if (!fs.existsSync(source)) {
    console.warn(`skip agent (missing): ${id}`);
    continue;
  }
  const { fm, body } = parseFrontmatter(fs.readFileSync(source, 'utf8'));
  const out = renderAgent(fm.description || `${id} subagent`, body, rulesForToolList(fm.tools), 'subagent');
  fs.writeFileSync(path.join(agentsOut, `${id}.md`), out);
  installedIds.add(id);
  extraCount += 1;
}

let commandCount = 0;
for (const name of EXTRA_COMMANDS) {
  const source = path.join(repo, 'commands', `${name}.md`);
  if (!fs.existsSync(source)) {
    console.warn(`skip command (missing): ${name}`);
    continue;
  }
  const { fm, body } = parseFrontmatter(fs.readFileSync(source, 'utf8'));
  const lines = ['---', `description: ${quote(fm.description || name)}`];
  if (fm.agent && installedIds.has(fm.agent)) lines.push(`agent: ${fm.agent}`);
  lines.push('---', '');
  const rewritten = body
    .replace(/\bCLAUDE\.md\b/g, 'AGENTS.md')
    .replace(/^\s+/, '')
    .trimEnd();
  fs.writeFileSync(path.join(commandsOut, `${name}.md`), lines.join('\n') + rewritten + '\n');
  commandCount += 1;
}

// Config: agents are files now, so remove the v1 agent map to avoid clashes.
delete cfg.agent;
delete cfg.skills;
cfg.model = 'opencode-go/deepseek-v4-pro';
cfg.small_model = 'opencode-go/deepseek-v4.1-flash';
cfg.default_agent = 'build';
cfg.update = 'notify';
cfg.share = 'disabled';
cfg.snapshots = true;
cfg.shell = '/bin/zsh';
cfg.compaction = { auto: true, keep: { tokens: 24000 } };
cfg.watcher = { ignore: ['**/node_modules/**', '**/dist/**', '**/.venv/**'] };
cfg.permissions = GUARDRAILS.map(([action, resource, effect]) => ({ action, resource, effect }));
cfg.instructions = ['instructions/INSTRUCTIONS.md'].filter(p => fs.existsSync(path.resolve(cfgRoot, p)));
if (cfg.instructions.length === 0) delete cfg.instructions;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

console.log(`base agents: ${baseCount}`);
console.log(`extra agents: ${extraCount}`);
console.log(`commands: ${commandCount}`);
console.log(`config rewritten: ${cfgPath}`);

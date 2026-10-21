#!/usr/bin/env python3
"""Add bars and reset countdowns to opencode-usage-tui's sidebar row.

The upstream 0.2.0 sidebar prints plain percentages. This patch keeps the
plugin's own Usage section only; it does not touch the built-in Context
section. Re-run after updating the plugin.
"""
import glob
import os
import sys

patterns = [
    os.path.expanduser("~/.cache/opencode/npm/opencode-usage-tui@*/*/node_modules/opencode-usage-tui/src/tui.tsx"),
    os.path.expanduser("~/.cache/opencode/npm/opencode-usage-tui@*/node_modules/opencode-usage-tui/src/tui.tsx"),
    os.path.expanduser("~/.local/share/opencode/**/opencode-usage-tui/src/tui.tsx"),
    os.path.expanduser("~/.local/lib/node_modules/opencode-usage-tui/src/tui.tsx"),
    os.path.expanduser("~/.config/opencode/**/opencode-usage-tui/src/tui.tsx"),
]

path = None
for pattern in patterns:
    matches = glob.glob(pattern, recursive=True)
    if matches:
        path = matches[0]
        break

if not path or not os.path.isfile(path):
    print("opencode-usage-tui src/tui.tsx not found. Run `opencode plugin add opencode-usage-tui` first.", file=sys.stderr)
    sys.exit(1)

source = open(path, encoding="utf-8").read()

if "LABELS[w].padEnd(7)" in source:
    print("already patched:", path)
    sys.exit(0)

old_reset = """function resetsIn(iso: string): string {
  const mins = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000))
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}"""

new_reset = """function resetsIn(iso: string): string {
  const mins = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000))
  if (mins < 60) return `${mins}m`
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d${h}h`
  return `${h}h${m}m`
}"""

old_labels = 'const LABELS = { rolling: "5-hour", weekly: "Weekly", monthly: "Monthly" } as const'
new_labels = 'const LABELS = { rolling: "Rolling", weekly: "Weekly", monthly: "Monthly" } as const'

old_view = """            {WINDOWS.map((w) => (
              <text fg={context.theme.text.muted}>{`${LABELS[w]}: ${data()[w].percent}%`}</text>
            ))}"""

new_view = """            {WINDOWS.map((w) => {
              const p = Math.max(0, Math.min(100, data()[w].percent))
              const filled = Math.round((p / 100) * 10)
              const bar = "█".repeat(filled) + "░".repeat(10 - filled)
              return (
                <text fg={context.theme.text.muted}>{`${LABELS[w].padEnd(7)} ${bar} ${String(p).padStart(3)}%  ${resetsIn(data()[w].resetsAt)}`}</text>
              )
            })}"""

for old, new, label in (
    (old_reset, new_reset, "resetsIn"),
    (old_labels, new_labels, "LABELS"),
    (old_view, new_view, "View"),
):
    if old not in source:
        print("patch failed: could not find", label, "block in", path, file=sys.stderr)
        sys.exit(1)
    source = source.replace(old, new)

backup = path + ".bak"
if not os.path.exists(backup):
    open(backup, "w", encoding="utf-8").write(open(path, encoding="utf-8").read())

open(path, "w", encoding="utf-8").write(source)
print("patched:", path)

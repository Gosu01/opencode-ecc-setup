#!/usr/bin/env python3
"""Install the patched opencode-usage-tui sidebar view.

The patched view renders two collapsible sections:

  ▼ USAGE · Go
  Rolling █░░░░░░░░░   6%  4h40m
  Weekly  ██░░░░░░░░  17%  4d16h
  Monthly ██████░░░░  55%  22d8h

  ▼ MODELS · this session
  deepseek-v4-pro        $0.03  49k tok

It does not touch the built-in Context or MCP sections. Re-run after updating
the plugin; the package source is replaced on update.
"""
import glob
import os
import shutil
import sys

here = os.path.dirname(os.path.abspath(__file__))
source = os.path.join(here, "usage-tui-patched.tsx")
if not os.path.isfile(source):
    print("missing usage-tui-patched.tsx next to this script", file=sys.stderr)
    sys.exit(1)

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

current = open(path, encoding="utf-8").read()
if "USAGE · Go" in current and "MODELS · this session" in current:
    print("already patched:", path)
    sys.exit(0)

backup = path + ".bak"
if not os.path.exists(backup):
    shutil.copyfile(path, backup)

shutil.copyfile(source, path)
print("patched:", path)

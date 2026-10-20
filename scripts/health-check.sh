#!/usr/bin/env bash
set -euo pipefail

CFG="${HOME}/.config/opencode"

echo "OpenCode: $(opencode --version)"
echo "Service:"
opencode service status || true

echo "MCP:"
opencode api get /api/mcp | python3 -c '
import json, sys
d = json.load(sys.stdin)
for s in d.get("data", []):
    print("  {}: {}".format(s["name"], s.get("status", {}).get("status")))
'

echo "Plugins:"
opencode api get /api/plugin | python3 -c '
import json, sys
d = json.load(sys.stdin)["data"]
failed = [p for p in d if p.get("state", {}).get("status") == "failed"]
print("  total: {}  failed: {}".format(len(d), len(failed)))
for p in d:
    if p.get("id") in ("ecc-barrel", "ecc-hooks", "i-have-adhd"):
        print("  {}: {}".format(p["id"], p.get("state", {}).get("status")))
'

echo "Skills:"
opencode api get /api/skill | python3 -c '
import json, sys
print("  advertised: {}".format(len(json.load(sys.stdin).get("data", []))))
'

echo "Agents:"
opencode debug agents | python3 -c '
import json, sys
a = json.load(sys.stdin)
print("  {}".format(len(a)))
'

echo "Commands: $(ls "$CFG/commands" | wc -l)"
echo "Skills on disk: $(ls "$HOME/.agents/skills" | wc -l)"

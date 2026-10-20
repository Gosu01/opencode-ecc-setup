---
name: langflow-workflows
description: Build, debug, version, and deploy LangFlow 1.x AI workflows. Use for visual flows, custom Python components, API endpoints, webhooks, streaming, authentication, and production hardening.
metadata:
  tags: "langflow, automation, agentic-ai, workflows, python"
  category: "automation"
---

# LangFlow Workflows

Use this skill when the task involves LangFlow: designing a flow, writing a custom component, calling a flow over HTTP, debugging a run, or deploying LangFlow safely.

## Mental model

A LangFlow project is a graph:

- **Flow**: the graph document, stored as JSON and versioned in Git.
- **Component**: a node with typed inputs, typed outputs, and a Python method that produces each output.
- **Edge**: a connection from one component output to another component input.
- **Run**: one execution of a flow with a specific input payload.

Keep flow JSON and custom component code in the same repository so changes are reviewable.

## Install and run locally

```bash
uv pip install langflow
langflow run
# default: http://127.0.0.1:7860
```

Docker:

```bash
docker run --rm -p 7860:7860 langflowai/langflow:latest
```

For production, use PostgreSQL instead of the default SQLite store, set a persistent secret key, and disable auto-login.

## Build a flow

1. Define the input contract first: chat message, text, JSON, file, or webhook payload.
2. List the steps as components. Prefer built-in components before writing custom code.
3. Connect outputs to inputs with matching types. A `Message` output does not satisfy a `Data` input.
4. Add error handling at the boundaries: invalid input, upstream timeout, empty model response.
5. Run the flow in the playground with one normal case and one failure case.
6. Export the flow JSON and commit it.

## Call a flow over HTTP

Default endpoint shape for LangFlow 1.x:

```bash
curl -X POST "http://127.0.0.1:7860/api/v1/run/<flow-id-or-name>" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -d '{
    "input_value": "Summarize this ticket",
    "input_type": "chat",
    "output_type": "chat"
  }'
```

Webhook-style trigger:

```bash
curl -X POST "http://127.0.0.1:7860/api/v1/webhook/<flow-id>" \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

If authentication is enabled, every call needs the API key header. Use the interactive OpenAPI page at `/docs` to confirm the exact path and payload for the installed version.

## Custom component template

```python
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema.message import Message


class UppercaseComponent(Component):
    display_name = "Uppercase"
    description = "Uppercase a message"
    icon = "text"

    inputs = [
        MessageTextInput(name="text", display_name="Text", value=""),
    ]
    outputs = [
        Output(name="result", display_name="Result", method="transform"),
    ]

    def transform(self) -> Message:
        if not self.text:
            raise ValueError("text is required")
        return Message(text=self.text.upper())
```

Rules:

- The method name in `Output.method` must match the component method.
- Declare every input with a type and a default.
- Raise a clear error for invalid input; do not return an empty string silently.
- Keep secrets out of component code. Read them from environment variables or LangFlow variables.
- Put reusable components in a `components/` directory and import them consistently.

## Debugging

1. Reproduce with the smallest flow that still fails.
2. Inspect the failing component's input and output in the playground.
3. Check the server log for tracebacks; component errors are often wrapped as generic run failures.
4. Verify the input type (`chat` vs `text`) and the output key in the API response.
5. For webhook failures, log the raw payload before parsing it.
6. For timeouts, isolate whether the model call, a tool call, or a database call is slow.

## Production checklist

- Pin the LangFlow version and the Python dependencies.
- Store flow JSON in Git; review changes like code.
- Set `LANGFLOW_SECRET_KEY` explicitly and keep it stable across restarts.
- Disable auto-login and create a superuser with a strong password.
- Put LangFlow behind a reverse proxy with TLS; do not expose port 7860 directly.
- Use PostgreSQL for multi-user or production deployments.
- Set request and model timeouts; return a structured error instead of hanging.
- Add idempotency keys for webhook-triggered flows that create records or send messages.
- Log run IDs and correlation IDs; never log API keys, tokens, or full prompts containing secrets.
- Back up the database and the flow JSON separately.
- Test the flow's API contract after every export or upgrade.

## Common pitfalls

- **Output method mismatch**: `Output(method="build")` requires a `build` method.
- **Wrong input type**: a webhook sends JSON, not a chat message; add a parser component.
- **Hardcoded credentials**: use environment variables or LangFlow variables.
- **Version drift**: an exported flow may not import cleanly into a different LangFlow version; pin versions and test imports.
- **No idempotency**: retries can create duplicate records or duplicate messages.
- **Unbounded context**: trim or summarize long inputs before the model call.

## Official references

- https://docs.langflow.org/
- https://github.com/langflow-ai/langflow
- https://docs.langflow.org/api-reference-api-examples

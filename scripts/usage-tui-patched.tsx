/** @jsxImportSource @opentui/solid */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { homedir } from "node:os"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { Plugin, usePlugin } from "@opencode/plugin/tui"

const CAPS = { rolling: 12, weekly: 30, monthly: 60 } as const
const ENDPOINT = "https://opencode.ai/zen/go/v1/usage"

type Window = { status: string; percent: number; resetsAt: string }
type Usage = Record<keyof typeof CAPS, Window>

const CACHE =
  process.env.XDG_CACHE_HOME
    ? `${process.env.XDG_CACHE_HOME}/opencode/go-usage.json`
    : `${homedir()}/.cache/opencode/go-usage.json`

function readCache(): Usage | null {
  try {
    return JSON.parse(readFileSync(CACHE, "utf8"))
  } catch {
    return null
  }
}

function writeCache(usage: Usage): void {
  try {
    mkdirSync(dirname(CACHE), { recursive: true })
    writeFileSync(CACHE, JSON.stringify(usage))
  } catch {}
}

const [usage, setUsage] = createSignal<Usage | null>(readCache())
const [usageOpen, setUsageOpen] = createSignal(true)
const [modelsOpen, setModelsOpen] = createSignal(true)

function readKey(): string | undefined {
  try {
    const base = process.env.XDG_DATA_HOME ?? `${homedir()}/.local/share`
    const auth = JSON.parse(readFileSync(`${base}/opencode/auth.json`, "utf8"))
    return auth["opencode-go"]?.key ?? auth.opencode?.key
  } catch {
    return undefined
  }
}

async function refresh(): Promise<void> {
  const key = readKey()
  if (!key) {
    setUsage(null)
    return
  }
  try {
    const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${key}` } })
    if (res.ok) {
      const next = (await res.json()).usage as Usage
      setUsage(next)
      writeCache(next)
    }
  } catch {}
}

function money(percent: number, cap: number): string {
  return `$${((percent / 100) * cap).toFixed(2)}`
}

function resetsIn(iso: string): string {
  const mins = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000))
  if (mins < 60) return `${mins}m`
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d${h}h`
  return `${h}h${m}m`
}

function modelInfo(context: any, sessionID?: string) {
  const session = sessionID ? context?.data?.session?.get(sessionID) : undefined
  if (!session) return { name: "no session", cost: 0, tokens: "0" }
  const model: any = session.model
  const name = typeof model === "string" ? model : model?.id ?? "unknown"
  const cost = typeof session.cost === "number" ? session.cost : 0
  const t: any = session.tokens ?? {}
  const total =
    (t.input ?? 0) +
    (t.output ?? 0) +
    (t.reasoning ?? 0) +
    (t.cache?.read ?? 0) +
    (t.cache?.write ?? 0)
  const tokens =
    total >= 1_000_000
      ? `${(total / 1_000_000).toFixed(1)}m`
      : total >= 1_000
        ? `${Math.round(total / 1_000)}k`
        : `${total}`
  return { name: String(name), cost, tokens }
}

const WINDOWS = ["rolling", "weekly", "monthly"] as const
const LABELS = { rolling: "Rolling", weekly: "Weekly", monthly: "Monthly" } as const

function View(props: { sessionID?: string }) {
  const context = usePlugin()
  const text = context.theme.text
  const green = (text as any).feedback?.success?.base ?? text.base
  const current = () => modelInfo(context, props.sessionID)
  const [cached, setCached] = createSignal<Usage | null>(readCache())

  onMount(() => {
    const timer = setInterval(() => setCached(readCache()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <box>
      <box onMouseUp={() => setUsageOpen(!usageOpen())}>
        <text fg={text.base}>
          <b>{`${usageOpen() ? "▼" : "▶"} USAGE · Go`}</b>
        </text>
      </box>
      <Show when={usageOpen()}>
        <Show when={cached()} fallback={<text fg={text.muted}>no usage data</text>}>
          {(data) => (
            <>
              {WINDOWS.map((w) => {
                const p = Math.max(0, Math.min(100, data()[w].percent))
                const filled = Math.max(0, Math.min(10, Math.round((p / 100) * 10)))
                return (
                  <text fg={text.muted}>
                    {`${LABELS[w].padEnd(7)} `}
                    <span style={{ fg: green }}>{"█".repeat(filled)}</span>
                    <span style={{ fg: text.muted }}>{"░".repeat(10 - filled)}</span>
                    {` ${String(p).padStart(3)}%  ↻ ${resetsIn(data()[w].resetsAt)}`}
                  </text>
                )
              })}
            </>
          )}
        </Show>
      </Show>

      <box onMouseUp={() => setModelsOpen(!modelsOpen())}>
        <text fg={text.base}>
          <b>{`${modelsOpen() ? "▼" : "▶"} MODELS · this session`}</b>
        </text>
      </box>
      <Show when={modelsOpen()}>
        <text fg={text.base}>
          {current().name.slice(0, 22).padEnd(22)}
          <span style={{ fg: text.muted }}>{` $${current().cost.toFixed(2)}  ${current().tokens} tok`}</span>
        </text>
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "usage",
  async setup(context) {
    void refresh()
    const timer = setInterval(refresh, 60_000)

    context.ui.slot({
      append: "sidebar.content",
      render: (input: any) => <View sessionID={input?.sessionID} />,
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "usage.show",
          title: "Show Go usage",
          group: "Plugin",
          palette: true,
          slash: { name: "usage" },
          run() {
            const u = usage() ?? readCache()
            if (!u) {
              context.ui.toast.show({
                variant: "warning",
                title: "Usage",
                message: "No usage data — signed in to OpenCode Go?",
              })
              return
            }
            context.ui.toast.show({
              title: "OpenCode Go usage",
              message: WINDOWS.map(
                (w) =>
                  `${LABELS[w]}: ${u[w].percent}% (${money(u[w].percent, CAPS[w])}) · resets in ${resetsIn(u[w].resetsAt)}`,
              ).join("\n"),
            })
          },
        },
      ],
    }))

    return () => clearInterval(timer)
  },
})

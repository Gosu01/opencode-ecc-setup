/** @jsxImportSource @opentui/solid */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { homedir } from "node:os"
import { createEffect, createSignal, Show } from "solid-js"
import { Plugin, usePlugin } from "@opencode/plugin/tui"
// @ts-ignore - Bun provides this at runtime
import { Database } from "bun:sqlite"

const CAPS = { rolling: 12, weekly: 30, monthly: 60 } as const
const ENDPOINT = "https://opencode.ai/zen/go/v1/usage"

type Window = { status: string; percent: number; resetsAt: string }
type Usage = Record<keyof typeof CAPS, Window>
type ModelRow = { name: string; cost: number; tokens: number }

const CACHE =
  process.env.XDG_CACHE_HOME
    ? `${process.env.XDG_CACHE_HOME}/opencode/go-usage.json`
    : `${homedir()}/.cache/opencode/go-usage.json`

const DB =
  process.env.XDG_DATA_HOME
    ? `${process.env.XDG_DATA_HOME}/opencode/opencode.db`
    : `${homedir()}/.local/share/opencode/opencode.db`

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

let db: any = null
function getDb(): any {
  if (db) return db
  try {
    db = new Database(DB, { readonly: true })
  } catch {
    db = null
  }
  return db
}

function readModelRows(sessionID?: string): ModelRow[] {
  if (!sessionID) return []
  try {
    const stmt = getDb()?.prepare(
      "SELECT data FROM session_message WHERE session_id = ? AND type = 'assistant'",
    )
    const rows = (stmt?.all(sessionID) ?? []) as Array<{ data: string }>
    const groups = new Map<string, ModelRow>()
    for (const row of rows) {
      let data: any
      try {
        data = JSON.parse(String(row.data))
      } catch {
        continue
      }
      const model: any = data?.model
      const name = typeof model === "string" ? model : model?.id
      if (!name) continue
      const cost = typeof data.cost === "number" ? data.cost : 0
      const t: any = data.tokens ?? {}
      const tokens =
        (t.input ?? 0) +
        (t.output ?? 0) +
        (t.reasoning ?? 0) +
        (t.cache?.read ?? 0) +
        (t.cache?.write ?? 0)
      if (cost === 0 && tokens === 0) continue
      const group = groups.get(name) ?? { name, cost: 0, tokens: 0 }
      group.cost += cost
      group.tokens += tokens
      groups.set(name, group)
    }
    return [...groups.values()].sort((a, b) => b.cost - a.cost)
  } catch {
    return []
  }
}

function readKey(): string | undefined {
  try {
    const base = process.env.XDG_DATA_HOME ?? `${homedir()}/.local/share`
    const auth = JSON.parse(readFileSync(`${base}/opencode/auth.json`, "utf8"))
    return auth["opencode-go"]?.key ?? auth.opencode?.key
  } catch {
    return undefined
  }
}

function money(percent: number, cap: number): string {
  return `$${((percent / 100) * cap).toFixed(2)}`
}

function resetsIn(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((Date.parse(iso) - now) / 1000))
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${m}m${s}s`
  return `${m}m${s}s`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
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
  return { name: String(name), cost, tokens: formatTokens(total) }
}

function modelLine(name: string, cost: number, tokens: string) {
  const money = cost > 0 ? `$${cost.toFixed(2)}` : "free"
  const label = name.length > 19 ? `${name.slice(0, 18)}…` : name.padEnd(19)
  return `${label} ${money.padStart(5)}  ${tokens.padStart(4)} tok`
}

const WINDOWS = ["rolling", "weekly", "monthly"] as const
const LABELS = { rolling: "Rolling", weekly: "Weekly", monthly: "Monthly" } as const

type ViewProps = {
  sessionID?: string
  usage: () => Usage | null
  clock: () => number
  usageOpen: () => boolean
  setUsageOpen: any
  modelsOpen: () => boolean
  setModelsOpen: any
}

function View(props: ViewProps) {
  const context = usePlugin()
  const text = context.theme.text
  const green = (text as any).feedback?.success?.base ?? text.base

  const current = () => {
    props.clock()
    return modelInfo(context, props.sessionID)
  }
  const currentUsage = () => {
    props.clock()
    return props.usage() ?? readCache()
  }
  const now = () => {
    props.clock()
    return Date.now()
  }
  const [modelRows, setModelRows] = createSignal<ModelRow[]>(readModelRows(props.sessionID))
  createEffect(() => {
    props.clock()
    setModelRows(readModelRows(props.sessionID))
  })

  const renderView = () => (
    <box>
      <box onMouseUp={() => props.setUsageOpen(!props.usageOpen())}>
        <text fg={text.base}>
          <b>{`${props.usageOpen() ? "▼" : "▶"} USAGE · Go`}</b>
        </text>
      </box>
      <Show when={props.usageOpen()}>
        <Show when={currentUsage()} fallback={<text fg={text.muted}>no usage data</text>}>
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
                    {` ${String(p).padStart(3)}%  ↻ ${resetsIn(data()[w].resetsAt, now())}`}
                  </text>
                )
              })}
            </>
          )}
        </Show>
      </Show>

      <box onMouseUp={() => props.setModelsOpen(!props.modelsOpen())}>
        <text fg={text.base}>
          <b>{`${props.modelsOpen() ? "▼" : "▶"} MODELS · this session`}</b>
        </text>
      </box>
      <Show when={props.modelsOpen()}>
        <Show
          when={modelRows().length > 0}
          fallback={
            <text fg={text.base}>
              {modelLine(current().name, current().cost, current().tokens)}
            </text>
          }
        >
          {modelRows().map((row) => (
            <text fg={text.base}>{modelLine(row.name, row.cost, formatTokens(row.tokens))}</text>
          ))}
        </Show>
      </Show>
    </box>
  )
  return <>{() => renderView()}</>
}

export default Plugin.define({
  id: "usage",
  async setup(context) {
    const [usageState, setUsageState] = createSignal<Usage | null>(readCache())
    const [usageOpen, setUsageOpen] = createSignal(true)
    const [modelsOpen, setModelsOpen] = createSignal(true)
    const [clock, setClock] = createSignal(0)

    const refresh = async () => {
      const key = readKey()
      if (!key) {
        setUsageState(null)
        return
      }
      try {
        const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${key}` } })
        if (res.ok) {
          const next = (await res.json()).usage as Usage
          setUsageState(next)
          writeCache(next)
        }
      } catch {}
    }

    void refresh()
    const timer = setInterval(refresh, 10_000)
    const clockTimer = setInterval(() => {
      setClock((v) => v + 1)
      const renderer: any = (context as any).renderer
      renderer?.requestRender?.()
      renderer?.markDirty?.()
    }, 1000)

    context.ui.slot({
      append: "sidebar.content",
      render: (input: any) => (
        <View
          sessionID={input?.sessionID}
          usage={usageState}
          clock={clock}
          usageOpen={usageOpen}
          setUsageOpen={setUsageOpen}
          modelsOpen={modelsOpen}
          setModelsOpen={setModelsOpen}
        />
      ),
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
            const u = usageState() ?? readCache()
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

    return () => {
      clearInterval(timer)
      clearInterval(clockTimer)
    }
  },
})

'use client'

import { ExternalLink, FileJson, GitBranch, Info, Layers, Network, ShieldCheck } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useArchitecture } from '@/hooks/use-soc'
import type { SpecGraph, SpecGraphNode } from '@/lib/types'
import { SectionLabel } from '@/components/soc/bits'

const KIND_TINT: Record<string, string> = {
  source: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  service: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
  ai: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  ai_output: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  logic: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300',
  output: 'border-red-500/40 bg-red-500/10 text-red-300',
  compute: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
  data_store: 'border-lime-500/40 bg-lime-500/10 text-lime-300',
  presentation: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  consumer: 'border-zinc-400/40 bg-zinc-400/10 text-zinc-300',
  intermediate: 'border-teal-400/40 bg-teal-400/10 text-teal-300',
  optional_ai: 'border-zinc-600/50 bg-zinc-600/10 text-zinc-400',
  optional_logic: 'border-zinc-600/50 bg-zinc-600/10 text-zinc-400',
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ').toUpperCase()
}

// ─── Node chip ────────────────────────────────────────────────────

function NodeChip({ node }: { node: SpecGraphNode }) {
  const tint = KIND_TINT[node.kind] ?? 'border-zinc-600/50 bg-zinc-600/10 text-zinc-400'
  const chip = (
    <div className={`cursor-default rounded-md border bg-zinc-950/60 px-2.5 py-1.5 text-center transition-transform hover:-translate-y-0.5 ${tint}`}>
      <div className="text-[11px] font-semibold leading-tight text-zinc-100">{node.label}</div>
      <div className="mt-0.5 font-mono text-[8px] uppercase tracking-widest opacity-80">{kindLabel(node.kind)}</div>
    </div>
  )
  if (!node.details || node.details.length === 0) return chip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 border-zinc-800 bg-zinc-950">
        <div className="space-y-0.5 font-mono text-[10px] leading-relaxed text-zinc-300">
          {node.details.map((d, i) => (
            <div key={i}>· {d}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Horizontal flow graph (array order, arrows where edges exist) ──

function HorizontalGraph({ graph }: { graph: SpecGraph }) {
  const edgeMap = new Map<string, { label?: string; optional?: boolean }>()
  graph.edges.forEach((e) => edgeMap.set(`${e.from}->${e.to}`, e))

  return (
    <TooltipProvider delayDuration={150}>
      <div className="soc-scroll flex items-center gap-1.5 overflow-x-auto pb-2">
        {graph.nodes.map((n, i) => {
          if (i === graph.nodes.length - 1) return <div key={n.id} className="shrink-0"><NodeChip node={n} /></div>
          const edge = edgeMap.get(`${n.id}->${graph.nodes[i + 1].id}`)
          return (
            <div key={n.id} className="flex shrink-0 items-center gap-1.5">
              <NodeChip node={n} />
              <div className="flex flex-col items-center leading-none">
                <span className="font-mono text-xs text-zinc-500">→</span>
                {edge && (
                  <span className={`mt-0.5 whitespace-nowrap font-mono text-[8px] ${edge.optional ? 'text-zinc-700' : 'text-zinc-500'}`}>
                    {edge.label ?? (edge.optional ? 'optional' : '')}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

// ─── Layered vertical flow (layered_model_pipeline) ───────────────

const LAYER_GROUPS: { kinds: string[]; title: string }[] = [
  { kinds: ['source'], title: 'Sensing' },
  { kinds: ['ai', 'ai_output'], title: 'Detection' },
  { kinds: ['logic'], title: 'Temporal verification & reasoning' },
  { kinds: ['intermediate'], title: 'Output' },
  { kinds: ['optional_ai', 'optional_logic'], title: 'Optional enrichment' },
]

function LayeredGraph({ graph }: { graph: SpecGraph }) {
  const rows = LAYER_GROUPS.map((g) => ({
    title: g.title,
    nodes: graph.nodes.filter((n) => g.kinds.includes(n.kind)),
  })).filter((r) => r.nodes.length > 0)

  function edgesBetween(fromKinds: string[], toKinds: string[]): string[] {
    const fromIds = new Set(graph.nodes.filter((n) => fromKinds.includes(n.kind)).map((n) => n.id))
    const toIds = new Set(graph.nodes.filter((n) => toKinds.includes(n.kind)).map((n) => n.id))
    return graph.edges.filter((e) => fromIds.has(e.from) && toIds.has(e.to)).map((e) => e.label ?? 'flow')
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={row.title}>
            <div className="rounded-md border border-zinc-800/70 bg-zinc-950/40 p-2.5">
              <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">{row.title}</div>
              <div className="flex flex-wrap items-start gap-1.5">
                {row.nodes.map((n) => (
                  <NodeChip key={n.id} node={n} />
                ))}
              </div>
            </div>
            {i < rows.length - 1 && (
              <div className="flex items-center justify-center gap-2 py-0.5">
                <span className="font-mono text-xs text-zinc-600">↓</span>
                {edgesBetween(
                  LAYER_GROUPS[i]?.kinds ?? [],
                  LAYER_GROUPS[i + 1]?.kinds ?? []
                ).slice(0, 3).map((lbl, j) => (
                  <span key={j} className="font-mono text-[8px] text-zinc-700">{lbl}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────

function GraphCard({ title, icon: Icon, graph, children }: { title: string; icon: typeof Network; graph: SpecGraph; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <span className="rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-px font-mono text-[9px] text-zinc-500">
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
      </div>
      {graph.rationale && <p className="mb-1 text-xs leading-relaxed text-zinc-500">{graph.rationale}</p>}
      {graph.notes && <p className="mb-2 font-mono text-[10px] text-zinc-600">note: {graph.notes}</p>}
      <div className="mb-3">{children}</div>
      <div className="flex flex-wrap gap-1.5">
        {[...new Set(graph.nodes.map((n) => n.kind))].map((k) => (
          <span key={k} className={`rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider ${KIND_TINT[k] ?? 'border-zinc-700 text-zinc-500'}`}>
            {kindLabel(k)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ArchitectureTab() {
  const { data, isLoading } = useArchitecture()

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg bg-zinc-900/50" />
        <Skeleton className="h-40 rounded-lg bg-zinc-900/50" />
        <Skeleton className="h-40 rounded-lg bg-zinc-900/50" />
      </div>
    )
  }

  const { metadata, architecture, sources, roadmap, yolo26_capabilities } = data

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-100">{metadata.title}</h2>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
            v{metadata.version} · generated {metadata.generated_date} · doc {metadata.doc_id}
          </p>
        </div>
        <a
          href="/api/architecture"
          download="yolo26-security-platform.json"
          className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-[11px] tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500/20"
        >
          <FileJson className="h-3.5 w-3.5" /> DOWNLOAD SPEC JSON
        </a>
      </div>

      {/* Design principle */}
      <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 lg:p-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <SectionLabel className="mb-1 text-amber-500/80">Design principle</SectionLabel>
          <p className="max-w-5xl text-xs leading-relaxed text-zinc-300">{metadata.design_principle}</p>
        </div>
      </div>

      {/* Graphs */}
      <GraphCard title={architecture.overall_architecture.title} icon={Network} graph={architecture.overall_architecture}>
        <HorizontalGraph graph={architecture.overall_architecture} />
      </GraphCard>

      <GraphCard title={architecture.end_to_end_production.title} icon={GitBranch} graph={architecture.end_to_end_production}>
        <HorizontalGraph graph={architecture.end_to_end_production} />
      </GraphCard>

      <GraphCard title={architecture.layered_model_pipeline.title} icon={Layers} graph={architecture.layered_model_pipeline}>
        <LayeredGraph graph={architecture.layered_model_pipeline} />
      </GraphCard>

      {/* Edge-central pattern */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
          <div className="mb-2 flex items-center gap-2">
            <Network className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Edge + central pattern</h3>
          </div>
          <p className="mb-3 border-l-2 border-emerald-500/50 pl-3 text-xs italic leading-relaxed text-zinc-300">
            “{architecture.edge_central_pattern.principle}”
          </p>
          <SectionLabel className="mb-1.5">Flow</SectionLabel>
          <ol className="mb-3 space-y-1">
            {architecture.edge_central_pattern.flow.map((step, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-zinc-300">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-700 font-mono text-[9px] text-zinc-500">{i + 1}</span>
                <span className="font-mono">{step}</span>
                {i < architecture.edge_central_pattern.flow.length - 1 && <span className="font-mono text-[9px] text-zinc-600">→</span>}
              </li>
            ))}
          </ol>
          <SectionLabel className="mb-1.5">Send to central only</SectionLabel>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {architecture.edge_central_pattern.send_to_central_only.map((s) => (
              <span key={s} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                {s}
              </span>
            ))}
          </div>
          <SectionLabel className="mb-1.5">Benefits</SectionLabel>
          <ul className="space-y-0.5">
            {architecture.edge_central_pattern.benefits.map((b, i) => (
              <li key={i} className="text-xs text-zinc-400">· {b}</li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[10px] text-zinc-600">{architecture.edge_central_pattern.edge_behavior}</p>
        </div>

        {/* YOLO26 capabilities */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
          <div className="mb-2 flex items-center gap-2">
            <Info className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">YOLO26 capabilities</h3>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Role: <span className="text-zinc-200">{yolo26_capabilities.role}</span>
          </p>
          <SectionLabel className="mb-1.5">Supported tasks</SectionLabel>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {yolo26_capabilities.supported_tasks.map((t) => (
              <span key={t} className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                {t}
              </span>
            ))}
          </div>
          <SectionLabel className="mb-1.5">Tracking</SectionLabel>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {yolo26_capabilities.tracking.named_options.map((t) => (
              <span key={t} className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                {t}
              </span>
            ))}
            <span className="font-mono text-[10px] text-zinc-500">
              {yolo26_capabilities.tracking.multiple_trackers ? 'multiple trackers' : 'single tracker'} · ReID{' '}
              {yolo26_capabilities.tracking.reid_options_available ? 'available' : 'n/a'}
            </span>
          </div>
          <SectionLabel className="mb-1.5">Export formats</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {yolo26_capabilities.export_formats.map((f) => (
              <span key={f} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                {f}
              </span>
            ))}
            {yolo26_capabilities.nms_free_end_to_end_detection?.available && (
              <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                NMS-free end-to-end (optional)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Roadmap */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <SectionLabel className="mb-2 text-red-400/80">V1 exclusions</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {roadmap.v1_exclusions.map((x) => (
                <span key={x} className="rounded border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-300 line-through decoration-red-500/50">
                  {x}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">Deliberately out of scope for v1 — perception-first, human-in-the-loop.</p>
          </div>
          <div>
            <SectionLabel className="mb-2">Build sequence</SectionLabel>
            <ol className="space-y-1">
              {roadmap.build_sequence.map((s, i) => (
                <li key={s} className="flex items-center gap-2 text-xs text-zinc-300">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-700 font-mono text-[9px] text-zinc-500">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <SectionLabel className="mb-2">Metrics that matter</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {roadmap.metrics_that_matter.map((m) => (
                <span key={m} className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                  {m}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{roadmap.yolo26_fit}</p>
          </div>
        </div>
      </div>

      {/* Sources */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
        <SectionLabel className="mb-3">Sources</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2">
          {sources.map((s) => (
            <div key={s.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:underline"
              >
                <span className="font-mono text-zinc-500">{s.id}</span> {s.title} <ExternalLink className="h-3 w-3" />
              </a>
              <ul className="mt-1.5 space-y-0.5">
                {s.used_for.map((u, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-zinc-500">· {u}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[10px] text-zinc-600">
          machine-readable schema: <span className="text-zinc-400">/spec/yolo26-security-platform.schema.json</span> · served by <span className="text-zinc-400">/api/architecture</span>
        </p>
      </div>
    </div>
  )
}

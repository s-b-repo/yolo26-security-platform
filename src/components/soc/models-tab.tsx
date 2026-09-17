'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpCircle, Brain, ClipboardCheck, Cpu, FileDown, MoreHorizontal, Package } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useModelStatusPatch, useModels } from '@/hooks/use-soc'
import { FORMAT_META, MODEL_STATUS_META, timeAgo } from '@/lib/soc'
import type { ModelVersion } from '@/lib/types'
import { SectionLabel } from '@/components/soc/bits'

const PIPELINE_ICONS = [Brain, ClipboardCheck, Package, FileDown, Cpu]

function MetricCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">{value}</div>
      {hint && <div className="text-[9px] text-zinc-600">{hint}</div>}
    </div>
  )
}

function fmtMetric(key: string, v: number): string {
  if (key === 'latencyMs') return `${v.toFixed(1)} ms`
  if (key === 'fps') return v.toFixed(0)
  if (key === 'falsePositiveRate' || key === 'falseNegativeRate') return `${(v * 100).toFixed(2)}%`
  return v.toFixed(3)
}

function StatusBadgeModels({ status }: { status: string }) {
  const meta = MODEL_STATUS_META[status] ?? MODEL_STATUS_META.archived
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider ${meta.badge}`}>
      {status === 'active' && <span className="animate-soc-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {meta.label}
    </span>
  )
}

function formatBadge(f: string) {
  const cls = FORMAT_META[f] ?? 'border-zinc-600/60 bg-zinc-500/10 text-zinc-400'
  return (
    <span key={f} className={`rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide ${cls}`}>
      {f}
    </span>
  )
}

export function ModelsTab() {
  const { data, isLoading } = useModels()
  const patch = useModelStatusPatch()
  const [pending, setPending] = useState<{ model: ModelVersion; status: string } | null>(null)

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-lg bg-zinc-900/50" />
        <Skeleton className="h-24 rounded-lg bg-zinc-900/50" />
        <Skeleton className="h-64 rounded-lg bg-zinc-900/50" />
      </div>
    )
  }

  const active = data.models.find((m) => m.status === 'active')
  const others = data.models.filter((m) => m.id !== active?.id)

  function requestStatus(model: ModelVersion, status: string) {
    if (status === 'active' && model.status !== 'active') {
      setPending({ model, status })
      return
    }
    applyStatus(model, status)
  }

  function applyStatus(model: ModelVersion, status: string) {
    patch.mutate(
      { id: model.id, status },
      {
        onSuccess: () => {
          toast.success(`${model.id} → ${status}`, {
            description: status === 'active' ? 'Previous active model was demoted to archived.' : undefined,
          })
          setPending(null)
        },
        onError: (err) => toast.error('Update failed', { description: err.message }),
      }
    )
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Active model hero */}
      {active && (
        <div className="overflow-hidden rounded-lg border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-zinc-900/60 to-zinc-900/60 p-4 lg:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
              <Brain className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <SectionLabel>Active model · serving all cameras</SectionLabel>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold text-zinc-50">{active.id}</span>
                <StatusBadgeModels status={active.status} />
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {active.formats.map((f) => formatBadge(f))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
            <MetricCell label="mAP@50" value={fmtMetric('mAP50', active.metrics.mAP50 ?? 0)} />
            <MetricCell label="Precision" value={fmtMetric('precision', active.metrics.precision ?? 0)} />
            <MetricCell label="Recall" value={fmtMetric('recall', active.metrics.recall ?? 0)} />
            <MetricCell label="Latency" value={fmtMetric('latencyMs', active.metrics.latencyMs ?? 0)} />
            <MetricCell label="FPS" value={fmtMetric('fps', active.metrics.fps ?? 0)} />
            <MetricCell label="FP rate" value={fmtMetric('falsePositiveRate', active.metrics.falsePositiveRate ?? 0)} />
            <MetricCell label="FN rate" value={fmtMetric('falseNegativeRate', active.metrics.falseNegativeRate ?? 0)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-zinc-500">
            <span>dataset: <span className="text-zinc-300">{active.datasetSize?.toLocaleString() ?? '—'} images</span></span>
            <span>trained: <span className="text-zinc-300">{active.trainedAt ? new Date(active.trainedAt).toISOString().slice(0, 10) : '—'}</span></span>
            <span>variant: <span className="text-zinc-300">{active.variant}</span></span>
            <span>tier: <span className="text-zinc-300">{active.tier}</span></span>
          </div>
        </div>
      )}

      {/* Export pipeline */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
        <SectionLabel className="mb-3">Export pipeline · train once, deploy everywhere</SectionLabel>
        <div className="soc-scroll flex items-stretch gap-2 overflow-x-auto pb-1">
          {data.exportPipeline.map((step, i) => {
            const Icon = PIPELINE_ICONS[i] ?? Package
            return (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex min-w-36 flex-col gap-1.5 rounded-md border p-3 ${i === data.exportPipeline.length - 1 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
                  <Icon className={`h-4 w-4 ${i === data.exportPipeline.length - 1 ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  <span className="text-xs font-medium leading-tight text-zinc-200">{step}</span>
                  <span className="font-mono text-[9px] text-zinc-600">step {i + 1}</span>
                </div>
                {i < data.exportPipeline.length - 1 && <span className="font-mono text-zinc-600">→</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Version table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center justify-between px-4 py-3">
          <SectionLabel>Model registry · {data.models.length} versions</SectionLabel>
          <span className="font-mono text-[10px] text-zinc-600">single-active constraint enforced by API</span>
        </div>
        <div className="soc-scroll overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                {['MODEL', 'VARIANT', 'TIER', 'FORMATS', 'mAP@50', 'DATASET', 'TRAINED', 'STATUS', ''].map((h, i) => (
                  <TableHead key={i} className="h-9 whitespace-nowrap text-[9px] font-semibold tracking-[0.14em] text-zinc-500">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...others].reverse().map((m) => (
                <TableRow key={m.id} className="border-zinc-800/60 hover:bg-zinc-900/70">
                  <TableCell className="whitespace-nowrap py-2.5 font-mono text-[11px] text-zinc-200">
                    {m.id}
                    {m.id === active?.id && <span className="ml-1.5 text-emerald-400">●</span>}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-px font-mono text-[10px] text-zinc-300">{m.variant}</span>
                  </TableCell>
                  <TableCell className="py-2.5 font-mono text-[11px] text-zinc-400">{m.tier}</TableCell>
                  <TableCell className="py-2.5"><span className="flex flex-wrap gap-1">{m.formats.map((f) => formatBadge(f))}</span></TableCell>
                  <TableCell className="py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((m.metrics.mAP50 ?? 0) * 100)}%` }} />
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-zinc-300">{(m.metrics.mAP50 ?? 0).toFixed(2)}</span>
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 font-mono text-[11px] tabular-nums text-zinc-400">{m.datasetSize?.toLocaleString() ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 font-mono text-[10px] text-zinc-500">
                    {m.trainedAt ? new Date(m.trainedAt).toISOString().slice(0, 10) : '—'}
                  </TableCell>
                  <TableCell className="py-2.5"><StatusBadgeModels status={m.status} /></TableCell>
                  <TableCell className="py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-zinc-800 bg-zinc-950">
                        <DropdownMenuItem disabled={m.status === 'active'} onClick={() => requestStatus(m, 'active')} className="gap-2 text-emerald-400 focus:text-emerald-300">
                          <ArrowUpCircle className="h-3.5 w-3.5" /> Promote to active
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={m.status === 'shadow'} onClick={() => requestStatus(m, 'shadow')} className="gap-2 text-amber-400 focus:text-amber-300">
                          Shadow evaluation
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={m.status === 'archived'} onClick={() => requestStatus(m, 'archived')} className="gap-2">
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {active && (
                <TableRow className="border-zinc-800/60 bg-emerald-500/5 hover:bg-emerald-500/5">
                  <TableCell className="whitespace-nowrap py-2.5 font-mono text-[11px] font-semibold text-emerald-300">{active.id} ●</TableCell>
                  <TableCell className="py-2.5">
                    <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-px font-mono text-[10px] text-zinc-300">{active.variant}</span>
                  </TableCell>
                  <TableCell className="py-2.5 font-mono text-[11px] text-zinc-400">{active.tier}</TableCell>
                  <TableCell className="py-2.5"><span className="flex flex-wrap gap-1">{active.formats.map((f) => formatBadge(f))}</span></TableCell>
                  <TableCell className="py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((active.metrics.mAP50 ?? 0) * 100)}%` }} />
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-zinc-300">{(active.metrics.mAP50 ?? 0).toFixed(2)}</span>
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 font-mono text-[11px] tabular-nums text-zinc-400">{active.datasetSize?.toLocaleString() ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 font-mono text-[10px] text-zinc-500">
                    {active.trainedAt ? new Date(active.trainedAt).toISOString().slice(0, 10) : '—'}
                  </TableCell>
                  <TableCell className="py-2.5"><StatusBadgeModels status="active" /></TableCell>
                  <TableCell className="py-2.5 text-right font-mono text-[10px] text-zinc-600">in production</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Provenance explainer */}
      <div className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <SectionLabel className="mb-1">Alert provenance</SectionLabel>
          <p className="max-w-4xl text-xs leading-relaxed text-zinc-400">
            The security operator can <span className="text-zinc-100">always determine which model generated an alert</span>. Every
            event in this platform carries the <code className="rounded bg-zinc-800 px-1 font-mono text-[10px] text-emerald-300">model</code>{' '}
            field of the exact registry version that produced it (check any event detail dialog), and every camera records
            the model tier it serves. Promoting a new version never rewrites history — past alerts keep pointing at the
            model that raised them.
          </p>
        </div>
      </div>

      {/* Promote confirm */}
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">Promote {pending?.model.id} to active?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Only one model can be active at a time. Promoting this version will <span className="text-amber-400">demote the
              current active model to archived</span>. All cameras will serve this version on their next pipeline cycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" onClick={() => pending && applyStatus(pending.model, pending.status)}>
              Promote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* trained relative footer */}
      <div className="text-right font-mono text-[10px] text-zinc-700">
        registry synced · latest training {active?.trainedAt ? timeAgo(active.trainedAt) : '—'}
      </div>
    </div>
  )
}

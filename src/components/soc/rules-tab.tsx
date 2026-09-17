'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, Copy, ListChecks, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useRuleCreate, useRuleDelete, useRulePatch, useRules } from '@/hooks/use-soc'
import { NUMERIC_RULE_FIELDS, RULE_ACTIONS, RULE_FIELDS, RULE_OPS, conditionToken, timeAgo } from '@/lib/soc'
import type { Rule, RuleCondition } from '@/lib/types'
import { SectionLabel, SeverityBadge } from '@/components/soc/bits'

// ─── Condition value conversion ───────────────────────────────────

function buildCondition(row: { field: string; op: string; value: string }): RuleCondition {
  if (row.op === 'exists' || row.op === 'missing') return { field: row.field, op: row.op, value: null }
  if (row.op === 'in') {
    return { field: row.field, op: row.op, value: row.value.split(',').map((s) => s.trim()).filter(Boolean) }
  }
  if (row.field === 'afterHours') return { field: row.field, op: row.op, value: row.value.trim().toLowerCase() === 'true' }
  if (NUMERIC_RULE_FIELDS.has(row.field)) {
    const n = Number(row.value)
    return { field: row.field, op: row.op, value: Number.isNaN(n) ? row.value.trim() : n }
  }
  return { field: row.field, op: row.op, value: row.value.trim() }
}

interface CondRow {
  field: string
  op: string
  value: string
}

interface RuleFormPreset {
  id: string | null
  name: string
  description: string
  severity: string
  action: string
  priority: number
  rows: CondRow[]
}

const DEFAULT_ROWS: CondRow[] = [{ field: 'objectType', op: 'in', value: 'firearm, knife' }]

function RuleFormDialog({
  open,
  onClose,
  preset,
}: {
  open: boolean
  onClose: () => void
  preset: RuleFormPreset | null
}) {
  const create = useRuleCreate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('suspicious')
  const [action, setAction] = useState('raise_alert')
  const [priority, setPriority] = useState(1)
  const [rows, setRows] = useState<CondRow[]>(DEFAULT_ROWS)

  // sync form whenever dialog opens with a preset (create or duplicate)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const openKey = open ? preset?.id ?? 'new' : null
  if (open && openKey !== loadedFor) {
    setLoadedFor(openKey)
    setName(preset ? preset.name : '')
    setDescription(preset ? preset.description : '')
    setSeverity(preset ? preset.severity : 'suspicious')
    setAction(preset ? preset.action : 'raise_alert')
    setPriority(preset ? preset.priority : 1)
    setRows(preset ? preset.rows.map((r) => ({ ...r })) : DEFAULT_ROWS.map((r) => ({ ...r })))
  }

  function updateRow(i: number, patch: Partial<CondRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function submit() {
    if (!name.trim()) {
      toast.error('Rule name is required')
      return
    }
    if (rows.length === 0) {
      toast.error('At least one condition is required')
      return
    }
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        severity,
        action,
        priority,
        enabled: true,
        conditions: rows.map(buildCondition),
      },
      {
        onSuccess: () => {
          toast.success(`Rule “${name.trim()}” created`, { description: 'Live immediately — the event engine reloads rules every 15s.' })
          onClose()
        },
        onError: (err) => toast.error('Create failed', { description: err.message }),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-zinc-800 bg-zinc-950 soc-scroll">
        <DialogHeader>
          <DialogTitle className="font-mono text-base text-zinc-100">New event-engine rule</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Conditions are ANDed. The engine evaluates rules against verified tracks — never raw detections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="weapon_in_restricted_zone" className="border-zinc-800 bg-zinc-950/60 font-mono text-xs" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950/60 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-950">
                    <SelectItem value="info">info</SelectItem>
                    <SelectItem value="suspicious">suspicious</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                    <SelectItem value="critical">critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950/60 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-950">
                    {RULE_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Priority</Label>
                <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
                  <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950/60 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-950">
                    <SelectItem value="1">1 · low</SelectItem>
                    <SelectItem value="2">2 · elevated</SelectItem>
                    <SelectItem value="3">3 · top</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this rule catch and why…" className="min-h-16 resize-none border-zinc-800 bg-zinc-950/60 text-xs" />
          </div>

          {/* Conditions builder */}
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between">
              <SectionLabel>IF conditions (AND)</SectionLabel>
              <button
                onClick={() => setRows((rs) => [...rs, { field: 'confidence', op: '>=', value: '0.65' }])}
                className="flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:bg-zinc-800"
              >
                <Plus className="h-3 w-3" /> condition
              </button>
            </div>
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                {i > 0 && <span className="font-mono text-[9px] font-bold tracking-widest text-zinc-600">AND</span>}
                <Select value={row.field} onValueChange={(v) => updateRow(i, { field: v })}>
                  <SelectTrigger className="h-8 w-[150px] border-zinc-800 bg-zinc-950/60 font-mono text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-950">
                    {RULE_FIELDS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={row.op} onValueChange={(v) => updateRow(i, { op: v })}>
                  <SelectTrigger className="h-8 w-[86px] border-zinc-800 bg-zinc-950/60 font-mono text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-950">
                    {RULE_OPS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {row.op !== 'exists' && row.op !== 'missing' && (
                  <Input
                    value={row.value}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    placeholder={row.op === 'in' ? 'firearm, knife' : 'value'}
                    className="h-8 min-w-28 flex-1 border-zinc-800 bg-zinc-950/60 font-mono text-[11px]"
                  />
                )}
                <button
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  disabled={rows.length === 1}
                  className="rounded p-1 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending} className="bg-emerald-500/15 font-mono text-[11px] tracking-wider text-emerald-300 hover:bg-emerald-500/25">
            CREATE RULE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PriorityChevrons({ priority }: { priority: number }) {
  return (
    <span className="flex items-center" title={`priority ${priority}/3`}>
      {[1, 2, 3].map((i) => (
        <ChevronRight key={i} className={`-ml-1.5 h-3.5 w-3.5 first:ml-0 ${i <= priority ? 'text-emerald-400' : 'text-zinc-700'}`} strokeWidth={3} />
      ))}
    </span>
  )
}

function RuleCard({ rule, onDuplicate }: { rule: Rule; onDuplicate: (rule: Rule) => void }) {
  const patch = useRulePatch()
  const del = useRuleDelete()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tokens = useMemo(() => rule.conditions.map((c) => conditionToken(c)), [rule.conditions])

  return (
    <Card className={`border-zinc-800 bg-zinc-900/60 p-0 transition-colors ${rule.enabled ? '' : 'opacity-60'}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[13px] font-semibold text-zinc-100" title={rule.name}>
              {rule.name}
            </div>
          </div>
          <SeverityBadge severity={rule.severity} />
          <PriorityChevrons priority={rule.priority} />
          <Switch
            checked={rule.enabled}
            onCheckedChange={(checked) =>
              patch.mutate(
                { id: rule.id, body: { enabled: checked } },
                {
                  onSuccess: () => toast.success(`${rule.name} ${checked ? 'enabled' : 'disabled'}`),
                  onError: (err) => toast.error('Update failed', { description: err.message }),
                }
              )
            }
            className="data-[state=checked]:bg-emerald-600"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-zinc-800 bg-zinc-950">
              <DropdownMenuItem onClick={() => onDuplicate(rule)} className="gap-2">
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="gap-2 text-red-400 focus:text-red-300">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-zinc-500">{rule.description || '—'}</p>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-600">IF</span>
            {tokens.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <span className="font-mono text-[8px] font-bold tracking-widest text-zinc-600">AND</span>}
                <code className="rounded border border-zinc-700/70 bg-zinc-800/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{t}</code>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-600">THEN</span>
            <code className="rounded border border-zinc-700/70 bg-zinc-800/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{rule.action}</code>
            <span className="font-mono text-[10px] text-zinc-500">→ {rule.severity}</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800/70 pt-2 font-mono text-[10px] text-zinc-500">
          <span>
            hits <span className="tabular-nums text-zinc-200">{rule.hits}</span>
          </span>
          <span>last {rule.lastTriggered ? timeAgo(rule.lastTriggered) : 'never'}</span>
        </div>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">Delete rule “{rule.name}”?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              The event engine will stop evaluating this rule immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500/15 text-red-300 hover:bg-red-500/25"
              onClick={() =>
                del.mutate(rule.id, {
                  onSuccess: () => toast.success(`Rule “${rule.name}” deleted`),
                  onError: (err) => toast.error('Delete failed', { description: err.message }),
                })
              }
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function RulesTab() {
  const { data, isLoading } = useRules()
  const [formOpen, setFormOpen] = useState(false)
  const [preset, setPreset] = useState<RuleFormPreset | null>(null)

  function openNew() {
    setPreset({ id: `new-${Date.now()}`, name: '', description: '', severity: 'suspicious', action: 'raise_alert', priority: 1, rows: DEFAULT_ROWS.map((r) => ({ ...r })) })
    setFormOpen(true)
  }

  function openDuplicate(rule: Rule) {
    setPreset({
      id: rule.id,
      name: `${rule.name}-copy`,
      description: rule.description,
      severity: rule.severity,
      action: rule.action,
      priority: rule.priority,
      rows: rule.conditions.map((c) => ({
        field: c.field,
        op: c.op,
        value: Array.isArray(c.value) ? c.value.join(', ') : c.value === null ? '' : String(c.value),
      })),
    })
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Intro strip */}
      <div className="rounded-lg border border-zinc-800 bg-gradient-to-r from-zinc-900/80 to-zinc-900/30 p-4 lg:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
            <ListChecks className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100">Event Engine — the platform’s brain</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">
              YOLO26 is only the perception engine. This rule engine is what turns verified detections into security
              events: conditions are evaluated against temporally-confirmed, zone-aware tracks, and matching rules raise
              alerts at the configured severity. Rules reload live every 15 seconds.
            </p>
          </div>
          <Button onClick={openNew} size="sm" className="bg-emerald-500/15 font-mono text-[11px] tracking-wider text-emerald-300 hover:bg-emerald-500/25">
            <Plus className="mr-1 h-3.5 w-3.5" /> NEW RULE
          </Button>
        </div>
      </div>

      {/* Rule cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg bg-zinc-900/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.rules ?? []).map((r) => (
            <RuleCard key={r.id} rule={r} onDuplicate={openDuplicate} />
          ))}
        </div>
      )}

      <RuleFormDialog open={formOpen} onClose={() => setFormOpen(false)} preset={preset} />
    </div>
  )
}

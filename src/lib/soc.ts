import { format, formatDistanceToNowStrict } from 'date-fns'
import type { EventStatus, Severity } from '@/lib/types'

// ─── Severity system (used consistently everywhere) ───────────────
// critical → red-500/600 · high → amber-500 · suspicious → yellow-400/500 · info → zinc-400/500

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'suspicious', 'info']

export const SEVERITY_META: Record<Severity, { label: string; hex: string; badge: string; dot: string; border: string; text: string; bgSoft: string }> = {
  critical: {
    label: 'CRITICAL',
    hex: '#ef4444', // red-500
    badge: 'border-red-500/40 bg-red-500/15 text-red-400',
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    text: 'text-red-400',
    bgSoft: 'bg-red-500/10',
  },
  high: {
    label: 'HIGH',
    hex: '#f59e0b', // amber-500
    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-500',
    border: 'border-l-amber-500',
    text: 'text-amber-400',
    bgSoft: 'bg-amber-500/10',
  },
  suspicious: {
    label: 'SUSPICIOUS',
    hex: '#facc15', // yellow-400
    badge: 'border-yellow-400/40 bg-yellow-400/15 text-yellow-300',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    text: 'text-yellow-300',
    bgSoft: 'bg-yellow-400/10',
  },
  info: {
    label: 'INFO',
    hex: '#a1a1aa', // zinc-400
    badge: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-300',
    dot: 'bg-zinc-400',
    border: 'border-l-zinc-500',
    text: 'text-zinc-400',
    bgSoft: 'bg-zinc-500/10',
  },
}

export function severityOf(s: string | null | undefined): Severity {
  if (s === 'critical' || s === 'high' || s === 'suspicious' || s === 'info') return s
  return 'info'
}

// ─── Event status ─────────────────────────────────────────────────

export const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  open: { label: 'OPEN', badge: 'border-red-500/40 bg-red-500/10 text-red-400', dot: 'bg-red-500' },
  acknowledged: { label: 'ACK', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500' },
  dismissed: { label: 'DISMISSED', badge: 'border-zinc-600/50 bg-zinc-500/10 text-zinc-400', dot: 'bg-zinc-500' },
  escalated: { label: 'ESCALATED', badge: 'border-orange-500/40 bg-orange-500/10 text-orange-400', dot: 'bg-orange-500' },
  resolved: { label: 'RESOLVED', badge: 'border-teal-500/40 bg-teal-500/10 text-teal-400', dot: 'bg-teal-500' },
}

// ─── Camera status ────────────────────────────────────────────────

export const CAMERA_STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  online: { label: 'ONLINE', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500' },
  degraded: { label: 'DEGRADED', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400', dot: 'bg-amber-500' },
  offline: { label: 'OFFLINE', badge: 'border-red-500/40 bg-red-500/10 text-red-400', dot: 'bg-red-500' },
}

// ─── Model tier ───────────────────────────────────────────────────

export const TIER_META: Record<string, { label: string; badge: string }> = {
  'yolo26n-edge': { label: 'n-edge', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  'yolo26s-server': { label: 's-server', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  'yolo26l-central': { label: 'l-central', badge: 'border-orange-500/40 bg-orange-500/10 text-orange-400' },
  edge: { label: 'edge', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  server: { label: 'server', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  central: { label: 'central', badge: 'border-orange-500/40 bg-orange-500/10 text-orange-400' },
}

// ─── Zone type ────────────────────────────────────────────────────

export const ZONE_META: Record<string, { badge: string; stroke: string }> = {
  restricted: { badge: 'border-red-500/50 text-red-400 bg-red-500/10', stroke: '#ef4444' },
  flow: { badge: 'border-amber-500/50 text-amber-400 bg-amber-500/10', stroke: '#f59e0b' },
  public: { badge: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10', stroke: '#10b981' },
}

// ─── Confidence bands (per spec) ──────────────────────────────────
// <0.40 ignore gray · 0.40-0.65 observe amber · 0.65-0.85 suspicious orange · >0.85 strong emerald

export function confidenceBand(c: number): { label: string; hex: string; bar: string; badge: string } {
  if (c < 0.4) return { label: 'IGNORE', hex: '#71717a', bar: 'bg-zinc-500', badge: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400' }
  if (c < 0.65) return { label: 'OBSERVE', hex: '#f59e0b', bar: 'bg-amber-500', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400' }
  if (c < 0.85) return { label: 'SUSPICIOUS', hex: '#fb923c', bar: 'bg-orange-400', badge: 'border-orange-400/40 bg-orange-400/10 text-orange-300' }
  return { label: 'STRONG', hex: '#10b981', bar: 'bg-emerald-500', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' }
}

// ─── Object type coloring ─────────────────────────────────────────

export function objectMeta(object: string | null | undefined): { badge: string; hex: string } {
  const o = (object ?? '').toLowerCase()
  if (o === 'firearm' || o === 'gun' || o === 'weapon') return { badge: 'border-red-500/50 text-red-400 bg-red-500/10', hex: '#ef4444' }
  if (o === 'knife' || o === 'blade') return { badge: 'border-red-500/50 text-red-400 bg-red-500/10', hex: '#ef4444' }
  if (o === 'person') return { badge: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10', hex: '#10b981' }
  return { badge: 'border-zinc-500/50 text-zinc-300 bg-zinc-500/10', hex: '#a1a1aa' }
}

// ─── Model status ─────────────────────────────────────────────────

export const MODEL_STATUS_META: Record<string, { label: string; badge: string }> = {
  active: { label: 'ACTIVE', badge: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' },
  shadow: { label: 'SHADOW', badge: 'border-amber-500/50 bg-amber-500/10 text-amber-400' },
  archived: { label: 'ARCHIVED', badge: 'border-zinc-600/60 bg-zinc-500/10 text-zinc-400' },
  training: { label: 'TRAINING', badge: 'border-yellow-400/50 bg-yellow-400/10 text-yellow-300' },
}

export const FORMAT_META: Record<string, string> = {
  pytorch: 'border-orange-500/50 bg-orange-500/10 text-orange-400',
  onnx: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
  tensorrt: 'border-red-500/50 bg-red-500/10 text-red-400',
}

// ─── Time formatting ──────────────────────────────────────────────

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
  } catch {
    return '—'
  }
}

export function utcClock(d: Date): string {
  return d.toISOString().slice(11, 19)
}

export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function hourLabel(iso: string): string {
  try {
    return format(new Date(iso), 'HH:mm')
  } catch {
    return iso
  }
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

// ─── Rule helpers ─────────────────────────────────────────────────

export const RULE_FIELDS = ['objectType', 'confidence', 'framesConfirmed', 'associatedPerson', 'zoneType', 'zoneName', 'zoneDwellSeconds', 'afterHours'] as const
export const RULE_OPS = ['==', '!=', '>', '>=', '<', 'in', 'exists', 'missing'] as const
export const RULE_ACTIONS = ['raise_alert', 'notify_security', 'escalate_immediately', 'lockdown_zone'] as const

export const NUMERIC_RULE_FIELDS = new Set(['confidence', 'framesConfirmed', 'zoneDwellSeconds', 'associatedPerson'])

export function conditionToken(c: { field: string; op: string; value: unknown }): string {
  if (c.op === 'exists' || c.op === 'missing') return `${c.field} ${c.op === 'exists' ? '∃' : '∄'}`
  let v: string
  if (Array.isArray(c.value)) v = c.value.join(', ')
  else if (typeof c.value === 'boolean') v = c.value ? 'true' : 'false'
  else v = String(c.value ?? '')
  const opSym: Record<string, string> = { '==': '=', '!=': '≠', '>': '>', '>=': '≥', '<': '<', in: '∈' }
  return `${c.field} ${opSym[c.op] ?? c.op} ${v}`
}

// ─── Misc ─────────────────────────────────────────────────────────

export function isEventFresh(iso: string, seconds = 20): boolean {
  return Date.now() - new Date(iso).getTime() < seconds * 1000
}

export function cnLower(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

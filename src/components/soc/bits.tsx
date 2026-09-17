'use client'

import { Crosshair, PersonStanding, ShieldAlert, Users, CameraOff, User, Slice, Car, Backpack, Box, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CAMERA_STATUS_META,
  SEVERITY_META,
  STATUS_META,
  TIER_META,
  ZONE_META,
  confidenceBand,
  objectMeta,
  severityOf,
} from '@/lib/soc'

// ─── Section label ────────────────────────────────────────────────

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500', className)}>
      {children}
    </div>
  )
}

// ─── Badges & chips ───────────────────────────────────────────────

export function SeverityBadge({ severity, className }: { severity: string | null | undefined; className?: string }) {
  const meta = SEVERITY_META[severityOf(severity)]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider',
        meta.badge,
        className
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = STATUS_META[status ?? ''] ?? {
    label: (status ?? '—').toUpperCase(),
    badge: 'border-zinc-600/50 bg-zinc-500/10 text-zinc-400',
    dot: 'bg-zinc-500',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider',
        meta.badge,
        className
      )}
    >
      {meta.label}
    </span>
  )
}

export function CameraStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = CAMERA_STATUS_META[status ?? ''] ?? CAMERA_STATUS_META.offline
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider',
        meta.badge,
        className
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', meta.dot, status === 'online' && 'animate-soc-dot')} />
      {meta.label}
    </span>
  )
}

export function TierChip({ tier, className }: { tier: string | null | undefined; className?: string }) {
  const meta = TIER_META[tier ?? ''] ?? { label: tier ?? '—', badge: 'border-zinc-600/50 bg-zinc-500/10 text-zinc-400' }
  return (
    <span className={cn('rounded border px-1.5 py-px font-mono text-[10px] tracking-wide', meta.badge, className)}>
      {meta.label}
    </span>
  )
}

export function ZoneChip({ zone, className }: { zone: { id: string; name: string; type: string } | null | undefined; className?: string }) {
  if (!zone) return null
  const meta = ZONE_META[zone.type] ?? { badge: 'border-zinc-600/50 text-zinc-300 bg-zinc-500/10' }
  return (
    <span className={cn('rounded border px-1.5 py-px text-[10px] font-medium', meta.badge, className)}>
      {zone.name}
    </span>
  )
}

export function ZoneTypeChip({ type, className }: { type: string; className?: string }) {
  const meta = ZONE_META[type] ?? { badge: 'border-zinc-600/50 text-zinc-300 bg-zinc-500/10' }
  return (
    <span className={cn('rounded border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide', meta.badge, className)}>
      {type}
    </span>
  )
}

export function ObjectChip({ object, className }: { object: string | null | undefined; className?: string }) {
  if (!object) return null
  const meta = objectMeta(object)
  return (
    <span className={cn('rounded border px-1.5 py-px font-mono text-[10px] tracking-wide', meta.badge, className)}>
      {object}
    </span>
  )
}

export function LiveDot({ className, pulse = true }: { className?: string; pulse?: boolean }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full bg-emerald-500', pulse && 'animate-soc-dot', className)} />
}

// ─── Event / object icons ─────────────────────────────────────────

export function eventIcon(type: string | null | undefined): LucideIcon {
  const t = (type ?? '').toLowerCase()
  if (t.includes('weapon') || t.includes('firearm')) return Crosshair
  if (t.includes('intrusion') || t.includes('breach')) return ShieldAlert
  if (t.includes('crowd')) return Users
  if (t.includes('tamper')) return CameraOff
  if (t.includes('loiter')) return PersonStanding
  if (t.includes('person')) return User
  return ShieldAlert
}

export function objectIcon(objectType: string | null | undefined): LucideIcon {
  const o = (objectType ?? '').toLowerCase()
  if (o === 'firearm' || o === 'gun' || o === 'weapon') return Crosshair
  if (o === 'knife' || o === 'blade') return Slice
  if (o === 'person') return PersonStanding
  if (o === 'backpack' || o === 'bag') return Backpack
  if (o === 'vehicle' || o === 'car') return Car
  return Box
}

// ─── Confidence bar ───────────────────────────────────────────────

export function ConfidenceBar({ value, className, showLabel = false }: { value: number; className?: string; showLabel?: boolean }) {
  const band = confidenceBand(value)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-full min-w-10 overflow-hidden rounded-full bg-zinc-800">
        <div className={cn('h-full rounded-full transition-all duration-500', band.bar)} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[10px] text-zinc-400">{Math.round(value * 100)}%</span>
      {showLabel && <span className={cn('shrink-0 rounded border px-1 font-mono text-[9px]', band.badge)}>{band.label}</span>}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────

export function KpiCard({
  label,
  accentClass,
  children,
  className,
}: {
  label: string
  accentClass?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 p-4',
        className
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-0.5', accentClass ?? 'bg-zinc-600')} />
      <SectionLabel className="mb-2">{label}</SectionLabel>
      {children}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 p-8 text-center">
      <Icon className="h-6 w-6 text-zinc-600" />
      <div className="text-sm text-zinc-400">{title}</div>
      {hint && <div className="text-xs text-zinc-600">{hint}</div>}
    </div>
  )
}

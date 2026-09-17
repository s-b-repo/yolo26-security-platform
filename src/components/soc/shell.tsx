'use client'

import { useEffect, useState } from 'react'
import { Bell, Boxes, Cctv, LayoutDashboard, ListChecks, Network, Play, Route, Shield, Siren, Square, Biohazard, Syringe, PersonStanding } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useDashboard, useSimulator, useSimulatorAction } from '@/hooks/use-soc'
import { utcClock, utcDate } from '@/lib/soc'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type TabKey = 'dashboard' | 'cameras' | 'events' | 'tracks' | 'rules' | 'models' | 'architecture'

const TABS: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'cameras', label: 'Cameras', icon: Cctv },
  { key: 'events', label: 'Events', icon: Siren },
  { key: 'tracks', label: 'Tracks', icon: Route },
  { key: 'rules', label: 'Rules', icon: ListChecks },
  { key: 'models', label: 'Models', icon: Boxes },
  { key: 'architecture', label: 'Architecture', icon: Network },
]

function UtcClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    const initial = setTimeout(update, 0)
    const t = setInterval(update, 1000)
    return () => {
      clearTimeout(initial)
      clearInterval(t)
    }
  }, [])
  return (
    <div className="hidden flex-col items-end leading-tight sm:flex">
      <span className="font-mono text-sm tabular-nums text-zinc-100">{now ? utcClock(now) : '--:--:--'}</span>
      <span className="font-mono text-[10px] tracking-wider text-zinc-500">{now ? `${utcDate(now)} UTC` : 'UTC'}</span>
    </div>
  )
}

function SimulatorPill() {
  const { data } = useSimulator()
  const sim = useSimulatorAction()
  const enabled = data?.enabled ?? false
  const running = enabled && (data?.running ?? false)

  function doAction(action: string, label: string) {
    sim.mutate(
      { action },
      {
        onSuccess: () => toast.success(label, { description: 'Simulator command accepted.' }),
        onError: (err) => toast.error(`${label} failed`, { description: err.message }),
      }
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-wide transition-colors',
            running
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
              : 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/15'
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', running ? 'animate-soc-dot bg-emerald-500' : 'bg-red-500')} />
          <span className="hidden sm:inline">{running ? 'SIMULATOR' : 'SIM STOPPED'}</span>
          <span className="text-zinc-400">TICK {data?.tickCount ?? 0}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-zinc-800 bg-zinc-950">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Pipeline simulator</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => doAction('start', 'Simulator started')} className="gap-2 text-emerald-400 focus:text-emerald-300">
          <Play className="h-3.5 w-3.5" /> Start simulator
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => doAction('stop', 'Simulator stopped')} className="gap-2 text-red-400 focus:text-red-300">
          <Square className="h-3.5 w-3.5" /> Stop simulator
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-zinc-800" />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Threat injection</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => doAction('inject_weapon', 'Firearm injection queued')} className="gap-2">
          <Biohazard className="h-3.5 w-3.5 text-red-400" /> Inject firearm
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => doAction('inject_knife', 'Knife injection queued')} className="gap-2">
          <Syringe className="h-3.5 w-3.5 text-amber-400" /> Inject knife
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => doAction('inject_intruder', 'Intruder injection queued')} className="gap-2">
          <PersonStanding className="h-3.5 w-3.5 text-yellow-400" /> Inject intruder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AlarmBell({ count, onClick }: { count: number; onClick: () => void }) {
  const critical = count > 0
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'relative rounded-md border p-2 transition-colors',
              critical
                ? 'animate-critical-pulse border-red-500/60 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Bell className={cn('h-4 w-4', critical && 'animate-bell-shake')} />
            {critical && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-bold text-white">
                {count}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="border-zinc-800 bg-zinc-950 text-xs">
          {critical ? `${count} unacknowledged CRITICAL event${count > 1 ? 's' : ''}` : 'No unacknowledged critical events'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SocShell({
  activeTab,
  onTabChange,
  onOpenCriticalEvents,
  children,
}: {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onOpenCriticalEvents: () => void
  children: React.ReactNode
}) {
  const { data } = useDashboard()
  const { data: simData } = useSimulator()
  const alarmCount = data?.events.openBySeverity?.critical ?? 0

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* fixed grid texture */}
      <div className="soc-grid-bg pointer-events-none fixed inset-0 z-0" />

      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3 lg:px-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-bold tracking-[0.14em] text-zinc-100">
                YOLO26 <span className="text-emerald-400">SECURITY</span> PLATFORM
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Security Operations Center</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <UtcClock />
            <SimulatorPill />
            {data?.activeModel && (
              <span className="hidden items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 md:flex">
                <Boxes className="h-3.5 w-3.5 text-emerald-400" />
                {data.activeModel.id}
                <span className="rounded border border-zinc-700 px-1 text-[9px] uppercase text-zinc-500">{data.activeModel.tier}</span>
              </span>
            )}
            <AlarmBell count={alarmCount} onClick={onOpenCriticalEvents} />
          </div>
        </div>

        {/* Tab nav */}
        <nav className="border-t border-zinc-800/60">
          <div className="soc-scroll mx-auto flex w-full max-w-[1600px] gap-1 overflow-x-auto px-2 lg:px-4" role="tablist">
            {TABS.map((t) => {
              const active = activeTab === t.key
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onTabChange(t.key)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                    active ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-400" />}
                </button>
              )
            })}
          </div>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 lg:px-6 lg:py-5">{children}</main>

      <footer className="relative z-10 mt-auto border-t border-zinc-800/80 bg-zinc-950/90">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[11px] text-zinc-500 lg:px-6">
          <span>
            YOLO26 perception engine · <span className="text-zinc-400">edge-central pattern</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span>
            <span className="font-mono text-emerald-400">{data?.cameras.online ?? 0}</span>/{data?.cameras.total ?? 0} cameras online
          </span>
          <span className="hidden text-zinc-700 md:inline">|</span>
          <span className="hidden md:inline">pipeline: perception → tracking → temporal verification → event engine</span>
          <span className="ml-auto font-mono">
            {data?.events.last24h ?? 0} events / 24h · sim tick #{simData?.tickCount ?? 0}
          </span>
        </div>
      </footer>
    </div>
  )
}

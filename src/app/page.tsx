'use client'

import { useCallback, useState } from 'react'
import { SocShell, type TabKey } from '@/components/soc/shell'
import { DashboardTab } from '@/components/soc/dashboard-tab'
import { CamerasTab } from '@/components/soc/cameras-tab'
import { EventsTab } from '@/components/soc/events-tab'
import { TracksTab } from '@/components/soc/tracks-tab'
import { RulesTab } from '@/components/soc/rules-tab'
import { ModelsTab } from '@/components/soc/models-tab'
import { ArchitectureTab } from '@/components/soc/architecture-tab'
import { EventDetailDialog } from '@/components/soc/event-detail-dialog'

export default function SocPage() {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [eventId, setEventId] = useState<string | null>(null)
  const [focusCamera, setFocusCamera] = useState<string | null>(null)
  const [eventsPreset, setEventsPreset] = useState<{ value: string; nonce: number } | undefined>(undefined)

  const openCamera = useCallback((cameraId: string) => {
    setFocusCamera(cameraId)
    setTab('cameras')
  }, [])

  const openCriticalEvents = useCallback(() => {
    setEventsPreset({ value: 'critical', nonce: Date.now() })
    setTab('events')
  }, [])

  return (
    <SocShell activeTab={tab} onTabChange={setTab} onOpenCriticalEvents={openCriticalEvents}>
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {tab === 'dashboard' && <DashboardTab onOpenEvent={setEventId} onOpenCamera={openCamera} />}
        {tab === 'cameras' && <CamerasTab focusCameraId={focusCamera} onClearFocus={() => setFocusCamera(null)} />}
        {tab === 'events' && <EventsTab onOpenEvent={setEventId} presetSeverity={eventsPreset} />}
        {tab === 'tracks' && <TracksTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'architecture' && <ArchitectureTab />}
      </div>

      {/* Shared event detail dialog (opened from dashboard feed, events table, camera panels) */}
      <EventDetailDialog eventId={eventId} onClose={() => setEventId(null)} />
    </SocShell>
  )
}

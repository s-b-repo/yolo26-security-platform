/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/tracks/route'
import { POST as simulatorCommand } from '../src/app/api/simulator/route'

test('tracks rejects malformed pagination before starting the simulator', async () => {
  const response = await GET(new NextRequest('http://localhost/api/tracks?limit=NaN'))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'invalid request parameters' })
})

test('simulator rejects production commands', async () => {
  const originalDemoMode = process.env.DEMO_MODE
  process.env.DEMO_MODE = 'true'
  const original = process.env.NODE_ENV
  const env = { ...process.env } as Record<string, string | undefined>
  Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true, writable: true })
  try {
    const response = await simulatorCommand(new NextRequest('http://localhost/api/simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'simulator disabled' })
  } finally {
    Object.defineProperty(process.env, 'NODE_ENV', { value: original, configurable: true, writable: true })
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE
    else process.env.DEMO_MODE = originalDemoMode
    void env
  }
})

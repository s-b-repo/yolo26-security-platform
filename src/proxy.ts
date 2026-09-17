import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeIngest } from '@/lib/ingest-auth'

function matches(actual: string, expected: string): boolean {
  return timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest())
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/ingest' || req.nextUrl.pathname.startsWith('/api/ingest/')) {
    const denied = authorizeIngest(req)
    if (denied) return denied
    const headers = new Headers(req.headers)
    headers.delete('x-soc-user')
    const response = NextResponse.next({ request: { headers } })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  const username = process.env.SOC_USERNAME
  const password = process.env.SOC_PASSWORD
  const origin = process.env.APP_ORIGIN
  const production = process.env.NODE_ENV === 'production'
  const deny = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })

  if (!username || !password || password.length < 24 || (production && (!origin || !origin.startsWith('https://')))) {
    return deny(503, 'service is not configured')
  }

  const authorization = req.headers.get('authorization') ?? ''
  let credentials = ''
  if (authorization.startsWith('Basic ') && authorization.length <= 4096) {
    credentials = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
  }
  if (!matches(credentials, `${username}:${password}`)) {
    const response = deny(401, 'authentication required')
    response.headers.set('WWW-Authenticate', 'Basic realm="SOC", charset="UTF-8"')
    return response
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.headers.get('origin') !== (origin ?? req.nextUrl.origin) || req.headers.get('sec-fetch-site') === 'cross-site') {
      return deny(403, 'cross-origin mutation denied')
    }
    if (req.method !== 'DELETE' && req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      return deny(415, 'application/json required')
    }
  }

  const headers = new Headers(req.headers)
  headers.set('x-soc-user', username)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Cache-Control', 'private, no-store')
  if (production) response.headers.set('Strict-Transport-Security', 'max-age=31536000')
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }

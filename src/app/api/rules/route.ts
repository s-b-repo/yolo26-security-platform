import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { parseJson } from '@/lib/serialize'
import { parseBody, withRoute } from '@/lib/api'
import { ruleCreateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withRoute(async () => {
    await ensureSimulator()
    const rules = await db.rule.findMany({ orderBy: [{ priority: 'desc' }, { name: 'asc' }] })
    return NextResponse.json({ rules: rules.map((r) => ({ ...r, conditions: parseJson(r.conditions, []), createdAt: r.createdAt.toISOString(), lastTriggered: r.lastTriggered?.toISOString() ?? null })) })
  })
}

export async function POST(req: NextRequest) {
  return withRoute(async () => {
    const parsed = await parseBody(req, ruleCreateSchema)
    if (!parsed.ok) return parsed.response
    await ensureSimulator()
    const body = parsed.data
    const rule = await db.rule.create({
      data: {
        name: body.name,
        description: body.description ?? '',
        enabled: body.enabled ?? true,
        conditions: JSON.stringify(body.conditions),
        action: body.action ?? 'raise_alert',
        severity: body.severity ?? 'suspicious',
        priority: body.priority ?? 1,
      },
    })
    return NextResponse.json({ rule: { ...rule, conditions: body.conditions, createdAt: rule.createdAt.toISOString(), lastTriggered: rule.lastTriggered?.toISOString() ?? null } }, { status: 201 })
  })
}

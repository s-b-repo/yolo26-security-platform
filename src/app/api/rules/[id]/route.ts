import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { parseJson } from '@/lib/serialize'
import { parseBody, withRoute } from '@/lib/api'
import { rulePatchSchema, zodId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Context) {
  return withRoute(async () => {
    const id = zodId.parse((await params).id)
    const parsed = await parseBody(req, rulePatchSchema)
    if (!parsed.ok) return parsed.response
    await ensureSimulator()
    const { conditions, ...data } = parsed.data
    const rule = await db.rule.update({ where: { id }, data: { ...data, ...(conditions === undefined ? {} : { conditions: JSON.stringify(conditions) }) } })
    return NextResponse.json({ rule: { ...rule, conditions: parseJson(rule.conditions, []), createdAt: rule.createdAt.toISOString(), lastTriggered: rule.lastTriggered?.toISOString() ?? null } })
  })
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  return withRoute(async () => {
    const id = zodId.parse((await params).id)
    await ensureSimulator()
    await db.rule.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  })
}

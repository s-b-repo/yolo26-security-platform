import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeModel } from '@/lib/serialize'
import { parseBody, withRoute } from '@/lib/api'
import { modelPatchSchema, zodId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    const id = zodId.parse((await params).id)
    const parsed = await parseBody(req, modelPatchSchema)
    if (!parsed.ok) return parsed.response
    await ensureSimulator()
    const updated = await db.$transaction(async (tx) => {
      if (parsed.data.status === 'active') {
        await tx.modelVersion.updateMany({ where: { status: 'active', id: { not: id } }, data: { status: 'archived' } })
      }
      return tx.modelVersion.update({ where: { id }, data: parsed.data })
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ model: serializeModel(updated) })
  })
}

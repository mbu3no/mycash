import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncPluggyItem } from '@/lib/pluggy/sync'
import { conferirAssinatura, deveRecusar, extrairAssinatura } from '@/lib/pluggy/assinatura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PluggyWebhookEvent {
  id?: string
  eventId?: string
  event?: string
  itemId?: string
  data?: { itemId?: string; code?: string; message?: string }
  [key: string]: unknown
}

/**
 * Webhook Pluggy.
 * Eventos relevantes:
 *   - item/created, item/updated, item/error, item/deleted
 *   - transactions/created, transactions/updated, transactions/deleted
 *   - connector/status_updated
 *
 * Autenticidade: a Pluggy assina o corpo com HMAC SHA-256 usando o
 * clientSecret e envia o resultado em X-Pluggy-Signature. Assinatura presente
 * e errada recusa sempre. Assinatura ausente depende de
 * PLUGGY_WEBHOOK_ESTRITO, porque o sandbox nem sempre assina — ver
 * src/lib/pluggy/assinatura.ts.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()

  // A conferencia vem antes de ler o corpo como JSON e antes de qualquer
  // escrita: requisicao nao autentica nao deve sequer virar linha de log.
  const resultado = conferirAssinatura(
    raw,
    extrairAssinatura(req.headers),
    process.env.PLUGGY_CLIENT_SECRET
  )

  if (deveRecusar(resultado, process.env.PLUGGY_WEBHOOK_ESTRITO === 'true')) {
    console.warn(`Pluggy webhook recusado: ${resultado.motivo}`)
    return NextResponse.json({ error: 'assinatura invalida' }, { status: 401 })
  }

  if (!resultado.valida) {
    // Aceito, mas registrado: em producao com dados reais isto deveria ser
    // recusa, e o aviso existe para que a lacuna nao passe despercebida.
    console.warn(`Pluggy webhook aceito sem assinatura valida: ${resultado.motivo}`)
  }

  let event: PluggyWebhookEvent
  try {
    event = JSON.parse(raw) as PluggyWebhookEvent
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const db = createServiceClient()

  // Log bruto (idempotência + auditoria)
  const eventId = event.id || event.eventId || `${event.event}-${event.itemId}-${Date.now()}`
  const itemId = event.itemId || event.data?.itemId

  const { data: existing } = await db
    .from('pluggy_webhook_events')
    .select('id, processed')
    .eq('event_id', eventId)
    .maybeSingle()

  if (existing?.processed) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const { data: wh } = await db
    .from('pluggy_webhook_events')
    .upsert(
      {
        event_id: eventId,
        event_type: event.event || 'unknown',
        pluggy_item_id: itemId,
        payload: event,
      },
      { onConflict: 'event_id' }
    )
    .select()
    .single()

  try {
    switch (event.event) {
      case 'item/created':
      case 'item/updated':
      case 'transactions/created':
      case 'transactions/updated': {
        if (!itemId) break

        const { data: conn } = await db
          .from('pluggy_connections')
          .select('id_usuario')
          .eq('pluggy_item_id', itemId)
          .maybeSingle()

        if (!conn) break

        await syncPluggyItem(db, itemId, conn.id_usuario)
        break
      }

      case 'item/deleted': {
        if (!itemId) break
        await db
          .from('pluggy_connections')
          .update({ status: 'DELETED' })
          .eq('pluggy_item_id', itemId)
        break
      }

      case 'item/error': {
        if (!itemId) break
        await db
          .from('pluggy_connections')
          .update({
            status: 'ERROR',
            error_code: event.data?.code || null,
            error_message: event.data?.message || null,
          })
          .eq('pluggy_item_id', itemId)
        break
      }

      default:
        // evento desconhecido — só loga
        break
    }

    if (wh) {
      await db
        .from('pluggy_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', wh.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('webhook error', err)
    const message = err instanceof Error ? err.message : String(err)
    if (wh) {
      await db
        .from('pluggy_webhook_events')
        .update({ error: message })
        .eq('id', wh.id)
    }
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'pluggy webhook ok' })
}

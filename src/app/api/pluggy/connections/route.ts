import { NextRequest, NextResponse } from 'next/server'
import { createClientFromRequest } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPluggyClient } from '@/lib/pluggy/client'
import { syncPluggyItem } from '@/lib/pluggy/sync'

export const runtime = 'nodejs'

/** Callback do widget: recebe itemId criado, persiste conexão e faz 1º sync. */
/**
 * Lista as conexoes Open Finance do usuario.
 *
 * Usa o cliente com a sessao do usuario, e nao o service role: a RLS de
 * `pluggy_connections` ja filtra por dono, entao nao ha o que conferir aqui
 * a mao. Existe para a interface saber quais conexoes sincronizar — antes
 * disso, a rota de sincronizacao existia mas nao havia como descobrir o id
 * para chama-la.
 */
export async function GET(req: NextRequest) {
  const supabase = createClientFromRequest(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('pluggy_connections')
    .select('id, institution_name, status, execution_status, last_updated_at')
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClientFromRequest(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'não autenticado' }, { status: 401 })
  }

  const { itemId } = await req.json()
  if (!itemId) return NextResponse.json({ error: 'itemId ausente' }, { status: 400 })

  // Descobre id_usuario (integer) via auth_user_id
  const { data: userRow } = await supabase
    .from('usuarios')
    .select('id_usuario')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!userRow) {
    return NextResponse.json({ error: 'usuário não mapeado' }, { status: 500 })
  }

  const pluggy = getPluggyClient()
  const item = await pluggy.fetchItem(itemId)

  const db = createServiceClient()

  await db.from('pluggy_connections').upsert(
    {
      id_usuario: userRow.id_usuario,
      pluggy_item_id: itemId,
      connector_id: item.connector.id,
      institution_name: item.connector.name,
      status: item.status,
      execution_status: item.executionStatus,
    },
    { onConflict: 'pluggy_item_id' }
  )

  const result = await syncPluggyItem(db, itemId, userRow.id_usuario)

  return NextResponse.json({ ok: true, ...result })
}

/** Deleta conexão + item Pluggy. */
export async function DELETE(req: NextRequest) {
  const supabase = createClientFromRequest(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const connectionId = searchParams.get('id')
  if (!connectionId) return NextResponse.json({ error: 'id ausente' }, { status: 400 })

  const { data: conn } = await supabase
    .from('pluggy_connections')
    .select('pluggy_item_id')
    .eq('id', Number(connectionId))
    .maybeSingle()

  if (!conn) return NextResponse.json({ error: 'não encontrada' }, { status: 404 })

  const pluggy = getPluggyClient()
  try {
    await pluggy.deleteItem(conn.pluggy_item_id)
  } catch (e) {
    console.warn('pluggy deleteItem falhou (seguindo adiante)', e)
  }

  const db = createServiceClient()
  await db.from('pluggy_connections').delete().eq('id', Number(connectionId))

  return NextResponse.json({ ok: true })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPluggyClient } from './client'
import {
  mapAccountType,
  mapAccountNumber,
  mapTransactionTipo,
  mapTransactionCategoria,
} from './mapping'
import { applyTransactionRules, applyBalanceAlert } from './rules'

type DB = SupabaseClient<Database>

/**
 * Sincroniza todas as contas e transações de um item Pluggy.
 * - Usa service role (server-side) para bypass de RLS no ingest.
 * - Idempotente: upsert por pluggy_account_id e pluggy_tx_id.
 */
export async function syncPluggyItem(
  db: DB,
  pluggyItemId: string,
  idUsuario: number,
  options: { since?: Date } = {}
): Promise<{ contas: number; transacoes: number; novos: number }> {
  const pluggy = getPluggyClient()

  const item = await pluggy.fetchItem(pluggyItemId)

  // Atualiza connection status
  await db
    .from('pluggy_connections')
    .update({
      status: item.status,
      execution_status: item.executionStatus,
      last_updated_at: new Date().toISOString(),
      error_code: item.error?.code ?? null,
      error_message: item.error?.message ?? null,
    })
    .eq('pluggy_item_id', pluggyItemId)

  const accountsResp = await pluggy.fetchAccounts(pluggyItemId)
  const accounts = accountsResp.results

  let totalTx = 0
  let novosTx = 0

  for (const acc of accounts) {
    // Upsert conta
    const { data: conta, error: accErr } = await db
      .from('contas_bancarias')
      .upsert(
        {
          id_usuario: idUsuario,
          instituicao: item.connector.name,
          numero_conta: mapAccountNumber(acc),
          tipo_conta: mapAccountType(acc),
          saldo_atual: acc.balance,
          ultima_sync: new Date().toISOString(),
          pluggy_item_id: pluggyItemId,
          pluggy_account_id: acc.id,
          pluggy_status: item.status,
          origem: 'pluggy',
        },
        { onConflict: 'pluggy_account_id' }
      )
      .select()
      .single()

    if (accErr || !conta) {
      console.error('upsert conta falhou', accErr)
      continue
    }

    await applyBalanceAlert(db, idUsuario, conta.id_conta, acc.balance, item.connector.name)

    // Busca transações.
    //
    // `fetchAllTransactions` percorre o endpoint /v2/transactions com
    // paginação por cursor e devolve a lista completa. A versão anterior
    // chamava `fetchTransactions`, que usa o /v1 — a Pluggy removeu esse
    // endpoint e ele passou a responder 410 Gone, derrubando a sincronização
    // inteira com "ENDPOINT_DEPRECATED". O laço manual de páginas some junto:
    // o cursor fica por conta do SDK.
    //
    // O limite de 10 mil transações que existia aqui como rede de segurança
    // deixou de ser necessário: o varrimento por cursor é estável em listas
    // longas, que era justamente o motivo da deprecação.
    const transacoesDaConta = await pluggy.fetchAllTransactions(acc.id, {
      dateFrom: options.since?.toISOString().slice(0, 10),
    })

    // Quais transacoes desta conta o banco ja conhece.
    //
    // Sem esta consulta nao da para saber se o upsert abaixo inseriu ou
    // atualizou: `upsert().select().single()` devolve a linha nos dois casos.
    // A versao anterior tratava todo retorno como insercao nova, e o efeito
    // nao era so um contador errado — `applyTransactionRules` reaplicava as
    // regras a cada sincronizacao, aportando de novo nas mesmas metas. Duas
    // passadas levaram tres metas a 100% e as marcaram como concluidas.
    const { data: linhasConhecidas } = await db
      .from('transacoes')
      .select('pluggy_tx_id')
      .eq('id_conta', conta.id_conta)
      .not('pluggy_tx_id', 'is', null)

    const idsConhecidos = new Set(
      (linhasConhecidas ?? []).map((l) => l.pluggy_tx_id).filter(Boolean) as string[]
    )

    {
      for (const tx of transacoesDaConta) {
        totalTx++

        // upsert idempotente
        const payload = {
          id_conta: conta.id_conta,
          data_transacao: tx.date.toISOString().slice(0, 10),
          tipo: mapTransactionTipo(tx),
          categoria: mapTransactionCategoria(tx),
          descricao: tx.description || '(sem descrição)',
          valor: Math.abs(tx.amount),
          pluggy_tx_id: tx.id,
          origem: 'pluggy' as const,
          raw_data: tx as unknown as Record<string, unknown>,
        }

        const { data: inserted, error: txErr } = await db
          .from('transacoes')
          .upsert(payload, { onConflict: 'pluggy_tx_id', ignoreDuplicates: false })
          .select()
          .single()

        if (txErr) {
          console.error('upsert tx falhou', txErr)
          continue
        }

        // As regras de negocio (aporte em meta, baixa em lembrete, alerta)
        // tem efeito colateral e nao sao idempotentes: so podem rodar quando
        // a transacao e de fato nova.
        if (!idsConhecidos.has(tx.id) && inserted) {
          novosTx++
          // Marca antes de aplicar: se a Pluggy repetir o mesmo id dentro da
          // mesma varredura, a regra nao roda duas vezes.
          idsConhecidos.add(tx.id)
          await applyTransactionRules(db, inserted, idUsuario)
        }
      }
    }
  }

  return { contas: accounts.length, transacoes: totalTx, novos: novosTx }
}

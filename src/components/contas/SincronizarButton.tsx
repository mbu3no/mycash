'use client'

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

interface Conexao {
  id: number
  institution_name: string | null
}

/**
 * Dispara a sincronizacao manual das conexoes Open Finance.
 *
 * A rota `/api/pluggy/sync/[connectionId]` existia desde o inicio, mas nada
 * na interface a chamava: so havia sincronizacao no momento de conectar e
 * quando a Pluggy mandava webhook. Quando o webhook de conclusao nao chega —
 * o que aconteceu no primeiro teste real contra o sandbox — a conta aparecia
 * sem extrato e nao havia como pedir de novo sem mexer no banco.
 *
 * O botao so e renderizado quando ha conexao: usuario que nunca conectou
 * banco nenhum nao tem o que sincronizar.
 */
export default function SincronizarButton({
  aoConcluir,
}: {
  aoConcluir: () => void
}) {
  const [rodando, setRodando] = useState(false)

  async function sincronizar() {
    setRodando(true)
    try {
      const resp = await fetch('/api/pluggy/connections')
      if (!resp.ok) throw new Error('falha ao listar conexões')
      const { data } = (await resp.json()) as { data: Conexao[] }

      if (!data.length) {
        alert('Nenhum banco conectado via Open Finance.')
        return
      }

      // Em serie, nao em paralelo: cada sincronizacao consome cota da Pluggy
      // e escreve nas mesmas tabelas. Com duas ou tres conexoes a diferenca
      // de tempo e irrelevante, e o custo de disputa desaparece.
      const falhas: string[] = []
      let totalNovas = 0

      for (const conexao of data) {
        const r = await fetch(`/api/pluggy/sync/${conexao.id}`, { method: 'POST' })
        if (!r.ok) {
          falhas.push(conexao.institution_name ?? `conexão ${conexao.id}`)
          continue
        }
        const resultado = (await r.json()) as { novos?: number }
        totalNovas += resultado.novos ?? 0
      }

      if (falhas.length) {
        alert(`Não foi possível sincronizar: ${falhas.join(', ')}.`)
      } else {
        alert(
          totalNovas > 0
            ? `Sincronização concluída. ${totalNovas} ${totalNovas === 1 ? 'nova transação' : 'novas transações'}.`
            : 'Sincronização concluída. Nenhuma transação nova.'
        )
      }

      aoConcluir()
    } catch (err) {
      console.error(err)
      alert('Erro ao sincronizar. Verifique sua conexão e tente novamente.')
    } finally {
      setRodando(false)
    }
  }

  return (
    <button
      onClick={sincronizar}
      disabled={rodando}
      title="Buscar contas e transações novas nos bancos conectados"
      className="btn-secondary inline-flex items-center gap-2 focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-2 focus:ring-offset-surface-0"
    >
      {rodando ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {rodando ? 'Sincronizando...' : 'Sincronizar'}
    </button>
  )
}

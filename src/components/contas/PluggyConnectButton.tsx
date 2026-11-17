'use client'

import { useEffect, useState } from 'react'
import { Link2, Loader2 } from 'lucide-react'

interface PluggyConnectOptions {
  connectToken: string
  includeSandbox?: boolean
  onSuccess?: (data: { item: { id: string } }) => void | Promise<void>
  onError?: (err: unknown) => void
}
interface PluggyConnectInstance {
  init: () => void
}
type PluggyConnectCtor = new (opts: PluggyConnectOptions) => PluggyConnectInstance

declare global {
  interface Window {
    PluggyConnect?: PluggyConnectCtor
  }
}

/**
 * Enderecos do widget, em ordem de preferencia.
 *
 * A versao fixada vem primeiro porque o comportamento do widget faz parte do
 * fluxo de consentimento: uma mudanca silenciosa ali altera o que o usuario ve
 * ao autorizar o compartilhamento dos dados bancarios.
 *
 * Mas fixar sozinho nao basta. A versao anterior deste arquivo apontava para
 * `v2.9.0`, que a Pluggy removeu do CDN; o script passou a responder 404, o
 * `window.PluggyConnect` nunca aparecia e o botao dizia "tente novamente em
 * 2s" para sempre. Por isso existe o segundo endereco: se a versao fixada
 * sumir, o widget ainda abre, e o aviso no console registra que isso
 * aconteceu.
 */
const ENDERECOS_DO_WIDGET = [
  'https://cdn.pluggy.ai/pluggy-connect/v2.10.0/pluggy-connect.js',
  'https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js',
]

/**
 * Carrega o widget uma vez por pagina.
 *
 * A promessa fica no modulo, e nao em estado do componente, para que varias
 * montagens compartilhem o mesmo carregamento em vez de injetarem um script
 * cada. Quem chama espera por ela, em lugar de consultar uma flag e desistir.
 */
let carregamento: Promise<PluggyConnectCtor> | null = null

function carregarWidget(): Promise<PluggyConnectCtor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('widget indisponivel fora do navegador'))
  }
  if (window.PluggyConnect) return Promise.resolve(window.PluggyConnect)
  if (carregamento) return carregamento

  carregamento = new Promise<PluggyConnectCtor>((resolve, reject) => {
    const tentar = (indice: number) => {
      if (indice >= ENDERECOS_DO_WIDGET.length) {
        // Zera para que um novo clique tente de novo: a falha pode ter sido
        // uma queda momentanea de rede, nao a ausencia definitiva do arquivo.
        carregamento = null
        reject(new Error('nenhum endereco do widget respondeu'))
        return
      }

      const endereco = ENDERECOS_DO_WIDGET[indice]
      const script = document.createElement('script')
      script.src = endereco
      script.async = true

      script.onload = () => {
        if (window.PluggyConnect) {
          if (indice > 0) {
            console.warn(
              `Pluggy: a versao fixada falhou; widget carregado de ${endereco}.`
            )
          }
          resolve(window.PluggyConnect)
        } else {
          // Carregou, mas nao definiu o global: trata como falha e segue.
          script.remove()
          tentar(indice + 1)
        }
      }

      script.onerror = () => {
        console.warn(`Pluggy: falha ao carregar ${endereco}.`)
        script.remove()
        tentar(indice + 1)
      }

      document.body.appendChild(script)
    }

    tentar(0)
  })

  return carregamento
}

export default function PluggyConnectButton({
  onConnected,
}: {
  onConnected: () => void
}) {
  const [loading, setLoading] = useState(false)

  // Dispara o carregamento assim que a tela monta, para que o widget ja esteja
  // pronto quando o usuario clicar. A falha aqui nao interrompe nada: o clique
  // tenta de novo e e la que o erro vira mensagem.
  useEffect(() => {
    carregarWidget().catch(() => {})
  }, [])

  async function handleClick() {
    setLoading(true)
    try {
      const resp = await fetch('/api/pluggy/connect-token', { method: 'POST' })
      if (!resp.ok) throw new Error('falha ao obter token')
      const { accessToken } = await resp.json()

      // Espera o widget em vez de pedir ao usuario que tente de novo. Se ele
      // nunca carregar, a excecao cai no catch abaixo com mensagem honesta.
      const PluggyConnect = await carregarWidget()

      const connect = new PluggyConnect({
        connectToken: accessToken,
        includeSandbox: true,
        onSuccess: async (itemData: { item: { id: string } }) => {
          await fetch('/api/pluggy/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: itemData.item.id }),
          })
          onConnected()
        },
        onError: (err: unknown) => {
          console.error('Pluggy error', err)
        },
      })

      connect.init()
    } catch (err) {
      console.error(err)
      alert(
        'Nao foi possivel abrir a conexao com o banco. Verifique sua internet e tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="btn-primary inline-flex items-center gap-2 focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-2 focus:ring-offset-surface-0"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
      Conectar banco
    </button>
  )
}

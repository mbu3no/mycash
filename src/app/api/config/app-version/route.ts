import { NextRequest, NextResponse } from 'next/server'

import { decidirAtualizacao } from '@/domain/versao'
import { CABECALHO_VERSAO_APP, LOJA, POLITICA_DE_VERSAO } from '@/lib/politica-de-versao'

/**
 * Metadados de versao do aplicativo.
 *
 *   GET /api/config/app-version
 *
 * O aplicativo consulta isto na abertura e decide sozinho o que fazer:
 * seguir, exibir aviso dispensavel ou bloquear a entrada. A decisao fica aqui
 * e nao no cliente porque so o servidor sabe qual contrato ele ainda atende —
 * e porque assim da para endurecer a politica sem publicar versao nova na
 * loja.
 *
 * Rota publica de proposito: e consultada antes do login, inclusive por quem
 * esta bloqueado e precisa saber para onde ir.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const instalada = req.headers.get(CABECALHO_VERSAO_APP)
  const decisao = decidirAtualizacao(instalada, POLITICA_DE_VERSAO)

  return NextResponse.json(
    {
      maisRecente: POLITICA_DE_VERSAO.maisRecente,
      minimaSuportada: POLITICA_DE_VERSAO.minimaSuportada,
      // Eco do que foi recebido: ajuda a depurar cliente que manda o
      // cabecalho errado, sem precisar de log do servidor.
      versaoRecebida: instalada,
      decisao,
      loja: LOJA,
    },
    {
      // Sem cache: o aplicativo precisa enxergar uma mudanca de politica na
      // proxima abertura, nao depois que algum intermediario expirar.
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}

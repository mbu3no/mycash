import { NextRequest, NextResponse } from 'next/server'

import { deveRecusarPorVersao } from '@/domain/versao'
import { CABECALHO_VERSAO_APP, LOJA, POLITICA_DE_VERSAO } from '@/lib/politica-de-versao'

/**
 * Recusa requisicoes de versoes do aplicativo que a API nao atende mais.
 *
 * A tela de bloqueio do aplicativo nao basta: ela protege o usuario de ver
 * uma tela quebrada, nao protege a API de receber chamada de um cliente que
 * nao entende mais o contrato. Requisicao montada a mao, aparelho com o
 * bundle adulterado ou simples `curl` passariam por cima da interface.
 *
 * O codigo devolvido e 426 Upgrade Required, que existe exatamente para
 * dizer "o pedido esta correto, mas o cliente precisa mudar antes de ser
 * atendido". Nao e 400, porque a requisicao nao esta malformada, nem 403,
 * porque nao e questao de permissao.
 *
 * Devolve `null` quando a requisicao pode seguir, para o chamador usar como
 * guarda de uma linha:
 *
 *   const barrada = barreiraDeVersao(req)
 *   if (barrada) return barrada
 */
export function barreiraDeVersao(req: NextRequest): NextResponse | null {
  const instalada = req.headers.get(CABECALHO_VERSAO_APP)

  // Sem cabecalho nao e o aplicativo: e o navegador, servido pelo mesmo
  // deploy desta API e portanto sempre compativel. Barrar aqui derrubaria o
  // web inteiro.
  if (!instalada) return null

  if (!deveRecusarPorVersao(instalada, POLITICA_DE_VERSAO)) return null

  return NextResponse.json(
    {
      error: 'versão do aplicativo não suportada',
      versaoRecebida: instalada,
      minimaSuportada: POLITICA_DE_VERSAO.minimaSuportada,
      maisRecente: POLITICA_DE_VERSAO.maisRecente,
      loja: LOJA,
    },
    {
      status: 426,
      headers: {
        // O cabecalho Upgrade acompanha o 426 por definicao do protocolo e
        // diz para o que se deve migrar.
        Upgrade: `mycash-app/${POLITICA_DE_VERSAO.minimaSuportada}`,
        'Cache-Control': 'no-store',
      },
    }
  )
}

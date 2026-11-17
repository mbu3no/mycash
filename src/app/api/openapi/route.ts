import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'

/**
 * Serve a especificacao OpenAPI.
 *
 *   GET /api/openapi
 *
 * Existe para que o contrato seja alcancavel por maquina, e nao so por quem
 * tem o repositorio aberto: geradores de cliente tipado, validadores de
 * contrato e a pagina de documentacao consomem daqui.
 *
 * O arquivo e lido do disco em vez de embutido no codigo porque a fonte da
 * verdade e `docs/api/openapi.yaml`, versionado e validado no CI. Duplicar o
 * conteudo aqui criaria duas versoes do mesmo contrato, que e exatamente o
 * problema que ter um contrato resolve.
 */
export const runtime = 'nodejs'

export async function GET() {
  try {
    const arquivo = path.join(process.cwd(), 'docs', 'api', 'openapi.yaml')
    const conteudo = await readFile(arquivo, 'utf8')

    return new NextResponse(conteudo, {
      headers: {
        'Content-Type': 'application/yaml; charset=utf-8',
        // O contrato muda junto com o deploy; cache curto evita que um
        // intermediario sirva a versao anterior logo apos uma publicacao.
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'especificação indisponível' },
      { status: 500 }
    )
  }
}

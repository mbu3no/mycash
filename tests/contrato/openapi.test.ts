import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import yaml from 'yaml'

/**
 * O contrato nao pode divergir do codigo.
 *
 * Uma especificacao OpenAPI envelhece em silencio: rota nova entra, rota
 * antiga sai, e o documento continua dizendo o que valia meses atras. O
 * resultado e pior do que nao ter documento nenhum, porque quem consome passa
 * a confiar numa descricao errada — foi assim que o aplicativo quebrou em
 * 28/08, esperando um campo que a API ainda nao servia.
 *
 * Estes testes comparam o YAML com as rotas que existem de fato em
 * src/app/api, e falham nas duas direcoes: rota sem documentacao e
 * documentacao sem rota.
 */

const RAIZ = process.cwd()
const ESPEC = path.join(RAIZ, 'docs', 'api', 'openapi.yaml')
const RAIZ_API = path.join(RAIZ, 'src', 'app', 'api')

type Documento = {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, { operationId?: string; responses?: unknown }>>
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> }
}

const documento = yaml.parse(readFileSync(ESPEC, 'utf8')) as Documento

const VERBOS = ['get', 'post', 'patch', 'put', 'delete'] as const

/** Percorre src/app/api e devolve os caminhos no formato da especificacao. */
function rotasDoCodigo(): Map<string, Set<string>> {
  const encontradas = new Map<string, Set<string>>()

  const andar = (dir: string, prefixo: string) => {
    for (const entrada of readdirSync(dir)) {
      const completo = path.join(dir, entrada)

      if (statSync(completo).isDirectory()) {
        // [id] no sistema de arquivos vira {id} na especificacao.
        const segmento = entrada.startsWith('[') ? `{${entrada.slice(1, -1)}}` : entrada
        andar(completo, `${prefixo}/${segmento}`)
        continue
      }

      if (entrada !== 'route.ts') continue

      const fonte = readFileSync(completo, 'utf8')
      const verbos = new Set<string>()
      for (const verbo of VERBOS) {
        // `export async function GET(` — a forma que o App Router exige.
        if (new RegExp(`export\\s+async\\s+function\\s+${verbo.toUpperCase()}\\s*\\(`).test(fonte)) {
          verbos.add(verbo)
        }
      }
      if (verbos.size) encontradas.set(prefixo || '/', verbos)
    }
  }

  andar(RAIZ_API, '')
  return encontradas
}

const doCodigo = rotasDoCodigo()

describe('documento OpenAPI', () => {
  it('openapi_versao_e310', () => {
    // 3.1 e a primeira versao convergente com JSON Schema 2020-12, que e o
    // ponto que sustenta os schemas abaixo.
    expect(documento.openapi).toBe('3.1.0')
  })

  it('openapi_temInfoCompleta', () => {
    expect(documento.info.title).toBeTruthy()
    expect(documento.info.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('openapi_todaOperacaoTemOperationId', () => {
    // O operationId e o nome que geradores de cliente usam para batizar os
    // metodos. Sem ele, a ferramenta inventa a partir do caminho e a
    // assinatura do cliente muda a cada ajuste de rota.
    const semId: string[] = []

    for (const [caminho, operacoes] of Object.entries(documento.paths)) {
      for (const verbo of VERBOS) {
        const op = operacoes[verbo]
        if (op && !op.operationId) semId.push(`${verbo.toUpperCase()} ${caminho}`)
      }
    }

    expect(semId).toEqual([])
  })

  it('openapi_operationIdsSaoUnicos', () => {
    const vistos = new Map<string, string>()
    const repetidos: string[] = []

    for (const [caminho, operacoes] of Object.entries(documento.paths)) {
      for (const verbo of VERBOS) {
        const id = operacoes[verbo]?.operationId
        if (!id) continue
        if (vistos.has(id)) repetidos.push(`${id}: ${vistos.get(id)} e ${verbo} ${caminho}`)
        vistos.set(id, `${verbo} ${caminho}`)
      }
    }

    expect(repetidos).toEqual([])
  })
})

describe('contrato versus implementação', () => {
  it('contrato_todaRotaDoCodigo_estaDocumentada', () => {
    // Direcao que pega rota nova entrando sem documentacao.
    const ausentes: string[] = []

    // Array.from porque o target do tsconfig nao habilita iteracao direta de Map.
    for (const [caminho, verbos] of Array.from(doCodigo)) {
      const documentada = documento.paths[caminho]
      if (!documentada) {
        ausentes.push(`${caminho} (nenhum verbo documentado)`)
        continue
      }
      for (const verbo of Array.from(verbos)) {
        if (!documentada[verbo]) ausentes.push(`${verbo.toUpperCase()} ${caminho}`)
      }
    }

    expect(ausentes).toEqual([])
  })

  it('contrato_todaRotaDocumentada_existeNoCodigo', () => {
    // Direcao que pega rota removida cuja documentacao ficou para tras — o
    // caso mais traicoeiro, porque leva o cliente a chamar o que nao existe.
    const inexistentes: string[] = []

    for (const [caminho, operacoes] of Object.entries(documento.paths)) {
      const implementada = doCodigo.get(caminho)
      if (!implementada) {
        inexistentes.push(`${caminho} (rota não existe)`)
        continue
      }
      for (const verbo of VERBOS) {
        if (operacoes[verbo] && !implementada.has(verbo)) {
          inexistentes.push(`${verbo.toUpperCase()} ${caminho}`)
        }
      }
    }

    expect(inexistentes).toEqual([])
  })
})

describe('campos obrigatórios do painel', () => {
  it('dashboard_camposQueOAppExige_estaoMarcadosComoObrigatorios', () => {
    // O registro de decisao arquitetural classifica estes quatro como
    // obrigatorios: sem eles o aplicativo trava. Remover um e mudanca
    // incompativel, e o contrato precisa dizer isso.
    const schema = documento.components.schemas.ResumoDashboard as {
      required: string[]
    }

    expect(schema.required).toEqual(
      expect.arrayContaining(['saldoTotal', 'entradas', 'saidas', 'metasAtivas'])
    )
  })

  it('dashboard_camposTolerantes_naoSaoObrigatorios', () => {
    // A contrapartida: estes podem faltar, e o aplicativo os le com `?? []`.
    // Marca-los como obrigatorios impediria o servidor de evoluir sem quebrar
    // versao antiga instalada.
    const schema = documento.components.schemas.ResumoDashboard as {
      required: string[]
    }

    for (const tolerante of ['serieMensal', 'recentes', 'proximosLembretes', 'nome']) {
      expect(schema.required).not.toContain(tolerante)
    }
  })

  it('transacao_valorEhSemprePositivo', () => {
    // O sinal vem do tipo, nunca do numero. O contrato declara isso para que
    // nenhum cliente envie valor negativo esperando que vire saida.
    const schema = documento.components.schemas.Transacao as {
      properties: { valor: { exclusiveMinimum?: number } }
    }

    expect(schema.properties.valor.exclusiveMinimum).toBe(0)
  })
})

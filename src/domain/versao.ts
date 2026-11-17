/**
 * Negociacao de versao entre o aplicativo instalado e a API.
 *
 * O problema que isto resolve aconteceu em 28/08/2026: ao adicionar o campo
 * `serieMensal` em GET /api/dashboard, o aplicativo quebrou com
 * `Cannot read property 'length' of undefined`. O bundle ja esperava o campo
 * novo e a Vercel ainda servia a rota anterior. Uma tela branca por causa de
 * assimetria de release.
 *
 * O web nao sofre disso: o deploy troca todo mundo de uma vez. O aplicativo
 * depende de o usuario atualizar — dias, semanas, ou nunca. Enquanto houver
 * aparelho com versao antiga instalada, as duas precisam conviver.
 *
 * Este modulo e TypeScript puro, sem rede e sem React, porque e consumido
 * pelos dois lados: a API decide se recusa a requisicao, o aplicativo decide
 * se avisa ou bloqueia.
 */

export type DecisaoDeAtualizacao = 'em-dia' | 'sugerida' | 'obrigatoria'

export type PoliticaDeVersao = {
  /** Ultima versao publicada na loja. */
  maisRecente: string
  /** Abaixo disto a API recusa atender. */
  minimaSuportada: string
}

/**
 * Compara duas versoes no formato MAJOR.MINOR.PATCH.
 *
 * Devolve negativo se `a` for anterior a `b`, zero se forem equivalentes e
 * positivo se `a` for posterior.
 *
 * Comparacao numerica por segmento, e nao alfabetica: como texto, "1.10.0"
 * viria antes de "1.9.0", e a decimaa versao seria tratada como mais antiga
 * que a nona.
 *
 * Segmento ausente conta como zero, entao "1.2" equivale a "1.2.0". Segmento
 * nao numerico tambem vira zero, o que faz uma versao malformada ser tratada
 * como antiga — o lado seguro, porque leva a sugerir atualizacao em vez de
 * liberar acesso indevido.
 */
export function compararVersoes(a: string, b: string): number {
  const partes = (v: string) =>
    v
      .trim()
      .split('.')
      .map((p) => {
        const n = Number.parseInt(p, 10)
        return Number.isNaN(n) ? 0 : n
      })

  const pa = partes(a)
  const pb = partes(b)
  const total = Math.max(pa.length, pb.length)

  for (let i = 0; i < total; i++) {
    const diferenca = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diferenca !== 0) return diferenca < 0 ? -1 : 1
  }

  return 0
}

/** `instalada` e anterior a `referencia`? */
export function ehAnterior(instalada: string, referencia: string): boolean {
  return compararVersoes(instalada, referencia) < 0
}

/**
 * Classifica a versao instalada diante da politica vigente.
 *
 * - `obrigatoria`: viola o minimo suportado. O aplicativo bloqueia a entrada
 *   e a API recusa com 426 Upgrade Required, porque requisicao forjada nao
 *   pode contornar o bloqueio da interface.
 * - `sugerida`: funciona, mas existe versao mais nova. Aviso dispensavel, sem
 *   interromper o uso.
 * - `em-dia`: nada a fazer.
 *
 * Versao ausente ou vazia conta como obrigatoria: cliente que nao se
 * identifica nao tem como provar compatibilidade.
 */
export function decidirAtualizacao(
  instalada: string | null | undefined,
  politica: PoliticaDeVersao
): DecisaoDeAtualizacao {
  if (!instalada || !instalada.trim()) return 'obrigatoria'
  if (ehAnterior(instalada, politica.minimaSuportada)) return 'obrigatoria'
  if (ehAnterior(instalada, politica.maisRecente)) return 'sugerida'
  return 'em-dia'
}

/**
 * A API deve recusar esta requisicao?
 *
 * Separado de `decidirAtualizacao` porque a pergunta do servidor e mais
 * estreita: so o caso obrigatorio vira recusa. Sugerir atualizacao e assunto
 * da interface, nao motivo para negar atendimento.
 */
export function deveRecusarPorVersao(
  instalada: string | null | undefined,
  politica: PoliticaDeVersao
): boolean {
  return decidirAtualizacao(instalada, politica) === 'obrigatoria'
}

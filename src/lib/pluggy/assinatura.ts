import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verificacao da assinatura do webhook da Pluggy.
 *
 * A Pluggy assina o corpo da requisicao com HMAC SHA-256, usando o
 * `clientSecret` como chave, e envia o resultado no cabecalho
 * `X-Pluggy-Signature`. Sem conferir isso, a rota aceita qualquer POST de
 * quem descobrir a URL.
 *
 * O estrago de um evento forjado e limitado — o handler so reage a itens que
 * ja existem em `pluggy_connections`, e a sincronizacao busca a verdade na
 * propria Pluggy em vez de confiar no corpo recebido. Ainda assim, da para
 * disparar sincronizacoes em serie de fora, o que consome cota do provedor e
 * tempo de funcao.
 */

/** Cabecalhos onde a assinatura pode vir, conforme a versao do provedor. */
const CABECALHOS = ['x-pluggy-signature', 'x-signature', 'pluggy-signature']

export type ResultadoDaAssinatura =
  | { valida: true; motivo: 'assinatura-confere' }
  | { valida: false; motivo: 'assinatura-ausente' | 'assinatura-invalida' | 'segredo-ausente' }

export function extrairAssinatura(headers: Headers): string | null {
  for (const nome of CABECALHOS) {
    const valor = headers.get(nome)
    if (valor) return valor.trim()
  }
  return null
}

/**
 * Compara a assinatura recebida com a calculada sobre o corpo cru.
 *
 * O corpo precisa ser exatamente o texto recebido: reserializar o JSON mudaria
 * espacos e ordem de chaves, e o HMAC deixaria de bater.
 */
export function conferirAssinatura(
  corpoCru: string,
  assinaturaRecebida: string | null,
  clientSecret: string | undefined
): ResultadoDaAssinatura {
  if (!clientSecret) return { valida: false, motivo: 'segredo-ausente' }
  if (!assinaturaRecebida) return { valida: false, motivo: 'assinatura-ausente' }

  // Alguns provedores prefixam o algoritmo ("sha256=abc..."); aceita os dois.
  const recebida = assinaturaRecebida.includes('=')
    ? assinaturaRecebida.slice(assinaturaRecebida.indexOf('=') + 1)
    : assinaturaRecebida

  const calculada = createHmac('sha256', clientSecret).update(corpoCru, 'utf8').digest('hex')

  const a = Buffer.from(calculada, 'utf8')
  const b = Buffer.from(recebida.toLowerCase(), 'utf8')

  // Comprimentos diferentes ja reprovam, e `timingSafeEqual` exige buffers do
  // mesmo tamanho. A comparacao em tempo constante evita que o atacante
  // descubra a assinatura byte a byte medindo o tempo de resposta.
  if (a.length !== b.length) return { valida: false, motivo: 'assinatura-invalida' }
  if (!timingSafeEqual(a, b)) return { valida: false, motivo: 'assinatura-invalida' }

  return { valida: true, motivo: 'assinatura-confere' }
}

/**
 * Decide se a requisicao deve ser recusada.
 *
 * Assinatura presente e errada recusa sempre: e tentativa de falsificacao.
 *
 * Assinatura ausente depende de `PLUGGY_WEBHOOK_ESTRITO`. O padrao e aceitar,
 * porque o sandbox da Pluggy nem sempre assina e recusar deixaria o ambiente
 * de desenvolvimento sem webhook nenhum. Em producao de verdade, com dados
 * bancarios reais, a variavel deve ser ligada.
 */
export function deveRecusar(resultado: ResultadoDaAssinatura, estrito: boolean): boolean {
  if (resultado.valida) return false
  if (resultado.motivo === 'assinatura-invalida') return true
  return estrito
}

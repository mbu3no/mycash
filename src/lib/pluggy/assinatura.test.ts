import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { conferirAssinatura, deveRecusar, extrairAssinatura } from './assinatura'

/**
 * Testes da verificacao de assinatura do webhook.
 *
 * Codigo de seguranca tem uma caracteristica incomoda: quando esta errado,
 * continua parecendo funcionar. Um `return true` no lugar da comparacao
 * passaria em qualquer teste de caminho feliz, e so apareceria no dia em que
 * alguem forjasse um evento. Por isso a maior parte dos casos abaixo exercita
 * a recusa, nao a aceitacao.
 */

const SEGREDO = 'pluggy_sk_segredo_de_teste'
const CORPO = '{"event":"item/updated","itemId":"abc-123"}'

/** Assinatura que a Pluggy produziria para este corpo. */
function assinar(corpo: string, segredo = SEGREDO): string {
  return createHmac('sha256', segredo).update(corpo, 'utf8').digest('hex')
}

describe('extrairAssinatura', () => {
  it('extrairAssinatura_cabecalhoPadrao_encontra', () => {
    const h = new Headers({ 'x-pluggy-signature': 'abc123' })

    expect(extrairAssinatura(h)).toBe('abc123')
  })

  it('extrairAssinatura_cabecalhoAlternativo_encontra', () => {
    // O nome do cabecalho ja variou entre versoes do provedor; aceitar os
    // tres evita que uma renomeacao silenciosa derrube a verificacao.
    expect(extrairAssinatura(new Headers({ 'x-signature': 'abc' }))).toBe('abc')
    expect(extrairAssinatura(new Headers({ 'pluggy-signature': 'abc' }))).toBe('abc')
  })

  it('extrairAssinatura_semCabecalho_devolveNulo', () => {
    expect(extrairAssinatura(new Headers())).toBeNull()
  })
})

describe('conferirAssinatura', () => {
  it('conferirAssinatura_assinaturaCorreta_aprova', () => {
    const r = conferirAssinatura(CORPO, assinar(CORPO), SEGREDO)

    expect(r.valida).toBe(true)
  })

  it('conferirAssinatura_comPrefixoDoAlgoritmo_aprova', () => {
    // Formato "sha256=<hex>", usado por varios provedores.
    const r = conferirAssinatura(CORPO, `sha256=${assinar(CORPO)}`, SEGREDO)

    expect(r.valida).toBe(true)
  })

  it('conferirAssinatura_maiusculas_aprova', () => {
    const r = conferirAssinatura(CORPO, assinar(CORPO).toUpperCase(), SEGREDO)

    expect(r.valida).toBe(true)
  })

  it('conferirAssinatura_corpoAlterado_reprova', () => {
    // O cenario que a verificacao existe para pegar: assinatura legitima de
    // um corpo, colada num corpo adulterado.
    const assinaturaDoOriginal = assinar(CORPO)
    const adulterado = CORPO.replace('abc-123', 'item-de-outro-usuario')

    const r = conferirAssinatura(adulterado, assinaturaDoOriginal, SEGREDO)

    expect(r).toEqual({ valida: false, motivo: 'assinatura-invalida' })
  })

  it('conferirAssinatura_segredoErrado_reprova', () => {
    const r = conferirAssinatura(CORPO, assinar(CORPO, 'outro_segredo'), SEGREDO)

    expect(r).toEqual({ valida: false, motivo: 'assinatura-invalida' })
  })

  it('conferirAssinatura_assinaturaAusente_distingueDeInvalida', () => {
    // A distincao importa: ausente pode ser o sandbox, invalida e ataque.
    const r = conferirAssinatura(CORPO, null, SEGREDO)

    expect(r).toEqual({ valida: false, motivo: 'assinatura-ausente' })
  })

  it('conferirAssinatura_semSegredoConfigurado_reprova', () => {
    const r = conferirAssinatura(CORPO, assinar(CORPO), undefined)

    expect(r).toEqual({ valida: false, motivo: 'segredo-ausente' })
  })

  it('conferirAssinatura_tamanhoDiferente_reprovaSemLancar', () => {
    // `timingSafeEqual` lanca se os buffers tiverem tamanhos distintos; o
    // guard precisa pegar isso antes.
    expect(() => conferirAssinatura(CORPO, 'curta', SEGREDO)).not.toThrow()
    expect(conferirAssinatura(CORPO, 'curta', SEGREDO).valida).toBe(false)
  })

  it('conferirAssinatura_espacoAMais_reprova', () => {
    // Prova que a comparacao e sobre o corpo cru: reserializar o JSON mudaria
    // os espacos e quebraria o HMAC.
    const r = conferirAssinatura(CORPO + ' ', assinar(CORPO), SEGREDO)

    expect(r.valida).toBe(false)
  })
})

describe('deveRecusar', () => {
  it('deveRecusar_assinaturaValida_aceita', () => {
    expect(deveRecusar({ valida: true, motivo: 'assinatura-confere' }, false)).toBe(false)
    expect(deveRecusar({ valida: true, motivo: 'assinatura-confere' }, true)).toBe(false)
  })

  it('deveRecusar_assinaturaInvalida_recusaMesmoForaDoModoEstrito', () => {
    // Nao ha leitura benigna de uma assinatura que nao confere.
    const r = { valida: false, motivo: 'assinatura-invalida' } as const

    expect(deveRecusar(r, false)).toBe(true)
    expect(deveRecusar(r, true)).toBe(true)
  })

  it('deveRecusar_assinaturaAusente_dependeDoModoEstrito', () => {
    const r = { valida: false, motivo: 'assinatura-ausente' } as const

    expect(deveRecusar(r, false)).toBe(false)
    expect(deveRecusar(r, true)).toBe(true)
  })

  it('deveRecusar_segredoAusente_dependeDoModoEstrito', () => {
    const r = { valida: false, motivo: 'segredo-ausente' } as const

    expect(deveRecusar(r, false)).toBe(false)
    expect(deveRecusar(r, true)).toBe(true)
  })
})

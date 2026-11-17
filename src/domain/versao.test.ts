import { describe, expect, it } from 'vitest'

import {
  compararVersoes,
  decidirAtualizacao,
  deveRecusarPorVersao,
  ehAnterior,
  type PoliticaDeVersao,
} from './versao'

/**
 * Testes da negociacao de versao entre aplicativo e API.
 *
 * O caso que origina este modulo e real: em 28/08/2026 o aplicativo quebrou
 * porque o bundle esperava um campo que a API ainda nao servia. Os casos
 * abaixo cobrem sobretudo as fronteiras — versao igual ao minimo, versao
 * malformada, segmento faltando — porque e nelas que uma comparacao
 * descuidada deixa passar quem deveria bloquear.
 */

const POLITICA: PoliticaDeVersao = {
  maisRecente: '1.4.0',
  minimaSuportada: '1.2.0',
}

describe('compararVersoes', () => {
  it('compararVersoes_versoesIguais_devolveZero', () => {
    expect(compararVersoes('1.2.3', '1.2.3')).toBe(0)
  })

  it('compararVersoes_maiorEMenor_respeitaAOrdem', () => {
    expect(compararVersoes('1.2.4', '1.2.3')).toBeGreaterThan(0)
    expect(compararVersoes('1.2.3', '1.2.4')).toBeLessThan(0)
  })

  it('compararVersoes_dezAposNove_naoComparaComoTexto', () => {
    // O caso que a comparacao alfabetica erra: como string, "1.10.0" < "1.9.0",
    // e a decima versao seria tratada como anterior a nona.
    expect(compararVersoes('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compararVersoes('2.0.0', '1.99.99')).toBeGreaterThan(0)
  })

  it('compararVersoes_segmentoAusente_contaComoZero', () => {
    expect(compararVersoes('1.2', '1.2.0')).toBe(0)
    expect(compararVersoes('1', '1.0.0')).toBe(0)
    expect(compararVersoes('1.2', '1.2.1')).toBeLessThan(0)
  })

  it('compararVersoes_espacosAoRedor_ignorados', () => {
    expect(compararVersoes(' 1.2.0 ', '1.2.0')).toBe(0)
  })

  it('compararVersoes_segmentoNaoNumerico_tratadoComoZero', () => {
    // Versao malformada vira "antiga", que e o lado seguro: leva a pedir
    // atualizacao em vez de liberar acesso.
    expect(compararVersoes('1.x.0', '1.2.0')).toBeLessThan(0)
  })
})

describe('ehAnterior', () => {
  it('ehAnterior_versaoMenor_verdadeiro', () => {
    expect(ehAnterior('1.1.9', '1.2.0')).toBe(true)
  })

  it('ehAnterior_versaoIgual_falso', () => {
    // Fronteira que decide bloqueio: igual ao minimo esta dentro do suportado.
    expect(ehAnterior('1.2.0', '1.2.0')).toBe(false)
  })

  it('ehAnterior_versaoMaior_falso', () => {
    expect(ehAnterior('1.3.0', '1.2.0')).toBe(false)
  })
})

describe('decidirAtualizacao', () => {
  it('decidirAtualizacao_versaoAtual_emDia', () => {
    expect(decidirAtualizacao('1.4.0', POLITICA)).toBe('em-dia')
  })

  it('decidirAtualizacao_versaoAdiantada_emDia', () => {
    // Build interno a frente da loja nao e defasagem.
    expect(decidirAtualizacao('1.5.0', POLITICA)).toBe('em-dia')
  })

  it('decidirAtualizacao_entreMinimaEAtual_sugerida', () => {
    expect(decidirAtualizacao('1.3.0', POLITICA)).toBe('sugerida')
  })

  it('decidirAtualizacao_exatamenteNaMinima_sugerida', () => {
    // Na minima o acesso continua liberado; so abaixo dela bloqueia.
    expect(decidirAtualizacao('1.2.0', POLITICA)).toBe('sugerida')
  })

  it('decidirAtualizacao_abaixoDaMinima_obrigatoria', () => {
    expect(decidirAtualizacao('1.1.9', POLITICA)).toBe('obrigatoria')
  })

  it('decidirAtualizacao_versaoAusente_obrigatoria', () => {
    // Cliente que nao se identifica nao tem como provar compatibilidade.
    expect(decidirAtualizacao(null, POLITICA)).toBe('obrigatoria')
    expect(decidirAtualizacao(undefined, POLITICA)).toBe('obrigatoria')
    expect(decidirAtualizacao('   ', POLITICA)).toBe('obrigatoria')
  })
})

describe('deveRecusarPorVersao', () => {
  it('deveRecusarPorVersao_abaixoDaMinima_recusa', () => {
    // Requisicao forjada contorna o bloqueio da tela; o servidor precisa ter
    // a propria barreira, devolvendo 426 Upgrade Required.
    expect(deveRecusarPorVersao('1.0.0', POLITICA)).toBe(true)
  })

  it('deveRecusarPorVersao_apenasDesatualizada_atende', () => {
    // Sugerir atualizacao e assunto da interface, nao motivo para negar.
    expect(deveRecusarPorVersao('1.3.0', POLITICA)).toBe(false)
  })

  it('deveRecusarPorVersao_emDia_atende', () => {
    expect(deveRecusarPorVersao('1.4.0', POLITICA)).toBe(false)
  })

  it('deveRecusarPorVersao_semVersao_recusa', () => {
    expect(deveRecusarPorVersao(null, POLITICA)).toBe(true)
  })
})

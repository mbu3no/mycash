import type { PoliticaDeVersao } from '@/domain/versao'

/**
 * Politica de compatibilidade entre o aplicativo e esta API.
 *
 * Fica no codigo, versionada junto com as rotas, e nao em variavel de
 * ambiente: mudar o minimo suportado e decidir que aparelhos param de
 * funcionar. Isso merece revisao de codigo e registro no historico, nao um
 * campo editavel no painel de hospedagem.
 *
 * Como mexer nisto:
 *
 * `maisRecente` sobe junto com a publicacao na loja. Quem estiver abaixo vê
 * um aviso dispensavel.
 *
 * `minimaSuportada` so sobe quando a API deixa de atender uma versao antiga
 * — campo obrigatorio removido, rota encerrada, correcao de seguranca
 * inadiavel. Subir sem necessidade transforma usuario em refem de uma
 * atualizacao que nao muda nada para ele.
 */
export const POLITICA_DE_VERSAO: PoliticaDeVersao = {
  maisRecente: '1.0.0',
  minimaSuportada: '1.0.0',
}

/**
 * Cabecalho pelo qual o aplicativo se identifica.
 *
 * O navegador nao manda este cabecalho, e nao deve: o web e servido pelo
 * mesmo deploy da API, entao nunca esta defasado. Ausencia de cabecalho
 * significa "nao e o aplicativo" e e tratada como atendimento normal — a
 * barreira de versao so se aplica a quem se declara aplicativo.
 */
export const CABECALHO_VERSAO_APP = 'x-mycash-app-version'

/** Endereco da loja, usado pelo aplicativo no botao de atualizar. */
export const LOJA = {
  android: 'https://play.google.com/store/apps/details?id=com.mycash.app',
  ios: 'https://apps.apple.com/app/mycash/id000000000',
}

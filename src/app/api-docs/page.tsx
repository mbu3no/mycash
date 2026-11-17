import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MyCash · Documentação da API',
  description: 'Contrato REST consumido pela aplicação web e pelo aplicativo móvel.',
}

/**
 * Documentacao navegavel da API.
 *
 * Renderiza `/api/openapi` com Redoc, carregado do CDN. A pagina nao duplica
 * nenhuma informacao do contrato: tudo que ela mostra vem do YAML versionado,
 * entao documentacao e implementacao nao tem como divergir sem que o linter
 * do CI acuse.
 *
 * Publica de proposito. O contrato descreve quais rotas existem e que formato
 * devolvem — nao expoe dado de usuario, e esconde-lo so dificultaria a vida
 * de quem precisa consumir a API, inclusive do proprio grupo.
 */
export default function PaginaDeDocumentacao() {
  return (
    <>
      {/* `spec-url` aponta para a rota que le o YAML do disco. */}
      <div
        dangerouslySetInnerHTML={{
          __html: `
            <redoc spec-url="/api/openapi"
                   hide-download-button="false"
                   theme='{"typography":{"fontFamily":"system-ui, -apple-system, sans-serif"}}'>
            </redoc>
          `,
        }}
      />
      {/* Versao fixada, e nao "latest": o episodio do widget da Pluggy, em que
          uma versao fixada foi removida do CDN, ensinou que nenhuma das duas
          escolhas e segura sozinha. Aqui a pagina e documentacao, entao uma
          falha de carregamento nao derruba o produto — fixar e o lado certo. */}
      <script
        src="https://cdn.redoc.ly/redoc/v2.1.5/bundles/redoc.standalone.js"
        async
      />
    </>
  )
}

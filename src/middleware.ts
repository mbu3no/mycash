import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { barreiraDeVersao } from '@/lib/api/barreira-de-versao'

export async function middleware(request: NextRequest) {
  // As rotas de API cuidam da propria autenticacao — por cookie no navegador
  // e por Bearer no aplicativo. Aqui elas passam apenas pela barreira de
  // versao, e o trabalho de renovar sessao nao roda a toa.
  //
  // /api/config/app-version fica de fora da barreira de proposito: e a rota
  // que informa ao aplicativo bloqueado para onde ir. Barra-la criaria um
  // impasse em que o cliente desatualizado nao consegue nem descobrir que
  // precisa atualizar.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (request.nextUrl.pathname !== '/api/config/app-version') {
      const barrada = barreiraDeVersao(request)
      if (barrada) return barrada
    }
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the auth session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Auth pages that authenticated users should not see
  const authRoutes = ['/login', '/registro', '/recuperar-senha']
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // Protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/transacoes', '/contas', '/metas', '/lembretes', '/notificacoes', '/perfil']
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route))

  // Redirect unauthenticated users away from protected routes
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth routes
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/transacoes/:path*',
    '/contas/:path*',
    '/metas/:path*',
    '/lembretes/:path*',
    '/notificacoes/:path*',
    '/perfil/:path*',
    '/login',
    '/registro',
    '/recuperar-senha',
    '/api/:path*',
  ],
}

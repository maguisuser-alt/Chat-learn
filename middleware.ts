import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig, { authEnabled } from "@/auth.config";

// Instancia ligera (sin mongoose) para poder correr en el runtime edge.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // Sin credenciales de Google la app queda abierta (modo anónimo).
  if (!authEnabled) return NextResponse.next();

  if (req.auth) return NextResponse.next();

  // Las APIs responden 401 en vez de redirigir a una página HTML.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Inicia sesión para continuar" }, { status: 401 });
  }
  const url = new URL("/login", req.nextUrl.origin);
  return NextResponse.redirect(url);
});

export const config = {
  // Excluye archivos estáticos, iconos, /login y las rutas de NextAuth.
  // También el manifiesto, el service worker y la página sin conexión (la app instalable los pide sin sesión).
  matcher: [
    "/((?!_next/static|_next/image|favicon|icon|.*\\.(?:png|svg|ico|jpg|jpeg)|manifest\\.webmanifest|sw\\.js|offline\\.html|login|api/auth).*)",
  ],
};

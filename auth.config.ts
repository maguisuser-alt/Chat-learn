import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * El login con Google solo se activa si están las tres variables. Sin ellas la
 * app sigue funcionando en modo anónimo (como antes) y la página /login explica
 * cómo configurarlo.
 */
export const authEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET
);

/** Configuración compatible con el runtime edge (el middleware no puede usar mongoose). */
export default {
  // Lee AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET automáticamente.
  providers: [Google],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    /** Guarda el email en el token para identificar al usuario. */
    jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
    /** Expone el email como `session.user.id` en el cliente. */
    session({ session, token }) {
      if (token.email) session.user.id = token.email;
      return session;
    },
  },
} satisfies NextAuthConfig;

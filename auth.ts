import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { connectDB, isDbConfigured } from "@/lib/mongodb";
import { User } from "@/models/User";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  events: {
    /**
     * Crea o actualiza la cuenta en MongoDB. Es opcional: si la base de datos no
     * está disponible el inicio de sesión sigue funcionando.
     */
    async signIn({ user }) {
      if (!user.email || !isDbConfigured()) return;
      try {
        await connectDB();
        await User.findOneAndUpdate(
          { clientId: user.email },
          {
            $set: { name: user.name ?? "", avatar: user.image ?? "", lastLoginAt: new Date() },
            $setOnInsert: { clientId: user.email },
          },
          { upsert: true }
        );
      } catch (err) {
        console.warn("[auth] no se pudo guardar el usuario:", err instanceof Error ? err.message : err);
      }
    },
  },
});

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      /** El clientId (email del usuario) expuesto en el cliente. */
      id: string;
    };
  }
}

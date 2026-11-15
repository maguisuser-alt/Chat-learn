/**
 * Construye la URI de MongoDB a partir de variables de entorno.
 * Sin dependencias para poder usarla también desde scripts de Node.
 *
 * - `MONGODB_URI` (si existe) manda sobre todo lo demás.
 * - Si no: `MONGODB_USER` + `MONGODB_PASSWORD` + `MONGODB_HOST` (+ `MONGODB_DB`).
 *   Un host de Atlas (cluster0.xxxxx.mongodb.net) usa `mongodb+srv`; un host con
 *   puerto o `localhost` usa `mongodb://`.
 * La contraseña se codifica, así que puede llevar caracteres especiales.
 */
export function buildMongoUri(env: Record<string, string | undefined> = process.env): string | null {
  if (env.MONGODB_URI) return env.MONGODB_URI;

  const host = env.MONGODB_HOST?.trim();
  if (!host) return null;

  const db = env.MONGODB_DB?.trim() || "lingua-tutor";
  const user = env.MONGODB_USER?.trim();
  const creds = user
    ? `${encodeURIComponent(user)}:${encodeURIComponent(env.MONGODB_PASSWORD ?? "")}@`
    : "";

  const plain = host.includes(":") || /^(localhost|127\.0\.0\.1)$/.test(host);
  return plain
    ? `mongodb://${creds}${host}/${db}`
    : `mongodb+srv://${creds}${host}/${db}?retryWrites=true&w=majority&appName=lingua-tutor`;
}

/** Misma URI con la contraseña oculta, para mostrarla en logs. */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):[^@]*@/, "//$1:***@");
}

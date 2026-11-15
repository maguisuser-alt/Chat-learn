import { listProviders, validateProviders } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Lista los proveedores y si tienen API key configurada. */
export async function GET() {
  return Response.json(listProviders());
}

/** Valida con una petición real cada proveedor configurado. */
export async function POST() {
  return Response.json(await validateProviders());
}

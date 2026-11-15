import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse y mongoose usan fs/require dinámicos: no deben empaquetarse.
  serverExternalPackages: ["pdf-parse", "mongoose"],
  // Silencia el warning de lockfiles múltiples apuntando a la raíz del workspace.
  outputFileTracingRoot: __dirname,
  // No pre-renderiza nada en build; todo es dinámico.
  output: undefined,
};

export default nextConfig;

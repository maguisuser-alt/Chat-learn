// Genera los PNG de la app instalable a partir de los SVG de public/icons.
// Uso: node scripts/make-icons.mjs
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const file = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url));
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["maskable.svg", "maskable-512.png", 512],
  // iOS no admite transparencia y redondea él mismo las esquinas.
  ["maskable.svg", "apple-touch-icon.png", 180],
];

for (const [src, out, size] of jobs) {
  await sharp(file(src), { density: Math.ceil(72 * (size / 64)) }).resize(size, size).png().toFile(file(out));
  console.log("ok", out);
}

// Genera favicon + iconos PWA de "team tac" a partir de los SVG maestros.
// Símbolo: Timer tick (dos manecillas, tic + tac) sobre degradado morado→azul.
//   node scripts/gen-icons.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tile = readFileSync(resolve(root, "public/icon.svg"));
const maskable = readFileSync(resolve(root, "public/icon-maskable.svg"));

const png = (svg, size) =>
  sharp(svg, { density: 512 }).resize(size, size).png().toBuffer();

async function main() {
  mkdirSync(resolve(root, "public/icons"), { recursive: true });
  mkdirSync(resolve(root, "app"), { recursive: true });

  // PWA (manifest)
  writeFileSync(resolve(root, "public/icons/icon-192.png"), await png(tile, 192));
  writeFileSync(resolve(root, "public/icons/icon-512.png"), await png(tile, 512));
  writeFileSync(resolve(root, "public/icons/icon-maskable-512.png"), await png(maskable, 512));

  // Apple touch icon (Next lo sirve desde app/apple-icon.png)
  writeFileSync(resolve(root, "app/apple-icon.png"), await png(tile, 180));

  // favicon.ico multi-tamaño (16/32/48), PNG embebido en ICO
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map((s) => png(tile, s)));
  writeFileSync(resolve(root, "app/favicon.ico"), buildIco(sizes, images));

  console.log("✓ iconos generados: PWA 192/512/maskable, apple-icon 180, favicon.ico 16/32/48");
}

function buildIco(sizes, images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo icono
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0); // ancho
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1); // alto
    e.writeUInt8(0, 2); // paleta
    e.writeUInt8(0, 3); // reservado
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por pixel
    e.writeUInt32LE(images[i].length, 8); // tamaño
    e.writeUInt32LE(offset, 12); // offset
    offset += images[i].length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

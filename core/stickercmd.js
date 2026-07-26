/**
 * stickercmd.js — Stickers que ejecutan comandos.
 *
 * Porta el bloque 2 del pipeline del bot de WhatsApp: `.addco <comando>`
 * respondiendo a un sticker guarda una huella de ese sticker en
 * `comandos.json`; cuando alguien vuelve a enviarlo, el bot ejecuta el
 * comando asociado como si lo hubiera escrito.
 *
 * En WhatsApp la huella era el `fileSha256` del archivo. Discord no expone
 * ningún hash, pero sus stickers tienen un ID permanente, así que
 * `core/message.js` genera con él un `fileSha256` equivalente. El formato
 * de `comandos.json` no cambia:
 *
 *     { "<huella en base64>": "kick" }
 */

import fs from "fs";
import path from "path";

const FILE = path.resolve("./comandos.json");

// Caché en memoria con recarga por fecha de modificación: el archivo se
// consultaba en cada mensaje y releerlo entero era un desperdicio.
let cache = null;
let cacheMtime = 0;

export function loadStickerCommands() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const { mtimeMs } = fs.statSync(FILE);
    if (!cache || mtimeMs !== cacheMtime) {
      cache = JSON.parse(fs.readFileSync(FILE, "utf-8") || "{}");
      cacheMtime = mtimeMs;
    }
    return cache || {};
  } catch {
    return {};
  }
}

/** Invalida la caché (lo llaman `.addco` y `.delco` tras escribir). */
export function invalidateStickerCommands() {
  cache = null;
  cacheMtime = 0;
}

/**
 * Si el mensaje es un sticker asociado a un comando, devuelve el texto del
 * comando ya listo para ejecutarse (con prefijo). Si no, devuelve `null`.
 */
export function resolveStickerCommand(m) {
  try {
    const node = m?.message?.stickerMessage;
    if (!node?.fileSha256) return null;

    const mapa = loadStickerCommands();
    if (!Object.keys(mapa).length) return null;

    const huella = Buffer.isBuffer(node.fileSha256)
      ? node.fileSha256.toString("base64")
      : String(node.fileSha256);

    const comando = mapa[huella];
    if (!comando) return null;

    const prefijo = global.prefixes?.[0] || ".";
    const texto = String(comando).trim();

    // El comando puede guardarse con o sin prefijo.
    return texto.startsWith(prefijo) ? texto : `${prefijo}${texto}`;
  } catch {
    return null;
  }
}

/**
 * Inyecta el comando en el mensaje, igual que hacía el bot de WhatsApp:
 * se reescribe el contenido como si el usuario lo hubiera tecleado, de modo
 * que el despachador y todos los filtros lo traten con normalidad.
 *
 * @returns {string|null} el texto inyectado, o `null` si no aplicaba
 */
export function applyStickerCommand(m) {
  const texto = resolveStickerCommand(m);
  if (!texto) return null;

  const contextInfo = m.message.stickerMessage.contextInfo || {};
  m.message = {
    ...m.message,
    extendedTextMessage: { text: texto, contextInfo }
  };
  // Se conserva el sticker original por si algún plugin lo necesita.
  m._stickerCommand = texto;

  return texto;
}

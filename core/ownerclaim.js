/**
 * ownerclaim.js — Reclamar la propiedad del bot desde Discord.
 *
 * Al arrancar, el bot genera un código aleatorio y lo muestra en la consola
 * del panel. Quien tenga acceso a esa consola —es decir, el dueño real del
 * servidor— puede escribir en Discord:
 *
 *     .soyowner <código>
 *
 * y queda registrado como propietario en `owner.json`, sin tener que editar
 * ficheros ni averiguar su ID de usuario.
 *
 * Seguridad: el código se genera de nuevo en cada arranque, caduca al usarse
 * y sólo es visible para quien puede ver la consola del servidor.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import chalk from "chalk";
import { digits } from "./ids.js";

const OWNER_PATH = path.resolve("./owner.json");

// Sin caracteres ambiguos (0/O, 1/I/L) para que se copie bien a mano.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

let currentCode = null;
let claimedBy = [];

/** Genera un código nuevo de 8 caracteres. */
export function generateCode() {
  const bytes = crypto.randomBytes(8);
  currentCode = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return currentCode;
}

export const getCode = () => currentCode;

/** Lee la lista de propietarios conservando el formato original. */
function readOwners() {
  try {
    if (!fs.existsSync(OWNER_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(OWNER_PATH, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Guarda la lista de propietarios en el mismo formato de siempre. */
function writeOwners(owners) {
  fs.writeFileSync(OWNER_PATH, JSON.stringify(owners, null, 2));
}

/** ¿Este ID ya es propietario? */
export function isAlreadyOwner(userId) {
  const id = digits(userId);
  return readOwners().some((entry) => digits(Array.isArray(entry) ? entry[0] : entry) === id);
}

/**
 * Comprueba el código y, si es correcto, registra al usuario como owner.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function claimOwner(userId, code, userTag = "") {
  const id = digits(userId);
  if (!id) return { ok: false, reason: "invalid-user" };

  if (!currentCode) return { ok: false, reason: "no-code" };

  // Comparación en tiempo constante para no filtrar el código carácter a
  // carácter mediante los tiempos de respuesta.
  const given = String(code || "").trim().toUpperCase();
  const expected = currentCode.toUpperCase();
  if (given.length !== expected.length) return { ok: false, reason: "bad-code" };

  const equal = crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!equal) return { ok: false, reason: "bad-code" };

  if (isAlreadyOwner(id)) return { ok: false, reason: "already-owner" };

  // Registrar y recargar en memoria.
  const owners = readOwners();
  owners.unshift([id]);
  writeOwners(owners);
  global.owner = owners;

  claimedBy.push({ id, tag: userTag, at: new Date() });

  console.log(chalk.green(
    `\n  👑 Nuevo propietario registrado: ${userTag || id} (${id})`
  ));

  // El código se consume: se genera uno nuevo para el siguiente reclamo.
  const nuevo = generateCode();
  console.log(chalk.gray(`  🔄 Código nuevo para el siguiente owner: `) + chalk.bold.magenta(nuevo) + "\n");

  return { ok: true };
}

/** Texto del panel que se muestra en la consola al conectar. */
export function claimPanelLines(prefix = ".") {
  return [
    chalk.white("¿Aún no eres propietario del bot?"),
    "",
    chalk.white("Escribe esto en cualquier canal de Discord:"),
    "",
    "   " + chalk.bgMagenta.white.bold(` ${prefix}soyowner ${currentCode} `),
    "",
    chalk.gray("Te registrará como owner al instante."),
    chalk.gray("El código cambia cada vez que reinicias el bot.")
  ];
}

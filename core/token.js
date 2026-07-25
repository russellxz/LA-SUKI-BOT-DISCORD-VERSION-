/**
 * token.js — Obtención del token del bot.
 *
 * Reglas de oro:
 *   1. NUNCA terminar el proceso con código de error por falta de token.
 *      Pterodactyl interpreta la salida ≠ 0 como caída y reinicia el
 *      servidor en bucle, que es justo lo que hay que evitar.
 *   2. Si no hay token, pedirlo por la consola y esperar. El panel envía
 *      lo que escribes en la caja de comandos a la entrada estándar,
 *      así que el token se puede pegar ahí directamente.
 *   3. Una vez recibido, se guarda en `.env` para los siguientes arranques.
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import chalk from "chalk";
import { box, rule } from "./ui.js";

const ENV_PATH = path.resolve("./.env");

/** Lee el token guardado en `.env` (sin depender de que dotenv ya cargara). */
function readFromEnvFile() {
  try {
    if (!fs.existsSync(ENV_PATH)) return "";
    const line = fs.readFileSync(ENV_PATH, "utf-8")
      .split("\n")
      .find((l) => l.trim().startsWith("DISCORD_TOKEN="));
    if (!line) return "";
    return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

/** Guarda o actualiza DISCORD_TOKEN dentro de `.env`. */
export function saveToken(token) {
  try {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
    if (/^DISCORD_TOKEN=.*$/m.test(content)) {
      content = content.replace(/^DISCORD_TOKEN=.*$/m, `DISCORD_TOKEN=${token}`);
    } else {
      content = `${content.trimEnd()}\nDISCORD_TOKEN=${token}\n`.trimStart();
    }
    fs.writeFileSync(ENV_PATH, content);
    return true;
  } catch (e) {
    console.log(chalk.yellow(`⚠️  No se pudo guardar el token en .env: ${e.message}`));
    return false;
  }
}

/**
 * Comprobación de forma, no de validez: un token de bot son tres bloques
 * separados por puntos. Sirve para avisar de pegados incompletos.
 */
export function looksLikeToken(value) {
  const t = String(value || "").trim();
  return t.length > 40 && t.split(".").length === 3;
}

/** Instrucciones que se muestran cuando falta el token. */
function showInstructions() {
  box("FALTA EL TOKEN DEL BOT", [
    chalk.white("Consíguelo en 3 pasos:"),
    "",
    chalk.cyan("  1.") + chalk.white(" Entra en ") + chalk.underline("https://discord.com/developers/applications"),
    chalk.cyan("  2.") + chalk.white(" Tu aplicación → pestaña ") + chalk.bold("Bot") + chalk.white(" → ") + chalk.bold("Reset Token"),
    chalk.cyan("  3.") + chalk.white(" Copia el token y pégalo aquí abajo 👇"),
    "",
    chalk.magenta.bold("  ✍️  Escribe o pega el token en la consola y pulsa Enter."),
    "",
    chalk.gray("  También puedes ponerlo en la pestaña «Startup» del panel"),
    chalk.gray("  (variable DISCORD_TOKEN) o en el archivo .env")
  ], chalk.red);
}

/**
 * Devuelve un token válido. Si no lo hay, lo pide por consola y espera
 * indefinidamente sin cerrar el proceso.
 *
 * @returns {Promise<string>}
 */
export async function resolveToken() {
  const fromEnv = (process.env.DISCORD_TOKEN || "").trim();
  if (fromEnv) return fromEnv;

  const fromFile = readFromEnvFile();
  if (fromFile) return fromFile;

  showInstructions();

  return await promptToken();
}

/** Pide el token por la entrada estándar (la consola del panel). */
export function promptToken() {
  return new Promise((resolve) => {
    // Mantiene vivo el bucle de eventos mientras esperamos. Sin esto, si la
    // entrada estándar se cierra el proceso terminaría solo y el panel
    // marcaría el servidor como apagado.
    const keepAlive = setInterval(() => {}, 60000);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    const ask = () => {
      process.stdout.write(chalk.magenta("\n  🔑 TOKEN › "));
    };

    ask();

    rl.on("line", (line) => {
      const token = String(line || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        // Por si pegan la línea entera del .env
        .replace(/^DISCORD_TOKEN\s*=\s*/i, "")
        // Discord antepone "Bot " en algunos ejemplos de la documentación
        .replace(/^Bot\s+/i, "");

      if (!token) { ask(); return; }

      if (!looksLikeToken(token)) {
        console.log(chalk.yellow(
          "\n  ⚠️  Eso no parece un token válido.\n" +
          "     Un token tiene tres partes separadas por puntos, así:\n" +
          chalk.gray("     MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.fGhIjKlMnOpQrStUvWxYz\n")
        ));
        ask();
        return;
      }

      rl.close();
      clearInterval(keepAlive);
      saveToken(token);
      console.log(chalk.green("\n  ✅ Token recibido y guardado en .env\n"));
      rule();
      resolve(token);
    });

    // Si se cierra la entrada (consola sin stdin), seguimos vivos:
    // salir aquí provocaría el bucle de reinicios del panel.
    rl.on("close", () => {});
  });
}

/**
 * Se llama cuando Discord rechaza el token. Borra el guardado y vuelve a
 * pedirlo, en lugar de cerrar el proceso.
 */
export async function retryAfterInvalidToken(reason) {
  box("EL TOKEN NO ES VÁLIDO", [
    chalk.white(reason || "Discord ha rechazado el token."),
    "",
    chalk.white("Puede deberse a:"),
    chalk.gray("  · Lo copiaste incompleto o con espacios de más"),
    chalk.gray("  · Pulsaste «Reset Token» después de copiarlo"),
    chalk.gray("  · Es el ID de la aplicación o el client secret, no el token"),
    "",
    chalk.magenta.bold("  ✍️  Pega el token correcto aquí abajo 👇")
  ], chalk.red);

  return await promptToken();
}

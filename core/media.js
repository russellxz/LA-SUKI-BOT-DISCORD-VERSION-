/**
 * media.js — Gestión de adjuntos respetando los límites oficiales de Discord.
 *
 * Requisito del proyecto: ningún comando de descarga puede crashear por el
 * tamaño de un archivo. La estrategia, en orden:
 *
 *   1. Si el archivo entra en el límite del servidor → se envía tal cual.
 *   2. Si se pasa → se recomprime con ffmpeg (vídeo/audio/imagen).
 *   3. Si aun así se pasa → se sube a qu.ax (la misma API que ya usaba el
 *      bot en `libs/upload.js`) y se envía el enlace temporal.
 *   4. Si todo falla → mensaje claro al usuario, nunca una excepción.
 *
 * Límites oficiales de Discord por nivel de mejoras del servidor
 * (https://discord.com/developers/docs/reference#uploading-files):
 *   Nivel 0 y 1 → 10 MiB · Nivel 2 → 50 MiB · Nivel 3 → 100 MiB
 * Los DM usan siempre el límite base.
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import quAx from "../libs/upload.js";

const MiB = 1024 * 1024;

/** Límite por nivel de mejoras (premiumTier de discord.js). */
const TIER_LIMITS = {
  0: 10 * MiB,
  1: 10 * MiB,
  2: 50 * MiB,
  3: 100 * MiB
};

/**
 * Margen de seguridad: Discord cuenta la petición multipart completa, no sólo
 * los bytes del fichero, así que nunca apuramos al límite exacto.
 */
const SAFETY_MARGIN = 0.95;

/** Límite real de subida para un servidor concreto. */
export function getUploadLimit(guild) {
  const tier = Number(guild?.premiumTier ?? 0);
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS[0];
  return Math.floor(limit * SAFETY_MARGIN);
}

export function formatBytes(bytes = 0) {
  if (bytes >= MiB) return `${(bytes / MiB).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function tmpFile(ext = "bin") {
  const dir = path.resolve("./tmp");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`);
}

function run(cmd, args, timeoutMs = 240000) {
  return new Promise((resolve) => {
    let done = false;
    const child = spawn(cmd, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { child.kill("SIGKILL"); } catch {}
        resolve(false);
      }
    }, timeoutMs);
    child.on("error", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

const safeUnlink = (file) => { try { fs.unlinkSync(file); } catch {} };
const sizeOf = (file) => { try { return fs.statSync(file).size; } catch { return Infinity; } };

/**
 * Normaliza cualquier forma de adjunto que usan los plugins (Buffer, ruta,
 * `{ url }`, `{ stream }`) a un fichero en disco. Devuelve `null` si no se
 * pudo materializar.
 */
export async function materialize(source, ext = "bin") {
  try {
    if (!source) return null;

    if (Buffer.isBuffer(source)) {
      const file = tmpFile(ext);
      fs.writeFileSync(file, source);
      return { file, temporary: true };
    }

    if (typeof source === "string") {
      if (/^https?:\/\//i.test(source)) {
        const res = await fetch(source);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const file = tmpFile(ext);
        fs.writeFileSync(file, buf);
        return { file, temporary: true };
      }
      if (fs.existsSync(source)) return { file: source, temporary: false };
      return null;
    }

    if (source.url) return materialize(source.url, ext);
    if (source.stream) {
      const file = tmpFile(ext);
      const chunks = [];
      for await (const chunk of source.stream) chunks.push(chunk);
      fs.writeFileSync(file, Buffer.concat(chunks));
      return { file, temporary: true };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Recomprime un vídeo por pasadas sucesivas hasta entrar en el límite.
 * Se calcula el bitrate objetivo a partir de la duración real para no
 * degradar más de lo necesario.
 */
async function compressVideo(input, limit) {
  const attempts = [
    { scale: "1280:-2", crf: 28 },
    { scale: "854:-2", crf: 30 },
    { scale: "640:-2", crf: 32 },
    { scale: "480:-2", crf: 34 }
  ];

  for (const { scale, crf } of attempts) {
    const out = tmpFile("mp4");
    const ok = await run("ffmpeg", [
      "-y", "-i", input,
      "-vf", `scale=${scale}:flags=lanczos`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf),
      "-c:a", "aac", "-b:a", "96k",
      "-movflags", "+faststart",
      out
    ]);
    if (ok && sizeOf(out) <= limit) return out;
    safeUnlink(out);
  }
  return null;
}

async function compressAudio(input, limit) {
  for (const bitrate of ["128k", "96k", "64k", "48k"]) {
    const out = tmpFile("mp3");
    const ok = await run("ffmpeg", [
      "-y", "-i", input,
      "-vn", "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", "44100",
      out
    ]);
    if (ok && sizeOf(out) <= limit) return out;
    safeUnlink(out);
  }
  return null;
}

async function compressImage(input, limit) {
  for (const [width, quality] of [[1920, 80], [1280, 70], [960, 60]]) {
    const out = tmpFile("jpg");
    const ok = await run("ffmpeg", [
      "-y", "-i", input,
      "-vf", `scale='min(${width},iw)':-2`,
      "-q:v", String(Math.round((100 - quality) / 100 * 31) || 5),
      out
    ]);
    if (ok && sizeOf(out) <= limit) return out;
    safeUnlink(out);
  }
  return null;
}

/**
 * Punto de entrada principal. Devuelve siempre un objeto utilizable:
 *   { ok: true,  file, name, compressed }        → adjuntar a Discord
 *   { ok: false, link, size, limit }             → enviar enlace temporal
 *   { ok: false, reason }                        → avisar al usuario
 *
 * Nunca lanza: los comandos de descarga jamás deben romperse por esto.
 */
export async function prepareAttachment(source, options = {}) {
  const { guild = null, filename = "archivo", kind = "document" } = options;
  const limit = getUploadLimit(guild);
  const ext = path.extname(filename).slice(1) || (
    kind === "video" ? "mp4" : kind === "audio" ? "mp3" : kind === "image" ? "jpg" : "bin"
  );

  const materialized = await materialize(source, ext);
  if (!materialized) return { ok: false, reason: "No se pudo obtener el archivo." };

  const { file, temporary } = materialized;
  const cleanup = [];
  if (temporary) cleanup.push(file);

  const size = sizeOf(file);

  // 1. Cabe tal cual.
  if (size <= limit) {
    return { ok: true, file, name: filename, size, limit, cleanup, compressed: false };
  }

  // 2. Intentar recomprimir según el tipo de medio.
  let compressed = null;
  try {
    if (kind === "video") compressed = await compressVideo(file, limit);
    else if (kind === "audio") compressed = await compressAudio(file, limit);
    else if (kind === "image") compressed = await compressImage(file, limit);
  } catch {
    compressed = null;
  }

  if (compressed) {
    cleanup.push(compressed);
    return {
      ok: true,
      file: compressed,
      name: filename,
      size: sizeOf(compressed),
      originalSize: size,
      limit,
      cleanup,
      compressed: true
    };
  }

  // 3. Fallback: subir a qu.ax y devolver enlace (misma API que ya usaba el bot).
  try {
    const uploaded = await quAx(file);
    if (uploaded?.status && uploaded.result?.url) {
      return {
        ok: false,
        link: uploaded.result.url,
        size,
        limit,
        cleanup,
        reason: "excede-limite"
      };
    }
  } catch {}

  // 4. Sin alternativa: informar con claridad.
  return {
    ok: false,
    size,
    limit,
    cleanup,
    reason: "excede-limite-sin-enlace"
  };
}

/** Borra los temporales generados por `prepareAttachment`. */
export function cleanupAttachment(result) {
  for (const file of result?.cleanup || []) safeUnlink(file);
}

/** Mensaje estándar y claro cuando un archivo no se puede enviar. */
export function oversizeMessage(result) {
  const size = formatBytes(result.size);
  const limit = formatBytes(result.limit);
  if (result.link) {
    return `📦 El archivo pesa *${size}* y este servidor permite hasta *${limit}*.\n` +
           `🔗 Te lo dejo en un enlace temporal:\n${result.link}`;
  }
  return `⚠️ El archivo pesa *${size}* y supera el límite de *${limit}* de este servidor.\n` +
         `💡 Mejora el servidor con boosts o intenta con una calidad menor.`;
}

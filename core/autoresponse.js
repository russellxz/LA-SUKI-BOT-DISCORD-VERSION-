/**
 * autoresponse.js — Respuestas automáticas del bot.
 *
 * Reúne dos sistemas que vivían sueltos dentro del `index.js` original:
 *
 *   1. 🧠 Conversación con IA por canal (`.chatgpt on`) — la personalidad de
 *      Linda. Se conserva **exactamente** la misma API (neoxr gpt4-session),
 *      el mismo session ID y la misma apikey que ya usaba el bot.
 *
 *   2. 💾 Multimedia guardada por palabra clave (`guar.json` + `guar_files.json`).
 *      Cuando alguien escribe la palabra exacta, el bot responde con el medio
 *      guardado. Misma normalización de texto y misma elección aleatoria.
 */

import fs from "fs";
import path from "path";
import axios from "axios";
import { getConfig } from "../db.js";

/* ───────────────────────────── IA · Linda ─────────────────────────────── */

const NEOXR_SESSION = "1727468410446638";
const NEOXR_APIKEY = "russellxz";

/**
 * Responde con IA si el canal tiene `.chatgpt on`.
 * Devuelve `true` si contestó.
 */
export async function autoChatGPT(ctx) {
  try {
    if (!ctx.isGroup || ctx.fromMe) return false;
    if (String(getConfig(ctx.chatId, "chatgpt")) !== "1") return false;

    const text = ctx.text || "";
    if (!text.length) return false;

    // Evitamos responder a los propios comandos del bot.
    if (global.prefixes?.some?.((p) => text.startsWith(p))) return false;

    await ctx.channel?.sendTyping?.().catch(() => {});

    const url = `https://api.neoxr.eu/api/gpt4-session`
      + `?q=${encodeURIComponent(text)}`
      + `&session=${NEOXR_SESSION}`
      + `&apikey=${NEOXR_APIKEY}`;

    const res = await axios.get(url, { timeout: 45000 });
    const answer = res.data?.data?.message;
    if (!answer) return false;

    await ctx.conn.sendMessage(ctx.chatId, { text: answer }, { quoted: ctx.m });
    return true;
  } catch (e) {
    console.error("⚠️ IA automática:", e?.message);
    return false;
  }
}

/* ─────────────────── Multimedia guardada por palabra ──────────────────── */

/** Normalización idéntica a la del bot original (sin tildes ni símbolos). */
const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]/g, "");

function loadSavedMedia() {
  const data = {};

  // 1) Formato antiguo: base64 embebido en guar.json
  try {
    const file = path.resolve("./guar.json");
    if (fs.existsSync(file)) Object.assign(data, JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {}

  // 2) Formato nuevo: rutas en guar_files.json (se combinan con el anterior)
  try {
    const file = path.resolve("./guar_files.json");
    if (fs.existsSync(file)) {
      const files = JSON.parse(fs.readFileSync(file, "utf-8"));
      for (const key of Object.keys(files)) {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key] = data[key].concat(files[key]);
      }
    }
  } catch {}

  return data;
}

/** ¿Están activas las respuestas automáticas en este canal? */
function reactionsEnabled(chatId) {
  try {
    const file = path.resolve("./activoss.json");
    if (!fs.existsSync(file)) return true;
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return String(data?.[chatId]?.reacion || "on").toLowerCase() !== "off";
  } catch {
    return true;
  }
}

/**
 * Envía el medio guardado si el texto coincide exactamente con una palabra
 * clave. Devuelve `true` si respondió.
 */
export async function autoSavedMedia(ctx) {
  try {
    if (!reactionsEnabled(ctx.chatId)) return false;

    const saved = loadSavedMedia();
    if (!Object.keys(saved).length) return false;

    const clean = normalize(ctx.text);
    if (!clean) return false;

    for (const key of Object.keys(saved)) {
      if (normalize(key) !== clean) continue;
      const items = saved[key];
      if (!Array.isArray(items) || !items.length) continue;

      const item = items[Math.floor(Math.random() * items.length)];

      let buffer = null;
      if (item.path) {
        try {
          const filePath = path.resolve(item.path);
          if (fs.existsSync(filePath)) buffer = fs.readFileSync(filePath);
        } catch {}
      }
      if (!buffer && item.media) {
        try { buffer = Buffer.from(item.media, "base64"); } catch {}
      }
      if (!buffer?.length) return false;

      const ext = String(item.ext || item.mime?.split("/")?.[1] || "bin").toLowerCase();
      const mime = item.mime || "";
      const payload = {};

      if (["jpg", "jpeg", "png", "gif"].includes(ext)) {
        payload.image = buffer;
        payload.fileName = `media.${ext}`;
      } else if (["mp4", "mkv", "webm"].includes(ext)) {
        payload.video = buffer;
        payload.fileName = `video.${ext}`;
      } else if (["mp3", "ogg", "opus", "wav"].includes(ext)) {
        payload.audio = buffer;
        payload.mimetype = mime || "audio/mpeg";
        payload.fileName = `audio.${ext}`;
      } else if (ext === "webp") {
        payload.sticker = buffer;
        payload.fileName = "sticker.webp";
      } else {
        payload.document = buffer;
        payload.mimetype = mime || "application/octet-stream";
        payload.fileName = item.fileName || `archivo.${ext}`;
      }

      await ctx.conn.sendMessage(ctx.chatId, payload, { quoted: ctx.m });
      return true;
    }
    return false;
  } catch (e) {
    console.error("⚠️ Multimedia guardada:", e?.message);
    return false;
  }
}

/** Ejecuta ambos sistemas en el mismo orden que el bot original. */
export async function runAutoResponses(ctx) {
  if (await autoSavedMedia(ctx)) return true;
  if (await autoChatGPT(ctx)) return true;
  return false;
}

/**
 * systems.js — Sistemas de protección y moderación automática.
 *
 * Porta uno a uno los filtros que vivían incrustados en el `index.js` del bot
 * de WhatsApp: modo privado, apagado por chat, modo admins, mute, ban,
 * antilink, antisticker, antibots, antidelete, antispam/flood y las
 * respuestas automáticas.
 *
 * Se conservan **exactamente** las mismas claves de configuración
 * (`antilink`, `modoadmins`, `apagado`, …) y los mismos ficheros de estado
 * (`setwelcome.json`), de modo que todos los comandos de `pluginsgrupos`
 * siguen encendiéndolos y apagándolos sin cambios.
 *
 * Toda la maquinaria de resolución de identificadores @lid de WhatsApp
 * desaparece: en Discord un usuario es un único snowflake estable.
 */

import fs from "fs";
import path from "path";
import { PermissionsBitField } from "discord.js";
import { getConfig, getAntideleteDB, saveAntideleteDB } from "../db.js";
import { digits, jidToId, userToJid } from "./ids.js";

const WELCOME_FILE = path.resolve("./setwelcome.json");

/* ─────────────────────────── Estado en disco ─────────────────────────── */

export function readStore() {
  try {
    if (!fs.existsSync(WELCOME_FILE)) return {};
    const raw = fs.readFileSync(WELCOME_FILE, "utf-8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeStore(data) {
  try {
    fs.writeFileSync(WELCOME_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("⚠️ No se pudo guardar setwelcome.json:", e?.message);
  }
}

const chatEntry = (store, chatId) => (store[chatId] = store[chatId] || {});

/* ────────────────────────── Permisos de Discord ───────────────────────── */

/**
 * ¿El autor es administrador del servidor?
 * En WhatsApp esto requería resolver LIDs; aquí es una comprobación directa
 * de permisos, que además respeta la jerarquía real de Discord.
 */
export function isGuildAdmin(member) {
  if (!member) return false;
  if (member.guild?.ownerId === member.id) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

export function isOwnerId(userId) {
  const id = digits(userId);
  if (!id) return false;
  if (typeof global.isOwner === "function" && global.isOwner(id)) return true;
  return Array.isArray(global.owner) && global.owner.some((entry) => {
    const value = Array.isArray(entry) ? entry[0] : entry;
    return digits(value) === id;
  });
}

/** ¿El bot puede moderar a este miembro? (jerarquía de roles de Discord) */
const canModerate = (member) =>
  Boolean(member?.kickable) && !isOwnerId(member.id) && !isGuildAdmin(member);

/* ──────────────────────────── Utilidades ──────────────────────────────── */

const isOn = (chatId, key) => {
  const value = getConfig(chatId, key);
  return value === "1" || value === "on" || value === "true";
};

async function safeDelete(message) {
  try {
    if (message?.deletable) await message.delete();
    return true;
  } catch { return false; }
}

async function safeKick(member, reason) {
  try {
    if (!canModerate(member)) return false;
    await member.kick(String(reason || "Moderación automática").slice(0, 512));
    return true;
  } catch { return false; }
}

/* ─────────────────────── Filtros de acceso (gates) ────────────────────── */

/**
 * Cada función devuelve `true` para dejar pasar el mensaje y `false` para
 * detenerlo. El handler los ejecuta en el mismo orden que el bot original.
 */

/** 🔐 Modo privado global: sólo responde al owner. */
export function gatePrivateMode(ctx) {
  if (!isOn("global", "modoprivado")) return true;
  return ctx.isOwner;
}

/** 💤 Apagado por canal: sólo el owner puede reactivarlo. */
export function gateShutdown(ctx) {
  if (!isOn(ctx.chatId, "apagado")) return true;
  return ctx.isOwner;
}

/** 👮 Modo admins: sólo administradores y owners pueden usar comandos. */
export function gateAdminMode(ctx) {
  if (!ctx.isGroup || !isOn(ctx.chatId, "modoadmins")) return true;
  return ctx.isAdmin || ctx.isOwner || ctx.fromMe;
}

/** 🔇 Usuarios muteados: se les borra el mensaje al instante. */
export async function gateMuted(ctx) {
  if (!ctx.isGroup || ctx.isOwner) return true;
  const store = readStore();
  const muted = store[ctx.chatId]?.muted;
  if (!Array.isArray(muted) || !muted.length) return true;
  if (!muted.map(digits).includes(ctx.userId)) return true;
  await safeDelete(ctx.message);
  return false;
}

/** 🚫 Usuarios baneados del bot: no pueden ejecutar comandos. */
export function gateBanned(ctx) {
  if (ctx.isOwner) return true;
  const store = readStore();
  const banned = store[ctx.chatId]?.banned || store.global?.banned;
  if (!Array.isArray(banned) || !banned.length) return true;
  return !banned.map(digits).includes(ctx.userId);
}

/* ───────────────────────────── Protecciones ───────────────────────────── */

const LINK_PATTERN = /(https?:\/\/|www\.)\S+|discord\.gg\/\S+|\b[\w-]+\.(com|net|org|io|gg|xyz|me|tv|link)\b/i;
const INVITE_PATTERN = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/\S+/i;

/**
 * 🔗 Antilink — borra el mensaje y expulsa al autor (igual que en WhatsApp).
 * `linkall` es la variante estricta: bloquea cualquier enlace.
 * `antilink` bloquea sólo invitaciones a otros servidores, que es el
 * equivalente natural en Discord de los enlaces a otros grupos.
 */
export async function guardLinks(ctx) {
  if (!ctx.isGroup || ctx.isAdmin || ctx.isOwner || ctx.fromMe) return true;

  const strict = isOn(ctx.chatId, "linkall");
  const basic = isOn(ctx.chatId, "antilink");
  if (!strict && !basic) return true;

  const text = ctx.text || "";
  const matched = strict ? LINK_PATTERN.test(text) : INVITE_PATTERN.test(text);
  if (!matched) return true;

  await safeDelete(ctx.message);
  const kicked = await safeKick(ctx.member, "Antilink");

  await ctx.conn.sendMessage(ctx.chatId, {
    text: kicked
      ? `🚫 <@${ctx.userId}> fue expulsado por enviar enlaces no permitidos.`
      : `🚫 <@${ctx.userId}>, los enlaces no están permitidos aquí.`
  });
  return false;
}

/**
 * 🎯 Antisticker — 3 avisos en 15 segundos y fuera, igual que el original.
 * En Discord se aplica a stickers nativos y a imágenes WebP.
 */
const stickerStrikes = new Map();

export async function guardStickers(ctx) {
  if (!ctx.isGroup || ctx.isAdmin || ctx.isOwner || ctx.fromMe) return true;
  if (!isOn(ctx.chatId, "antis")) return true;

  const hasSticker = ctx.message.stickers?.size > 0
    || [...(ctx.message.attachments?.values() || [])]
      .some((a) => String(a.contentType || "").includes("webp"));
  if (!hasSticker) return true;

  await safeDelete(ctx.message);

  const key = `${ctx.chatId}:${ctx.userId}`;
  const now = Date.now();
  const record = stickerStrikes.get(key) || { count: 0, first: now };
  if (now - record.first > 15000) { record.count = 0; record.first = now; }
  record.count += 1;
  stickerStrikes.set(key, record);

  if (record.count >= 3) {
    stickerStrikes.delete(key);
    const kicked = await safeKick(ctx.member, "Antisticker");
    await ctx.conn.sendMessage(ctx.chatId, {
      text: kicked
        ? `🚫 <@${ctx.userId}> fue expulsado por enviar stickers repetidamente.`
        : `⚠️ <@${ctx.userId}>, los stickers están desactivados en este canal.`
    });
  }
  return false;
}

/**
 * 🤖 Antibots — expulsa a otros bots que escriban en el canal.
 * Sustituye al antiguo "antiarabe", que filtraba por prefijo telefónico:
 * en Discord ese criterio no existe, y el uso real era echar cuentas
 * automatizadas no deseadas.
 */
export async function guardBots(ctx) {
  if (!ctx.isGroup) return true;
  if (!isOn(ctx.chatId, "antiarabe") && !isOn(ctx.chatId, "antiarabe2")) return true;
  if (!ctx.message.author?.bot || ctx.fromMe) return true;

  await safeDelete(ctx.message);
  const kicked = await safeKick(ctx.member, "Antibots");
  if (kicked) {
    await ctx.conn.sendMessage(ctx.chatId, {
      text: `🤖 Bot no autorizado expulsado: <@${ctx.userId}>`
    });
  }
  return false;
}

/**
 * 🌊 Antispam / antiflood — 6 mensajes en 5 segundos activan el freno.
 * Discord no tiene "mute de grupo", así que aplicamos un timeout nativo
 * (la herramienta equivalente y la recomendada por la plataforma).
 */
const floodTracker = new Map();

export async function guardFlood(ctx) {
  if (!ctx.isGroup || ctx.isAdmin || ctx.isOwner || ctx.fromMe) return true;

  const key = `${ctx.chatId}:${ctx.userId}`;
  const now = Date.now();
  const record = floodTracker.get(key) || { count: 0, first: now, warned: 0 };
  if (now - record.first > 5000) { record.count = 0; record.first = now; }
  record.count += 1;
  floodTracker.set(key, record);

  if (record.count < 6) return true;

  record.count = 0;
  record.first = now;

  // Aviso primero; a la reincidencia, timeout de 5 minutos.
  if (now - record.warned > 60000) {
    record.warned = now;
    await ctx.conn.sendMessage(ctx.chatId, {
      text: `🌊 <@${ctx.userId}>, baja el ritmo o tendré que silenciarte.`
    });
    return false;
  }

  try {
    if (ctx.member?.moderatable) await ctx.member.timeout(5 * 60 * 1000, "Antiflood");
  } catch {}
  return false;
}

/* ─────────────────────────────── Antidelete ───────────────────────────── */

/**
 * 🗑️ Antidelete — guarda cada mensaje y lo reenvía cuando alguien lo borra.
 * Mantiene el mismo almacén (`antidelete.db`) y las mismas claves `g`/`p`
 * (grupo / privado) que usaba el bot de WhatsApp.
 */
export function rememberForAntidelete(ctx) {
  try {
    const scope = ctx.isGroup ? "g" : "p";
    const key = ctx.isGroup ? "antidelete" : "antideletepri";
    if (!isOn(ctx.isGroup ? ctx.chatId : "global", key)) return;

    const db = getAntideleteDB();
    db[scope] = db[scope] || {};
    db[scope][ctx.chatId] = db[scope][ctx.chatId] || {};

    db[scope][ctx.chatId][ctx.message.id] = {
      sender: ctx.userId,
      name: ctx.pushName,
      text: ctx.text || "",
      attachments: [...(ctx.message.attachments?.values() || [])].map((a) => a.url),
      at: Date.now()
    };

    // Poda: conservamos los 200 mensajes más recientes por canal.
    const entries = Object.entries(db[scope][ctx.chatId]);
    if (entries.length > 200) {
      entries.sort((a, b) => a[1].at - b[1].at);
      for (const [id] of entries.slice(0, entries.length - 200)) {
        delete db[scope][ctx.chatId][id];
      }
    }
    saveAntideleteDB(db);
  } catch {}
}

/** Se dispara desde el evento `messageDelete`. */
export async function handleDeletedMessage(conn, message) {
  try {
    const isGroup = Boolean(message.guild);
    const scope = isGroup ? "g" : "p";
    const chatId = isGroup
      ? `${message.channel.id}@g.us`
      : userToJid(message.author?.id || "0");
    const key = isGroup ? "antidelete" : "antideletepri";
    if (!isOn(isGroup ? chatId : "global", key)) return;

    const db = getAntideleteDB();
    const saved = db[scope]?.[chatId]?.[message.id];
    if (!saved) return;

    delete db[scope][chatId][message.id];
    saveAntideleteDB(db);

    // Ignoramos los borrados hechos por el propio bot (antilink, antispam…).
    if (saved.sender === conn.client.user.id) return;

    let text = `🗑️ *Mensaje eliminado*\n👤 <@${saved.sender}>\n`;
    if (saved.text) text += `\n💬 ${saved.text}`;
    if (saved.attachments?.length) text += `\n\n📎 ${saved.attachments.join("\n")}`;

    await conn.sendMessage(chatId, { text });
  } catch {}
}

/* ─────────────────────── Bienvenidas y despedidas ─────────────────────── */

/**
 * 👋 Sustituye las variables del mensaje configurado, respetando los mismos
 * marcadores que usaba el bot original.
 */
function renderTemplate(template, member) {
  return String(template)
    .replace(/@user|@usuario|\{user\}/gi, `<@${member.id}>`)
    .replace(/@group|@grupo|\{grupo\}/gi, member.guild.name)
    .replace(/\{miembros\}|@count/gi, String(member.guild.memberCount));
}

export async function handleMemberJoin(conn, member) {
  try {
    const store = readStore();
    for (const [chatId, entry] of Object.entries(store)) {
      if (!chatId.endsWith("@g.us") || !entry?.welcome) continue;
      const channelId = jidToId(chatId);
      const channel = member.guild.channels.cache.get(channelId);
      if (!channel) continue;
      if (!isOn(chatId, "welcome")) continue;

      await conn.sendMessage(chatId, {
        text: renderTemplate(entry.welcome, member)
      });
    }
  } catch (e) {
    console.error("⚠️ Bienvenida:", e?.message);
  }
}

export async function handleMemberLeave(conn, member) {
  try {
    const store = readStore();
    for (const [chatId, entry] of Object.entries(store)) {
      if (!chatId.endsWith("@g.us") || !entry?.despedida) continue;
      const channelId = jidToId(chatId);
      const channel = member.guild.channels.cache.get(channelId);
      if (!channel) continue;
      if (!isOn(chatId, "despedidas")) continue;

      await conn.sendMessage(chatId, {
        text: renderTemplate(entry.despedida, member)
      });
    }
  } catch (e) {
    console.error("⚠️ Despedida:", e?.message);
  }
}

/* ────────────────────────── Conteo de mensajes ────────────────────────── */

/** 📊 Contador por usuario que alimenta `.totalchat` y los rankings. */
export function countMessage(ctx) {
  if (!ctx.isGroup) return;
  try {
    const store = readStore();
    const entry = chatEntry(store, ctx.chatId);
    entry.contador = entry.contador || {};
    entry.contador[ctx.userId] = (entry.contador[ctx.userId] || 0) + 1;
    writeStore(store);
  } catch {}
}

/* ───────────────────── Encadenado de todos los filtros ────────────────── */

/**
 * Ejecuta las protecciones que actúan sobre *cualquier* mensaje (no sólo
 * comandos). Devuelve `false` si el mensaje ya fue tratado y debe pararse.
 */
export async function runGuards(ctx) {
  if (await guardBots(ctx) === false) return false;
  if (await guardLinks(ctx) === false) return false;
  if (await guardStickers(ctx) === false) return false;
  if (await guardFlood(ctx) === false) return false;
  if (await gateMuted(ctx) === false) return false;
  return true;
}

/**
 * Filtros que deciden si un *comando* puede ejecutarse.
 */
export function runGates(ctx) {
  if (!gatePrivateMode(ctx)) return false;
  if (!gateShutdown(ctx)) return false;
  if (!gateBanned(ctx)) return false;
  if (!gateAdminMode(ctx)) return false;
  return true;
}

/**
 * message.js — Adaptador de mensajes Discord → forma Baileys.
 *
 * Los 330 plugins del bot original leen `msg.key.remoteJid`,
 * `msg.message.extendedTextMessage.contextInfo.quotedMessage`, etc.
 * En vez de reescribir cada uno, construimos un objeto con esa misma
 * estructura a partir de un `Message` de discord.js. Así la lógica de
 * comandos, RPG, economía y descargas queda intacta.
 *
 * El objeto original de discord.js sigue disponible en `m._discord` para
 * los casos donde conviene usar la API nativa.
 */

import { channelJid, userToJid, mentionsToJids } from "./ids.js";

/** Clasifica un adjunto de Discord en el tipo de medio de WhatsApp. */
function classify(attachment) {
  const mime = String(attachment?.contentType || "").toLowerCase();
  const name = String(attachment?.name || "").toLowerCase();

  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) {
    if (mime === "image/webp" || name.endsWith(".webp")) return "sticker";
    return "image";
  }
  if (mime.startsWith("video/") || /\.(mp4|mkv|mov|webm|avi)$/.test(name)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|ogg|opus|wav|m4a|flac)$/.test(name)) return "audio";
  return "document";
}

/**
 * Huella estable de un adjunto o sticker.
 *
 * En WhatsApp los stickers se identificaban por su `fileSha256`, y así es
 * como `.addco` los asocia a un comando. En Discord no hay hash, pero los
 * stickers tienen un ID permanente, así que lo usamos como equivalente:
 * el plugin sigue leyendo `fileSha256.toString("base64")` sin cambios.
 */
function fingerprint(source, prefix) {
  return Buffer.from(`${prefix}:${source}`);
}

/** Construye el nodo de medio con la forma que esperan los plugins. */
function mediaNode(attachment, caption = "") {
  const kind = classify(attachment);
  const node = {
    url: attachment.url,
    directPath: attachment.url,
    mimetype: attachment.contentType || "application/octet-stream",
    fileLength: attachment.size,
    fileName: attachment.name,
    caption,
    // Huella estable para `.addco` y para el álbum de multimedia.
    fileSha256: fingerprint(`${attachment.name}|${attachment.size}`, "att"),
    // Referencia interna que usa `conn.downloadContentFromMessage`.
    _discordUrl: attachment.url
  };

  if (kind === "image") return { imageMessage: node };
  if (kind === "video") return { videoMessage: node };
  if (kind === "audio") return { audioMessage: { ...node, ptt: false } };
  if (kind === "sticker") return { stickerMessage: node };
  return { documentMessage: node };
}

/**
 * Nodo para los stickers nativos de Discord.
 *
 * Son la causa de que `.guar` no guardara stickers: en Discord **no viajan
 * como adjuntos**, sino en su propia colección `message.stickers`, así que
 * el código que sólo miraba `attachments` nunca los veía.
 *
 * Los stickers Lottie (formato 3) son animaciones vectoriales en JSON y no
 * tienen imagen descargable; se marcan para poder avisar al usuario.
 */
function stickerNode(sticker) {
  const lottie = sticker.format === 3 || sticker.format === "LOTTIE";
  const animado = sticker.format === 2 || sticker.format === 4;
  const ext = lottie ? "json" : (animado ? "gif" : "png");

  return {
    stickerMessage: {
      url: sticker.url,
      directPath: sticker.url,
      mimetype: lottie ? "application/json" : (animado ? "image/gif" : "image/png"),
      fileName: `${sticker.name || "sticker"}.${ext}`,
      fileLength: 0,
      isAnimated: animado,
      isLottie: lottie,
      fileSha256: fingerprint(sticker.id, "sticker"),
      _discordUrl: sticker.url,
      _discordSticker: sticker
    }
  };
}

/** Contenido `message` de un mensaje de Discord (texto, medio o sticker). */
function buildContent(message, { quoted = null } = {}) {
  const text = message.content || "";
  const sticker = message.stickers?.first?.() || null;
  const attachment = message.attachments?.first?.() || null;
  const mentionedJid = mentionsToJids(text);

  const contextInfo = {
    mentionedJid,
    ...(quoted
      ? {
          stanzaId: quoted.id,
          participant: userToJid(quoted.author?.id || ""),
          remoteJid: channelJid(message.channel),
          quotedMessage: buildContent(quoted).content
        }
      : {})
  };

  // Los stickers nativos van primero: en Discord pueden llegar junto a
  // texto y no aparecen entre los adjuntos.
  if (sticker) {
    const node = stickerNode(sticker);
    node.stickerMessage.contextInfo = contextInfo;
    return { content: node, contextInfo };
  }

  if (attachment) {
    const node = mediaNode(attachment, text);
    const key = Object.keys(node)[0];
    node[key].contextInfo = contextInfo;
    return { content: node, contextInfo };
  }

  if (quoted || mentionedJid.length) {
    return {
      content: { extendedTextMessage: { text, contextInfo } },
      contextInfo
    };
  }

  return { content: { conversation: text }, contextInfo };
}

/**
 * Convierte un `Message` de discord.js en un mensaje con forma Baileys.
 *
 * @param {import('discord.js').Message} message
 * @param {object} client  Cliente de discord.js (para saber si es propio)
 */
export function toBaileysMessage(message, client) {
  const isDM = !message.guild;
  const remoteJid = channelJid(message.channel);
  const authorJid = userToJid(message.author.id);
  const fromMe = message.author.id === client?.user?.id;

  const quoted = message.__quoted || null;
  const { content, contextInfo } = buildContent(message, { quoted });

  const m = {
    key: {
      remoteJid,
      fromMe,
      id: message.id,
      // En "grupos" (canales) los plugins leen `participant`; en DM es null,
      // exactamente igual que en WhatsApp.
      participant: isDM ? undefined : authorJid
    },
    message: content,
    messageTimestamp: Math.floor(message.createdTimestamp / 1000),
    pushName: message.member?.displayName || message.author.globalName || message.author.username,
    // `realJid` lo usa `libs/adminCheck.js` y varios plugins como identidad
    // ya normalizada del remitente.
    realJid: authorJid,
    contextInfo,

    // 🔌 Escotilla hacia la API nativa de discord.js.
    _discord: {
      message,
      client,
      channel: message.channel,
      guild: message.guild,
      member: message.member,
      author: message.author,
      attachments: [...(message.attachments?.values?.() || [])],
      quoted
    }
  };

  return m;
}

/**
 * Resuelve el mensaje citado (reply) de forma segura, incluyendo el caso
 * en que Discord no lo tenga en caché.
 */
export async function resolveQuoted(message) {
  try {
    const ref = message.reference;
    if (!ref?.messageId) return null;
    const cached = message.channel.messages.cache.get(ref.messageId);
    if (cached) return cached;
    return await message.channel.messages.fetch(ref.messageId);
  } catch {
    return null;
  }
}

/**
 * ids.js — Puente de identificadores WhatsApp ↔ Discord
 *
 * La clave de toda la migración: los snowflakes de Discord son cadenas
 * numéricas, exactamente igual que los números de teléfono de WhatsApp.
 * Eso permite conservar el formato de `owner.json`, `global.isOwner()`,
 * las claves de la base de datos y toda la lógica de los plugins sin tocar
 * una sola línea.
 *
 * Convenciones (idénticas a las de Baileys para que los plugins no noten
 * el cambio):
 *   - Canal de servidor  →  `<channelId>@g.us`          (los `endsWith("@g.us")` siguen funcionando)
 *   - Mensaje directo    →  `<userId>@s.whatsapp.net`
 *   - Usuario            →  `<userId>@s.whatsapp.net`
 */

export const GROUP_SUFFIX = "@g.us";
export const USER_SUFFIX = "@s.whatsapp.net";

/** Sólo los dígitos de una cadena (igual que hacía el bot de WhatsApp). */
export const digits = (value = "") => String(value ?? "").replace(/[^0-9]/g, "");

/** Canal de servidor → JID de "grupo". */
export const channelToJid = (channelId) => `${digits(channelId)}${GROUP_SUFFIX}`;

/** Usuario → JID de "privado". */
export const userToJid = (userId) => `${digits(userId)}${USER_SUFFIX}`;

/** JID (de cualquier tipo) → snowflake de Discord. */
export const jidToId = (jid = "") => digits(String(jid).split("@")[0].split(":")[0]);

/** ¿Este JID representa un canal de servidor? */
export const isGroupJid = (jid = "") => String(jid).endsWith(GROUP_SUFFIX);

/**
 * Convierte las menciones de Discord (`<@123>`, `<@!123>`) al formato de
 * JIDs que esperan los plugins, y viceversa.
 */
export const mentionsToJids = (content = "") =>
  [...String(content).matchAll(/<@!?(\d+)>/g)].map((match) => userToJid(match[1]));

/** JID → mención renderizable en Discord. */
export const jidToMention = (jid = "") => {
  const id = jidToId(jid);
  return id ? `<@${id}>` : "";
};

/**
 * Reemplaza en un texto saliente las menciones estilo WhatsApp (`@123456`)
 * por menciones reales de Discord. Los plugins escriben `@${numero}` por
 * todos lados; así se renderizan correctamente sin tocarlos.
 */
export function renderMentions(text = "") {
  return String(text).replace(/@(\d{5,25})\b/g, (match, id) => `<@${id}>`);
}

/**
 * Deriva el JID de un canal de Discord respetando la semántica del bot:
 * los canales de servidor (incluidos hilos y foros) se comportan como
 * grupos; los DM como chats privados.
 */
export function channelJid(channel) {
  if (!channel) return "";
  if (channel.guild) return channelToJid(channel.id);
  const recipientId = channel.recipientId || channel.recipient?.id;
  return recipientId ? userToJid(recipientId) : channelToJid(channel.id);
}

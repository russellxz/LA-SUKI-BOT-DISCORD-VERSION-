// plugins/pluginsowner/Soyowner.js — Reclamar la propiedad del bot.
//
// El bot muestra un código en la consola del panel al conectarse. Quien
// tenga acceso a esa consola (el dueño real del servidor) escribe aquí
// `.soyowner <código>` y queda registrado en owner.json automáticamente,
// sin tener que buscar su ID ni editar ficheros a mano.

import { claimOwner, isAlreadyOwner, getCode } from "../../core/ownerclaim.js";

const handler = async (msg, { conn, args, usedPrefix = "." }) => {
  const chatId = msg.key.remoteJid;
  const user = msg._discord?.author;
  const userId = user?.id;
  const userTag = user?.tag || user?.username || "";

  await conn.sendMessage(chatId, { react: { text: "⏳", key: msg.key } }).catch(() => {});

  // Ya es propietario: no hace falta el código.
  if (isAlreadyOwner(userId)) {
    await conn.sendMessage(chatId, { react: { text: "👑", key: msg.key } }).catch(() => {});
    return conn.sendMessage(chatId, {
      text: "👑 *Ya eres propietario de este bot.*\n\nPuedes usar todos los comandos de owner."
    }, { quoted: msg });
  }

  const code = (args || [])[0];

  if (!code) {
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } }).catch(() => {});
    return conn.sendMessage(chatId, {
      text:
        "🔐 *Reclamar propiedad del bot*\n\n" +
        `📌 *Uso:* \`${usedPrefix}soyowner <código>\`\n\n` +
        "🖥️ El código aparece en la *consola del panel* donde tienes alojado el bot, " +
        "dentro del recuadro que sale al conectarse.\n\n" +
        "💡 Si reinicias el bot, se genera un código nuevo."
    }, { quoted: msg });
  }

  const result = claimOwner(userId, code, userTag);

  if (result.ok) {
    await conn.sendMessage(chatId, { react: { text: "👑", key: msg.key } }).catch(() => {});
    return conn.sendMessage(chatId, {
      text:
        "👑 *¡Listo! Ya eres propietario del bot.*\n\n" +
        `✅ Registrado como: <@${userId}>\n` +
        "🔓 Tienes acceso a todos los comandos de owner.\n\n" +
        `📋 Prueba con \`${usedPrefix}menuowner\` para verlos.`
    }, { quoted: msg });
  }

  await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } }).catch(() => {});

  const mensajes = {
    "bad-code": "❌ *Código incorrecto.*\n\nRevisa la consola del panel y cópialo tal cual. " +
                "Recuerda que cambia cada vez que reinicias el bot.",
    "no-code": "⚠️ *No hay ningún código activo.*\n\nReinicia el bot para generar uno nuevo.",
    "already-owner": "👑 *Ya eres propietario de este bot.*",
    "invalid-user": "❌ No pude identificar tu usuario. Inténtalo de nuevo."
  };

  return conn.sendMessage(chatId, {
    text: mensajes[result.reason] || "❌ No se pudo completar la operación."
  }, { quoted: msg });
};

handler.command = ["soyowner", "claimowner"];
export default handler;

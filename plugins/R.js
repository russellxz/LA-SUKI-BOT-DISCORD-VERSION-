// plugins/R.js — Reacciones múltiples sobre un mensaje.
//
// En WhatsApp este comando reaccionaba a una publicación de un canal
// llamando a una API externa. Discord no tiene canales de difusión con ese
// modelo, pero sí conserva la utilidad: aplicar varias reacciones de golpe
// a un mensaje concreto. Se admite un enlace de mensaje o responder a él.

const LINK = /https?:\/\/(?:\w+\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/i;

const handler = async (msg, { conn, text, args }) => {
  const chatId = msg.key.remoteJid;
  const raw = (text && text.trim()) || (args || []).join(" ").trim();
  const quoted = msg._discord?.quoted;

  if (!raw && !quoted) {
    return conn.sendMessage(chatId, {
      text:
        "👻 *Reacciones múltiples*\n\n" +
        "📌 *Uso:*\n" +
        "  • Responde a un mensaje:  `.rc 😨,🤣,👾,😳`\n" +
        "  • O pega el enlace:  `.rc <enlace_del_mensaje> 😨,🤣`\n\n" +
        "💡 Copia el enlace con: clic derecho sobre el mensaje → *Copiar enlace del mensaje*\n" +
        "🔢 Máximo 10 reacciones (límite de Discord por mensaje)."
    }, { quoted: msg });
  }

  await conn.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

  try {
    // 1. Localizar el mensaje objetivo: por enlace o por respuesta.
    let target = null;
    let emojiPart = raw;

    const match = raw.match(LINK);
    if (match) {
      const [, , channelId, messageId] = match;
      const channel = await conn.client.channels.fetch(channelId).catch(() => null);
      target = await channel?.messages?.fetch(messageId).catch(() => null);
      emojiPart = raw.replace(match[0], "").trim();
    } else if (quoted) {
      target = quoted;
    }

    if (!target) {
      await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
      return conn.sendMessage(chatId, {
        text: "🚫 No encontré ese mensaje. Responde al mensaje o comprueba que el enlace sea correcto y que yo tenga acceso a ese canal."
      }, { quoted: msg });
    }

    // 2. Separar los emojis (coma normal, coma china o espacios).
    const emojis = emojiPart
      .split(/[,，\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (!emojis.length) {
      await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
      return conn.sendMessage(chatId, {
        text: "⚠️ Debes indicar al menos 1 emoji.\n\nEjemplo: `.rc 😨,🤣,👾`"
      }, { quoted: msg });
    }

    // Discord permite como mucho 20 reacciones distintas por mensaje;
    // nos quedamos en 10 para no agotar el límite de peticiones.
    const lista = emojis.slice(0, 10);

    // 3. Aplicarlas una a una, respetando el ritmo de la API.
    const ok = [];
    const fallidos = [];

    for (const emoji of lista) {
      try {
        await target.react(emoji);
        ok.push(emoji);
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        fallidos.push(emoji);
      }
    }

    await conn.sendMessage(chatId, { react: { text: ok.length ? "✅" : "❌", key: msg.key } });

    let resumen = ok.length
      ? `✅ *${ok.length} reacción(es) aplicadas:* ${ok.join(" ")}`
      : "❌ No se pudo aplicar ninguna reacción.";

    if (fallidos.length) {
      resumen += `\n\n⚠️ *No válidas:* ${fallidos.join(" ")}\n` +
                 `_Los emojis personalizados sólo funcionan si soy miembro del servidor que los tiene._`;
    }

    return conn.sendMessage(chatId, { text: resumen }, { quoted: msg });
  } catch (e) {
    console.error("❌ Error en reacciones múltiples:", e?.message);
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    return conn.sendMessage(chatId, {
      text: "❌ Ocurrió un error aplicando las reacciones."
    }, { quoted: msg });
  }
};

handler.command = ["r", "rc", "channelreact"];
export default handler;

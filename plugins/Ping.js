// plugins/Ping.js — Latencia del bot.
// En WhatsApp había que editar el mensaje vía `relayMessage` + proto;
// en Discord la edición es nativa, así que medimos el viaje real de la API
// y además mostramos la latencia del WebSocket.

const handler = async (msg, { conn }) => {
  const chatId = msg.key.remoteJid;

  try {
    const start = Date.now();
    const sent = await conn.sendMessage(chatId, { text: "🏓 Pong..." }, { quoted: msg });
    const roundtrip = Date.now() - start;
    const gateway = Math.max(0, Math.round(conn.client?.ws?.ping ?? 0));

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text =
      `🏓 *Pong*\n\n` +
      `⚡ Respuesta: *${roundtrip} ms*\n` +
      `📡 Gateway: *${gateway} ms*\n` +
      `⏱️ Activo: *${hours}h ${minutes}m ${seconds}s*`;

    if (sent?.editable) {
      await sent.edit({ content: text }).catch(() => null);
    } else {
      await conn.sendMessage(chatId, { text }, { quoted: msg });
    }
  } catch (e) {
    console.error("Error en ping:", e?.message);
    await conn.sendMessage(chatId, { text: "❌ Error calculando el ping." }, { quoted: msg }).catch(() => {});
  }
};

handler.command = ["ping"];
export default handler;

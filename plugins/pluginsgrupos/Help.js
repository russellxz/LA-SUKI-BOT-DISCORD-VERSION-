const handler = async (msg, { conn }) => {
  const chatId = msg.key.remoteJid;
  const pref = global.prefixes?.[0] || ".";

  // Reacción al iniciar
  await conn.sendMessage(chatId, {
    react: { text: "🧠", key: msg.key }
  });

  const caption = `
*🌐 INFORMACIÓN DEL BOT 🌐*

💫 *LA SUKI BOT — Edición Discord*

❖ *Qué incluyo:*
  ▸ Sistema RPG completo, economía y mascotas.
  ▸ Descargas de vídeo, audio y redes sociales.
  ▸ Moderación automática: antilink, antispam y antibots.
  ▸ Inteligencia artificial conversacional.
  ▸ Más de 390 comandos organizados por categorías.

📌 Usa ${pref}menu para ver todas mis funciones.
📌 Prefijos disponibles: ${(global.prefixes || ["."]).join("  ")}

🎬 Para estar al tanto de noticias, actualizaciones y lanzamientos:
🔗 *Sigue el canal de Sky Ultra Plus:*  
https://youtube.com/@skyultraplus?si=4hnO5biMvrUu9JXY

╰────────────────╯
`.trim();

  await conn.sendMessage(chatId, {
    video: { url: 'https://cdn.russellxz.click/12fea11a.mp4' },
    caption
  }, { quoted: msg });
};

handler.command = ['info', 'help'];
handler.tags = ['info'];
handler.help = ['info'];
handler.register = true;

export default handler;

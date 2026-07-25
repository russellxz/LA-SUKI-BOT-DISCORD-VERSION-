// plugins/Pais.js — Convocar a un subconjunto de miembros.
//
// En WhatsApp este comando reunía a los miembros de un país filtrando por el
// prefijo del número de teléfono. Discord no expone teléfonos ni país, así
// que se conserva la utilidad real —convocar sólo a una parte del servidor—
// con los criterios que Discord sí ofrece:
//
//   .pais @rol      → convoca a todos los que tengan ese rol
//   .pais 7d        → convoca a las cuentas creadas hace menos de 7 días
//                     (útil para detectar oleadas de cuentas nuevas)
//
// Requiere ser administrador u owner, igual que antes.

import { isAdminInGroup, isOwnerCheck } from '../libs/adminCheck.js';

const DAY = 24 * 60 * 60 * 1000;

const handler = async (msg, { conn, args }) => {
  const chatId = msg.key.remoteJid;
  const guild = msg._discord?.guild;

  if (!guild) {
    return conn.sendMessage(chatId, {
      text: "❌ Este comando solo funciona dentro de un servidor."
    }, { quoted: msg });
  }

  const senderId = msg.key.participant || msg.key.remoteJid;
  const isOwner = isOwnerCheck(msg.realJid || senderId);
  const isAdmin = await isAdminInGroup(conn, chatId, msg.realJid || senderId);

  if (!isAdmin && !isOwner) {
    return conn.sendMessage(chatId, {
      text: "❌ Este comando solo puede ser usado por *admins* o *el owner*."
    }, { quoted: msg });
  }

  const input = (args || []).join(" ").trim();

  if (!input) {
    return conn.sendMessage(chatId, {
      text:
        "🌍 *Convocar miembros*\n\n" +
        "Discord no expone el país ni el teléfono de los usuarios, así que " +
        "se filtra por los datos que sí están disponibles:\n\n" +
        "📌 *Por rol:*\n" +
        "  `.pais @miembros`\n\n" +
        "📌 *Por antigüedad de la cuenta:*\n" +
        "  `.pais 7d`   → cuentas creadas hace menos de 7 días\n" +
        "  `.pais 30d`  → menos de 30 días\n\n" +
        "💡 Útil para detectar oleadas de cuentas nuevas o spam."
    }, { quoted: msg });
  }

  // Aseguramos tener la lista completa de miembros en caché.
  const members = guild.members.cache.size > 1
    ? guild.members.cache
    : await guild.members.fetch().catch(() => guild.members.cache);

  let matched = [];
  let titulo = "";

  // ── Filtro por rol ──────────────────────────────────────────────
  const roleMatch = input.match(/<@&(\d+)>/) || input.match(/^(\d{15,25})$/);
  if (roleMatch) {
    const role = guild.roles.cache.get(roleMatch[1]);
    if (!role) {
      return conn.sendMessage(chatId, {
        text: "❌ No encontré ese rol en el servidor."
      }, { quoted: msg });
    }
    matched = [...members.values()].filter((m) => m.roles.cache.has(role.id));
    titulo = `🎭 *Miembros con el rol ${role.name}*`;
  } else {
    // ── Filtro por antigüedad ─────────────────────────────────────
    const ageMatch = input.match(/^(\d+)\s*d(?:ías?|ays?)?$/i);
    if (!ageMatch) {
      return conn.sendMessage(chatId, {
        text: "⚠️ Formato no reconocido.\n\nUsa `.pais @rol` o `.pais 7d`"
      }, { quoted: msg });
    }
    const days = Number(ageMatch[1]);
    const limit = Date.now() - days * DAY;
    matched = [...members.values()].filter((m) => m.user.createdTimestamp > limit);
    titulo = `🆕 *Cuentas creadas hace menos de ${days} día(s)*`;
  }

  // Excluimos bots para no llenar la convocatoria de ruido.
  matched = matched.filter((m) => !m.user.bot);

  if (!matched.length) {
    return conn.sendMessage(chatId, {
      text: "❌ No hay miembros que cumplan ese criterio."
    }, { quoted: msg });
  }

  // El adaptador ya trocea a 2.000 caracteres, pero limitamos el número de
  // menciones para no generar un ping masivo desmedido.
  const MAX = 80;
  const lista = matched.slice(0, MAX).map((m, i) => `${i + 1}. <@${m.id}>`).join("\n");
  const extra = matched.length > MAX
    ? `\n\n… y ${matched.length - MAX} más (mostrando los primeros ${MAX}).`
    : "";

  await conn.sendMessage(chatId, {
    text: `${titulo}\n👥 *Total:* ${matched.length}\n\n${lista}${extra}`
  }, { quoted: msg });

  await conn.sendMessage(chatId, { react: { text: "🌐", key: msg.key } });
};

handler.command = ["pais"];
export default handler;

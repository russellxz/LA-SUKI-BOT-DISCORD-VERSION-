/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                      LA SUKI BOT · Discord                       ║
 * ║        Bot modular por plugins · listo para Pterodactyl          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Punto de entrada único. Sólo necesita el token del bot de Discord en la
 * variable de entorno DISCORD_TOKEN (fichero .env) para arrancar.
 *
 * Arquitectura:
 *   core/conn.js      → fachada compatible con la API antigua de los plugins
 *   core/message.js   → adapta los mensajes de Discord al formato de plugins
 *   core/systems.js   → protecciones (antilink, antispam, mute, ban…)
 *   core/autoresponse → IA de Linda y multimedia guardada
 *   plugins/          → todos los comandos (RPG, economía, descargas, …)
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import chalk from "chalk";
import figlet from "figlet";
import { Client, GatewayIntentBits, Partials, ActivityType } from "discord.js";

import { createConn } from "./core/conn.js";
import { toBaileysMessage, resolveQuoted } from "./core/message.js";
import { channelJid, userToJid, jidToId, digits } from "./core/ids.js";
import {
  runGuards, runGates, countMessage, rememberForAntidelete,
  handleDeletedMessage, handleMemberJoin, handleMemberLeave,
  isGuildAdmin, isOwnerId, readStore
} from "./core/systems.js";
import { runAutoResponses } from "./core/autoresponse.js";
import "./config.js";

/* ─────────────────────────────── Arranque ─────────────────────────────── */

console.log(chalk.magenta(figlet.textSync("SUKI BOT", { font: "Standard" })));
console.log(chalk.cyan("        Edición Discord · v3.0\n"));

const TOKEN = process.env.DISCORD_TOKEN?.trim();

if (!TOKEN) {
  console.error(chalk.red("\n❌ Falta el token del bot.\n"));
  console.error(chalk.yellow("   1. Entra en https://discord.com/developers/applications"));
  console.error(chalk.yellow("   2. Crea tu aplicación → pestaña «Bot» → «Reset Token»"));
  console.error(chalk.yellow("   3. Copia el token y pégalo en el archivo .env:\n"));
  console.error(chalk.white("      DISCORD_TOKEN=tu_token_aqui\n"));
  console.error(chalk.yellow("   En Pterodactyl: pestaña «Startup» → variable DISCORD_TOKEN.\n"));
  process.exit(1);
}

/* ───────────────────────── Prefijos y propietarios ────────────────────── */

// Por defecto el bot responde a  .  #  /  — y admite emojis como prefijo.
let defaultPrefixes = [".", "#", "/"];
const prefixPath = path.resolve("./prefijos.json");
if (fs.existsSync(prefixPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(prefixPath, "utf-8").trim());
    if (Array.isArray(parsed) && parsed.length) defaultPrefixes = parsed;
    else if (typeof parsed === "string") defaultPrefixes = [parsed];
  } catch {}
}
global.prefixes = defaultPrefixes;

// owner.json conserva EXACTAMENTE el mismo formato que en WhatsApp:
// una lista de listas con IDs numéricos (ahora snowflakes de Discord).
const ownerPath = path.resolve("./owner.json");
if (!fs.existsSync(ownerPath)) fs.writeFileSync(ownerPath, JSON.stringify([["000000000000000000"]], null, 2));
global.owner = JSON.parse(fs.readFileSync(ownerPath, "utf-8"));

// Permite añadir el owner principal desde el .env sin editar ficheros.
if (process.env.OWNER_ID) {
  const envOwner = digits(process.env.OWNER_ID);
  if (envOwner && !global.owner.some((e) => digits(Array.isArray(e) ? e[0] : e) === envOwner)) {
    global.owner.unshift([envOwner]);
  }
}

/** Misma firma que en el bot original: acepta ID, mención o JID. */
global.isOwner = function (value) {
  const id = digits(value);
  return global.owner.some((entry) => digits(Array.isArray(entry) ? entry[0] : entry) === id);
};

/**
 * En WhatsApp `global.lidMap` traducía los identificadores ocultos (@lid) a
 * números reales. En Discord cada usuario tiene un único ID definitivo, así
 * que el mapa se queda vacío: los plugins que lo consultan simplemente usan
 * la ruta directa, que ya es la correcta.
 */
global.lidMap = new Map();

/* ────────────────────────── Carga de plugins ──────────────────────────── */

global.plugins = [];

/**
 * Sistemas de fondo: plugins sin `command` que exportan un inicializador
 * (cron jobs, limpieza de temporales, préstamos del RPG, bienvenidas…).
 * Se arrancan una vez que el bot está conectado, pasándoles `conn`.
 */
const backgroundSystems = [];

async function loadPlugins(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) { await loadPlugins(full); continue; }
    if (!item.name.endsWith(".js")) continue;
    try {
      const mod = await import(pathToFileURL(path.resolve(full)).href);
      const plugin = mod.default || mod;

      if (plugin?.command) {
        global.plugins.push(plugin);
      } else if (typeof plugin === "function" || typeof plugin?.run === "function") {
        backgroundSystems.push({ name: item.name, init: plugin.run || plugin });
      }
    } catch (err) {
      console.log(chalk.red(`❌ Plugin ${full}: ${err?.message}`));
    }
  }
}

/** Índice comando → plugin para despacho O(1). */
global.buildPluginIndex = function () {
  const index = new Map();
  for (const plugin of global.plugins) {
    for (const cmd of (Array.isArray(plugin?.command) ? plugin.command : [])) {
      const key = String(cmd).toLowerCase();
      if (!index.has(key)) index.set(key, plugin);
    }
  }
  global.pluginIndex = index;
  return index;
};

await loadPlugins("./plugins");
global.buildPluginIndex();
console.log(chalk.green(`✅ ${global.plugins.length} plugins cargados · ${global.pluginIndex.size} comandos`));
console.log(chalk.green(`⚙️  ${backgroundSystems.length} sistemas de fondo detectados`));

/* ──────────────────────────── Cliente Discord ─────────────────────────── */

/**
 * Intents mínimos necesarios. Los tres marcados como «privilegiados»
 * (MessageContent, GuildMembers, GuildPresences) hay que activarlos a mano
 * en el Developer Portal → Bot → Privileged Gateway Intents.
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,      // privilegiado — leer comandos
    GatewayIntentBits.GuildMembers,        // privilegiado — bienvenidas y admins
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember],
  allowedMentions: { parse: ["users", "roles"] }
});

const conn = createConn(client);
global.conn = conn;

/* ─────────────────────────────── Eventos ──────────────────────────────── */

client.once("clientReady", async () => {
  console.log(chalk.green(`\n✅ Conectado como ${client.user.tag}`));
  console.log(chalk.cyan(`🌐 ${client.guilds.cache.size} servidores · prefijos: ${global.prefixes.join(" ")}\n`));

  client.user.setPresence({
    activities: [{ name: `${global.prefixes[0]}menu`, type: ActivityType.Listening }],
    status: "online"
  });

  // ⚙️ Arrancar los sistemas de fondo (cron jobs, limpieza, bienvenidas…).
  for (const system of backgroundSystems) {
    try {
      await system.init(conn);
    } catch (e) {
      console.log(chalk.red(`❌ Sistema ${system.name}: ${e?.message}`));
    }
  }

  // Aviso de reinicio pendiente (comando .carga / .rest).
  try {
    const file = path.resolve("./lastRestarter.json");
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (data.chatId) conn.sendMessage(data.chatId, { text: "✅ *Suki Bot está en línea nuevamente* 🚀" });
      fs.unlinkSync(file);
    }
  } catch {}
});

/**
 * Traduce las entradas y salidas de miembros al evento
 * `group-participants.update` que ya escuchaba el sistema de bienvenidas
 * original, de forma que toda su lógica (plantillas, imágenes, contadores)
 * se conserva sin tocarla.
 *
 * En WhatsApp el evento era por grupo; en Discord un miembro entra al
 * servidor, así que lo emitimos para cada canal que tenga bienvenida
 * configurada en ese servidor.
 */
function emitParticipantsUpdate(member, action) {
  try {
    const store = readStore();
    const jids = Object.keys(store).filter((chatId) => {
      if (!chatId.endsWith("@g.us")) return false;
      return member.guild.channels.cache.has(jidToId(chatId));
    });

    // Si no hay ninguno configurado, avisamos en el canal de sistema.
    if (!jids.length && member.guild.systemChannelId) {
      jids.push(channelJid({ id: member.guild.systemChannelId, guild: member.guild }));
    }

    for (const id of jids) {
      conn.ev.emit("group-participants.update", {
        id,
        action,
        participants: [userToJid(member.id)],
        author: userToJid(member.id)
      });
    }
  } catch (e) {
    console.error("⚠️ Evento de participantes:", e?.message);
  }
}

client.on("guildMemberAdd", (member) => {
  emitParticipantsUpdate(member, "add");
  // Respaldo propio: sólo actúa si el sistema original no está escuchando,
  // para no enviar la bienvenida por duplicado.
  if (!conn.__sukiWelcomeOldListenerStarted) handleMemberJoin(conn, member);
});
client.on("guildMemberRemove", (member) => {
  emitParticipantsUpdate(member, "remove");
  if (!conn.__sukiWelcomeOldListenerStarted) handleMemberLeave(conn, member);
});
client.on("messageDelete", (message) => handleDeletedMessage(conn, message));

/**
 * Interacciones con botones. Los plugins de descarga escuchan
 * `messages.upsert` esperando un `buttonsResponseMessage`; traducimos la
 * interacción de Discord a esa forma para no tocar su lógica.
 */
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate().catch(() => {});

    const fake = {
      key: {
        remoteJid: channelJid(interaction.channel),
        fromMe: false,
        id: interaction.message.id,
        participant: interaction.guild ? userToJid(interaction.user.id) : undefined
      },
      message: {
        buttonsResponseMessage: {
          selectedButtonId: interaction.customId,
          selectedDisplayText: interaction.component?.label || ""
        }
      },
      pushName: interaction.member?.displayName || interaction.user.username,
      realJid: userToJid(interaction.user.id),
      _discord: { interaction, client }
    };

    conn.ev.emit("messages.upsert", { messages: [fake], type: "notify" });
  } catch (e) {
    console.error("⚠️ Interacción:", e?.message);
  }
});

/* ───────────────────────── Despacho de mensajes ───────────────────────── */

client.on("messageCreate", async (message) => {
  try {
    // Ignoramos webhooks y los mensajes del propio bot para no hacer bucles.
    if (message.webhookId) return;
    if (message.author.id === client.user.id) return;

    const quoted = await resolveQuoted(message);
    if (quoted) message.__quoted = quoted;

    const m = toBaileysMessage(message, client);
    const chatId = m.key.remoteJid;
    const isGroup = Boolean(message.guild);
    const userId = message.author.id;

    const text = message.content || "";

    const ctx = {
      m, conn, message, text, chatId, userId,
      isGroup,
      fromMe: false,
      channel: message.channel,
      member: message.member,
      pushName: m.pushName,
      isAdmin: isGroup ? isGuildAdmin(message.member) : false,
      isOwner: isOwnerId(userId)
    };

    // Los plugins con flujos interactivos escuchan este evento.
    conn.ev.emit("messages.upsert", { messages: [m], type: "notify" });

    // 1️⃣ Antidelete: guardar antes de cualquier filtro.
    rememberForAntidelete(ctx);

    // 2️⃣ Protecciones automáticas (antilink, antispam, mute…).
    if (await runGuards(ctx) === false) return;

    // 3️⃣ Estadísticas.
    countMessage(ctx);

    // 4️⃣ ¿Lleva prefijo? Si no, pasa por las respuestas automáticas.
    const prefix = global.prefixes.find((p) => text.startsWith(p));
    if (!prefix) {
      await runAutoResponses(ctx);
      return;
    }

    const body = text.slice(prefix.length).trim();
    if (!body) return;

    const command = body.split(/\s+/)[0].toLowerCase();
    const rawArgs = body.slice(command.length).trim();
    const args = rawArgs.length ? rawArgs.split(/\s+/) : [];

    const plugin = global.pluginIndex.get(command)
      || global.plugins.find((p) => p?.command?.includes?.(command));
    if (!plugin) return;

    // 5️⃣ Filtros de acceso (modo privado, apagado, admins, baneados).
    if (!runGates(ctx)) return;

    // 6️⃣ Ejecutar — misma firma que en el bot de WhatsApp.
    try {
      if (typeof plugin === "function") {
        await plugin(m, { conn, text: rawArgs, args, command, client, isOwner: ctx.isOwner, isAdmin: ctx.isAdmin });
      } else if (typeof plugin.run === "function") {
        await plugin.run({ msg: m, conn, args, command, text: rawArgs, client });
      }
    } catch (e) {
      console.error(chalk.red(`❌ Error en ${command}:`), e?.message);
      await conn.sendMessage(chatId, {
        text: `⚠️ Ocurrió un error ejecutando *${command}*. Inténtalo de nuevo.`
      }).catch(() => {});
    }
  } catch (e) {
    console.error(chalk.red("❌ Error procesando mensaje:"), e?.message);
  }
});

/* ────────────────────────── Robustez del proceso ──────────────────────── */

process.on("uncaughtException", (err) => {
  console.error(chalk.red("⚠️ Excepción no capturada:"), err?.message);
});
process.on("unhandledRejection", (reason) => {
  console.error(chalk.red("🚨 Promesa sin manejar:"), reason?.message || reason);
});

client.on("error", (e) => console.error(chalk.red("⚠️ Cliente:"), e?.message));
client.on("shardError", (e) => console.error(chalk.red("⚠️ Shard:"), e?.message));

client.login(TOKEN).catch((err) => {
  console.error(chalk.red("\n❌ No se pudo iniciar sesión en Discord."));
  if (String(err?.message).includes("disallowed intents")) {
    console.error(chalk.yellow("   Activa los «Privileged Gateway Intents» en el Developer Portal:"));
    console.error(chalk.yellow("   Bot → Presence Intent, Server Members Intent y Message Content Intent.\n"));
  } else {
    console.error(chalk.yellow(`   ${err?.message}\n`));
  }
  process.exit(1);
});

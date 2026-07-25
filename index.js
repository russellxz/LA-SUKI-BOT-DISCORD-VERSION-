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
import { showBanner, typeLine, spinner, progressBar, gradient, box, rule } from "./core/ui.js";
import { resolveToken, retryAfterInvalidToken } from "./core/token.js";
import { generateCode, claimPanelLines } from "./core/ownerclaim.js";
import "./config.js";

/* ─────────────────────────────── Arranque ─────────────────────────────── */

console.clear();

await showBanner(figlet.textSync("SUKI  BOT", { font: "ANSI Shadow" }).split("\n"));
await typeLine(gradient("        ⚡ Edición Discord · v3.0 · by Russell ⚡"), 12);
rule();

/**
 * El token puede venir de tres sitios: la variable de entorno (pestaña
 * «Startup» del panel), el archivo .env, o escrito directamente en la
 * consola. Si falta, se pide y se espera — nunca se cierra el proceso,
 * porque una salida con error hace que Pterodactyl reinicie en bucle.
 */
let TOKEN = await resolveToken();

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
// Algunos plugins leen `global.prefix` en singular para componer ejemplos.
global.prefix = defaultPrefixes[0];

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

const loader = spinner("Cargando plugins…");
await loadPlugins("./plugins");
global.buildPluginIndex();
loader.stop("📦", chalk.bold(`${global.plugins.length} plugins`) + chalk.gray(" · ") +
  chalk.bold(`${global.pluginIndex.size} comandos`) + chalk.gray(" · ") +
  chalk.bold(`${backgroundSystems.length} sistemas`));

await progressBar("Preparando el núcleo…", 600);

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
  const members = client.guilds.cache.reduce((n, g) => n + (g.memberCount || 0), 0);

  box("🟢  BOT EN LÍNEA", [
    chalk.white("Usuario    ") + chalk.magenta.bold(client.user.tag),
    chalk.white("Servidores ") + chalk.magenta.bold(client.guilds.cache.size),
    chalk.white("Usuarios   ") + chalk.magenta.bold(members.toLocaleString("es")),
    chalk.white("Comandos   ") + chalk.magenta.bold(global.pluginIndex.size),
    chalk.white("Prefijos   ") + chalk.magenta.bold(global.prefixes.join("  ")),
    "",
    chalk.gray("Escribe ") + chalk.bold(`${global.prefixes[0]}menu`) + chalk.gray(" en Discord para empezar")
  ], chalk.green);

  client.user.setPresence({
    activities: [{ name: `${global.prefixes[0]}menu`, type: ActivityType.Listening }],
    status: "online"
  });

  // ⚙️ Arrancar los sistemas de fondo (cron jobs, limpieza, bienvenidas…).
  const sys = spinner("Iniciando sistemas de fondo…");
  for (const system of backgroundSystems) {
    try {
      await system.init(conn);
    } catch (e) {
      console.log(chalk.red(`❌ Sistema ${system.name}: ${e?.message}`));
    }
  }
  sys.stop("⚙️", `${backgroundSystems.length} sistemas de fondo activos`);

  // 👑 Código para reclamar la propiedad del bot desde Discord.
  generateCode();
  box("👑  RECLAMAR PROPIEDAD", claimPanelLines(global.prefixes[0]), chalk.magenta);

  rule();

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
    //    `soyowner` queda exento: es el comando con el que el dueño se
    //    registra, y aún no es owner cuando lo ejecuta. Si el modo privado
    //    estuviera activo, quedaría bloqueado para siempre.
    const EXENTOS = new Set(["soyowner", "claimowner"]);
    if (!EXENTOS.has(command) && !runGates(ctx)) return;

    // 6️⃣ Ejecutar — misma firma que en el bot de WhatsApp.
    //    Se añaden `usedPrefix` y `prefix`, que varios plugins usan para
    //    mostrar ejemplos de uso y antes llegaban indefinidos.
    const extra = {
      conn, text: rawArgs, args, command, client,
      usedPrefix: prefix, prefix,
      isOwner: ctx.isOwner, isAdmin: ctx.isAdmin
    };

    try {
      if (typeof plugin === "function") {
        await plugin(m, extra);
      } else if (typeof plugin.run === "function") {
        await plugin.run({ msg: m, ...extra });
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

/**
 * Conexión con reintentos. Ninguna rama termina el proceso con código de
 * error: si lo hiciera, Pterodactyl lo tomaría por una caída y reiniciaría
 * el servidor una y otra vez. Ante un token inválido se vuelve a pedir por
 * consola; ante un fallo de red se reintenta con espera progresiva.
 */
async function connect(token, attempt = 1) {
  const link = spinner("Conectando con Discord…");
  try {
    await client.login(token);
    link.stop("🔗", "Conexión establecida");
  } catch (err) {
    link.stop("❌", "No se pudo conectar");
    const message = String(err?.message || "");

    // 1. Intents privilegiados desactivados: es un fallo de configuración,
    //    no tiene sentido reintentar hasta que el dueño los active.
    if (message.includes("disallowed intents")) {
      box("FALTAN LOS INTENTS PRIVILEGIADOS", [
        chalk.white("Discord rechaza la conexión porque el bot pide permisos"),
        chalk.white("que no están habilitados en tu aplicación."),
        "",
        chalk.cyan("  1.") + chalk.white(" Entra en ") + chalk.underline("https://discord.com/developers/applications"),
        chalk.cyan("  2.") + chalk.white(" Tu aplicación → pestaña ") + chalk.bold("Bot"),
        chalk.cyan("  3.") + chalk.white(" Baja a ") + chalk.bold("Privileged Gateway Intents"),
        chalk.cyan("  4.") + chalk.white(" Activa los ") + chalk.bold("TRES") + chalk.white(" interruptores:"),
        "",
        chalk.green("        ✓ Presence Intent"),
        chalk.green("        ✓ Server Members Intent"),
        chalk.green("        ✓ Message Content Intent"),
        "",
        chalk.cyan("  5.") + chalk.white(" Guarda los cambios y reinicia el servidor"),
        "",
        chalk.gray("Esperando… reinicia cuando los hayas activado.")
      ], chalk.red);
      return; // Se queda vivo: sin salida de error, sin bucle de reinicios.
    }

    // 2. Token inválido: se pide uno nuevo por consola.
    if (message.includes("TOKEN_INVALID") || message.toLowerCase().includes("invalid token")
        || message.includes("401")) {
      const nuevo = await retryAfterInvalidToken("Discord ha rechazado este token.");
      return connect(nuevo, 1);
    }

    // 3. Tras varios intentos fallidos, lo más probable es que el token
    //    esté mal aunque Discord no lo diga con claridad: lo pedimos otra vez.
    if (attempt >= 3) {
      const nuevo = await retryAfterInvalidToken(
        `No se ha podido conectar tras ${attempt} intentos (${message || "sin detalle"}).`
      );
      return connect(nuevo, 1);
    }

    // 4. Problema puntual de red o de Discord: reintento con espera creciente.
    const wait = 5 * attempt;
    console.log(chalk.yellow(`\n  ⚠️  ${message || "Error de conexión"}`));
    console.log(chalk.gray(`  ⏳ Reintentando en ${wait}s… (intento ${attempt} de 3)\n`));
    await new Promise((r) => setTimeout(r, wait * 1000));
    return connect(token, attempt + 1);
  }
}

await connect(TOKEN);

/**
 * conn.js — Fachada compatible con Baileys implementada sobre discord.js.
 *
 * Este es el corazón de la migración. Los plugins siguen llamando a
 * `conn.sendMessage(jid, { text })`, `conn.groupMetadata(jid)` o
 * `conn.sendMessage(jid, { react: { text, key } })` exactamente igual que
 * en WhatsApp; aquí traducimos cada llamada a la API de Discord y
 * aplicamos por el camino los límites oficiales de la plataforma.
 *
 * Con ~15 métodos cubrimos las más de 2.900 llamadas que hacen los plugins,
 * lo que permite conservar intacta toda la lógica de RPG, economía,
 * descargas, moderación e IA del bot original.
 */

import {
  AttachmentBuilder,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from "discord.js";
import { EventEmitter } from "events";
import fs from "fs";

import {
  channelJid,
  userToJid,
  jidToId,
  isGroupJid,
  renderMentions,
  digits
} from "./ids.js";
import {
  prepareAttachment,
  cleanupAttachment,
  oversizeMessage,
  getUploadLimit
} from "./media.js";
import { waToDiscord, shouldEmbed, textToEmbed, COLORS } from "./embeds.js";

/** Límites duros documentados por Discord. */
export const LIMITS = {
  MESSAGE: 2000,
  EMBED_DESCRIPTION: 4096,
  EMBED_TITLE: 256,
  EMBED_FIELD_VALUE: 1024,
  EMBED_TOTAL: 6000,
  EMBEDS_PER_MESSAGE: 10,
  BUTTONS_PER_ROW: 5,
  ROWS_PER_MESSAGE: 5,
  SELECT_OPTIONS: 25,
  REASON: 512
};

/**
 * Trocea un texto respetando el límite de 2.000 caracteres de Discord,
 * cortando por saltos de línea para no partir palabras ni bloques de código.
 */
export function chunkText(text, limit = LIMITS.MESSAGE) {
  const source = String(text ?? "");
  if (source.length <= limit) return [source];

  const chunks = [];
  let current = "";

  for (const line of source.split("\n")) {
    if (line.length > limit) {
      if (current) { chunks.push(current); current = ""; }
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      continue;
    }
    if ((current + "\n" + line).length > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Extrae el primer emoji utilizable para una reacción de Discord. */
function normalizeEmoji(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  // Emoji personalizado <:nombre:id> o <a:nombre:id>
  const custom = value.match(/<a?:\w+:(\d+)>/);
  if (custom) return value;
  // Primer cluster de emoji del texto
  const chars = [...value];
  return chars.slice(0, 8).join("") || null;
}

export function createConn(client, options = {}) {
  const ev = new EventEmitter();
  ev.setMaxListeners(0);

  /** Caché de mensajes enviados para resolver reacciones, ediciones y borrados. */
  const sentCache = new Map();

  /**
   * Guarda el mensaje y le añade una `key` con forma de Baileys.
   *
   * Muchos plugins hacen `const enviado = await conn.sendMessage(...)` y
   * después leen `enviado.key.id` (por ejemplo, los de descarga, para
   * asociar los botones a la respuesta). Sin esta `key` reventaban con
   * «Cannot read properties of undefined (reading 'id')».
   */
  const rememberMessage = (message) => {
    if (!message?.id) return message;

    if (!message.key) {
      message.key = {
        id: message.id,
        remoteJid: channelJid(message.channel),
        fromMe: true,
        participant: userToJid(client.user?.id || "0")
      };
    }

    sentCache.set(message.id, message);
    if (sentCache.size > 3000) {
      const oldest = sentCache.keys().next().value;
      sentCache.delete(oldest);
    }
    return message;
  };

  /** JID → canal de Discord (crea el DM si hace falta). */
  async function resolveChannel(jid) {
    const id = jidToId(jid);
    if (!id) return null;

    if (isGroupJid(jid)) {
      return client.channels.cache.get(id) || await client.channels.fetch(id).catch(() => null);
    }

    // Chat privado: abrimos (o reutilizamos) el DM con ese usuario.
    const user = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
    if (!user) return null;
    return user.dmChannel || await user.createDM().catch(() => null);
  }

  /** Localiza un mensaje concreto a partir de una `key` estilo Baileys. */
  async function resolveMessage(key, channel) {
    if (!key?.id) return null;
    if (sentCache.has(key.id)) return sentCache.get(key.id);
    const target = channel || await resolveChannel(key.remoteJid);
    if (!target?.messages) return null;
    return target.messages.cache.get(key.id)
      || await target.messages.fetch(key.id).catch(() => null);
  }

  /** Recorta respetando el máximo de caracteres de Discord. */
  const clip = (value, max, fallback = "") => {
    const text = String(value ?? "").trim() || fallback;
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  /**
   * Convierte las listas de WhatsApp (`sections` → `rows`) en menús
   * desplegables de Discord.
   *
   * En WhatsApp esto era un único botón que abría una lista con secciones.
   * Discord no tiene ese componente, pero sí los *select menu*, que son el
   * equivalente natural: cada sección se convierte en su propio desplegable,
   * conservando el agrupado visual y las descripciones de cada opción.
   *
   * Límites aplicados: 25 opciones por menú, 5 filas por mensaje,
   * 100 caracteres en etiqueta, descripción y valor.
   */
  function buildSelectMenus(entries) {
    const rows = [];

    for (const entry of entries) {
      const sections = Array.isArray(entry?.sections) ? entry.sections : [];

      for (const section of sections) {
        const items = Array.isArray(section?.rows) ? section.rows : [];
        if (!items.length) continue;

        // Si una sección supera las 25 opciones, se parte en varios menús.
        for (let start = 0; start < items.length; start += LIMITS.SELECT_OPTIONS) {
          if (rows.length >= LIMITS.ROWS_PER_MESSAGE) return rows;

          const trozo = items.slice(start, start + LIMITS.SELECT_OPTIONS);
          const seen = new Set();
          const options = [];

          for (const [i, item] of trozo.entries()) {
            // Discord exige valores únicos dentro del mismo menú.
            let value = clip(item?.id ?? item?.rowId ?? `row_${i}`, 100, `row_${i}`);
            while (seen.has(value)) value = `${value}_${i}`;
            seen.add(value);

            const option = new StringSelectMenuOptionBuilder()
              .setLabel(clip(item?.title ?? item?.header, 100, `Opción ${i + 1}`))
              .setValue(value);

            const description = clip(item?.description, 100);
            if (description) option.setDescription(description);

            options.push(option);
          }

          if (!options.length) continue;

          const etiqueta = clip(section?.title ?? entry?.text, 150, "Elige una opción");
          const menu = new StringSelectMenuBuilder()
            // El id identifica el menú; la opción elegida viaja en `values`.
            .setCustomId(`suki_list_${rows.length}_${Date.now()}`)
            .setPlaceholder(clip(etiqueta, 150, "Elige una opción"))
            .addOptions(options);

          rows.push(new ActionRowBuilder().addComponents(menu));
        }
      }
    }

    return rows;
  }

  /**
   * Traduce los botones nativos de WhatsApp a componentes de Discord.
   * Si el contenido trae `sections`, se genera un menú desplegable;
   * en caso contrario, botones normales (5 por fila).
   */
  function buildComponents(content) {
    const raw = content.buttons
      || content.templateButtons
      || content.interactiveButtons
      || null;
    if (!Array.isArray(raw) || !raw.length) return [];

    // ¿Es una lista con secciones? → menús desplegables.
    if (raw.some((b) => Array.isArray(b?.sections) && b.sections.length)) {
      const menus = buildSelectMenus(raw);
      if (menus.length) return menus;
    }

    const buttons = raw.slice(0, LIMITS.BUTTONS_PER_ROW * LIMITS.ROWS_PER_MESSAGE).map((b, i) => {
      const id = clip(b.buttonId ?? b.id ?? b.name, 100, `btn_${i}`);
      const label = clip(
        b.buttonText?.displayText ?? b.displayText ?? b.text ?? b.title,
        80,
        `Opción ${i + 1}`
      );
      return new ButtonBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary);
    });

    const rows = [];
    for (let i = 0; i < buttons.length; i += LIMITS.BUTTONS_PER_ROW) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + LIMITS.BUTTONS_PER_ROW)));
    }
    return rows;
  }

  /**
   * Envía texto con la presentación de Discord.
   *
   * Los mensajes largos y estructurados —menús, fichas, listas— se muestran
   * como embed con la barra de color de la marca; el resto va como texto
   * normal. En ambos casos se traduce el formato de WhatsApp (`*negrita*`)
   * al de Discord, que si no se vería en cursiva.
   *
   * Los mensajes con menciones nunca se convierten en embed: dentro de un
   * embed las menciones no avisan a nadie.
   */
  async function sendText(channel, text, payload = {}) {
    const rendered = renderMentions(text);

    if (shouldEmbed(rendered)) {
      const embed = textToEmbed(rendered);
      return rememberMessage(await channel.send({ embeds: [embed], ...payload }));
    }

    const parts = chunkText(waToDiscord(rendered));
    let last = null;
    let anchor = null;

    for (let i = 0; i < parts.length; i++) {
      const body = { content: parts[i] || "​" };
      // Sólo el primer trozo lleva la cita y los componentes.
      if (i === 0) Object.assign(body, payload);
      last = rememberMessage(await channel.send(body));
      if (i === 0) anchor = last;
    }

    // Si hay botones, devolvemos el mensaje que los lleva: es el que los
    // plugins guardan para reconocer después la interacción del usuario.
    return payload.components?.length ? anchor : last;
  }

  /** Adjunta un archivo aplicando límites, compresión y enlace de respaldo. */
  async function sendMedia(channel, source, { kind, filename, caption, payload = {} }) {
    const prepared = await prepareAttachment(source, {
      guild: channel.guild,
      filename,
      kind
    });

    try {
      if (!prepared.ok) {
        // Nunca lanzamos: informamos con claridad (con enlace si lo hay).
        const note = oversizeMessage(prepared);
        const text = caption ? `${caption}\n\n${note}` : note;
        return await sendText(channel, text, payload);
      }

      const attachment = new AttachmentBuilder(prepared.file, { name: prepared.name });

      // 📌 El medio va SIEMPRE en su propio mensaje y va primero.
      // Discord dibuja el texto por encima del adjunto, así que incluir el
      // caption aquí dejaría la imagen o el vídeo debajo del texto. Los
      // menús y las descargas se ven mucho mejor con el medio arriba.
      const { components, ...mediaPayload } = payload;
      const mediaMsg = rememberMessage(await channel.send({
        files: [attachment],
        ...mediaPayload
      }));

      const notes = [];
      if (caption) notes.push(caption);
      if (prepared.compressed) {
        notes.push("♻️ Archivo recomprimido para ajustarse al límite de Discord.");
      }

      // El texto (y los botones, si los hay) van justo debajo del medio.
      // Se quita el `reply` para no repetir la cita dos veces.
      if (notes.length) {
        const { reply, ...rest } = payload;
        const textMsg = await sendText(channel, notes.join("\n\n"), rest);
        // Los plugins interactivos guardan el mensaje devuelto para
        // reconocer la pulsación: debe ser el que lleva los botones.
        if (components?.length && textMsg) return textMsg;
        return mediaMsg;
      }

      // Sin texto: los botones van en un mensaje aparte, que pasa a ser el
      // ancla de la interacción.
      if (components?.length) {
        const btnMsg = await channel.send({ content: "​", components })
          .then(rememberMessage)
          .catch(() => null);
        if (btnMsg) return btnMsg;
      }

      return mediaMsg;
    } catch (error) {
      console.error("⚠️ Error enviando adjunto:", error?.message || error);
      const note = "⚠️ No se pudo enviar el archivo. Intenta de nuevo en unos segundos.";
      return await sendText(channel, caption ? `${caption}\n\n${note}` : note, payload).catch(() => null);
    } finally {
      cleanupAttachment(prepared);
    }
  }

  const conn = {
    /** Cliente nativo, por si un plugin necesita la API completa. */
    client,
    ev,
    limits: LIMITS,

    get user() {
      return {
        id: userToJid(client.user?.id || "0"),
        jid: userToJid(client.user?.id || "0"),
        name: client.user?.username || "Suki Bot",
        lid: userToJid(client.user?.id || "0")
      };
    },

    get contacts() {
      const out = {};
      for (const [id, user] of client.users.cache) {
        out[userToJid(id)] = { id: userToJid(id), name: user.username, notify: user.username };
      }
      return out;
    },

    /**
     * 📨 Método central. Enruta según la clave del contenido, igual que hacía
     * Baileys: text, image, video, audio, sticker, document, react, delete, edit.
     */
    async sendMessage(jid, content = {}, options = {}) {
      try {
        const channel = await resolveChannel(jid);
        if (!channel?.send) return null;

        // Permisos: si el bot no puede escribir, salimos en silencio en vez
        // de reventar el comando (pasa a menudo en canales restringidos).
        if (channel.guild) {
          const me = channel.guild.members.me;
          if (me && !channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
            return null;
          }
        }

        // ── Reacciones ─────────────────────────────────────────────
        if (content.react) {
          const emoji = normalizeEmoji(content.react.text);
          if (!emoji) return null;
          const target = await resolveMessage(content.react.key, channel);
          if (!target) return null;
          return await target.react(emoji).catch(() => null);
        }

        // ── Borrado ────────────────────────────────────────────────
        if (content.delete) {
          const target = await resolveMessage(content.delete, channel);
          if (!target?.deletable) return null;
          return await target.delete().catch(() => null);
        }

        // ── Edición ────────────────────────────────────────────────
        if (content.edit) {
          const target = await resolveMessage(content.edit, channel);
          if (!target?.editable) return null;
          const body = renderMentions(content.text || content.caption || "");
          return await target.edit({ content: body.slice(0, LIMITS.MESSAGE) }).catch(() => null);
        }

        // Reply: los plugins pasan `{ quoted: msg }`.
        const payload = {};
        const quotedId = options.quoted?.key?.id || options.quoted?.id;
        if (quotedId) {
          payload.reply = { messageReference: quotedId, failIfNotExists: false };
        }
        const components = buildComponents(content);
        if (components.length) payload.components = components;
        // Evitamos pings masivos accidentales heredados de WhatsApp.
        payload.allowedMentions = { parse: ["users"] };

        // ── Medios ─────────────────────────────────────────────────
        if (content.image) {
          return await sendMedia(channel, content.image, {
            kind: "image", filename: content.fileName || "imagen.jpg",
            caption: content.caption, payload
          });
        }
        if (content.video) {
          return await sendMedia(channel, content.video, {
            kind: "video", filename: content.fileName || "video.mp4",
            caption: content.caption, payload
          });
        }
        if (content.audio) {
          return await sendMedia(channel, content.audio, {
            kind: "audio", filename: content.fileName || "audio.mp3",
            caption: content.caption, payload
          });
        }
        if (content.sticker) {
          // Discord no tiene stickers subibles por bots: se envía como imagen,
          // que conserva la animación en WebP/GIF.
          return await sendMedia(channel, content.sticker, {
            kind: "image", filename: content.fileName || "sticker.webp",
            caption: content.caption, payload
          });
        }
        if (content.document) {
          return await sendMedia(channel, content.document, {
            kind: "document",
            filename: content.fileName || content.mimetype?.split("/")?.[1] || "archivo",
            caption: content.caption, payload
          });
        }

        // ── Texto / embeds ─────────────────────────────────────────
        const text = content.text ?? content.caption ?? "";
        if (content.embeds || content.embed) {
          const embeds = (content.embeds || [content.embed])
            .slice(0, LIMITS.EMBEDS_PER_MESSAGE)
            .map((e) => (e instanceof EmbedBuilder ? e : EmbedBuilder.from(e)));
          return rememberMessage(await channel.send({
            content: text ? renderMentions(text).slice(0, LIMITS.MESSAGE) : undefined,
            embeds,
            ...payload
          }));
        }

        if (!text) return null;
        return await sendText(channel, text, payload);
      } catch (error) {
        console.error("⚠️ sendMessage:", error?.message || error);
        return null;
      }
    },

    /**
     * Variante que en WhatsApp añadía la cabecera del canal oficial.
     * En Discord no existe ese concepto: delegamos en `sendMessage` para
     * que los 21 plugins que la usan sigan funcionando.
     */
    async sendMessage2(jid, content, quoted, options = {}) {
      return conn.sendMessage(jid, content, { quoted, ...options });
    },

    /**
     * 👥 Metadata de "grupo" = canal de Discord.
     * Devuelve la misma forma que Baileys: `{ id, subject, participants }`
     * con `admin: "admin"` para quienes pueden gestionar el servidor.
     */
    async groupMetadata(jid) {
      const channel = await resolveChannel(jid);
      const guild = channel?.guild;
      if (!guild) {
        return { id: jid, subject: "Chat privado", participants: [], owner: null, desc: "" };
      }

      // `fetch` garantiza la lista completa aunque la caché esté fría
      // (requiere el intent GuildMembers, documentado en el README).
      let members = guild.members.cache;
      if (members.size <= 1) {
        members = await guild.members.fetch().catch(() => guild.members.cache);
      }

      const participants = [...members.values()].map((member) => {
        const isAdmin =
          member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          member.permissions.has(PermissionsBitField.Flags.ManageGuild);
        return {
          id: userToJid(member.id),
          jid: userToJid(member.id),
          admin: guild.ownerId === member.id ? "superadmin" : (isAdmin ? "admin" : null),
          name: member.displayName
        };
      });

      return {
        id: jid,
        subject: channel.name || guild.name,
        subjectOwner: userToJid(guild.ownerId),
        owner: userToJid(guild.ownerId),
        desc: channel.topic || guild.description || "",
        participants,
        size: participants.length,
        creation: Math.floor(guild.createdTimestamp / 1000),
        _guild: guild,
        _channel: channel
      };
    },

    /** Todos los canales donde está el bot (equivalente a los grupos). */
    async groupFetchAllParticipating() {
      const out = {};
      for (const [, guild] of client.guilds.cache) {
        for (const [, channel] of guild.channels.cache) {
          if (channel.type !== ChannelType.GuildText) continue;
          const jid = channelJid(channel);
          out[jid] = { id: jid, subject: channel.name, size: guild.memberCount };
        }
      }
      return out;
    },

    /**
     * 🔨 Acciones sobre miembros: expulsar, promover y degradar.
     * Misma firma que Baileys: (jid, [usuarios], acción).
     */
    async groupParticipantsUpdate(jid, participants, action) {
      const channel = await resolveChannel(jid);
      const guild = channel?.guild;
      if (!guild) return [];

      const results = [];
      for (const participant of participants) {
        const id = jidToId(participant);
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) { results.push({ status: "404", jid: participant }); continue; }

        try {
          if (action === "remove") {
            if (!member.kickable) throw new Error("jerarquía");
            await member.kick("Comando del bot");
          } else if (action === "promote") {
            const role = guild.roles.cache.find((r) =>
              r.permissions.has(PermissionsBitField.Flags.ManageGuild) && r.editable);
            if (role) await member.roles.add(role);
          } else if (action === "demote") {
            const roles = member.roles.cache.filter((r) =>
              r.permissions.has(PermissionsBitField.Flags.ManageGuild) && r.editable);
            if (roles.size) await member.roles.remove(roles);
          }
          results.push({ status: "200", jid: participant });
        } catch {
          results.push({ status: "403", jid: participant });
        }
      }
      return results;
    },

    /**
     * 🔒 Abrir/cerrar el chat. En WhatsApp era `announcement`;
     * en Discord se traduce a permisos de `@everyone` sobre el canal.
     */
    async groupSettingUpdate(jid, setting) {
      const channel = await resolveChannel(jid);
      if (!channel?.guild) return false;
      const everyone = channel.guild.roles.everyone;
      const locked = setting === "announcement";
      await channel.permissionOverwrites.edit(everyone, { SendMessages: !locked }).catch(() => null);
      return true;
    },

    /** Invitación del canal (equivalente al link del grupo). */
    async groupInviteCode(jid) {
      const channel = await resolveChannel(jid);
      if (!channel?.guild) return null;
      const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 }).catch(() => null);
      return invite?.code || null;
    },

    async groupUpdateSubject(jid, subject) {
      const channel = await resolveChannel(jid);
      if (!channel?.guild) return false;
      await channel.setName(String(subject).slice(0, 100)).catch(() => null);
      return true;
    },

    async groupUpdateDescription(jid, description) {
      const channel = await resolveChannel(jid);
      if (!channel?.setTopic) return false;
      await channel.setTopic(String(description).slice(0, 1024)).catch(() => null);
      return true;
    },

    /** Foto de perfil de un usuario o icono del servidor. */
    async profilePictureUrl(jid, type = "image") {
      const id = jidToId(jid);
      if (isGroupJid(jid)) {
        const channel = await resolveChannel(jid);
        return channel?.guild?.iconURL({ size: type === "image" ? 512 : 128 }) || null;
      }
      const user = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
      return user?.displayAvatarURL({ size: type === "image" ? 512 : 128, extension: "png" }) || null;
    },

    /** Nombre visible de un usuario o canal. */
    async getName(jid) {
      const id = jidToId(jid);
      if (isGroupJid(jid)) {
        const channel = await resolveChannel(jid);
        return channel?.name || "Canal";
      }
      const user = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
      return user?.globalName || user?.username || id;
    },

    /** Indicador de "escribiendo…". */
    async sendPresenceUpdate(type, jid) {
      if (type !== "composing") return;
      const channel = await resolveChannel(jid);
      await channel?.sendTyping?.().catch(() => null);
    },

    async updateProfilePicture(jid, media) {
      try {
        const buffer = Buffer.isBuffer(media) ? media
          : media?.url ? Buffer.from(await (await fetch(media.url)).arrayBuffer())
          : fs.readFileSync(media);
        if (isGroupJid(jid)) {
          const channel = await resolveChannel(jid);
          await channel?.guild?.setIcon(buffer).catch(() => null);
        } else {
          await client.user.setAvatar(buffer).catch(() => null);
        }
        return true;
      } catch { return false; }
    },

    /** Cambia el nombre visible del bot. */
    async updateProfileName(name) {
      await client.user.setUsername(String(name).slice(0, 32)).catch(() => null);
      return true;
    },

    /**
     * Descarga un adjunto. Los plugins la usan como
     * `downloadContentFromMessage(node, tipo)` y recorren el stream.
     */
    async downloadContentFromMessage(node, _type) {
      const url = node?._discordUrl || node?.url || node?.directPath;
      if (!url) throw new Error("Adjunto sin URL");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Descarga fallida: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      // Iterable asíncrono, igual que el stream de Baileys.
      return (async function* () { yield buffer; })();
    },

    /** Compatibilidad: en Baileys servía para editar mensajes. */
    async relayMessage(jid, message, meta = {}) {
      const edit = message?.protocolMessage?.editedMessage;
      if (!edit) return null;
      const text = edit.conversation || edit.extendedTextMessage?.text || "";
      return conn.sendMessage(jid, { edit: message.protocolMessage.key, text });
    },

    /** Estado / actividad del bot (antes era el «info» de WhatsApp). */
    async updateProfileStatus(text) {
      client.user.setActivity(String(text).slice(0, 128));
      return true;
    },

    /**
     * Solicitudes de entrada. Discord no expone una cola de peticiones por
     * canal como WhatsApp; el equivalente es el filtro de acceso del
     * servidor. Se mantienen como operaciones seguras para que los plugins
     * que las invocan no rompan.
     */
    async groupRequestApprove() { return []; },
    async groupRequestReject() { return []; },

    /**
     * En WhatsApp resolvía los identificadores ocultos (@lid). Discord no
     * tiene ese problema: los IDs ya son definitivos, así que devolvemos la
     * lista tal cual para que los 86 usos en plugins sigan funcionando.
     */
    lidParser: (participants) => participants,

    /** Stub inofensivo: sólo se usaba para el cifrado de WhatsApp. */
    signalRepository: {
      lidMapping: {
        getLIDForPN: (jid) => jid,
        getPNForLID: (jid) => jid
      }
    },

    /** Utilidades expuestas para los plugins adaptados. */
    resolveChannel,
    resolveMessage,
    getUploadLimit: (guild) => getUploadLimit(guild)
  };

  /**
   * 📦 `conn.wa` — muchos plugins (guardar multimedia, tourl, stickers…)
   * buscaban aquí el módulo de Baileys para descargar adjuntos. Les damos
   * el mismo objeto con la misma firma, ahora servido desde el CDN de
   * Discord. También se expone en `global.wa`, que es el otro sitio donde
   * lo buscan.
   */
  conn.wa = {
    downloadContentFromMessage: conn.downloadContentFromMessage,
    proto: null
  };
  global.wa = conn.wa;

  return conn;
}

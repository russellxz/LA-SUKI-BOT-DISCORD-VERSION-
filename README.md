<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=200&color=gradient&customColorList=6,11,20&text=LA%20SUKI%20BOT&fontSize=64&fontColor=ffffff&animation=fadeIn&fontAlignY=34&desc=Edici%C3%B3n%20Discord%20·%20v3.0&descSize=20&descAlignY=56" width="100%"/>

<img src="https://cdn.russellxz.click/621517f4.jpg" width="620" alt="LA SUKI BOT"/>

<br/><br/>

<img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=800&size=26&duration=2800&pause=700&color=A855F7&center=true&vCenter=true&width=680&lines=%F0%9F%92%9C+Bot+premium+multifunci%C3%B3n+para+Discord;%E2%9A%A1+M%C3%A1s+de+390+comandos+listos+para+usar;%F0%9F%8E%AE+RPG+%C2%B7+Econom%C3%ADa+%C2%B7+Descargas+%C2%B7+IA;%F0%9F%A6%96+Instalaci%C3%B3n+en+Pterodactyl+en+2+minutos" alt="Typing SVG"/>

<br/>

<img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
<img src="https://img.shields.io/badge/Comandos-390+-A855F7?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Plugins-312-EC4899?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Pterodactyl-Ready-0E4688?style=for-the-badge&logo=pterodactyl&logoColor=white"/>

<br/><br/>

### 💫 Un solo token · Dos minutos · Bot funcionando

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

</div>

## 🎯 ¿Qué es LA SUKI BOT?

Un bot **comercial y completo** para Discord con más de **390 comandos** repartidos en RPG, economía, descargas, moderación automática e inteligencia artificial.

Está pensado para **venderse e instalarse sin complicaciones**: tu cliente sólo pega el token de su bot y arranca el servidor. Sin bases de datos externas, sin APIs que configurar, sin pasos intermedios.

<div align="center">

| 🎮 | 💰 | 📥 | 🛡️ | 🤖 |
|:--:|:--:|:--:|:--:|:--:|
| **RPG completo** | **Economía** | **Descargas** | **Moderación** | **IA** |
| Mascotas, clanes,<br/>misiones y batallas | Banco, inventario,<br/>tienda y rankings | YouTube, TikTok,<br/>Spotify, Instagram | Antilink, antispam,<br/>antibots y antiflood | Conversación natural<br/>con memoria |

</div>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## ⚡ Instalación rápida

<div align="center">

### 🐣 Paso 1 · Crea tu bot en Discord

</div>

1. Entra en el **[Discord Developer Portal](https://discord.com/developers/applications)**
2. Pulsa **New Application** → ponle nombre → **Create**
3. Ve a la pestaña **Bot** → **Reset Token** → **Copy**

> [!WARNING]
> **El token es la contraseña de tu bot.** No lo compartas, no lo subas a GitHub y no lo enseñes en capturas. Si se filtra, pulsa *Reset Token* de inmediato.

<div align="center">

### 🔐 Paso 2 · Activa los Intents (imprescindible)

</div>

En la misma pestaña **Bot**, baja hasta **Privileged Gateway Intents** y activa los tres:

<div align="center">

| Intent | ¿Para qué sirve? | Obligatorio |
|:--|:--|:--:|
| **Message Content Intent** | Leer los comandos que escriben los usuarios | ✅ |
| **Server Members Intent** | Bienvenidas, despedidas y detección de admins | ✅ |
| **Presence Intent** | Estado de los miembros en perfiles y rankings | ✅ |

</div>

> [!CAUTION]
> Si no los activas, el bot arrancará y **se cerrará con el error `Used disallowed intents`**. Es el fallo número uno en instalaciones nuevas.

<div align="center">

### 🔗 Paso 3 · Invita el bot a tu servidor

</div>

En **OAuth2 → URL Generator** marca:

- **Scopes:** `bot` y `applications.commands`
- **Bot Permissions:** los de la tabla desplegable

<details>
<summary><b>📋 Permisos necesarios — haz clic para desplegar</b></summary>

<br/>

| Permiso | Se usa en |
|:--|:--|
| `View Channels` | Leer los canales donde actúa |
| `Send Messages` | Responder a cualquier comando |
| `Send Messages in Threads` | Funcionar dentro de hilos |
| `Embed Links` | Menús, perfiles y fichas del RPG |
| `Attach Files` | Descargas, stickers e imágenes |
| `Read Message History` | Responder a mensajes citados |
| `Add Reactions` | Confirmaciones de comandos (⏳ ✅ ❌) |
| `Use External Emojis` | Emojis personalizados en los menús |
| `Manage Messages` | Antilink, antispam y `delete` |
| `Kick Members` | `kick`, antilink y antibots |
| `Ban Members` | `ban` y `unban` |
| `Moderate Members` | Silenciar con `mute` (timeout nativo) |
| `Manage Roles` | `daradmins` y `quitaradmins` |
| `Manage Channels` | `abrir`, `cerrar`, `setname` y `setinfo` |
| `Create Invite` | `linkgrupo` |

**Atajo:** puedes darle *Administrator* y te ahorras la lista. Es lo más cómodo para un cliente.

</details>

> [!IMPORTANT]
> Coloca el **rol del bot por encima** de los roles que deba moderar. Discord impide actuar sobre miembros con un rol igual o superior, por muchos permisos que tenga.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## 🦖 Instalación en Pterodactyl

<div align="center">

**La forma recomendada para hosting**

</div>

### 🥇 Opción A · Con el egg incluido (recomendada)

1. Panel de administración → **Nests → Import Egg**
2. Sube el archivo **`pterodactyl-egg.json`** de este repositorio
3. Crea un servidor nuevo con el egg **LA SUKI BOT · Discord**
4. En la pestaña **Startup**, rellena la variable **`DISCORD_TOKEN`**
5. Pulsa **Start** — el egg instala Node, ffmpeg y las dependencias solo

### 🥈 Opción B · Manual

```bash
git clone https://github.com/russellxz/LA-SUKI-BOT-DISCORD-VERSION-.git
cd LA-SUKI-BOT-DISCORD-VERSION-

npm install --omit=dev

cp .env.example .env
nano .env          # pega tu token en DISCORD_TOKEN

npm start
```

<div align="center">

**Configuración del servidor en el panel**

| Ajuste | Valor recomendado |
|:--|:--|
| 🐳 **Imagen Docker** | `ghcr.io/parkervcp/yolks:nodejs_22` |
| ▶️ **Comando de inicio** | `npm start` |
| 🧠 **RAM** | 1 GB mínimo · 2 GB recomendado |
| 💾 **Disco** | 3 GB |

</div>

> [!TIP]
> **ffmpeg es necesario** para convertir audio, vídeo y stickers, y para recomprimir los archivos que superan el límite de Discord. El egg lo instala automáticamente; en instalaciones manuales usa `apt install ffmpeg`.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## ⚙️ Variables de entorno

Todo se configura desde el archivo **`.env`** (o la pestaña *Startup* de Pterodactyl):

```env
# 🔑 OBLIGATORIO — Token del bot
DISCORD_TOKEN=tu_token_aqui

# 👑 OPCIONAL — Tu ID de Discord (te añade como owner automáticamente)
OWNER_ID=123456789012345678
```

<div align="center">

| Variable | Obligatoria | Descripción |
|:--|:--:|:--|
| `DISCORD_TOKEN` | ✅ | Token del Developer Portal. Lo único imprescindible. |
| `OWNER_ID` | ❌ | Tu ID de usuario. Alternativa cómoda a editar `owner.json`. |

</div>

### 👑 Propietarios del bot

Los owners se definen en **`owner.json`**, con el **mismo formato de siempre** — ahora con IDs de Discord:

```json
[
  ["123456789012345678"],
  ["987654321098765432"]
]
```

> **¿Cómo obtengo mi ID?** Ajustes de Discord → **Avanzado** → activa **Modo desarrollador**. Después, clic derecho sobre tu nombre → **Copiar ID de usuario**.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## 🎛️ Prefijos

El bot responde por defecto a **tres prefijos a la vez**:

<div align="center">

## `.play` · `#play` · `/play`

</div>

Se cambian en caliente con `setprefix`, y **se admiten emojis**:

```bash
.setprefix 🐱                     # →  🐱play
.setprefix [".", "#", "!", "💜"]   # →  varios a la vez
```

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## 📚 Comandos

<div align="center">

**+390 comandos** · escribe `.menu` dentro de Discord para verlos todos

</div>

<details open>
<summary><b>🎮 RPG y Economía · 124 comandos</b></summary>

<br/>

| Área | Comandos |
|:--|:--|
| 👤 **Perfil** | `perfil` · `bal` · `nivel` · `inventario` · `logros` |
| 🏦 **Economía** | `banco` · `depositar` · `retirar` · `dar` · `comprar` · `tienda` |
| ⛏️ **Trabajo** | `minar` · `cazar` · `pescar` · `cocinar` · `trabajar` · `claim` |
| 🐾 **Mascotas** | `addmascota` · `batallamascota` · `daragua` · `alimentar` |
| ⚔️ **Clanes** | `crearclan` · `unirme` · `miclan` · `clansupremo` · `darlider` |
| 🥊 **Batallas** | `batallauser` · `batallaanime` · `batallamas` |
| 🏆 **Rankings** | `top` · `topes` · `topesclavos` · `topkiss` · `topslap` |
| 💕 **Social** | `parejas` · `ship` · `kiss` · `slap` · `darcariño` |

</details>

<details>
<summary><b>📥 Descargas · 46 comandos</b></summary>

<br/>

| Plataforma | Comandos |
|:--|:--|
| ▶️ **YouTube** | `play` · `play2` · `ytmp3` · `ytmp4` · `yt1` · `yt2` |
| 🎵 **TikTok** | `tiktok` · `tt` · `tt2` · `ttt` |
| 🎧 **Spotify** | `spotify` · `sp` |
| 📸 **Instagram** | `ig` · `instagram` |
| 👥 **Facebook** | `fb` · `facebook` |
| 📌 **Pinterest** | `pinterest` · `pimg` · `pinvideo` |
| 📦 **Otros** | `mediafire` · `apk` · `letra` · `twitter` |

**Gestión automática del tamaño:** si un archivo supera el límite de Discord, el bot lo recomprime; si aun así no cabe, lo sube y envía un enlace temporal. Nunca falla ni se cae.

</details>

<details>
<summary><b>🛡️ Moderación y servidores · 56 comandos</b></summary>

<br/>

| Sistema | Comandos |
|:--|:--|
| 🔨 **Moderación** | `kick` · `ban` · `unban` · `mute` · `unmute` · `advertencias` |
| 🚫 **Protecciones** | `antilink` · `antis` · `antiarabe` · `linkall` · `antidelete` |
| ⚙️ **Canal** | `abrir` · `cerrar` · `setname` · `setinfo` · `setfoto` · `linkgrupo` |
| 👋 **Bienvenidas** | `setwelcome` · `welcome` · `setdespedidas` · `despedidas` |
| 🎖️ **Roles** | `daradmins` · `quitaradmins` · `modoadmins` |
| 📊 **Utilidad** | `infogrupo` · `todos` · `tag` · `fantasmas` · `totalchat` |

Todas las protecciones se activan por canal: `.antilink on` / `.antilink off`

</details>

<details>
<summary><b>🎨 General, IA y multimedia · 100 comandos</b></summary>

<br/>

| Área | Comandos |
|:--|:--|
| 🤖 **IA** | `chatgpt` · `gemini` · `dalle` · `ai` · `ask` · `vision` |
| 🎭 **Stickers** | `s` · `sticker` · `toimg` · `tovideo` · `qc` · `aniemoji` |
| 🎬 **Multimedia** | `guardar` · `del` · `tourl` · `toaudio` · `tts` · `hd` |
| 🎲 **Juegos** | `verdad` · `reto` · `ff` · `4vs4` · `12vs12` · `ship` |
| 🔧 **Utilidad** | `ping` · `menu` · `info` · `creador` · `mapas` · `pais` |

</details>

<details>
<summary><b>👑 Owner y ventas · 69 comandos</b></summary>

<br/>

| Área | Comandos |
|:--|:--|
| 👑 **Owner** | `addowner` · `delowner` · `apagado` · `modoprivado` · `bc` · `rest` |
| 🎨 **Personalización** | `botname` · `botfoto` · `setmenu` · `setmenuowner` |
| ➕ **Comandos propios** | `addco` · `delco` · `addlista` · `dellista` |
| 💵 **Ventas** | `pago` · `netflix` · `combos` · `promo` · `addfactura` · `setstock` |

</details>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## 🏗️ Arquitectura

Bot **100 % modular**: cada comando es un archivo suelto dentro de `plugins/`. Añadir uno nuevo es crear un `.js` y reiniciar.

```
📦 LA-SUKI-BOT-DISCORD
├── 📜 index.js              Punto de entrada: cliente, eventos y despacho
├── 📂 core/                 Núcleo de la edición Discord
│   ├── conn.js              Capa de compatibilidad para los plugins
│   ├── message.js           Adapta los mensajes de Discord
│   ├── media.js             Límites de subida, compresión y respaldo
│   ├── systems.js           Antilink, antispam, mute, ban, antidelete
│   ├── autoresponse.js      IA conversacional y multimedia guardada
│   └── ids.js               Equivalencias de identificadores
├── 📂 plugins/              +312 comandos por categorías
│   ├── pluginsrpg/          Sistema RPG
│   ├── pluginsrpges/        Clanes y esclavos
│   ├── pluginsdescargas/    Descargas
│   ├── pluginsgrupos/       Moderación y servidores
│   ├── pluginsowner/        Comandos de propietario
│   └── pluginsventas/       Sistema de ventas
├── 📂 libs/                 Utilidades compartidas
├── 📜 db.js                 Base de datos SQLite
├── 📜 owner.json            Propietarios del bot
└── 📜 pterodactyl-egg.json  Instalador para Pterodactyl
```

<details>
<summary><b>🔌 Cómo crear un plugin nuevo</b></summary>

<br/>

Crea `plugins/MiComando.js`:

```js
const handler = async (msg, { conn, args, text }) => {
  const chatId = msg.key.remoteJid;

  await conn.sendMessage(chatId, {
    text: `¡Hola! Me dijiste: ${text || "nada"}`
  }, { quoted: msg });
};

handler.command = ["hola", "saludo"];
export default handler;
```

Reinicia el bot y ya funciona con los tres prefijos.

</details>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## 🔄 Actualizar el bot

```bash
git pull
npm install --omit=dev
```

En Pterodactyl basta con **reinstalar el servidor** (*Settings → Reinstall Server*): el egg vuelve a clonar la última versión y conserva tu `.env`.

> [!NOTE]
> Los archivos de datos (`owner.json`, `activos.db`, `setwelcome.json`, `guar.json`) **no se sobrescriben**. Aun así, haz copia antes de una actualización grande.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## 🩺 Solución de problemas

<details>
<summary><b>❌ «Used disallowed intents»</b></summary>

<br/>

El fallo más habitual: faltan los intents privilegiados.

**Solución:** Developer Portal → tu aplicación → **Bot** → *Privileged Gateway Intents* → activa **los tres** → guarda → reinicia el bot.

</details>

<details>
<summary><b>❌ El bot está en línea pero no responde a los comandos</b></summary>

<br/>

Repasa en este orden:

1. **Message Content Intent** activado (sin él no lee los mensajes)
2. El bot tiene permiso **Ver canal** y **Enviar mensajes** en ese canal
3. Estás usando un prefijo válido: `.` `#` `/`
4. El canal no está apagado con `.apagado on`
5. El **modo privado** no está activo (`.modoprivado off`)

</details>

<details>
<summary><b>❌ «Missing Permissions» al expulsar, banear o silenciar</b></summary>

<br/>

Discord no deja actuar sobre miembros con un rol igual o superior al del bot.

**Solución:** Ajustes del servidor → **Roles** → arrastra el rol del bot **por encima** de los roles que deba moderar.

</details>

<details>
<summary><b>❌ Los comandos de descarga fallan o no envían el archivo</b></summary>

<br/>

- Comprueba que **ffmpeg** está instalado: `ffmpeg -version`
- Si el archivo era muy grande, el bot lo recomprime o envía un enlace: es el comportamiento esperado, no un error
- Los límites de Discord son **10 MB** (nivel 0-1), **50 MB** (nivel 2) y **100 MB** (nivel 3)

</details>

<details>
<summary><b>❌ Las bienvenidas no aparecen</b></summary>

<br/>

1. Activa el **Server Members Intent** en el Developer Portal
2. Configura el mensaje en el canal deseado: `.setwelcome tu mensaje`
3. Enciende el sistema: `.welcome on`

</details>

<details>
<summary><b>❌ Error al instalar «canvas» o «better-sqlite3»</b></summary>

<br/>

Faltan las librerías de compilación del sistema:

```bash
apt install -y build-essential python3 \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install
```

</details>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## ❓ Preguntas frecuentes

<details>
<summary><b>¿Necesito alguna API key aparte del token?</b></summary>

<br/>

**No.** El token de Discord es lo único obligatorio. Las APIs de descargas e IA vienen ya configuradas.

</details>

<details>
<summary><b>¿En cuántos servidores puede estar el bot?</b></summary>

<br/>

Sin límite hasta los **2.500 servidores**, momento en que Discord exige *sharding*. Para un uso normal no hay ninguna restricción.

</details>

<details>
<summary><b>¿Se pierden los datos al reiniciar?</b></summary>

<br/>

No. Todo se guarda en disco (`activos.db`, `setwelcome.json`, `sukirpg.json`, `owner.json`) y sobrevive a reinicios y actualizaciones.

</details>

<details>
<summary><b>¿Puedo cambiar el nombre y el avatar del bot?</b></summary>

<br/>

Sí, desde Discord con `.botname <nombre>` y `.botfoto` (respondiendo a una imagen), o desde el Developer Portal.

</details>

<details>
<summary><b>¿Funciona por mensaje directo?</b></summary>

<br/>

Sí. Los comandos generales y de RPG funcionan en DM. Los de moderación necesitan un servidor, como es lógico.

</details>

<details>
<summary><b>¿Cuánta RAM consume?</b></summary>

<br/>

Entre **300 y 600 MB** en marcha normal. Se recomienda **1 GB mínimo** y **2 GB** si vas a usar mucho las descargas.

</details>

<details>
<summary><b>¿Puedo revender el bot?</b></summary>

<br/>

Está preparado para ello: instalación en dos minutos, configuración con un único token y egg de Pterodactyl incluido.

</details>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

<div align="center">

## 💜 Soporte

**¿Dudas o problemas?**

<a href="https://youtube.com/@skyultraplus"><img src="https://img.shields.io/badge/YouTube-Sky_Ultra_Plus-FF0000?style=for-the-badge&logo=youtube&logoColor=white"/></a>
<a href="https://github.com/russellxz/LA-SUKI-BOT-DISCORD-VERSION-/issues"><img src="https://img.shields.io/badge/GitHub-Issues-181717?style=for-the-badge&logo=github&logoColor=white"/></a>

<br/><br/>

### ⭐ Si te sirve el proyecto, déjale una estrella

<br/>

**Desarrollado por Russell**

<img src="https://capsule-render.vercel.app/api?type=waving&height=120&color=gradient&customColorList=6,11,20&section=footer" width="100%"/>

</div>

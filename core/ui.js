/**
 * ui.js — Presentación en consola.
 *
 * Todo lo visual del arranque vive aquí: banner con degradado animado,
 * efecto de escritura, spinner y cajas de aviso. Sin dependencias extra
 * (sólo chalk) y con degradación elegante: si la consola no es interactiva
 * —como el streaming de logs de Pterodactyl— se imprime el resultado final
 * sin animaciones, para no llenar el log de basura.
 */

import chalk from "chalk";

/** ¿Podemos animar? En Pterodactyl los logs no son un TTY. */
export const canAnimate = Boolean(process.stdout.isTTY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────────── Colores ─────────────────────────────── */

/** Interpola entre varios colores para crear un degradado suave. */
function gradientColors(steps, stops = [
  [168, 85, 247],   // violeta
  [236, 72, 153],   // rosa
  [88, 101, 242]    // azul Discord
]) {
  const out = [];
  const segments = stops.length - 1;
  for (let i = 0; i < steps; i++) {
    const pos = (i / Math.max(1, steps - 1)) * segments;
    const idx = Math.min(segments - 1, Math.floor(pos));
    const t = pos - idx;
    const [r1, g1, b1] = stops[idx];
    const [r2, g2, b2] = stops[idx + 1];
    out.push([
      Math.round(r1 + (r2 - r1) * t),
      Math.round(g1 + (g2 - g1) * t),
      Math.round(b1 + (b2 - b1) * t)
    ]);
  }
  return out;
}

/** Aplica un degradado horizontal a una línea de texto. */
export function gradient(text, stops) {
  const colors = gradientColors(text.length || 1, stops);
  return [...text].map((ch, i) => {
    const [r, g, b] = colors[i] || colors[colors.length - 1];
    return chalk.rgb(r, g, b)(ch);
  }).join("");
}

/** Degradado vertical: cada línea toma un color del recorrido. */
export function gradientBlock(lines, stops) {
  const colors = gradientColors(lines.length || 1, stops);
  return lines.map((line, i) => {
    const [r, g, b] = colors[i] || colors[colors.length - 1];
    return chalk.rgb(r, g, b).bold(line);
  });
}

/* ────────────────────────────── Animaciones ───────────────────────────── */

/** Escribe carácter a carácter. */
export async function typeLine(text, delay = 14) {
  if (!canAnimate) { console.log(text); return; }
  for (const ch of text) {
    process.stdout.write(ch);
    await sleep(delay);
  }
  process.stdout.write("\n");
}

/** Muestra el banner línea a línea con degradado. */
export async function showBanner(lines, delay = 55) {
  const painted = gradientBlock(lines);
  for (const line of painted) {
    console.log(line);
    if (canAnimate) await sleep(delay);
  }
}

/**
 * Spinner con texto. Devuelve un objeto con `.stop(símbolo, texto)`.
 * En consolas no interactivas imprime una sola línea y ya.
 */
export function spinner(label) {
  if (!canAnimate) {
    console.log(chalk.cyan(`  ⋯ ${label}`));
    return { stop: (icon, text) => console.log(`  ${icon} ${text || label}`) };
  }

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${chalk.magenta(frames[i++ % frames.length])} ${chalk.white(label)}   `);
  }, 80);

  return {
    stop(icon = "✅", text = label) {
      clearInterval(timer);
      process.stdout.write(`\r  ${icon} ${chalk.white(text)}${" ".repeat(20)}\n`);
    }
  };
}

/** Barra de progreso animada de 0 a 100. */
export async function progressBar(label, duration = 700) {
  if (!canAnimate) { console.log(chalk.cyan(`  ⋯ ${label}`)); return; }
  const width = 28;
  const steps = 24;
  for (let s = 0; s <= steps; s++) {
    const filled = Math.round((s / steps) * width);
    const bar = gradient("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
    const pct = String(Math.round((s / steps) * 100)).padStart(3);
    process.stdout.write(`\r  ${bar} ${chalk.bold(pct)}%  ${chalk.white(label)}`);
    await sleep(duration / steps);
  }
  process.stdout.write("\n");
}

/* ──────────────────────────────── Cajas ───────────────────────────────── */

const BOX = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

/** Longitud visible, ignorando los códigos de color. */
const visibleLength = (s) => s.replace(/\[[0-9;]*m/g, "").length;

/** Dibuja un recuadro con título alrededor de varias líneas. */
export function box(title, lines, color = chalk.magenta) {
  const width = Math.max(
    visibleLength(title) + 4,
    ...lines.map((l) => visibleLength(l) + 4),
    56
  );

  const top = color(`${BOX.tl}${BOX.h} ${chalk.bold(title)} ${color(BOX.h.repeat(Math.max(0, width - visibleLength(title) - 5)))}${BOX.tr}`);
  const bottom = color(`${BOX.bl}${BOX.h.repeat(width - 2)}${BOX.br}`);

  console.log("\n" + top);
  for (const line of lines) {
    const pad = " ".repeat(Math.max(0, width - visibleLength(line) - 4));
    console.log(`${color(BOX.v)} ${line}${pad} ${color(BOX.v)}`);
  }
  console.log(bottom + "\n");
}

/** Línea separadora con degradado. */
export const rule = (width = 58) => console.log(gradient("━".repeat(width)));

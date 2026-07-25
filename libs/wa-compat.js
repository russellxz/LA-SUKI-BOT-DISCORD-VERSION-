/**
 * wa-compat.js — Sustituto de las utilidades de Baileys que aún usan algunos
 * plugins para leer archivos adjuntos.
 *
 * En WhatsApp los medios llegaban cifrados y había que descargarlos por
 * streaming. En Discord son URLs públicas del CDN, así que basta con una
 * petición HTTP; mantenemos la misma firma y el mismo iterable asíncrono
 * para que los plugins no cambien ni una línea de su lógica.
 */

/**
 * @param {object} node  Nodo de medio (imageMessage, videoMessage, …)
 * @returns {AsyncGenerator<Buffer>} stream compatible con `for await`
 */
export async function downloadContentFromMessage(node, _type) {
  const url = node?._discordUrl || node?.url || node?.directPath;
  if (!url) throw new Error("El adjunto no tiene URL descargable.");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el archivo (${res.status})`);

  const buffer = Buffer.from(await res.arrayBuffer());
  return (async function* () { yield buffer; })();
}

/** Algunos plugins comprueban `proto` antes de editar mensajes. */
export const proto = null;

export default { downloadContentFromMessage, proto };

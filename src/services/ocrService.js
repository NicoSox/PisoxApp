/**
 * ocrService.js
 * ─────────────
 * OCR optimizado para capturas de pantalla de sistema web.
 * Las capturas ya tienen texto nítido — no necesitan preprocesado agresivo.
 *
 * Formato del ticket:
 *   "Sitio" | Ticket "CODIGO" cargado con éxito | "Titulo"
 *   ─────────────────────────────────────────────────────
 *   Sitio:       Tucumán
 *   Rubro:       General y otros
 *   Sub-Rubro:   Edificio
 *   Descripción: Colocar media sombra estacionamiento
 *   Prioridad:   Baja
 */

import fs   from 'fs/promises'
import path from 'path'
import { v4 as uuid }   from 'uuid'
import sharp            from 'sharp'
import Tesseract        from 'tesseract.js'

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
await fs.mkdir(UPLOAD_DIR, { recursive: true })


// ── 1. Escalar imagen si es pequeña (capturas pequeñas dan peor OCR) ──────────
async function scaleIfNeeded(inputPath) {
  const { width } = await sharp(inputPath).metadata()
  // Si ya es grande, no tocar nada — el texto está perfecto
  if (width >= 1000) return null

  const outPath = path.join(UPLOAD_DIR, `scaled_${uuid()}.png`)
  await sharp(inputPath)
    .resize({ width: 1400, withoutEnlargement: false })
    .png()                  // PNG sin compresión = mejor OCR
    .toFile(outPath)
  return outPath
}


// ── 2. Guardar imagen optimizada para cards (480×320 máx) ─────────────────────
async function saveOptimized(inputPath, prefix = 'ticket') {
  const filename = `${prefix}_${uuid().slice(0, 8)}.jpg`
  const outPath  = path.join(UPLOAD_DIR, filename)
  await sharp(inputPath)
    .resize({ width: 480, height: 320, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(outPath)
  return `/${UPLOAD_DIR}/${filename}`
}


// ── 3. Tesseract.js — configurado para capturas de pantalla ───────────────────
async function runTesseract(imagePath) {
  const worker = await Tesseract.createWorker('spa', 1, {
    logger: () => {},
  })

  try {
    // PSM 6 = bloque de texto uniforme — ideal para capturas web con texto estructurado
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    })

    const { data } = await worker.recognize(imagePath)
    return {
      text:      data.text.trim(),
      confianza: Math.round(data.confidence),
    }
  } finally {
    await worker.terminate()
  }
}


// ── 4. Parser del formato específico del ticket ───────────────────────────────
function parseTicketText(text) {
  const result = {}

  // Código: busca Ticket "xxxx" o Ticket \"xxxx\"
  const codigoMatch = text.match(/Ticket\s+[\\"]?([a-f0-9]{6,12})[\\"]?/i)
  if (codigoMatch) result.codigo = codigoMatch[1]

  // Título: último segmento entre comillas en la primera línea
  const firstLine = text.split('\n')[0]
  const tituloMatches = firstLine.match(/[""\\"]([^"""\\]+)[""\\"](?:\s*[\|│]?\s*)?(?:\(|$|\n|Resumir)/g)
  if (tituloMatches && tituloMatches.length > 0) {
    const last = tituloMatches[tituloMatches.length - 1]
    const m = last.match(/[""\\"]([^"""\\]+)[""\\"]/)
    if (m) result.titulo = m[1].trim()
  }
  // Fallback título: busca 'Tu ticket sobre "..."'
  if (!result.titulo) {
    const sobreMatch = text.match(/Tu ticket sobre\s+[""\\"]([^"""\\]+)[""\\"]/)
    if (sobreMatch) result.titulo = sobreMatch[1].trim()
  }

  // Sitio
  const sitioMatch = text.match(/Sitio:\s*([^\n]+)/)
  if (sitioMatch) result.sitio = sitioMatch[1].trim()

  // Rubro
  const rubroMatch = text.match(/Rubro:\s*([^\n]+)/)
  if (rubroMatch) result.rubro = rubroMatch[1].trim()

  // Sub-Rubro
  const subMatch = text.match(/Sub-Rubro:\s*([^\n]+)/)
  if (subMatch) result.sub_rubro = subMatch[1].trim()

  // Descripción — puede ser multilínea hasta "Prioridad:"
  const descMatch = text.match(/Descripci[oó]n:\s*([\s\S]+?)(?=\nPrioridad:|\nActivar|\n\n)/)
  if (descMatch) result.descripcion = descMatch[1].replace(/\n/g, ' ').trim()

  // Prioridad
  const prioMatch = text.match(/Prioridad:\s*(Baja|Media|Alta|Crítica|Critica)/i)
  if (prioMatch) {
    result.prioridad = prioMatch[1].charAt(0).toUpperCase() + prioMatch[1].slice(1)
    if (result.prioridad === 'Critica') result.prioridad = 'Crítica'
  }

  return result
}

// ── FUNCIÓN PRINCIPAL ──────────────────────────────────────────────────────────
export async function processTicketImage(originalPath) {
  const result = {
    codigo:          null,
    titulo:          null,
    sitio:           null,
    rubro:           null,
    sub_rubro:       null,
    descripcion:     null,
    prioridad:       'Media',
    ocr_confianza:   0,
    texto_ocr_raw:   '',
    imagen_path:     null,
    campos_faltantes: [],
    error:           null,
  }

  let scaled = null

  try {
    // 1. Escalar solo si es necesario
    scaled = await scaleIfNeeded(originalPath)
    const ocrSource = scaled || originalPath

    // 2. OCR sobre la imagen (original o escalada)
    try {
      const { text, confianza } = await runTesseract(ocrSource)
      result.texto_ocr_raw = text
      result.ocr_confianza = confianza

      console.log('[OCR] Texto extraído:\n', text)
      console.log('[OCR] Confianza:', confianza)

      // 3. Parsear campos
      const parsed = parseTicketText(text)
      result.codigo      = parsed.codigo
      result.titulo      = parsed.titulo
      result.sitio       = parsed.sitio
      result.rubro       = parsed.rubro
      result.sub_rubro   = parsed.sub_rubro
      result.descripcion = parsed.descripcion
      result.prioridad   = parsed.prioridad || 'Media'

    } catch (ocrErr) {
      console.error('[OCR] Error:', ocrErr.message)
      result.error = `OCR falló: ${ocrErr.message}. Completá los campos manualmente.`
    }

    // 4. Guardar imagen optimizada para la card
    result.imagen_path = await saveOptimized(originalPath, 'ticket')

    // 5. Detectar campos obligatorios faltantes
    for (const [campo, label] of [
      ['codigo',      'Código'],
      ['titulo',      'Título'],
      ['descripcion', 'Descripción'],
    ]) {
      if (!result[campo]) result.campos_faltantes.push({ campo, label })
    }

  } catch (err) {
    console.error('[OCR] Fatal:', err)
    result.error = `Error procesando imagen: ${err.message}`
  } finally {
    if (scaled) await fs.unlink(scaled).catch(() => {})
  }

  return result
}

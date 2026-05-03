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
  const parsed = {
    codigo:      null,
    titulo:      null,
    sitio:       null,
    rubro:       null,
    sub_rubro:   null,
    descripcion: null,
    prioridad:   null,
  }

  if (!text) return parsed

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // ── Código ──
  // Busca: Ticket "8bd222a3" o Ticket 8bd222a3
  const codigoMatch =
    text.match(/[Tt]icket\s+[""]([a-zA-Z0-9_\-]{4,30})[""]/) ||
    text.match(/[Tt]icket\s+([a-zA-Z0-9_\-]{4,30})\s/)
  if (codigoMatch) parsed.codigo = codigoMatch[1]

  // ── Título ──
  // Busca: | "Titulo del ticket" o | Titulo del ticket (al final de la primera línea)
  // También: sobre "Titulo"
  const tituloMatch =
    text.match(/[|｜]\s*[""](.+?)[""]/) ||
    text.match(/sobre\s+[""](.+?)[""]/) ||
    text.match(/éxito\s*[|｜]\s*[""]?(.{5,80})[""]?/)
  if (tituloMatch) parsed.titulo = tituloMatch[1].trim().replace(/[""/]+$/, '').trim()

  // ── Campos clave: valor ──
  // Soporta variaciones de OCR: "Rubro:", "Rubro :", "RUBRO:"
  for (const line of lines) {
    const tryField = (regex) => {
      const m = line.match(regex)
      return m ? m[1].trim() : null
    }

    if (!parsed.sitio)
      parsed.sitio       = tryField(/^[Ss]itio\s*[:：]\s*(.+)/)

    if (!parsed.rubro)
      parsed.rubro       = tryField(/^[Rr]ubro\s*[:：]\s*(.+)/)

    if (!parsed.sub_rubro)
      parsed.sub_rubro   = tryField(/^[Ss]ub[\s\-]?[Rr]ubro\s*[:：]\s*(.+)/i)

    if (!parsed.descripcion)
      parsed.descripcion = tryField(/^[Dd]escripci[oó]n\s*[:：]\s*(.+)/)

    if (!parsed.prioridad)
      parsed.prioridad   = tryField(/^[Pp]rioridad\s*[:：]\s*(.+)/)
  }

  // ── Normalizar prioridad ──
  if (parsed.prioridad) {
    const p = parsed.prioridad.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if      (p.includes('baja'))   parsed.prioridad = 'Baja'
    else if (p.includes('criti') || p.includes('críti')) parsed.prioridad = 'Crítica'
    else if (p.includes('alta'))   parsed.prioridad = 'Alta'
    else                           parsed.prioridad = 'Media'
  }

  // ── Fallback título ──
  // Si no se encontró título, usar la primera línea que parezca un título real
  if (!parsed.titulo) {
    const skip = /[Tt]icket|¡Hola|cargado|exitosamente|[Ss]itio|[Rr]ubro|[Dd]escripci|[Pp]rioridad/
    const fallback = lines.find(l => l.length > 8 && !l.match(skip))
    if (fallback) parsed.titulo = fallback.slice(0, 120)
  }

  return parsed
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

/**
 * ocrService.js
 * ─────────────
 * OCR optimizado para capturas de pantalla de sistema web.
 * Las capturas ya tienen texto nítido — no necesitan preprocesado agresivo.
 */

import fs   from 'fs/promises'
import path from 'path'
import { v4 as uuid }   from 'uuid'
import sharp            from 'sharp'
import Tesseract        from 'tesseract.js'

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
await fs.mkdir(UPLOAD_DIR, { recursive: true })


// ── 1. Escalar imagen si es pequeña ──────────────────────────────────────────
async function scaleIfNeeded(inputPath) {
  const { width, height } = await sharp(inputPath).metadata()
  console.log(`[OCR] Imagen original: ${width}x${height}px`)

  // Si es muy angosta o pequeña, escalar — pero SIN recortar altura
  if (width < 1000) {
    const outPath = path.join(UPLOAD_DIR, `scaled_${uuid()}.png`)
    await sharp(inputPath)
      .resize({ width: 1400, withoutEnlargement: false })
      .png()
      .toFile(outPath)
    return outPath
  }
  return null
}


// ── 2. Guardar imagen optimizada para cards ───────────────────────────────────
async function saveOptimized(inputPath, prefix = 'ticket') {
  const filename = `${prefix}_${uuid().slice(0, 8)}.jpg`
  const outPath  = path.join(UPLOAD_DIR, filename)
  await sharp(inputPath)
    .resize({ width: 480, height: 320, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(outPath)
  return `/${UPLOAD_DIR}/${filename}`
}


// ── 3. Tesseract — PSM 6, sin límite de página ────────────────────────────────
async function runTesseract(imagePath) {
  const worker = await Tesseract.createWorker('spa', 1, {
    logger: () => {},
  })

  try {
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


// ── 4. Normalizar texto — unifica variaciones de comillas y caracteres ─────────
function normalizeText(text) {
  return text
    // Comillas tipográficas → estándar
    .replace(/[""«»]/g, '"')
    // Comillas escapadas → estándar
    .replace(/\\"/g, '"')
    // Comillas simples tipográficas → estándar
    .replace(/['']/g, "'")
    // Pipes alternativos → |
    .replace(/[│┃❙]/g, '|')
    // Guiones decorativos → espacio
    .replace(/[—–─]+/g, ' ')
    // Múltiples espacios → uno
    .replace(/[ \t]{2,}/g, ' ')
    // Limpiar líneas con solo ruido (solo símbolos no alfanuméricos)
    .split('\n')
    .filter(line => /[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/.test(line))
    .join('\n')
}


// ── 5. Parser tolerante ────────────────────────────────────────────────────────
function parseTicketText(rawText) {
  const text   = normalizeText(rawText)
  const result = {}

  console.log('[OCR] Texto normalizado:\n', text)

  // ── Código ──
  // Busca: Ticket "xxxx" o Ticket 'xxxx' con 6-12 hex chars
  const codigoMatch = text.match(/Ticket\s+"?'?([a-f0-9]{6,12})"?'?/i)
  if (codigoMatch) result.codigo = codigoMatch[1]

  // ── Título ──
  // Priorizar formato del correo: Tu ticket sobre "..." se ha cargado
  if (!result.titulo) {
    const sobreMatch = text.match(/tu ticket sobre\s+"([^"]+)"\s+se ha cargad/i)
      || text.match(/tu ticket sobre\s+'([^']+)'\s+se ha cargad/i)
      || text.match(/tu ticket sobre\s+(.+?)\s+se ha cargad/i)
    if (sobreMatch && sobreMatch[1]) {
      const tituloClean = sobreMatch[1].replace(/^["'\s]+|["'\s]+$/g, '').trim()
      if (tituloClean.length > 3) result.titulo = tituloClean
    }
  }

  // Fallback: título en el encabezado con pipes
  if (!result.titulo) {
    const firstLine = text.split('\n')[0]
    const partes    = firstLine.split('|')
    if (partes.length >= 3) {
      const ultimaParte = partes[partes.length - 1].trim()
      const tituloClean = ultimaParte.replace(/^["'\s]+|["'\s]+$/g, '').trim()
      if (tituloClean.length > 3) result.titulo = tituloClean
    }
  }

  // ── Sitio ──
  const sitioMatch = text.match(/Sitio\s*:\s*([^\n]+)/i)
  if (sitioMatch) result.sitio = sitioMatch[1].replace(/^["'\s]+|["'\s]+$/g, '').trim()

  // ── Rubro ──
  // Evitar capturar "Sub-Rubro" como "Rubro"
  const rubroMatch = text.match(/(?<!Sub[-\s])Rubro\s*:\s*([^\n]+)/i)
  if (rubroMatch) result.rubro = rubroMatch[1].replace(/^["'\s]+|["'\s]+$/g, '').trim()

  // ── Sub-Rubro ──
  const subMatch = text.match(/Sub[-\s]?Rubro\s*:\s*([^\n]+)/i)
  if (subMatch) result.sub_rubro = subMatch[1].replace(/^["'\s]+|["'\s]+$/g, '').trim()

  // ── Descripción — tolerante a Descripcion/Descripción y separadores : o - ──
  const descRegex = /Descripci(?:o|ó)n\s*[:\-]?\s*([\s\S]+?)(?=\n\s*(?:Prioridad|Activar|Atenci|Pronto|Saludos)\b|\n\s*\n|$)/i
  const descMatch = text.match(descRegex)
  if (descMatch && descMatch[1]) {
    result.descripcion = descMatch[1]
      .replace(/\r/g, '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  } else {
    const inlineDesc = text.match(/Descripci(?:o|ó)n\s*[:\-]?\s*([^\n]+)/i)
    if (inlineDesc && inlineDesc[1]) {
      result.descripcion = inlineDesc[1].trim()
    }
  }

  // ── Prioridad ──
  const prioMatch = text.match(/Prioridad\s*:\s*(Baja|Media|Alta|Cr[ií]tica)/i)
  if (prioMatch) {
    const p = prioMatch[1]
    result.prioridad = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    if (result.prioridad === 'Critica' || result.prioridad === 'Crítica') result.prioridad = 'Crítica'
  }

  console.log('[OCR] Campos extraídos:', result)
  return result
}


// ── FUNCIÓN PRINCIPAL ──────────────────────────────────────────────────────────
export async function processTicketImage(originalPath) {
  const result = {
    codigo:           null,
    titulo:           null,
    sitio:            null,
    rubro:            null,
    sub_rubro:        null,
    descripcion:      null,
    prioridad:        'Media',
    ocr_confianza:    0,
    texto_ocr_raw:    '',
    imagen_path:      null,
    campos_faltantes: [],
    error:            null,
  }

  let scaled = null

  try {
    scaled = await scaleIfNeeded(originalPath)
    const ocrSource = scaled || originalPath

    try {
      const { text, confianza } = await runTesseract(ocrSource)
      result.texto_ocr_raw = text
      result.ocr_confianza = confianza

      console.log('[OCR] Texto extraído:\n', text)
      console.log('[OCR] Confianza:', confianza)

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

    result.imagen_path = await saveOptimized(originalPath, 'ticket')

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

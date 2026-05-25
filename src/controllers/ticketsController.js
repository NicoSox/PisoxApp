import pool from '../utils/db.js'
import fs   from 'fs/promises'

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildWhereClause(query) {
  const conditions = []
  const values     = []
  const estado = query.estado?.trim()
  const prioridad = query.prioridad?.trim()
  const rubro = query.rubro?.trim()
  const sitio = query.sitio?.trim()
  const q = query.q?.trim()

  if (estado)    { conditions.push('LOWER(TRIM(estado)) = LOWER(TRIM(?))');       values.push(estado) }
  if (prioridad) { conditions.push('LOWER(TRIM(prioridad)) = LOWER(TRIM(?))');    values.push(prioridad) }
  if (rubro)     { conditions.push('LOWER(TRIM(rubro)) = LOWER(TRIM(?))');        values.push(rubro) }
  if (sitio)     { conditions.push('LOWER(TRIM(sitio)) = LOWER(TRIM(?))');        values.push(sitio) }
  if (q) {
    const like = `%${q}%`
    conditions.push(`(
      titulo LIKE ? OR
      codigo LIKE ? OR
      descripcion LIKE ? OR
      sitio LIKE ? OR
      rubro LIKE ? OR
      sub_rubro LIKE ? OR
      asignado_a LIKE ? OR
      notas LIKE ?
    )`)
    values.push(like, like, like, like, like, like, like, like)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, values }
}

function getActorName(req) {
  if (req?.user?.nombre) return req.user.nombre
  if (req?.user?.email) return req.user.email
  return 'sistema'
}

async function logChange(ticketId, campo, valorAntes, valorDespues, modificadoPor = 'sistema') {
  await pool.execute(
    `INSERT INTO ticket_historial (ticket_id, campo, valor_antes, valor_despues, modificado_por)
     VALUES (?, ?, ?, ?, ?)`,
    [ticketId, campo, valorAntes ?? null, valorDespues ?? null, modificadoPor]
  )
}

async function getComentarios(ticketId) {
  const [rows] = await pool.execute(
    'SELECT * FROM ticket_comentarios WHERE ticket_id = ? ORDER BY created_at ASC',
    [ticketId]
  )
  return rows
}

// Elimina el archivo de imagen del disco de forma segura
async function deleteImageFile(imagenPath) {
  if (!imagenPath) return
  try {
    const local = imagenPath.replace(/^\//, '')
    await fs.unlink(local)
    if (process.env.DEBUG === 'true') console.log(`[IMG] Eliminada: ${local}`)
  } catch (e) {
    // Si no existe, no es error crítico
    if (e.code !== 'ENOENT' && process.env.DEBUG === 'true') console.warn('[IMG] No se pudo eliminar:', e.message)
  }
}

// ── GET /api/tickets ──────────────────────────────────────────────────────────
export async function listTickets(req, res) {
  const { where, values } = buildWhereClause(req.query)
  const [tickets] = await pool.execute(
    `SELECT * FROM tickets ${where} ORDER BY created_at DESC`,
    values
  )
  for (const t of tickets) {
    t.comentarios = await getComentarios(t.id)
  }
  res.json(tickets)
}

// ── POST /api/tickets ─────────────────────────────────────────────────────────
export async function createTicket(req, res) {
  const {
    codigo, titulo, sitio, rubro, sub_rubro, descripcion,
    prioridad, estado, asignado_a, notas,
    imagen_path, texto_ocr_raw, ocr_confianza,
  } = req.body

  if (!codigo?.trim()) return res.status(400).json({ error: 'El código es obligatorio' })
  if (!titulo?.trim()) return res.status(400).json({ error: 'El título es obligatorio' })

  const [result] = await pool.execute(
    `INSERT INTO tickets
       (codigo, titulo, sitio, rubro, sub_rubro, descripcion,
        prioridad, estado, asignado_a, notas, imagen_path, texto_ocr_raw, ocr_confianza)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      codigo.trim(), titulo.trim(),
      sitio || null, rubro || null, sub_rubro || null, descripcion || null,
      prioridad || 'Media', estado || 'Pendiente',
      asignado_a || null, notas || null,
      imagen_path || null, texto_ocr_raw || null,
      ocr_confianza != null ? parseInt(ocr_confianza, 10) : null,
    ]
  )

  const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [result.insertId])
  rows[0].comentarios = []
  res.status(201).json(rows[0])
}

// ── GET /api/tickets/:id ──────────────────────────────────────────────────────
export async function getTicket(req, res) {
  const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [req.params.id])
  if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' })
  rows[0].comentarios = await getComentarios(rows[0].id)
  res.json(rows[0])
}

// ── PUT /api/tickets/:id ──────────────────────────────────────────────────────
export async function updateTicket(req, res) {
  const id = parseInt(req.params.id, 10)

  const [current] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [id])
  if (!current.length) return res.status(404).json({ error: 'Ticket no encontrado' })

  const ticket = current[0]
  const campos = ['titulo', 'sitio', 'rubro', 'sub_rubro', 'descripcion',
                  'prioridad', 'estado', 'asignado_a', 'notas']

  const sets    = []
  const values  = []
  const changes = []

  for (const campo of campos) {
    if (req.body[campo] !== undefined && req.body[campo] !== ticket[campo]) {
      sets.push(`${campo} = ?`)
      values.push(req.body[campo])
      changes.push({ campo, antes: ticket[campo], despues: req.body[campo] })
    }
  }

  if (sets.length) {
    values.push(id)
    await pool.execute(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, values)
    const actorName = getActorName(req)
    await Promise.all(changes.map(c => logChange(id, c.campo, c.antes, c.despues, actorName)))
  }

  // ── Si el nuevo estado es "Resuelto" → borrar imagen del disco ──────────
  const nuevoEstado = req.body.estado
  if (nuevoEstado === 'Resuelto' && ticket.imagen_path) {
    await deleteImageFile(ticket.imagen_path)
    // Limpiar imagen_path en la DB también
    await pool.execute('UPDATE tickets SET imagen_path = NULL WHERE id = ?', [id])
    await logChange(id, 'imagen_path', ticket.imagen_path, null, getActorName(req))
  }

  const [updated] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [id])
  updated[0].comentarios = await getComentarios(id)
  res.json(updated[0])
}

// ── DELETE /api/tickets/:id ───────────────────────────────────────────────────
export async function deleteTicket(req, res) {
  const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [req.params.id])
  if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' })

  // Eliminar imagen del disco antes de borrar el registro
  await deleteImageFile(rows[0].imagen_path)

  await pool.execute('DELETE FROM tickets WHERE id = ?', [req.params.id])
  res.json({ ok: true })
}

// ── POST /api/tickets/:id/comentarios ─────────────────────────────────────────
export async function addComentario(req, res) {
  const ticketId = parseInt(req.params.id, 10)
  const { autor, comentario } = req.body

  if (!comentario?.trim()) return res.status(400).json({ error: 'El comentario no puede estar vacío' })

  const [result] = await pool.execute(
    'INSERT INTO ticket_comentarios (ticket_id, autor, comentario) VALUES (?, ?, ?)',
    [ticketId, autor?.trim() || 'Anónimo', comentario.trim()]
  )

  const [rows] = await pool.execute('SELECT * FROM ticket_comentarios WHERE id = ?', [result.insertId])
  res.status(201).json(rows[0])
}

// ── DELETE /api/tickets/:id/comentarios/:cid ──────────────────────────────────
export async function deleteComentario(req, res) {
  await pool.execute(
    'DELETE FROM ticket_comentarios WHERE id = ? AND ticket_id = ?',
    [req.params.cid, req.params.id]
  )
  res.json({ ok: true })
}

// ── GET /api/tickets/:id/historial ────────────────────────────────────────────
export async function getHistorial(req, res) {
  const [rows] = await pool.execute(
    'SELECT * FROM ticket_historial WHERE ticket_id = ? ORDER BY modificado_at DESC',
    [req.params.id]
  )
  res.json(rows)
}

// ── GET /api/stats ────────────────────────────────────────────────────────────
export async function getStats(req, res) {
  const [[totals]] = await pool.execute(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(estado = 'Pendiente'), 0)   AS pendiente,
      COALESCE(SUM(estado = 'En Proceso'), 0)   AS en_proceso,
      COALESCE(SUM(estado = 'Resuelto'), 0)     AS resuelto,
      COALESCE(SUM(estado = 'Cerrado'), 0)      AS cerrado
    FROM tickets
  `)
  res.json(totals)
}

// ── GET /api/meta ─────────────────────────────────────────────────────────────
export async function getMeta(req, res) {
  const [[rubros], [sitios], [subRubros]] = await Promise.all([
    pool.execute('SELECT DISTINCT TRIM(rubro)     AS rubro     FROM tickets WHERE rubro     IS NOT NULL AND TRIM(rubro)     <> "" ORDER BY rubro'),
    pool.execute('SELECT DISTINCT TRIM(sitio)     AS sitio     FROM tickets WHERE sitio     IS NOT NULL AND TRIM(sitio)     <> "" ORDER BY sitio'),
    pool.execute('SELECT DISTINCT TRIM(sub_rubro) AS sub_rubro FROM tickets WHERE sub_rubro IS NOT NULL AND TRIM(sub_rubro) <> "" ORDER BY sub_rubro'),
  ])
  res.json({
    rubros:     rubros.map(r => r.rubro),
    sitios:     sitios.map(r => r.sitio),
    sub_rubros: subRubros.map(r => r.sub_rubro),
  })
}

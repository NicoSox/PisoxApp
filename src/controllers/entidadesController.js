// src/controllers/entidadesController.js
import pool from '../utils/db.js'

const API_URL    = process.env.API_URL || ''
const UPLOAD_DIR  = process.env.UPLOAD_DIR || 'uploads'

function parseDatos(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// POST /api/entidades/upload-foto — foto de perfil de la entidad
export async function uploadFotoEntidad(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  const url = `${API_URL}/${UPLOAD_DIR}/${req.file.filename}`
  res.json({ url })
}

// GET /api/entidades?propiedad_id=X
export async function listEntidades(req, res) {
  const { propiedad_id } = req.query
  if (!propiedad_id) return res.status(400).json({ error: 'propiedad_id es requerido' })

  const [rows] = await pool.execute(
    `SELECT e.*, tt.nombre as tipo_trabajo, st.nombre as subtipo_trabajo
     FROM entidades e
     LEFT JOIN tipos_trabajo tt ON tt.id = e.tipo_trabajo_id
     LEFT JOIN subtipos_trabajo st ON st.id = e.subtipo_trabajo_id
     WHERE e.propiedad_id = ? AND e.activo = 1
     ORDER BY e.habitacion, e.nombre`,
    [propiedad_id]
  )
  rows.forEach(r => { r.datos_tecnicos = parseDatos(r.datos_tecnicos) })
  res.json(rows)
}

// GET /api/entidades/:id — incluye el historial de trabajos completados sobre ella
export async function getEntidad(req, res) {
  const [[ent]] = await pool.execute(
    `SELECT e.*, tt.nombre as tipo_trabajo, st.nombre as subtipo_trabajo, p.cliente_id
     FROM entidades e
     LEFT JOIN tipos_trabajo tt ON tt.id = e.tipo_trabajo_id
     LEFT JOIN subtipos_trabajo st ON st.id = e.subtipo_trabajo_id
     JOIN propiedades p ON p.id = e.propiedad_id
     WHERE e.id = ?`,
    [req.params.id]
  )
  if (!ent) return res.status(404).json({ error: 'No encontrado' })
  ent.datos_tecnicos = parseDatos(ent.datos_tecnicos)

  const [historial] = await pool.execute(
    `SELECT tc.id, tc.titulo, tc.descripcion, tc.fecha_inicio, tc.fecha_fin,
            tc.garantia_meses, tc.garantia_hasta, tc.estado,
            u.nombre as tecnico_nombre
     FROM trabajos_cliente tc
     LEFT JOIN users u ON u.id = tc.tecnico_id
     WHERE tc.entidad_id = ? AND tc.estado = 'completado'
     ORDER BY tc.fecha_fin DESC`,
    [req.params.id]
  )
  ent.historial = historial

  res.json(ent)
}

// POST /api/entidades — la crea el relevador durante el relevamiento
export async function createEntidad(req, res) {
  const {
    propiedad_id, nombre, habitacion,
    tipo_trabajo_id, subtipo_trabajo_id,
    foto_perfil_url, datos_tecnicos,
  } = req.body

  if (!propiedad_id || !nombre || !habitacion) {
    return res.status(400).json({ error: 'propiedad_id, nombre y habitacion son requeridos' })
  }

  const [r] = await pool.execute(
    `INSERT INTO entidades
      (propiedad_id, nombre, habitacion, tipo_trabajo_id, subtipo_trabajo_id, foto_perfil_url, datos_tecnicos)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      propiedad_id, nombre, habitacion,
      tipo_trabajo_id || null, subtipo_trabajo_id || null,
      foto_perfil_url || null,
      JSON.stringify(Array.isArray(datos_tecnicos) ? datos_tecnicos : []),
    ]
  )

  res.status(201).json({ id: r.insertId, ok: true })
}

// PUT /api/entidades/:id
export async function updateEntidad(req, res) {
  const {
    nombre, habitacion, tipo_trabajo_id, subtipo_trabajo_id,
    foto_perfil_url, datos_tecnicos,
  } = req.body

  const [[ent]] = await pool.execute(`SELECT * FROM entidades WHERE id = ?`, [req.params.id])
  if (!ent) return res.status(404).json({ error: 'No encontrado' })

  await pool.execute(
    `UPDATE entidades SET
       nombre=?, habitacion=?, tipo_trabajo_id=?, subtipo_trabajo_id=?,
       foto_perfil_url=?, datos_tecnicos=?
     WHERE id=?`,
    [
      nombre || ent.nombre,
      habitacion || ent.habitacion,
      tipo_trabajo_id || ent.tipo_trabajo_id,
      subtipo_trabajo_id || ent.subtipo_trabajo_id,
      foto_perfil_url || ent.foto_perfil_url,
      datos_tecnicos ? JSON.stringify(datos_tecnicos) : ent.datos_tecnicos,
      req.params.id,
    ]
  )

  res.json({ ok: true })
}

// DELETE /api/entidades/:id — soft delete (no perder el historial de trabajos)
export async function deleteEntidad(req, res) {
  await pool.execute(`UPDATE entidades SET activo = 0 WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
}

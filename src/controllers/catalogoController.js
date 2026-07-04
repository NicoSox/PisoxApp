// src/controllers/catalogoController.js
// Zonas, tipos de trabajo, subtipos, provincias, localidades
import pool from '../utils/db.js'

// ── PROVINCIAS ────────────────────────────────────────────────────────────────
export async function listProvincias(req, res) {
  const [rows] = await pool.execute(
    `SELECT id, nombre, codigo, activo FROM provincias ORDER BY nombre ASC`
  )
  res.json(rows)
}

export async function createProvincia(req, res) {
  const { nombre, codigo } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  const [r] = await pool.execute(
    `INSERT INTO provincias (nombre, codigo) VALUES (?, ?)`,
    [nombre.trim(), codigo?.trim() || null]
  )
  res.status(201).json({ id: r.insertId, nombre, codigo })
}

export async function updateProvincia(req, res) {
  const { nombre, codigo, activo } = req.body
  await pool.execute(
    `UPDATE provincias SET nombre=?, codigo=?, activo=? WHERE id=?`,
    [nombre, codigo, activo ? 1 : 0, req.params.id]
  )
  res.json({ ok: true })
}

// ── LOCALIDADES ───────────────────────────────────────────────────────────────
export async function listLocalidades(req, res) {
  const { provincia_id } = req.query
  let sql = `SELECT l.id, l.nombre, l.activo, l.provincia_id, p.nombre as provincia
             FROM localidades l JOIN provincias p ON p.id = l.provincia_id`
  const params = []
  if (provincia_id) { sql += ' WHERE l.provincia_id = ?'; params.push(provincia_id) }
  sql += ' ORDER BY p.nombre ASC, l.nombre ASC'
  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

export async function createLocalidad(req, res) {
  const { nombre, provincia_id } = req.body
  if (!nombre?.trim() || !provincia_id) return res.status(400).json({ error: 'Nombre y provincia requeridos' })
  const [r] = await pool.execute(
    `INSERT INTO localidades (nombre, provincia_id) VALUES (?, ?)`,
    [nombre.trim(), provincia_id]
  )
  res.status(201).json({ id: r.insertId, nombre, provincia_id })
}

// ── ZONAS ─────────────────────────────────────────────────────────────────────
export async function listZonas(req, res) {
  const [rows] = await pool.execute(
    `SELECT z.id, z.nombre, z.descripcion, z.activo, z.localidad_id,
            l.nombre as localidad, p.nombre as provincia
     FROM zonas z
     LEFT JOIN localidades l ON l.id = z.localidad_id
     LEFT JOIN provincias  p ON p.id = l.provincia_id
     ORDER BY p.nombre ASC, l.nombre ASC, z.nombre ASC`
  )
  res.json(rows)
}

export async function createZona(req, res) {
  const { nombre, descripcion, localidad_id } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  const [r] = await pool.execute(
    `INSERT INTO zonas (nombre, descripcion, localidad_id) VALUES (?, ?, ?)`,
    [nombre.trim(), descripcion || null, localidad_id || null]
  )
  res.status(201).json({ id: r.insertId })
}

export async function updateZona(req, res) {
  const { nombre, descripcion, localidad_id, activo } = req.body
  await pool.execute(
    `UPDATE zonas SET nombre=?, descripcion=?, localidad_id=?, activo=? WHERE id=?`,
    [nombre, descripcion, localidad_id, activo ? 1 : 0, req.params.id]
  )
  res.json({ ok: true })
}

export async function deleteZona(req, res) {
  await pool.execute(`DELETE FROM zonas WHERE id=?`, [req.params.id])
  res.json({ ok: true })
}

// ── TIPOS DE TRABAJO ──────────────────────────────────────────────────────────
export async function listTiposTrabajo(req, res) {
  const [tipos] = await pool.execute(
    `SELECT id, nombre, descripcion, icono, activo FROM tipos_trabajo ORDER BY nombre ASC`
  )
  const [subtipos] = await pool.execute(
    `SELECT id, tipo_trabajo_id, nombre, descripcion, garantia_meses, activo
     FROM subtipos_trabajo ORDER BY nombre ASC`
  )
  // Anidar subtipos dentro de su tipo
  const result = tipos.map(t => ({
    ...t,
    subtipos: subtipos.filter(s => s.tipo_trabajo_id === t.id)
  }))
  res.json(result)
}

export async function createTipoTrabajo(req, res) {
  const { nombre, descripcion, icono } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  const [r] = await pool.execute(
    `INSERT INTO tipos_trabajo (nombre, descripcion, icono) VALUES (?, ?, ?)`,
    [nombre.trim(), descripcion || null, icono || 'construct-outline']
  )
  res.status(201).json({ id: r.insertId })
}

export async function updateTipoTrabajo(req, res) {
  const { nombre, descripcion, icono, activo } = req.body
  await pool.execute(
    `UPDATE tipos_trabajo SET nombre=?, descripcion=?, icono=?, activo=? WHERE id=?`,
    [nombre, descripcion, icono, activo ? 1 : 0, req.params.id]
  )
  res.json({ ok: true })
}

export async function deleteTipoTrabajo(req, res) {
  await pool.execute(`DELETE FROM tipos_trabajo WHERE id=?`, [req.params.id])
  res.json({ ok: true })
}

// ── SUBTIPOS DE TRABAJO ───────────────────────────────────────────────────────
export async function createSubtipo(req, res) {
  const { tipo_trabajo_id, nombre, descripcion, garantia_meses } = req.body
  if (!nombre?.trim() || !tipo_trabajo_id) return res.status(400).json({ error: 'Nombre y tipo requeridos' })
  const [r] = await pool.execute(
    `INSERT INTO subtipos_trabajo (tipo_trabajo_id, nombre, descripcion, garantia_meses)
     VALUES (?, ?, ?, ?)`,
    [tipo_trabajo_id, nombre.trim(), descripcion || null, garantia_meses || 0]
  )
  res.status(201).json({ id: r.insertId })
}

export async function updateSubtipo(req, res) {
  const { nombre, descripcion, garantia_meses, activo } = req.body
  await pool.execute(
    `UPDATE subtipos_trabajo SET nombre=?, descripcion=?, garantia_meses=?, activo=? WHERE id=?`,
    [nombre, descripcion, garantia_meses, activo ? 1 : 0, req.params.id]
  )
  res.json({ ok: true })
}

export async function deleteSubtipo(req, res) {
  await pool.execute(`DELETE FROM subtipos_trabajo WHERE id=?`, [req.params.id])
  res.json({ ok: true })
}

// ── TECNICO ZONAS ─────────────────────────────────────────────────────────────
export async function getTecnicoZonas(req, res) {
  const [rows] = await pool.execute(
    `SELECT tz.zona_id, z.nombre as zona, z.localidad_id,
            l.nombre as localidad, p.nombre as provincia
     FROM tecnico_zonas tz
     JOIN zonas z ON z.id = tz.zona_id
     LEFT JOIN localidades l ON l.id = z.localidad_id
     LEFT JOIN provincias  p ON p.id = l.provincia_id
     WHERE tz.tecnico_id = ?`,
    [req.params.tecnicoId]
  )
  res.json(rows)
}

export async function setTecnicoZonas(req, res) {
  // Reemplaza todas las zonas del técnico
  const { zona_ids } = req.body // array de IDs
  const tecnicoId = req.params.tecnicoId

  await pool.execute(`DELETE FROM tecnico_zonas WHERE tecnico_id = ?`, [tecnicoId])

  if (zona_ids?.length) {
    const values = zona_ids.map(zid => [tecnicoId, zid])
    await pool.query(`INSERT INTO tecnico_zonas (tecnico_id, zona_id) VALUES ?`, [values])
  }
  res.json({ ok: true })
}

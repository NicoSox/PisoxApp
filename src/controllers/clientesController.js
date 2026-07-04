// src/controllers/clientesController.js
import pool from '../utils/db.js'
import { notificar } from '../services/pushService.js'

// ── CLIENTES ──────────────────────────────────────────────────────────────────

export async function listClientes(req, res) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.nombre, u.email, u.activo, u.created_at,
            c.id as cliente_id, c.telefono, c.documento
     FROM users u
     LEFT JOIN clientes c ON c.user_id = u.id
     WHERE u.rol = 'user'
     ORDER BY u.nombre ASC`
  )
  res.json(rows)
}

export async function getCliente(req, res) {
  const [[cliente]] = await pool.execute(
    `SELECT u.id, u.nombre, u.email, u.activo, u.created_at, u.expo_push_token,
            c.id as cliente_id, c.telefono, c.documento
     FROM users u
     LEFT JOIN clientes c ON c.user_id = u.id
     WHERE u.id = ?`,
    [req.params.id]
  )
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })

  const [propiedades] = await pool.execute(
    `SELECT p.*, z.nombre as zona, l.nombre as localidad, pr.nombre as provincia
     FROM propiedades p
     LEFT JOIN zonas z ON z.id = p.zona_id
     LEFT JOIN localidades l ON l.id = p.localidad_id
     LEFT JOIN provincias pr ON pr.id = l.provincia_id
     WHERE p.cliente_id = ? AND p.activo = 1`,
    [cliente.cliente_id]
  )

  res.json({ ...cliente, propiedades })
}

// El cliente ve su propio perfil
export async function getMiPerfil(req, res) {
  const [[row]] = await pool.execute(
    `SELECT u.id, u.nombre, u.email, u.created_at,
            c.id as cliente_id, c.telefono, c.documento
     FROM users u
     LEFT JOIN clientes c ON c.user_id = u.id
     WHERE u.id = ?`,
    [req.user.id]
  )
  if (!row) return res.status(404).json({ error: 'Perfil no encontrado' })
  res.json(row)
}

export async function updateMiPerfil(req, res) {
  const { telefono, documento } = req.body
  const userId = req.user.id

  // Asegurarse que existe registro en clientes
  await pool.execute(
    `INSERT INTO clientes (user_id, telefono, documento)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE telefono = VALUES(telefono), documento = VALUES(documento)`,
    [userId, telefono || null, documento || null]
  )
  res.json({ ok: true })
}

// Registrar push token del cliente
export async function updatePushToken(req, res) {
  const { expo_push_token } = req.body
  await pool.execute(
    `UPDATE users SET expo_push_token = ?, push_activo = 1 WHERE id = ?`,
    [expo_push_token || null, req.user.id]
  )
  res.json({ ok: true })
}

// ── PROPIEDADES ───────────────────────────────────────────────────────────────

export async function getMisPropiedades(req, res) {
  const [[cli]] = await pool.execute(
    `SELECT id FROM clientes WHERE user_id = ?`, [req.user.id]
  )
  if (!cli) return res.json([])

  const [rows] = await pool.execute(
    `SELECT p.*, z.nombre as zona, l.nombre as localidad, pr.nombre as provincia
     FROM propiedades p
     LEFT JOIN zonas z ON z.id = p.zona_id
     LEFT JOIN localidades l ON l.id = p.localidad_id
     LEFT JOIN provincias pr ON pr.id = l.provincia_id
     WHERE p.cliente_id = ? AND p.activo = 1
     ORDER BY p.created_at ASC`,
    [cli.id]
  )
  res.json(rows)
}

export async function createPropiedad(req, res) {
  const { tipo, nombre, direccion, referencia, zona_id, localidad_id } = req.body
  if (!nombre?.trim() || !direccion?.trim()) {
    return res.status(400).json({ error: 'Nombre y dirección son requeridos' })
  }

  // Obtener o crear cliente
  let [[cli]] = await pool.execute(
    `SELECT id FROM clientes WHERE user_id = ?`, [req.user.id]
  )
  if (!cli) {
    const [r] = await pool.execute(
      `INSERT INTO clientes (user_id) VALUES (?)`, [req.user.id]
    )
    cli = { id: r.insertId }
  }

  const [r] = await pool.execute(
    `INSERT INTO propiedades (cliente_id, tipo, nombre, direccion, referencia, zona_id, localidad_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [cli.id, tipo || 'casa', nombre.trim(), direccion.trim(), referencia || null, zona_id || null, localidad_id || null]
  )
  res.status(201).json({ id: r.insertId, ok: true })
}

export async function updatePropiedad(req, res) {
  const { tipo, nombre, direccion, referencia, zona_id, localidad_id, foto_portada_url } = req.body
  const [[prop]] = await pool.execute(
    `SELECT p.id FROM propiedades p
     JOIN clientes c ON c.id = p.cliente_id
     WHERE p.id = ? AND c.user_id = ?`,
    [req.params.id, req.user.id]
  )
  if (!prop && !['admin','superadmin'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  await pool.execute(
    `UPDATE propiedades SET tipo=?, nombre=?, direccion=?, referencia=?,
     zona_id=?, localidad_id=?, foto_portada_url=? WHERE id=?`,
    [tipo, nombre, direccion, referencia, zona_id, localidad_id, foto_portada_url, req.params.id]
  )
  res.json({ ok: true })
}

export async function deletePropiedad(req, res) {
  // Soft delete
  await pool.execute(`UPDATE propiedades SET activo = 0 WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
}

export async function getPropiedad(req, res) {
  const [[prop]] = await pool.execute(
    `SELECT p.*, z.nombre as zona, l.nombre as localidad, pr.nombre as provincia,
            c.user_id
     FROM propiedades p
     LEFT JOIN zonas z ON z.id = p.zona_id
     LEFT JOIN localidades l ON l.id = p.localidad_id
     LEFT JOIN provincias pr ON pr.id = l.provincia_id
     JOIN clientes c ON c.id = p.cliente_id
     WHERE p.id = ?`,
    [req.params.id]
  )
  if (!prop) return res.status(404).json({ error: 'Propiedad no encontrada' })

  // Verificar acceso: el cliente solo ve sus propias propiedades
  if (req.user.rol === 'user' && prop.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  res.json(prop)
}

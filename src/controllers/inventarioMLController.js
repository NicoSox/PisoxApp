// src/controllers/inventarioMLController.js
// Inventario de infraestructura del galpón para Mercado Libre — visible para
// todo el staff (técnico, admin, superadmin). Cada alta, cambio de cantidad,
// edición o baja queda registrada en ml_inventario_auditoria.
import pool from '../utils/db.js'

async function registrarAuditoria({ itemId, itemNombre, accion, cantidadAntes, cantidadDespues, user }) {
  await pool.execute(
    `INSERT INTO ml_inventario_auditoria
     (item_id, item_nombre, accion, cantidad_antes, cantidad_despues, usuario_id, usuario_nombre)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [itemId, itemNombre, accion, cantidadAntes, cantidadDespues, user.id, user.nombre]
  )
}

// GET /api/ml-inventario — lista todos los ítems activos
export async function listarInventario(req, res) {
  const [rows] = await pool.execute(
    `SELECT id, nombre, icono, cantidad, updated_at
     FROM ml_inventario
     WHERE activo = 1
     ORDER BY nombre ASC`
  )
  res.json(rows)
}

// POST /api/ml-inventario — crear un nuevo tipo de ítem
export async function crearItem(req, res) {
  const { user } = req
  const { nombre, icono, cantidad } = req.body
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' })
  }
  const cantidadInicial = Number.isFinite(Number(cantidad)) ? Math.max(0, Math.trunc(Number(cantidad))) : 0

  try {
    const [r] = await pool.execute(
      `INSERT INTO ml_inventario (nombre, icono, cantidad, creado_por)
       VALUES (?, ?, ?, ?)`,
      [nombre.trim(), icono || 'cube-outline', cantidadInicial, user.id]
    )
    await registrarAuditoria({
      itemId: r.insertId, itemNombre: nombre.trim(), accion: 'creado',
      cantidadAntes: null, cantidadDespues: cantidadInicial, user,
    })
    res.status(201).json({ id: r.insertId, nombre: nombre.trim(), icono: icono || 'cube-outline', cantidad: cantidadInicial })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un ítem con ese nombre' })
    }
    throw e
  }
}

// PATCH /api/ml-inventario/:id/cantidad — sumar/restar (delta) o fijar (cantidad) un valor absoluto
export async function actualizarCantidad(req, res) {
  const { user } = req
  const { id } = req.params
  const { delta, cantidad } = req.body

  const [existing] = await pool.execute('SELECT * FROM ml_inventario WHERE id = ? AND activo = 1', [id])
  if (existing.length === 0) return res.status(404).json({ error: 'Ítem no encontrado' })
  const item = existing[0]

  let nuevaCantidad
  if (cantidad != null && cantidad !== '') {
    nuevaCantidad = Math.max(0, Math.trunc(Number(cantidad)))
  } else {
    nuevaCantidad = Math.max(0, item.cantidad + Math.trunc(Number(delta) || 0))
  }

  await pool.execute('UPDATE ml_inventario SET cantidad = ? WHERE id = ?', [nuevaCantidad, id])
  await registrarAuditoria({
    itemId: id, itemNombre: item.nombre, accion: 'cantidad_actualizada',
    cantidadAntes: item.cantidad, cantidadDespues: nuevaCantidad, user,
  })
  res.json({ id: Number(id), cantidad: nuevaCantidad })
}

// PUT /api/ml-inventario/:id — editar nombre/ícono
export async function editarItem(req, res) {
  const { user } = req
  const { id } = req.params
  const { nombre, icono } = req.body

  const [existing] = await pool.execute('SELECT * FROM ml_inventario WHERE id = ? AND activo = 1', [id])
  if (existing.length === 0) return res.status(404).json({ error: 'Ítem no encontrado' })
  const item = existing[0]

  const nuevoNombre = nombre?.trim() || item.nombre
  const nuevoIcono  = icono || item.icono

  try {
    await pool.execute('UPDATE ml_inventario SET nombre = ?, icono = ? WHERE id = ?', [nuevoNombre, nuevoIcono, id])
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un ítem con ese nombre' })
    throw e
  }

  await registrarAuditoria({
    itemId: id, itemNombre: nuevoNombre, accion: 'editado',
    cantidadAntes: null, cantidadDespues: null, user,
  })
  res.json({ id: Number(id), nombre: nuevoNombre, icono: nuevoIcono })
}

// DELETE /api/ml-inventario/:id — baja lógica (solo admin/superadmin)
export async function eliminarItem(req, res) {
  const { user } = req
  const { id } = req.params
  const [existing] = await pool.execute('SELECT * FROM ml_inventario WHERE id = ? AND activo = 1', [id])
  if (existing.length === 0) return res.status(404).json({ error: 'Ítem no encontrado' })
  const item = existing[0]

  await pool.execute('UPDATE ml_inventario SET activo = 0 WHERE id = ?', [id])
  await registrarAuditoria({
    itemId: id, itemNombre: item.nombre, accion: 'eliminado',
    cantidadAntes: item.cantidad, cantidadDespues: null, user,
  })
  res.json({ ok: true })
}

// GET /api/ml-inventario/auditoria?item_id=X — historial (todo el staff lo puede ver)
export async function getAuditoria(req, res) {
  const { item_id } = req.query
  const params = []
  let where = '1=1'
  if (item_id) { where += ' AND item_id = ?'; params.push(item_id) }

  const [rows] = await pool.execute(
    `SELECT id, item_id, item_nombre, accion, cantidad_antes, cantidad_despues,
            usuario_id, usuario_nombre, created_at
     FROM ml_inventario_auditoria
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 300`,
    params
  )
  res.json(rows)
}

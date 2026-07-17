import pool from '../utils/db.js'
import { notificar } from '../services/pushService.js'

// ── Helpers ───────────────────────────────────────────────────
function parseJSON(val, fallback = []) {
  if (!val) return fallback
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return fallback }
}

// GET /api/presupuestos
export async function listar(req, res) {
  const [rows] = await pool.query(
    `SELECT id, numero, fecha, cliente_nombre, cliente_telefono,
            total, estado, created_at, updated_at
     FROM presupuestos ORDER BY numero DESC`
  )
  res.json(rows)
}

// GET /api/presupuestos/:id
export async function obtener(req, res) {
  const [rows] = await pool.query(
    `SELECT * FROM presupuestos WHERE id = ?`, [req.params.id]
  )
  if (!rows.length) return res.status(404).json({ error: 'No encontrado' })
  const p = rows[0]
  p.mano_obra  = parseJSON(p.mano_obra)
  p.materiales = parseJSON(p.materiales)
  res.json(p)
}

// POST /api/presupuestos
export async function crear(req, res) {
  const {
    fecha, cliente_nombre, cliente_telefono, cliente_domicilio,
    mano_obra, materiales, incluir_materiales,
    iva_porcentaje, solicitar_adelanto, porcentaje_adelanto,
    subtotal_mano_obra, subtotal_materiales, total,
    notas, estado,
  } = req.body

  // Número autoincremental
  const [[{ maxNum }]] = await pool.query('SELECT COALESCE(MAX(numero), 480) as maxNum FROM presupuestos')
  const numero = maxNum + 1

  const [result] = await pool.query(
    `INSERT INTO presupuestos
      (numero, fecha, cliente_nombre, cliente_telefono, cliente_domicilio,
       mano_obra, materiales, incluir_materiales,
       iva_porcentaje, solicitar_adelanto, porcentaje_adelanto,
       subtotal_mano_obra, subtotal_materiales, total, notas, estado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      numero,
      fecha || new Date().toISOString().slice(0, 10),
      cliente_nombre || '',
      cliente_telefono || '',
      cliente_domicilio || '',
      JSON.stringify(mano_obra || []),
      JSON.stringify(materiales || []),
      incluir_materiales ? 1 : 0,
      iva_porcentaje || 0,
      solicitar_adelanto ? 1 : 0,
      porcentaje_adelanto || 50,
      subtotal_mano_obra || 0,
      subtotal_materiales || 0,
      total || 0,
      notas || null,
      estado || 'borrador',
    ]
  )
  res.status(201).json({ id: result.insertId, numero })
}

// PUT /api/presupuestos/:id
export async function actualizar(req, res) {
  const {
    fecha, cliente_nombre, cliente_telefono, cliente_domicilio,
    mano_obra, materiales, incluir_materiales,
    iva_porcentaje, solicitar_adelanto, porcentaje_adelanto,
    subtotal_mano_obra, subtotal_materiales, total,
    notas, estado,
  } = req.body

  const [[previo]] = await pool.query(
    `SELECT estado FROM presupuestos WHERE id = ?`, [req.params.id]
  )
  if (!previo) return res.status(404).json({ error: 'No encontrado' })

  await pool.query(
    `UPDATE presupuestos SET
      fecha=?, cliente_nombre=?, cliente_telefono=?, cliente_domicilio=?,
      mano_obra=?, materiales=?, incluir_materiales=?,
      iva_porcentaje=?, solicitar_adelanto=?, porcentaje_adelanto=?,
      subtotal_mano_obra=?, subtotal_materiales=?, total=?,
      notas=?, estado=?
     WHERE id=?`,
    [
      fecha,
      cliente_nombre || '',
      cliente_telefono || '',
      cliente_domicilio || '',
      JSON.stringify(mano_obra || []),
      JSON.stringify(materiales || []),
      incluir_materiales ? 1 : 0,
      iva_porcentaje || 0,
      solicitar_adelanto ? 1 : 0,
      porcentaje_adelanto || 50,
      subtotal_mano_obra || 0,
      subtotal_materiales || 0,
      total || 0,
      notas || null,
      estado || 'borrador',
      req.params.id,
    ]
  )

  // Si el presupuesto pasa a 'enviado' y está vinculado a un trabajo de cliente
  // (generado automáticamente al completar un relevamiento), ese es el momento
  // en que el cliente realmente lo ve: promovemos el trabajo de 'presupuestando'
  // (interno, invisible para el cliente) a 'presupuestado' (visible, esperando
  // su aprobación) y le avisamos.
  if (estado === 'enviado' && previo.estado !== 'enviado') {
    const [[trabajo]] = await pool.query(
      `SELECT tc.id, tc.titulo, c.user_id as cliente_user_id
       FROM trabajos_cliente tc
       JOIN clientes c ON c.id = tc.cliente_id
       WHERE tc.presupuesto_id = ? AND tc.estado = 'presupuestando'`,
      [req.params.id]
    )
    if (trabajo) {
      await pool.query(
        `UPDATE trabajos_cliente SET estado = 'presupuestado' WHERE id = ?`,
        [trabajo.id]
      )
      await notificar(
        trabajo.cliente_user_id,
        'Nuevo presupuesto',
        `Te enviamos el presupuesto para "${trabajo.titulo}". Revisalo en la app para aprobarlo o rechazarlo.`,
        'trabajo', trabajo.id
      )
    }
  }

  res.json({ ok: true })
}

// DELETE /api/presupuestos/:id
export async function eliminar(req, res) {
  await pool.query('DELETE FROM presupuestos WHERE id = ?', [req.params.id])
  res.json({ ok: true })
}

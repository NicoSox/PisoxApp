// src/controllers/ausenciasController.js
import pool from '../utils/db.js'
import { notificar, notificarAdmins } from '../services/pushService.js'

// GET — el técnico/relevador ve las suyas, admin/superadmin ve todas
export async function listAusencias(req, res) {
  const esStaff = ['admin', 'superadmin'].includes(req.user.rol)
  let sql = `SELECT sa.*, u.nombre as solicitante, u.rol as solicitante_rol,
             a.nombre as respondido_por_nombre
             FROM solicitudes_ausencia sa
             JOIN users u ON u.id = sa.user_id
             LEFT JOIN users a ON a.id = sa.respondido_por
             WHERE 1=1`
  const params = []

  if (!esStaff) {
    sql += ' AND sa.user_id = ?'
    params.push(req.user.id)
  }

  const { estado, user_id, desde, hasta } = req.query
  if (estado)  { sql += ' AND sa.estado = ?';      params.push(estado) }
  if (user_id && esStaff) { sql += ' AND sa.user_id = ?'; params.push(user_id) }
  if (desde)   { sql += ' AND sa.fecha_desde >= ?'; params.push(desde) }
  if (hasta)   { sql += ' AND sa.fecha_hasta <= ?'; params.push(hasta) }

  sql += ' ORDER BY sa.created_at DESC'
  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

export async function createAusencia(req, res) {
  const { tipo, fecha_desde, fecha_hasta, motivo } = req.body
  if (!tipo || !fecha_desde || !fecha_hasta) {
    return res.status(400).json({ error: 'tipo, fecha_desde y fecha_hasta son requeridos' })
  }

  // Verificar anticipación mínima
  const [[cfg]] = await pool.execute(
    `SELECT valor FROM configuracion WHERE clave = 'anticipacion_ausencia_dias'`
  )
  const minDias = parseInt(cfg?.valor || 3)
  const hoy = new Date()
  const desde = new Date(fecha_desde)
  const diffDias = Math.ceil((desde - hoy) / (1000 * 60 * 60 * 24))
  if (diffDias < minDias) {
    return res.status(400).json({
      error: `Debés solicitar la ausencia con al menos ${minDias} días de anticipación`
    })
  }

  const [r] = await pool.execute(
    `INSERT INTO solicitudes_ausencia (user_id, tipo, fecha_desde, fecha_hasta, motivo)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, tipo, fecha_desde, fecha_hasta, motivo || null]
  )

  await notificarAdmins(
    'Solicitud de ausencia',
    `${req.user.nombre} solicitó ${tipo} del ${fecha_desde} al ${fecha_hasta}.`,
    'general', r.insertId
  )

  res.status(201).json({ id: r.insertId, ok: true })
}

export async function responderAusencia(req, res) {
  const { estado, respuesta_admin } = req.body
  if (!['aprobada', 'rechazada'].includes(estado)) {
    return res.status(400).json({ error: 'estado debe ser aprobada o rechazada' })
  }

  const [[aus] ]= await pool.execute(
    `SELECT * FROM solicitudes_ausencia WHERE id = ?`, [req.params.id]
  )
  if (!aus) return res.status(404).json({ error: 'No encontrada' })

  await pool.execute(
    `UPDATE solicitudes_ausencia
     SET estado=?, respuesta_admin=?, respondido_por=?, respondido_at=NOW()
     WHERE id=?`,
    [estado, respuesta_admin || null, req.user.id, req.params.id]
  )

  // Si se aprueba, bloquear esos días en disponibilidad
  if (estado === 'aprobada') {
    const desde = new Date(aus.fecha_desde)
    const hasta = new Date(aus.fecha_hasta)
    for (let d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) {
      const fechaStr = d.toISOString().slice(0, 10)
      for (const franja of ['mañana', 'tarde']) {
        await pool.execute(
          `INSERT INTO disponibilidad_tecnicos (tecnico_id, fecha, franja, horas_disponibles, bloqueado_ml)
           VALUES (?, ?, ?, 0, 0)
           ON DUPLICATE KEY UPDATE horas_disponibles = 0`,
          [aus.user_id, fechaStr, franja]
        )
      }
    }
  }

  const msg = estado === 'aprobada'
    ? `Tu solicitud de ${aus.tipo} fue aprobada. ¡Que lo disfrutes!`
    : `Tu solicitud de ${aus.tipo} fue rechazada.${respuesta_admin ? ` Motivo: ${respuesta_admin}` : ''}`

  await notificar(aus.user_id, `Solicitud ${estado}`, msg, 'general', aus.id)

  res.json({ ok: true })
}

export async function deleteAusencia(req, res) {
  const [[aus]] = await pool.execute(
    `SELECT * FROM solicitudes_ausencia WHERE id = ?`, [req.params.id]
  )
  if (!aus) return res.status(404).json({ error: 'No encontrada' })
  if (aus.user_id !== req.user.id && !['admin','superadmin'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Sin permisos' })
  }
  if (aus.estado !== 'pendiente') {
    return res.status(400).json({ error: 'Solo se pueden eliminar solicitudes pendientes' })
  }
  await pool.execute(`DELETE FROM solicitudes_ausencia WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
}

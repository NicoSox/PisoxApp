// src/controllers/turnosController.js
import pool from '../utils/db.js'
import { notificar } from '../services/pushService.js'

// ── HELPERS DE FECHA (evitan corrimiento de día por UTC) ───────────────────────
// new Date('YYYY-MM-DD') se interpreta como medianoche UTC. En servidores con
// zona horaria negativa (ej. Argentina, UTC-3) eso puede caer en el día anterior
// al leerlo con .getDay()/.getDate() en hora local, salteando días por error.
function parseFechaLocal(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fechaALocalStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

/**
 * Descuenta horas de disponibilidad del técnico
 */
async function descontarHoras(tecnicoId, fecha, franja, horas) {
  // Insertar o actualizar registro de disponibilidad
  await pool.execute(
    `INSERT INTO disponibilidad_tecnicos (tecnico_id, fecha, franja, horas_disponibles)
     VALUES (?, ?, ?, 4 - ?)
     ON DUPLICATE KEY UPDATE
     horas_disponibles = GREATEST(0, horas_disponibles - ?)`,
    [tecnicoId, fecha, franja, horas, horas]
  )
}

/**
 * GET /api/turnos/disponibles?zona_id=X&desde=Y&hasta=Z&horas=H
 * Para que el cliente elija turno post-aprobación
 */
export async function getTurnosDisponibles(req, res) {
  const { zona_id, desde, hasta, horas = 1 } = req.query
  if (!zona_id || !desde || !hasta) {
    return res.status(400).json({ error: 'zona_id, desde y hasta son requeridos' })
  }

  const horasNec = parseFloat(horas)

  const [tecnicos] = await pool.execute(
    `SELECT DISTINCT tz.tecnico_id, u.nombre
     FROM tecnico_zonas tz
     JOIN users u ON u.id = tz.tecnico_id
     WHERE tz.zona_id = ? AND u.activo = 1 AND u.rol = 'tecnico'`,
    [zona_id]
  )

  if (!tecnicos.length) return res.json([])

  const result = []
  const start = parseFechaLocal(desde)
  const end   = parseFechaLocal(hasta)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const diaSem = d.getDay()
    if (diaSem === 0 || diaSem === 6) continue

    const fechaStr = fechaALocalStr(d)

    for (const franja of ['mañana', 'tarde']) {
      const tecnicosDisp = []

      for (const tec of tecnicos) {
        // Verificar ML
        const dia = d.getDate()
        const semanaMes = Math.ceil(dia / 7)
        const [[enML]] = await pool.execute(
          `SELECT id FROM schedule_mercadolibre
           WHERE tecnico_id = ? AND semana_del_mes = ? AND dia_semana = ? AND activo = 1`,
          [tec.tecnico_id, semanaMes, diaSem]
        )
        if (enML) continue

        const [[disp]] = await pool.execute(
          `SELECT horas_disponibles FROM disponibilidad_tecnicos
           WHERE tecnico_id = ? AND fecha = ? AND franja = ?`,
          [tec.tecnico_id, fechaStr, franja]
        )

        const horasLibres = disp ? parseFloat(disp.horas_disponibles) : 4
        if (horasLibres >= horasNec) {
          tecnicosDisp.push({ ...tec, horas_disponibles: horasLibres })
        }
      }

      if (tecnicosDisp.length > 0) {
        result.push({
          fecha: fechaStr,
          franja,
          tecnicos_disponibles: tecnicosDisp.length,
        })
      }
    }
  }

  res.json(result)
}

/**
 * GET /api/turnos/agenda — agenda del técnico logueado o filtrada por tecnico_id
 */
export async function getAgenda(req, res) {
  const { tecnico_id, fecha, desde, hasta } = req.query
  const tid = req.user.rol === 'tecnico' ? req.user.id : tecnico_id

  let sql = `SELECT ta.*, tc.titulo, tc.descripcion,
             p.nombre as propiedad_nombre, p.direccion,
             cu.nombre as cliente_nombre, cu.id as cliente_user_id,
             c.telefono as cliente_telefono,
             tt.nombre as tipo_trabajo, tt.icono,
             st.nombre as subtipo_trabajo
             FROM turnos_agendados ta
             JOIN trabajos_cliente tc ON tc.id = ta.trabajo_id
             JOIN propiedades p ON p.id = tc.propiedad_id
             JOIN clientes c ON c.id = tc.cliente_id
             JOIN users cu ON cu.id = c.user_id
             LEFT JOIN tipos_trabajo tt ON tt.id = tc.tipo_trabajo_id
             LEFT JOIN subtipos_trabajo st ON st.id = tc.subtipo_trabajo_id
             WHERE 1=1`
  const params = []

  if (tid)   { sql += ' AND ta.tecnico_id = ?'; params.push(tid) }
  if (fecha) { sql += ' AND ta.fecha = ?';      params.push(fecha) }
  if (desde) { sql += ' AND ta.fecha >= ?';     params.push(desde) }
  if (hasta) { sql += ' AND ta.fecha <= ?';     params.push(hasta) }

  sql += ' ORDER BY ta.fecha ASC, ta.franja ASC'
  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

/**
 * POST /api/turnos — el cliente elige un turno
 */
export async function crearTurno(req, res) {
  const { trabajo_id, fecha, franja } = req.body

  if (!trabajo_id || !fecha || !franja) {
    return res.status(400).json({ error: 'trabajo_id, fecha y franja son requeridos' })
  }

  const [[tc]] = await pool.execute(
    `SELECT tc.*, c.user_id as cliente_user_id, p.zona_id,
            rel.horas_estimadas
     FROM trabajos_cliente tc
     JOIN propiedades p ON p.id = tc.propiedad_id
     JOIN clientes c ON c.id = tc.cliente_id
     LEFT JOIN relevamientos rel ON rel.id = tc.relevamiento_id
     WHERE tc.id = ?`,
    [trabajo_id]
  )
  if (!tc) return res.status(404).json({ error: 'Trabajo no encontrado' })

  // Verificar que el cliente es el dueño
  if (req.user.rol === 'user' && tc.cliente_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  const horasNec = parseFloat(tc.horas_estimadas || 1)

  // Buscar mejor técnico disponible
  const [tecnicos] = await pool.execute(
    `SELECT tz.tecnico_id, u.nombre
     FROM tecnico_zonas tz
     JOIN users u ON u.id = tz.tecnico_id
     WHERE tz.zona_id = ? AND u.activo = 1 AND u.rol = 'tecnico'`,
    [tc.zona_id]
  )

  let mejorTecnico = null
  let maxHoras = -1

  for (const tec of tecnicos) {
    const [[disp]] = await pool.execute(
      `SELECT horas_disponibles FROM disponibilidad_tecnicos
       WHERE tecnico_id = ? AND fecha = ? AND franja = ?`,
      [tec.tecnico_id, fecha, franja]
    )
    const horasLibres = disp ? parseFloat(disp.horas_disponibles) : 4
    if (horasLibres >= horasNec && horasLibres > maxHoras) {
      maxHoras = horasLibres
      mejorTecnico = tec
    }
  }

  if (!mejorTecnico) {
    return res.status(409).json({ error: 'No hay técnicos disponibles para ese turno. Elegí otra fecha o franja.' })
  }

  // Crear turno
  const [r] = await pool.execute(
    `INSERT INTO turnos_agendados (trabajo_id, tecnico_id, fecha, franja, horas_asignadas)
     VALUES (?, ?, ?, ?, ?)`,
    [trabajo_id, mejorTecnico.tecnico_id, fecha, franja, horasNec]
  )

  // Descontar horas
  await descontarHoras(mejorTecnico.tecnico_id, fecha, franja, horasNec)

  // Actualizar estado del trabajo
  await pool.execute(
    `UPDATE trabajos_cliente SET estado = 'agendado', tecnico_id = ?, fecha_inicio = ?
     WHERE id = ?`,
    [mejorTecnico.tecnico_id, fecha, trabajo_id]
  )

  // Notificaciones
  await notificar(
    tc.cliente_user_id,
    'Turno confirmado',
    `Tu trabajo fue agendado para el ${fecha} (${franja}) con ${mejorTecnico.nombre}.`,
    'trabajo', trabajo_id
  )
  await notificar(
    mejorTecnico.tecnico_id,
    'Nuevo trabajo agendado',
    `Tenés un trabajo el ${fecha} (${franja}).`,
    'trabajo', trabajo_id
  )

  res.status(201).json({ id: r.insertId, tecnico: mejorTecnico, ok: true })
}

/**
 * PATCH /api/turnos/:id/estado — técnico actualiza estado
 */
export async function updateEstadoTurno(req, res) {
  const { estado } = req.body
  const [[turno]] = await pool.execute(
    `SELECT ta.*, tc.cliente_id, c.user_id as cliente_user_id
     FROM turnos_agendados ta
     JOIN trabajos_cliente tc ON tc.id = ta.trabajo_id
     JOIN clientes c ON c.id = tc.cliente_id
     WHERE ta.id = ?`,
    [req.params.id]
  )
  if (!turno) return res.status(404).json({ error: 'No encontrado' })

  await pool.execute(
    `UPDATE turnos_agendados SET estado = ? WHERE id = ?`,
    [estado, req.params.id]
  )

  // Sincronizar estado en trabajo_cliente
  if (estado === 'en_curso') {
    await pool.execute(
      `UPDATE trabajos_cliente SET estado = 'en_curso' WHERE id = ?`,
      [turno.trabajo_id]
    )
    await notificar(turno.cliente_user_id, 'Técnico en camino', 'El técnico comenzó el trabajo en tu propiedad.', 'trabajo', turno.trabajo_id)
  }

  if (estado === 'completado') {
    await pool.execute(
      `UPDATE trabajos_cliente SET estado = 'completado', fecha_fin = CURDATE() WHERE id = ?`,
      [turno.trabajo_id]
    )
    // Devolver horas si se canceló para liberar agenda
  }

  if (estado === 'cancelado') {
    // Devolver horas a disponibilidad
    await pool.execute(
      `INSERT INTO disponibilidad_tecnicos (tecnico_id, fecha, franja, horas_disponibles)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE horas_disponibles = LEAST(4, horas_disponibles + ?)`,
      [turno.tecnico_id, turno.fecha, turno.franja, turno.horas_asignadas, turno.horas_asignadas]
    )
    await notificar(turno.cliente_user_id, 'Turno cancelado', 'Tu turno fue cancelado. Podés elegir otro desde la app.', 'trabajo', turno.trabajo_id)
  }

  res.json({ ok: true })
}

/**
 * GET /api/turnos/notificaciones — notificaciones del usuario logueado
 */
export async function getNotificaciones(req, res) {
  const { solo_no_leidas } = req.query
  let sql = `SELECT * FROM notificaciones WHERE user_id = ?`
  const params = [req.user.id]
  if (solo_no_leidas === '1') { sql += ' AND leida = 0' }
  sql += ' ORDER BY created_at DESC LIMIT 50'
  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

export async function marcarLeida(req, res) {
  await pool.execute(
    `UPDATE notificaciones SET leida = 1 WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id]
  )
  res.json({ ok: true })
}

export async function marcarTodasLeidas(req, res) {
  await pool.execute(
    `UPDATE notificaciones SET leida = 1 WHERE user_id = ?`,
    [req.user.id]
  )
  res.json({ ok: true })
}

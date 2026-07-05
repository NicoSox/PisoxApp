// src/controllers/visitasController.js
import pool from '../utils/db.js'
import { notificar, notificarAdmins } from '../services/pushService.js'

// ── DISPONIBILIDAD ────────────────────────────────────────────────────────────

/**
 * Calcula si un técnico va a ML en una fecha dada
 */
async function tecnicoEnML(tecnicoId, fecha) {
  const d = new Date(fecha)
  const diaSem = d.getDay() // 1=lun...5=vie
  if (diaSem === 0 || diaSem === 6) return false
  const dia = d.getDate()
  const semanaMes = Math.ceil(dia / 7)

  const [[row]] = await pool.execute(
    `SELECT id FROM schedule_mercadolibre
     WHERE tecnico_id = ? AND semana_del_mes = ? AND dia_semana = ? AND activo = 1`,
    [tecnicoId, semanaMes, diaSem]
  )
  return !!row
}

/**
 * GET /api/disponibilidad?zona_id=X&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Devuelve franjas disponibles (con al menos 1 técnico libre) para que el cliente elija
 */
export async function getDisponibilidad(req, res) {
  const { zona_id, desde, hasta } = req.query
  if (!zona_id || !desde || !hasta) {
    return res.status(400).json({ error: 'zona_id, desde y hasta son requeridos' })
  }

  // Config
  const [[cfgHoras]] = await pool.execute(
    `SELECT valor FROM configuracion WHERE clave = 'jornada_horas'`
  )
  const jornadaHoras = parseFloat(cfgHoras?.valor || 8)

  // Técnicos que cubren esta zona
  const [tecnicos] = await pool.execute(
    `SELECT DISTINCT tz.tecnico_id, u.nombre
     FROM tecnico_zonas tz
     JOIN users u ON u.id = tz.tecnico_id
     WHERE tz.zona_id = ? AND u.activo = 1 AND u.rol IN ('tecnico', 'relevador')`,
    [zona_id]
  )

  if (!tecnicos.length) return res.json([])

  // Iterar días del rango
  const result = []
  const start = new Date(desde)
  const end   = new Date(hasta)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const diaSem = d.getDay()
    if (diaSem === 0 || diaSem === 6) continue // no fines de semana

    const fechaStr = d.toISOString().slice(0, 10)

    for (const franja of ['mañana', 'tarde']) {
      let hayDisponible = false

      for (const tec of tecnicos) {
        // Verificar ML
        const enML = await tecnicoEnML(tec.tecnico_id, fechaStr)
        if (enML) continue

        // Verificar horas disponibles en esa franja
        const [[disp]] = await pool.execute(
          `SELECT horas_disponibles FROM disponibilidad_tecnicos
           WHERE tecnico_id = ? AND fecha = ? AND franja = ?`,
          [tec.tecnico_id, fechaStr, franja]
        )

        // Si no hay registro, el día está libre (horas_disponibles = jornadaHoras/2)
        const horasLibres = disp ? disp.horas_disponibles : jornadaHoras / 2
        if (horasLibres > 0) { hayDisponible = true; break }
      }

      if (hayDisponible) {
        result.push({ fecha: fechaStr, franja, disponible: true })
      }
    }
  }

  res.json(result)
}

/**
 * Asigna automáticamente el mejor técnico disponible
 * para una zona, fecha y franja dadas
 */
export async function asignarTecnico(zonaId, fecha, franja, horasNecesarias = 1) {
  const jornadaHoras = 8

  // Técnicos de la zona
  const [tecnicos] = await pool.execute(
    `SELECT tz.tecnico_id, u.nombre
     FROM tecnico_zonas tz
     JOIN users u ON u.id = tz.tecnico_id
     WHERE tz.zona_id = ? AND u.activo = 1 AND u.rol IN ('tecnico', 'relevador')`,
    [zonaId]
  )

  let mejorTecnico = null
  let maxHoras = -1

  for (const tec of tecnicos) {
    const enML = await tecnicoEnML(tec.tecnico_id, fecha)
    if (enML) continue

    const [[disp]] = await pool.execute(
      `SELECT horas_disponibles FROM disponibilidad_tecnicos
       WHERE tecnico_id = ? AND fecha = ? AND franja = ?`,
      [tec.tecnico_id, fecha, franja]
    )

    const horasLibres = disp ? parseFloat(disp.horas_disponibles) : jornadaHoras / 2

    if (horasLibres >= horasNecesarias && horasLibres > maxHoras) {
      maxHoras = horasLibres
      mejorTecnico = tec
    }
  }

  return mejorTecnico
}

// ── VISITAS ───────────────────────────────────────────────────────────────────

export async function listVisitas(req, res) {
  const { estado, tecnico_id, desde, hasta } = req.query
  let sql = `SELECT v.*, p.nombre as propiedad_nombre, p.direccion,
             u.nombre as cliente_nombre, t.nombre as tecnico_nombre,
             z.nombre as zona_nombre
             FROM visitas_tecnicas v
             JOIN propiedades p ON p.id = v.propiedad_id
             JOIN clientes c ON c.id = v.cliente_id
             JOIN users u ON u.id = c.user_id
             LEFT JOIN users t ON t.id = v.tecnico_asignado_id
             LEFT JOIN zonas z ON z.id = v.zona_id
             WHERE 1=1`
  const params = []

  // El técnico/relevador solo ve sus visitas
  if (['tecnico', 'relevador'].includes(req.user.rol)) {
    sql += ' AND v.tecnico_asignado_id = ?'; params.push(req.user.id)
  }
  if (estado)     { sql += ' AND v.estado = ?';               params.push(estado) }
  if (tecnico_id) { sql += ' AND v.tecnico_asignado_id = ?';  params.push(tecnico_id) }
  if (desde)      { sql += ' AND v.fecha_solicitada >= ?';     params.push(desde) }
  if (hasta)      { sql += ' AND v.fecha_solicitada <= ?';     params.push(hasta) }

  sql += ' ORDER BY v.fecha_solicitada ASC, v.franja ASC'
  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

export async function getMisVisitas(req, res) {
  const [[cli]] = await pool.execute(
    `SELECT id FROM clientes WHERE user_id = ?`, [req.user.id]
  )
  if (!cli) return res.json([])

  const [rows] = await pool.execute(
    `SELECT v.*, p.nombre as propiedad_nombre, p.direccion,
            t.nombre as tecnico_nombre, z.nombre as zona_nombre
     FROM visitas_tecnicas v
     JOIN propiedades p ON p.id = v.propiedad_id
     LEFT JOIN users t ON t.id = v.tecnico_asignado_id
     LEFT JOIN zonas z ON z.id = v.zona_id
     WHERE v.cliente_id = ?
     ORDER BY v.fecha_solicitada DESC`,
    [cli.id]
  )
  res.json(rows)
}

export async function getVisita(req, res) {
  const [[visita]] = await pool.execute(
    `SELECT v.*, p.nombre as propiedad_nombre, p.direccion, p.zona_id,
            u.nombre as cliente_nombre, c.user_id as cliente_user_id, t.nombre as tecnico_nombre,
            z.nombre as zona_nombre
     FROM visitas_tecnicas v
     JOIN propiedades p ON p.id = v.propiedad_id
     JOIN clientes c ON c.id = v.cliente_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN users t ON t.id = v.tecnico_asignado_id
     LEFT JOIN zonas z ON z.id = v.zona_id
     WHERE v.id = ?`,
    [req.params.id]
  )
  if (!visita) return res.status(404).json({ error: 'Visita no encontrada' })
  if (req.user.rol === 'user' && visita.cliente_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }
  res.json(visita)
}

export async function createVisita(req, res) {
  const { propiedad_id, fecha_solicitada, franja, notas_cliente } = req.body

  if (!propiedad_id || !fecha_solicitada || !franja) {
    return res.status(400).json({ error: 'propiedad_id, fecha_solicitada y franja son requeridos' })
  }

  // Verificar que la propiedad pertenece al cliente
  const [[prop]] = await pool.execute(
    `SELECT p.id, p.zona_id, c.id as cliente_id, c.user_id
     FROM propiedades p JOIN clientes c ON c.id = p.cliente_id
     WHERE p.id = ?`,
    [propiedad_id]
  )
  if (!prop) return res.status(404).json({ error: 'Propiedad no encontrada' })
  if (req.user.rol === 'user' && prop.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  // Asignar técnico automáticamente
  const tecnico = await asignarTecnico(prop.zona_id, fecha_solicitada, franja, 1)

  const [r] = await pool.execute(
    `INSERT INTO visitas_tecnicas
     (propiedad_id, cliente_id, zona_id, fecha_solicitada, franja, tecnico_asignado_id, notas_cliente)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [propiedad_id, prop.cliente_id, prop.zona_id, fecha_solicitada, franja,
     tecnico?.tecnico_id || null, notas_cliente || null]
  )

  const visitaId = r.insertId

  // Notificar al cliente
  await notificar(
    req.user.id,
    'Visita solicitada',
    tecnico
      ? `Tu visita del ${fecha_solicitada} (${franja}) fue confirmada. Técnico asignado: ${tecnico.nombre}`
      : `Tu visita del ${fecha_solicitada} (${franja}) está pendiente de asignación.`,
    'visita',
    visitaId
  )

  // Notificar a admins
  await notificarAdmins(
    'Nueva solicitud de visita',
    `Se solicitó una visita para el ${fecha_solicitada} (${franja})`,
    'visita',
    visitaId
  )

  // Si hay técnico asignado, notificarlo
  if (tecnico) {
    await notificar(
      tecnico.tecnico_id,
      'Nueva visita asignada',
      `Tenés una visita el ${fecha_solicitada} (${franja})`,
      'visita',
      visitaId
    )
  }

  res.status(201).json({ id: visitaId, tecnico_asignado: tecnico || null, ok: true })
}

export async function updateVisita(req, res) {
  const { estado, tecnico_asignado_id, fecha_confirmada, franja_confirmada, notas_admin } = req.body

  const [[visita]] = await pool.execute(
    `SELECT v.*, c.user_id FROM visitas_tecnicas v
     JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`,
    [req.params.id]
  )
  if (!visita) return res.status(404).json({ error: 'No encontrada' })

  await pool.execute(
    `UPDATE visitas_tecnicas SET estado=?, tecnico_asignado_id=?,
     fecha_confirmada=?, franja_confirmada=?, notas_admin=? WHERE id=?`,
    [estado || visita.estado, tecnico_asignado_id || visita.tecnico_asignado_id,
     fecha_confirmada || visita.fecha_confirmada,
     franja_confirmada || visita.franja_confirmada,
     notas_admin || visita.notas_admin, req.params.id]
  )

  // Notificar al cliente si cambia estado
  if (estado && estado !== visita.estado) {
    const msgs = {
      confirmada: `Tu visita del ${visita.fecha_solicitada} fue confirmada.`,
      cancelada:  `Tu visita del ${visita.fecha_solicitada} fue cancelada. Podés solicitar una nueva.`,
      realizada:  `Tu visita fue marcada como realizada. Pronto recibirás el presupuesto.`,
    }
    if (msgs[estado]) {
      await notificar(visita.user_id, 'Actualización de visita', msgs[estado], 'visita', visita.id)
    }
  }

  res.json({ ok: true })
}

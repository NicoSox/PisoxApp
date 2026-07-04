// src/controllers/scheduleMLController.js
// Gestión de la rotación de técnicos en Mercado Libre
import pool from '../utils/db.js'

// GET /api/schedule-ml — lista todos los registros con info del técnico
export async function listarSchedule(req, res) {
  const [rows] = await pool.execute(
    `SELECT s.id, s.tecnico_id, u.nombre as tecnico_nombre,
            s.semana_del_mes, s.dia_semana, s.es_bucle, s.activo
     FROM schedule_mercadolibre s
     JOIN users u ON u.id = s.tecnico_id
     WHERE s.activo = 1
     ORDER BY s.semana_del_mes ASC, s.dia_semana ASC`
  )
  res.json(rows)
}

// POST /api/schedule-ml — crear entrada
export async function crearSchedule(req, res) {
  const { tecnico_id, semana_del_mes, dia_semana, es_bucle } = req.body
  if (!tecnico_id || !semana_del_mes || !dia_semana) {
    return res.status(400).json({ error: 'tecnico_id, semana_del_mes y dia_semana son requeridos' })
  }
  const [r] = await pool.execute(
    `INSERT INTO schedule_mercadolibre (tecnico_id, semana_del_mes, dia_semana, es_bucle)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE es_bucle = VALUES(es_bucle), activo = 1`,
    [tecnico_id, semana_del_mes, dia_semana, es_bucle ? 1 : 1]
  )
  res.status(201).json({ id: r.insertId || null, ok: true })
}

// DELETE /api/schedule-ml/:id
export async function eliminarSchedule(req, res) {
  await pool.execute(`DELETE FROM schedule_mercadolibre WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
}

// GET /api/schedule-ml/mes?año=2026&mes=6
// Devuelve qué técnico va a ML cada día del mes
export async function getScheduleMes(req, res) {
  const anio = parseInt(req.query.anio || new Date().getFullYear())
  const mes  = parseInt(req.query.mes  || new Date().getMonth() + 1)

  const [schedules] = await pool.execute(
    `SELECT s.tecnico_id, u.nombre as tecnico_nombre,
            s.semana_del_mes, s.dia_semana
     FROM schedule_mercadolibre s
     JOIN users u ON u.id = s.tecnico_id
     WHERE s.activo = 1 AND s.es_bucle = 1`
  )

  // Calcular qué días del mes corresponden a cada entrada
  const diasML = []
  const primerDia = new Date(anio, mes - 1, 1)
  const ultimoDia = new Date(anio, mes, 0).getDate()

  for (let dia = 1; dia <= ultimoDia; dia++) {
    const fecha  = new Date(anio, mes - 1, dia)
    const diaSem = fecha.getDay() // 0=dom, 1=lun... 6=sab
    if (diaSem === 0 || diaSem === 6) continue // skip fines de semana

    // Calcular semana del mes (1-4)
    const semanaMes = Math.ceil(dia / 7)

    const matches = schedules.filter(s =>
      s.semana_del_mes === semanaMes &&
      s.dia_semana === diaSem // 1=lun...5=vie en la DB, igual a JS 1=lun
    )

    matches.forEach(m => {
      diasML.push({
        fecha:          `${anio}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
        tecnico_id:     m.tecnico_id,
        tecnico_nombre: m.tecnico_nombre,
        dia_semana:     diaSem,
        semana_del_mes: semanaMes,
      })
    })
  }

  res.json(diasML)
}

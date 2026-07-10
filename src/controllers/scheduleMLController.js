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
  // Apenas se le asigna el primer día, queda habilitado para ver la card de
  // ML y marcar presentismo — sin esto, no ve nada de Mercado Libre.
  await pool.execute(`UPDATE users SET ml_habilitado = 1 WHERE id = ?`, [tecnico_id])
  res.status(201).json({ id: r.insertId || null, ok: true })
}

// DELETE /api/schedule-ml/:id
export async function eliminarSchedule(req, res) {
  await pool.execute(`DELETE FROM schedule_mercadolibre WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
}

// ── Numeración continua de semanas (real, lunes-viernes) ───────────────────
// Antes se usaba Math.ceil(dia/7), que corta el mes en bloques fijos de 7
// días — eso rompe las semanas reales que empiezan a fin de un mes y
// terminan a principio del siguiente (ej. lunes 29 a viernes 3). Acá se
// numera la semana de forma continua desde un ancla fija (lunes 1/1/2024),
// así una semana real nunca queda partida ni cambia de número según el mes.
const ANCLA_LUNES_MS = Date.UTC(2024, 0, 1) // 1/1/2024 es lunes
const CICLO_SEMANAS  = 4

function getSemanaCiclo(anio, mesIdx0, dia) {
  const d = Date.UTC(anio, mesIdx0, dia)
  const diffDias  = Math.floor((d - ANCLA_LUNES_MS) / 86400000)
  const semanaAbs = Math.floor(diffDias / 7)
  return ((semanaAbs % CICLO_SEMANAS) + CICLO_SEMANAS) % CICLO_SEMANAS + 1
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

    // Calcular semana del ciclo (continua, no reinicia con el mes)
    const semanaMes = getSemanaCiclo(anio, mes - 1, dia)

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

// ── El técnico consulta si está habilitado para Mercado Libre ──────────────
// Determina si la card de Mercado Libre debe mostrarse en su home.
export async function getMiEstadoML(req, res) {
  const [[row]] = await pool.execute(
    `SELECT ml_habilitado FROM users WHERE id = ?`,
    [req.user.id]
  )
  res.json({ asignado: !!row?.ml_habilitado })
}

// PATCH /api/schedule-ml/habilitar/:tecnicoId  { habilitado: bool }
// Admin/superadmin habilita o revoca manualmente el acceso a ML de un
// técnico, sin necesidad de borrar sus asignaciones de días.
export async function setHabilitadoML(req, res) {
  const { habilitado } = req.body
  await pool.execute(
    `UPDATE users SET ml_habilitado = ? WHERE id = ?`,
    [habilitado ? 1 : 0, req.params.tecnicoId]
  )
  res.json({ ok: true })
}

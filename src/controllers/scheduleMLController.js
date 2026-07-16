// src/controllers/scheduleMLController.js
// Gestión de la rotación de técnicos en Mercado Libre
import pool from '../utils/db.js'

// GET /api/schedule-ml — lista todos los registros con info del técnico
export async function listarSchedule(req, res) {
  const [rows] = await pool.execute(
    `SELECT s.id, s.tecnico_id, u.nombre as tecnico_nombre,
            s.semana_del_mes, s.dia_semana,
            DATE_FORMAT(s.fecha, '%Y-%m-%d') AS fecha,
            s.es_bucle, s.activo
     FROM schedule_mercadolibre s
     JOIN users u ON u.id = s.tecnico_id
     WHERE s.activo = 1
     ORDER BY s.semana_del_mes ASC, s.dia_semana ASC, s.fecha ASC`
  )
  res.json(rows)
}

// POST /api/schedule-ml — crear entrada
// Dos modos:
//  - Bucle (recurrente): { tecnico_id, semana_del_mes, dia_semana, es_bucle: 1 }
//  - Puntual (un solo día, fuera del bucle): { tecnico_id, fecha: 'YYYY-MM-DD', es_bucle: 0 }
export async function crearSchedule(req, res) {
  const { tecnico_id, semana_del_mes, dia_semana, fecha } = req.body
  if (!tecnico_id) {
    return res.status(400).json({ error: 'tecnico_id es requerido' })
  }

  const esPuntual = fecha != null && fecha !== ''

  if (esPuntual) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' })
    }
    const [r] = await pool.execute(
      `INSERT INTO schedule_mercadolibre (tecnico_id, semana_del_mes, dia_semana, fecha, es_bucle)
       VALUES (?, NULL, NULL, ?, 0)
       ON DUPLICATE KEY UPDATE activo = 1`,
      [tecnico_id, fecha]
    )
    await pool.execute(`UPDATE users SET ml_habilitado = 1 WHERE id = ?`, [tecnico_id])
    return res.status(201).json({ id: r.insertId || null, ok: true })
  }

  if (!semana_del_mes || !dia_semana) {
    return res.status(400).json({ error: 'semana_del_mes y dia_semana son requeridos (o fecha, para un día puntual)' })
  }
  const [r] = await pool.execute(
    `INSERT INTO schedule_mercadolibre (tecnico_id, semana_del_mes, dia_semana, fecha, es_bucle)
     VALUES (?, ?, ?, NULL, 1)
     ON DUPLICATE KEY UPDATE es_bucle = VALUES(es_bucle), activo = 1`,
    [tecnico_id, semana_del_mes, dia_semana]
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

  // Asignaciones puntuales (un solo día, fuera del bucle) que caen en este mes
  const [puntuales] = await pool.execute(
    `SELECT s.tecnico_id, u.nombre as tecnico_nombre,
            DATE_FORMAT(s.fecha, '%Y-%m-%d') AS fecha
     FROM schedule_mercadolibre s
     JOIN users u ON u.id = s.tecnico_id
     WHERE s.activo = 1 AND s.es_bucle = 0
       AND DATE_FORMAT(s.fecha, '%Y-%m') = ?`,
    [`${anio}-${String(mes).padStart(2, '0')}`]
  )

  // Calcular qué días del mes corresponden a cada entrada
  const diasML = []
  const primerDia = new Date(anio, mes - 1, 1)
  const ultimoDia = new Date(anio, mes, 0).getDate()

  // Como la semana del ciclo es continua (no reinicia con el mes), un mismo
  // día de la semana puede repetirse 5 veces en un mes de 29-31 días, y la
  // 1ra y la 5ta ocurrencia caen en la misma semana del ciclo (28 días =
  // exactamente 4 semanas). ESO NO ES UN DUPLICADO: son dos fechas reales y
  // distintas en las que, legítimamente, le toca ir al técnico (la rotación
  // es continua — por eso vuelve a tocarle 4 semanas después, aunque las
  // dos caigan dentro del mismo mes calendario). Antes acá se descartaba la
  // 2da ocurrencia como si fuera un duplicado de la 1ra, y esa era la causa
  // de que, por ejemplo, el lunes quedara marcado pero el viernes de esa
  // misma semana real no (cuando el mes cortaba a mitad de semana): el
  // viernes "extra" del final del mes se tomaba como duplicado del viernes
  // de semanas atrás y se tiraba.
  //
  // La clave única de la tabla (tecnico_id, semana_del_mes, dia_semana) ya
  // impide que haya dos FILAS iguales en la base para la misma combinación,
  // así que acá solo hace falta evitar contar la misma fila dos veces para
  // la MISMA fecha exacta (no puede pasar en este loop porque cada día del
  // mes se recorre una sola vez, pero se deja la protección por si en algún
  // momento se cruzan otras fuentes de datos para la misma fecha).
  const yaAsignado = new Set()

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
      // Clave por FECHA exacta (no por semana+día), para no perder
      // ocurrencias reales distintas que caen en la misma semana del ciclo.
      const clave = `${m.tecnico_id}-${anio}-${mes}-${dia}`
      if (yaAsignado.has(clave)) return
      yaAsignado.add(clave)

      diasML.push({
        fecha:          `${anio}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
        tecnico_id:     m.tecnico_id,
        tecnico_nombre: m.tecnico_nombre,
        dia_semana:     diaSem,
        semana_del_mes: semanaMes,
      })
    })
  }

  // Agregar los días puntuales — no dependen del cálculo de semana, van
  // directo por su fecha exacta
  puntuales.forEach(p => {
    const dia    = parseInt(p.fecha.split('-')[2], 10)
    const diaSem = new Date(anio, mes - 1, dia).getDay()
    diasML.push({
      fecha:          p.fecha,
      tecnico_id:     p.tecnico_id,
      tecnico_nombre: p.tecnico_nombre,
      dia_semana:     diaSem,
      semana_del_mes: null,
      es_puntual:     true,
    })
  })

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

import pool from '../utils/db.js'

// ── GET /api/asistencias?user_id=X&mes=YYYY-MM ───────────────────────────────
// Admin/superadmin pueden consultar cualquier user_id
// Técnico solo puede consultar el suyo
export async function getAsistencias(req, res) {
  const { user } = req
  const mes      = req.query.mes  // formato YYYY-MM
  const esStaff  = ['admin', 'superadmin'].includes(user.rol)

  // Técnico/relevador/user solo pueden ver las suyas. Admin/superadmin pueden
  // pedir las de un técnico puntual (user_id) o, si no mandan user_id, las de
  // TODO el equipo (necesario para pintar el calendario de todos los técnicos).
  let userId = null
  if (!esStaff) {
    userId = user.id
  } else if (req.query.user_id) {
    userId = Number(req.query.user_id)
  }

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return res.status(400).json({ error: 'Parámetro mes requerido (YYYY-MM)' })
  }

  const params = [mes]
  let   where  = `DATE_FORMAT(fecha, '%Y-%m') = ?`
  if (userId) {
    where += ' AND user_id = ?'
    params.push(userId)
  }

  const [rows] = await pool.execute(
    `SELECT id, user_id, fecha, presente, nota, creado_por, updated_at
     FROM asistencias
     WHERE ${where}
     ORDER BY fecha ASC`,
    params
  )

  // Contar días presentes hasta hoy dentro del mes (solo aplica a consulta de
  // un único usuario; si el admin pidió todo el equipo, se devuelve en 0)
  const hoy       = new Date().toISOString().slice(0, 10)
  const diasHoy   = userId ? rows.filter(r => r.presente && r.fecha <= hoy).length : 0
  const diasTotal = userId ? rows.filter(r => r.presente).length : 0

  res.json({ asistencias: rows, dias_hasta_hoy: diasHoy, dias_total: diasTotal })
}

// ── GET /api/asistencias/usuarios ────────────────────────────────────────────
// Solo admin/superadmin — devuelve lista de usuarios con sus días del mes
export async function getResumenUsuarios(req, res) {
  const { user } = req
  if (!['admin', 'superadmin'].includes(user.rol)) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  const mes = req.query.mes
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return res.status(400).json({ error: 'Parámetro mes requerido (YYYY-MM)' })
  }

  const [rows] = await pool.execute(
    `SELECT u.id, u.nombre, u.rol,
            COUNT(CASE WHEN a.presente = 1 THEN 1 END) AS dias_total
     FROM users u
     LEFT JOIN asistencias a ON a.user_id = u.id
       AND DATE_FORMAT(a.fecha, '%Y-%m') = ?
     WHERE u.activo = 1
     GROUP BY u.id, u.nombre, u.rol
     ORDER BY u.nombre ASC`,
    [mes]
  )

  res.json(rows)
}

// ── POST /api/asistencias/toggle ─────────────────────────────────────────────
// Marca o desmarca un día. Técnico solo el suyo. Admin puede marcar cualquiera.
export async function toggleAsistencia(req, res) {
  const { user }   = req
  const { fecha, user_id } = req.body

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' })
  }

  // Rol check
  let targetUserId = user.id
  if (['admin', 'superadmin'].includes(user.rol) && user_id) {
    targetUserId = Number(user_id)
  }

  // Verificar si ya existe
  const [existing] = await pool.execute(
    'SELECT id, presente FROM asistencias WHERE user_id = ? AND fecha = ?',
    [targetUserId, fecha]
  )

  if (existing.length) {
    // Toggle presente
    const nuevoEstado = existing[0].presente ? 0 : 1
    await pool.execute(
      'UPDATE asistencias SET presente = ?, creado_por = ? WHERE id = ?',
      [nuevoEstado, user.id, existing[0].id]
    )
    return res.json({ fecha, presente: !!nuevoEstado, accion: 'actualizado' })
  } else {
    // Crear nuevo
    await pool.execute(
      'INSERT INTO asistencias (user_id, fecha, presente, creado_por) VALUES (?, ?, 1, ?)',
      [targetUserId, fecha, user.id]
    )
    return res.json({ fecha, presente: true, accion: 'creado' })
  }
}

// ── PUT /api/asistencias/:id ──────────────────────────────────────────────────
// Admin/superadmin pueden editar directamente el estado de un día
export async function updateAsistencia(req, res) {
  const { user } = req
  if (!['admin', 'superadmin'].includes(user.rol)) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  const { id }      = req.params
  const { presente } = req.body

  if (presente === undefined) {
    return res.status(400).json({ error: 'Campo presente requerido' })
  }

  await pool.execute(
    'UPDATE asistencias SET presente = ?, creado_por = ? WHERE id = ?',
    [presente ? 1 : 0, user.id, id]
  )

  res.json({ ok: true })
}

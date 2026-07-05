// src/controllers/trabajosController.js
import pool from '../utils/db.js'
import { notificar, notificarAdmins } from '../services/pushService.js'
import { asignarTecnico } from './visitasController.js'

const API_URL   = process.env.API_URL || ''
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'

export async function listTrabajos(req, res) {
  const { propiedad_id, cliente_id, tecnico_id, estado } = req.query
  let sql = `SELECT tc.*, 
             p.nombre as propiedad_nombre, p.direccion,
             tt.nombre as tipo_trabajo, tt.icono,
             st.nombre as subtipo_trabajo, st.garantia_meses,
             u.nombre as tecnico_nombre,
             cu.nombre as cliente_nombre
             FROM trabajos_cliente tc
             JOIN propiedades p ON p.id = tc.propiedad_id
             LEFT JOIN tipos_trabajo tt ON tt.id = tc.tipo_trabajo_id
             LEFT JOIN subtipos_trabajo st ON st.id = tc.subtipo_trabajo_id
             LEFT JOIN users u ON u.id = tc.tecnico_id
             JOIN clientes c ON c.id = tc.cliente_id
             JOIN users cu ON cu.id = c.user_id
             WHERE 1=1`
  const params = []

  if (req.user.rol === 'tecnico') {
    sql += ' AND tc.tecnico_id = ?'; params.push(req.user.id)
  }
  if (propiedad_id) { sql += ' AND tc.propiedad_id = ?'; params.push(propiedad_id) }
  if (cliente_id)   { sql += ' AND tc.cliente_id = ?';   params.push(cliente_id) }
  if (tecnico_id)   { sql += ' AND tc.tecnico_id = ?';   params.push(tecnico_id) }
  if (estado)       { sql += ' AND tc.estado = ?';       params.push(estado) }

  sql += ' ORDER BY tc.created_at DESC'
  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

export async function getMisTrabajos(req, res) {
  const [[cli]] = await pool.execute(
    `SELECT id FROM clientes WHERE user_id = ?`, [req.user.id]
  )
  if (!cli) return res.json([])

  const { propiedad_id } = req.query
  let sql = `SELECT tc.*,
             p.nombre as propiedad_nombre, p.direccion,
             tt.nombre as tipo_trabajo, tt.icono,
             st.nombre as subtipo_trabajo,
             u.nombre as tecnico_nombre
             FROM trabajos_cliente tc
             JOIN propiedades p ON p.id = tc.propiedad_id
             LEFT JOIN tipos_trabajo tt ON tt.id = tc.tipo_trabajo_id
             LEFT JOIN subtipos_trabajo st ON st.id = tc.subtipo_trabajo_id
             LEFT JOIN users u ON u.id = tc.tecnico_id
             WHERE tc.cliente_id = ?`
  const params = [cli.id]

  if (propiedad_id) { sql += ' AND tc.propiedad_id = ?'; params.push(propiedad_id) }
  sql += ' ORDER BY tc.fecha_fin DESC, tc.created_at DESC'

  const [rows] = await pool.execute(sql, params)

  // Calcular si está en garantía
  const now = new Date()
  rows.forEach(r => {
    r.fotos_adicionales = r.fotos_adicionales ? JSON.parse(r.fotos_adicionales) : []
    r.en_garantia = r.garantia_hasta ? new Date(r.garantia_hasta) >= now : false
  })

  res.json(rows)
}

export async function getTrabajo(req, res) {
  const [[tc]] = await pool.execute(
    `SELECT tc.*,
            p.nombre as propiedad_nombre, p.direccion, p.zona_id,
            tt.nombre as tipo_trabajo, tt.icono,
            st.nombre as subtipo_trabajo, st.garantia_meses,
            u.nombre as tecnico_nombre,
            cu.nombre as cliente_nombre, c.user_id as cliente_user_id,
            pr.numero as presupuesto_numero, pr.total as presupuesto_total,
            pr.notas as presupuesto_notas
     FROM trabajos_cliente tc
     JOIN propiedades p ON p.id = tc.propiedad_id
     LEFT JOIN tipos_trabajo tt ON tt.id = tc.tipo_trabajo_id
     LEFT JOIN subtipos_trabajo st ON st.id = tc.subtipo_trabajo_id
     LEFT JOIN users u ON u.id = tc.tecnico_id
     JOIN clientes c ON c.id = tc.cliente_id
     JOIN users cu ON cu.id = c.user_id
     LEFT JOIN presupuestos pr ON pr.id = tc.presupuesto_id
     WHERE tc.id = ?`,
    [req.params.id]
  )
  if (!tc) return res.status(404).json({ error: 'No encontrado' })

  if (req.user.rol === 'user' && tc.cliente_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  tc.fotos_adicionales = tc.fotos_adicionales ? JSON.parse(tc.fotos_adicionales) : []
  tc.en_garantia = tc.garantia_hasta ? new Date(tc.garantia_hasta) >= new Date() : false

  res.json(tc)
}

export async function createTrabajo(req, res) {
  const {
    propiedad_id, cliente_id, tecnico_id,
    tipo_trabajo_id, subtipo_trabajo_id,
    visita_id, relevamiento_id, presupuesto_id,
    titulo, descripcion, notas_tecnico,
    foto_portada_url, fotos_adicionales,
    fecha_inicio,
  } = req.body

  if (!propiedad_id || !cliente_id || !titulo) {
    return res.status(400).json({ error: 'propiedad_id, cliente_id y titulo son requeridos' })
  }

  // Obtener garantia_meses del subtipo si existe
  let garantiaMeses = 0
  if (subtipo_trabajo_id) {
    const [[sub]] = await pool.execute(
      `SELECT garantia_meses FROM subtipos_trabajo WHERE id = ?`, [subtipo_trabajo_id]
    )
    garantiaMeses = sub?.garantia_meses || 0
  }

  const [r] = await pool.execute(
    `INSERT INTO trabajos_cliente
     (propiedad_id, cliente_id, tecnico_id, tipo_trabajo_id, subtipo_trabajo_id,
      visita_id, relevamiento_id, presupuesto_id,
      titulo, descripcion, notas_tecnico,
      foto_portada_url, fotos_adicionales,
      fecha_inicio, garantia_meses, estado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'presupuestado')`,
    [
      propiedad_id, cliente_id, tecnico_id || null,
      tipo_trabajo_id || null, subtipo_trabajo_id || null,
      visita_id || null, relevamiento_id || null, presupuesto_id || null,
      titulo, descripcion || null, notas_tecnico || null,
      foto_portada_url || null,
      fotos_adicionales ? JSON.stringify(fotos_adicionales) : null,
      fecha_inicio || null, garantiaMeses,
    ]
  )

  res.status(201).json({ id: r.insertId, ok: true })
}

export async function updateTrabajo(req, res) {
  const {
    estado, tecnico_id, tipo_trabajo_id, subtipo_trabajo_id,
    titulo, descripcion, notas_tecnico,
    foto_portada_url, fotos_adicionales,
    fecha_inicio, fecha_fin,
  } = req.body

  const [[tc]] = await pool.execute(
    `SELECT tc.*, c.user_id as cliente_user_id
     FROM trabajos_cliente tc
     JOIN clientes c ON c.id = tc.cliente_id
     WHERE tc.id = ?`,
    [req.params.id]
  )
  if (!tc) return res.status(404).json({ error: 'No encontrado' })

  // Solo el técnico asignado o staff puede tocar este trabajo
  if (req.user.rol === 'tecnico' && tc.tecnico_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  // ── Foto de portada: obligatoria al completar por primera vez, y fija después ──
  // Si el trabajo YA tiene una foto de portada, ignoramos cualquier intento de
  // cambiarla — queda fija representando esa instalación para siempre.
  // Si todavía NO la tiene y se está marcando como completado, exigimos una.
  let fotoPortadaFinal = tc.foto_portada_url
  if (!tc.foto_portada_url) {
    if (estado === 'completado' && !foto_portada_url) {
      return res.status(400).json({
        error: 'Este trabajo todavía no tiene foto de portada. Sacá una foto antes de marcarlo como completado — va a quedar como la imagen representativa de esta instalación.',
      })
    }
    if (foto_portada_url) fotoPortadaFinal = foto_portada_url
  }

  // Calcular garantia_hasta si se marca como completado
  let garantiaHasta = tc.garantia_hasta
  let garantiaMeses = tc.garantia_meses

  if (estado === 'completado' && fecha_fin) {
    if (subtipo_trabajo_id || tc.subtipo_trabajo_id) {
      const [[sub]] = await pool.execute(
        `SELECT garantia_meses FROM subtipos_trabajo WHERE id = ?`,
        [subtipo_trabajo_id || tc.subtipo_trabajo_id]
      )
      garantiaMeses = sub?.garantia_meses || 0
    }
    if (garantiaMeses > 0) {
      const fin = new Date(fecha_fin)
      fin.setMonth(fin.getMonth() + garantiaMeses)
      garantiaHasta = fin.toISOString().slice(0, 10)
    }
  }

  await pool.execute(
    `UPDATE trabajos_cliente SET
     estado=?, tecnico_id=?, tipo_trabajo_id=?, subtipo_trabajo_id=?,
     titulo=?, descripcion=?, notas_tecnico=?,
     foto_portada_url=?, fotos_adicionales=?,
     fecha_inicio=?, fecha_fin=?,
     garantia_meses=?, garantia_hasta=?
     WHERE id=?`,
    [
      estado || tc.estado,
      tecnico_id || tc.tecnico_id,
      tipo_trabajo_id || tc.tipo_trabajo_id,
      subtipo_trabajo_id || tc.subtipo_trabajo_id,
      titulo || tc.titulo,
      descripcion || tc.descripcion,
      notas_tecnico || tc.notas_tecnico,
      fotoPortadaFinal,
      fotos_adicionales ? JSON.stringify(fotos_adicionales) : tc.fotos_adicionales,
      fecha_inicio || tc.fecha_inicio,
      fecha_fin || tc.fecha_fin,
      garantiaMeses, garantiaHasta,
      req.params.id,
    ]
  )

  // Notificaciones por cambio de estado
  if (estado && estado !== tc.estado) {
    const msgs = {
      aprobado:      '¡Tu presupuesto fue aprobado! Pronto agendaremos el trabajo.',
      agendado:      `Tu trabajo fue agendado. Revisá la fecha en la app.`,
      en_curso:      'El técnico comenzó el trabajo en tu propiedad.',
      completado:    `¡Trabajo completado! ${garantiaMeses > 0 ? `Garantía por ${garantiaMeses} meses.` : ''}`,
      cancelado:     'El trabajo fue cancelado. Contactanos para más información.',
    }
    if (msgs[estado]) {
      await notificar(tc.cliente_user_id, 'Actualización de trabajo', msgs[estado], 'trabajo', tc.id)
    }
  }

  res.json({ ok: true })
}

// ── Subir la foto de portada (o adicionales) de un trabajo ──────────────────
// POST /api/trabajos/upload-foto — igual patrón que relevamientos: la imagen
// queda guardada de forma permanente en uploads/, servida por express.static.
export async function uploadFotoTrabajo(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  const url = `${API_URL}/${UPLOAD_DIR}/${req.file.filename}`
  res.json({ url })
}

// ── El cliente aprueba o rechaza el presupuesto de su trabajo ────────────────
// PATCH /api/trabajos/:id/responder-presupuesto  { aprobado: bool, motivo?: string }
export async function responderPresupuesto(req, res) {
  const { aprobado, motivo } = req.body
  if (typeof aprobado !== 'boolean') {
    return res.status(400).json({ error: 'aprobado (true/false) es requerido' })
  }

  const [[tc]] = await pool.execute(
    `SELECT tc.*, c.user_id as cliente_user_id
     FROM trabajos_cliente tc
     JOIN clientes c ON c.id = tc.cliente_id
     WHERE tc.id = ?`,
    [req.params.id]
  )
  if (!tc) return res.status(404).json({ error: 'No encontrado' })
  if (tc.cliente_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }
  if (tc.estado !== 'presupuestado') {
    return res.status(400).json({ error: 'Este trabajo no tiene un presupuesto pendiente de respuesta' })
  }

  const nuevoEstado = aprobado ? 'aprobado' : 'cancelado'
  await pool.execute(
    `UPDATE trabajos_cliente SET estado = ?, respuesta_cliente = ? WHERE id = ?`,
    [nuevoEstado, motivo || null, tc.id]
  )

  await notificarAdmins(
    aprobado ? 'Presupuesto aprobado' : 'Presupuesto rechazado',
    `El cliente ${aprobado ? 'aprobó' : 'rechazó'} el presupuesto de "${tc.titulo}".`,
    'trabajo', tc.id
  )

  res.json({ ok: true, estado: nuevoEstado })
}

// ── El cliente agenda día/horario para un trabajo ya aprobado ───────────────
// POST /api/trabajos/:id/agendar  { fecha: 'YYYY-MM-DD', franja: 'mañana'|'tarde' }
export async function agendarTrabajo(req, res) {
  const { fecha, franja } = req.body
  if (!fecha || !['mañana', 'tarde'].includes(franja)) {
    return res.status(400).json({ error: 'fecha y franja (mañana|tarde) son requeridos' })
  }

  const [[tc]] = await pool.execute(
    `SELECT tc.*, c.user_id as cliente_user_id, p.zona_id
     FROM trabajos_cliente tc
     JOIN clientes c ON c.id = tc.cliente_id
     JOIN propiedades p ON p.id = tc.propiedad_id
     WHERE tc.id = ?`,
    [req.params.id]
  )
  if (!tc) return res.status(404).json({ error: 'No encontrado' })
  if (tc.cliente_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }
  if (tc.estado !== 'aprobado') {
    return res.status(400).json({ error: 'Este trabajo todavía no fue aprobado' })
  }
  if (!tc.zona_id) {
    return res.status(400).json({ error: 'La propiedad no tiene zona asignada, contactá a soporte' })
  }

  const tecnico = await asignarTecnico(tc.zona_id, fecha, franja, 1)
  if (!tecnico) {
    return res.status(409).json({ error: 'No hay técnicos disponibles ese día y horario. Elegí otro turno.' })
  }

  await pool.execute(
    `INSERT INTO turnos_agendados (trabajo_id, tecnico_id, fecha, franja, horas_asignadas)
     VALUES (?, ?, ?, ?, 1)`,
    [tc.id, tecnico.tecnico_id, fecha, franja]
  )

  await pool.execute(
    `UPDATE trabajos_cliente SET estado = 'agendado', fecha_inicio = ?, tecnico_id = ? WHERE id = ?`,
    [fecha, tecnico.tecnico_id, tc.id]
  )

  await notificar(tc.cliente_user_id, 'Turno agendado', `Tu trabajo "${tc.titulo}" quedó agendado para el ${fecha} (${franja}).`, 'trabajo', tc.id)
  await notificar(tecnico.tecnico_id, 'Nuevo trabajo agendado', `Tenés un trabajo el ${fecha} (${franja}).`, 'trabajo', tc.id)

  res.json({ ok: true, tecnico: tecnico.nombre, fecha, franja })
}

// ══════════════════════════════════════════════════════════════════════════
// REPROGRAMACIÓN — el técnico (o admin) libera el turno por clima o porque
// el cliente no puede, el admin gestiona y vuelve a habilitar el calendario
// para que el cliente elija una nueva fecha (mismo flujo que agendarTrabajo).
// ══════════════════════════════════════════════════════════════════════════

// PATCH /api/trabajos/:id/reprogramar  { motivo: string }
// Lo puede pedir el técnico asignado o cualquier staff (admin/superadmin).
export async function solicitarReprogramacion(req, res) {
  const { motivo } = req.body
  if (!motivo?.trim()) {
    return res.status(400).json({ error: 'Contanos el motivo de la reprogramación' })
  }

  const [[tc]] = await pool.execute(
    `SELECT tc.*, c.user_id as cliente_user_id
     FROM trabajos_cliente tc
     JOIN clientes c ON c.id = tc.cliente_id
     WHERE tc.id = ?`,
    [req.params.id]
  )
  if (!tc) return res.status(404).json({ error: 'No encontrado' })

  const esStaffConPermiso = ['admin', 'superadmin'].includes(req.user.rol)
  const esTecnicoAsignado = req.user.rol === 'tecnico' && tc.tecnico_id === req.user.id
  if (!esStaffConPermiso && !esTecnicoAsignado) {
    return res.status(403).json({ error: 'Sin permisos' })
  }
  if (!['agendado', 'en_curso'].includes(tc.estado)) {
    return res.status(400).json({ error: 'Solo se puede reprogramar un trabajo agendado o en curso' })
  }

  // Liberar al técnico: cancela el/los turno(s) agendados activos de este trabajo
  await pool.execute(
    `UPDATE turnos_agendados SET estado = 'cancelado'
     WHERE trabajo_id = ? AND estado IN ('agendado', 'en_curso')`,
    [tc.id]
  )

  // El trabajo queda en un estado intermedio a la espera de que el admin
  // gestione y vuelva a habilitar el calendario para el cliente.
  await pool.execute(
    `UPDATE trabajos_cliente
     SET estado = 'reprogramar', motivo_reprogramacion = ?, tecnico_id = NULL, fecha_inicio = NULL
     WHERE id = ?`,
    [motivo.trim(), tc.id]
  )

  await notificarAdmins(
    'Trabajo necesita reprogramación',
    `"${tc.titulo}" necesita reprogramarse. Motivo: ${motivo.trim()}`,
    'trabajo', tc.id
  )
  await notificar(
    tc.cliente_user_id,
    'Tu turno fue reprogramado',
    `Tu trabajo "${tc.titulo}" necesita reprogramarse (${motivo.trim()}). En breve te avisamos las nuevas opciones de fecha.`,
    'trabajo', tc.id
  )
  if (tc.tecnico_id) {
    await notificar(tc.tecnico_id, 'Turno liberado', `Quedaste liberado del trabajo "${tc.titulo}".`, 'trabajo', tc.id)
  }

  res.json({ ok: true })
}

// PATCH /api/trabajos/:id/habilitar-reprogramacion — solo admin/superadmin.
// Vuelve el trabajo a 'aprobado', lo que reabre para el cliente la misma
// pantalla de "Agendar" que ya usa para elegir día y horario disponible.
export async function habilitarReprogramacion(req, res) {
  const [[tc]] = await pool.execute(
    `SELECT tc.*, c.user_id as cliente_user_id
     FROM trabajos_cliente tc
     JOIN clientes c ON c.id = tc.cliente_id
     WHERE tc.id = ?`,
    [req.params.id]
  )
  if (!tc) return res.status(404).json({ error: 'No encontrado' })
  if (tc.estado !== 'reprogramar') {
    return res.status(400).json({ error: 'Este trabajo no está esperando reprogramación' })
  }

  await pool.execute(`UPDATE trabajos_cliente SET estado = 'aprobado' WHERE id = ?`, [tc.id])

  await notificar(
    tc.cliente_user_id,
    'Ya podés elegir un nuevo turno',
    `Habilitamos el calendario para reprogramar "${tc.titulo}". Elegí el día y horario que mejor te quede.`,
    'trabajo', tc.id
  )

  res.json({ ok: true })
}

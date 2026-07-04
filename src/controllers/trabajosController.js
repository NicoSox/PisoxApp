// src/controllers/trabajosController.js
import pool from '../utils/db.js'
import { notificar, notificarAdmins } from '../services/pushService.js'

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
            p.nombre as propiedad_nombre, p.direccion,
            tt.nombre as tipo_trabajo, tt.icono,
            st.nombre as subtipo_trabajo, st.garantia_meses,
            u.nombre as tecnico_nombre,
            cu.nombre as cliente_nombre, c.user_id as cliente_user_id
     FROM trabajos_cliente tc
     JOIN propiedades p ON p.id = tc.propiedad_id
     LEFT JOIN tipos_trabajo tt ON tt.id = tc.tipo_trabajo_id
     LEFT JOIN subtipos_trabajo st ON st.id = tc.subtipo_trabajo_id
     LEFT JOIN users u ON u.id = tc.tecnico_id
     JOIN clientes c ON c.id = tc.cliente_id
     JOIN users cu ON cu.id = c.user_id
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
      foto_portada_url || tc.foto_portada_url,
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

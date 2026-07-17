// src/controllers/relevamientosController.js
import pool from '../utils/db.js'
import { notificarAdmins } from '../services/pushService.js'

const API_URL    = process.env.API_URL || ''
const UPLOAD_DIR  = process.env.UPLOAD_DIR || 'uploads'

// ── Helpers de fotos_drive ──────────────────────────────────────────────────
// Blindaje: registros viejos/corruptos a veces guardaron una URL suelta en vez
// de un array JSON. Si parseamos así nomás, revienta toda la petición.
function safeParseFotos(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    // Valor legado guardado como URL plana (no JSON): la recuperamos como foto única
    return [val]
  }
}

function normalizeFotosParaGuardar(fotos_drive) {
  if (!fotos_drive) return null
  const arr = Array.isArray(fotos_drive) ? fotos_drive : [fotos_drive]
  return JSON.stringify(arr)
}

// POST /api/relevamientos/upload-foto — sube una foto y devuelve su URL pública
// (a diferencia del OCR, esta imagen se conserva: queda en uploads/ y servida por express.static)
export async function uploadFotoRelevamiento(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  const url = `${API_URL}/${UPLOAD_DIR}/${req.file.filename}`
  res.json({ url })
}

export async function listRelevamientos(req, res) {
  const { visita_id, tecnico_id, estado } = req.query
  let sql = `SELECT r.*, v.fecha_solicitada, v.franja,
             u.nombre as tecnico_nombre,
             tt.nombre as tipo_trabajo, st.nombre as subtipo_trabajo,
             p.nombre as propiedad_nombre, p.direccion
             FROM relevamientos r
             JOIN visitas_tecnicas v ON v.id = r.visita_id
             JOIN users u ON u.id = r.tecnico_id
             LEFT JOIN tipos_trabajo tt ON tt.id = r.tipo_trabajo_id
             LEFT JOIN subtipos_trabajo st ON st.id = r.subtipo_trabajo_id
             JOIN propiedades p ON p.id = v.propiedad_id
             WHERE 1=1`
  const params = []

  if (['tecnico', 'relevador'].includes(req.user.rol)) {
    sql += ' AND r.tecnico_id = ?'; params.push(req.user.id)
  }
  if (visita_id) { sql += ' AND r.visita_id = ?';   params.push(visita_id) }
  if (tecnico_id){ sql += ' AND r.tecnico_id = ?';  params.push(tecnico_id) }
  if (estado)    { sql += ' AND r.estado = ?';       params.push(estado) }

  sql += ' ORDER BY r.created_at DESC'
  const [rows] = await pool.execute(sql, params)
  rows.forEach(r => { r.fotos_drive = safeParseFotos(r.fotos_drive) })
  res.json(rows)
}

export async function getRelevamiento(req, res) {
  const [[row]] = await pool.execute(
    `SELECT r.*, v.fecha_solicitada, v.franja, v.propiedad_id,
            u.nombre as tecnico_nombre,
            tt.nombre as tipo_trabajo, st.nombre as subtipo_trabajo,
            st.garantia_meses,
            p.nombre as propiedad_nombre, p.direccion,
            cu.nombre as cliente_nombre
     FROM relevamientos r
     JOIN visitas_tecnicas v ON v.id = r.visita_id
     JOIN users u ON u.id = r.tecnico_id
     LEFT JOIN tipos_trabajo tt ON tt.id = r.tipo_trabajo_id
     LEFT JOIN subtipos_trabajo st ON st.id = r.subtipo_trabajo_id
     JOIN propiedades p ON p.id = v.propiedad_id
     JOIN clientes c ON c.id = v.cliente_id
     JOIN users cu ON cu.id = c.user_id
     WHERE r.id = ?`,
    [req.params.id]
  )
  if (!row) return res.status(404).json({ error: 'No encontrado' })
  row.fotos_drive = safeParseFotos(row.fotos_drive)
  res.json(row)
}

export async function createRelevamiento(req, res) {
  const {
    visita_id, tipo_trabajo_id, subtipo_trabajo_id,
    descripcion, herramientas, horas_estimadas,
    materiales_notas, fotos_drive, notas_adicionales,
  } = req.body

  if (!visita_id || !descripcion) {
    return res.status(400).json({ error: 'visita_id y descripcion son requeridos' })
  }

  const [r] = await pool.execute(
    `INSERT INTO relevamientos
     (visita_id, tecnico_id, tipo_trabajo_id, subtipo_trabajo_id,
      descripcion, herramientas, horas_estimadas,
      materiales_notas, fotos_drive, notas_adicionales)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      visita_id, req.user.id,
      tipo_trabajo_id || null, subtipo_trabajo_id || null,
      descripcion,
      herramientas || null,
      horas_estimadas || 1,
      materiales_notas || null,
      fotos_drive ? normalizeFotosParaGuardar(fotos_drive) : null,
      notas_adicionales || null,
    ]
  )

  // Notificar a admins que hay un relevamiento nuevo
  await notificarAdmins(
    'Nuevo relevamiento cargado',
    `El técnico ${req.user.nombre} cargó un relevamiento. Revisalo para presupuestar.`,
    'visita',
    visita_id
  )

  res.status(201).json({ id: r.insertId, ok: true })
}

export async function updateRelevamiento(req, res) {
  const {
    tipo_trabajo_id, subtipo_trabajo_id,
    descripcion, herramientas, horas_estimadas,
    materiales_notas, fotos_drive, notas_adicionales, estado,
  } = req.body

  const [[rel]] = await pool.execute(
    `SELECT * FROM relevamientos WHERE id = ?`, [req.params.id]
  )
  if (!rel) return res.status(404).json({ error: 'No encontrado' })

  // Solo el técnico/relevador que lo creó o admin/superadmin puede editar
  if (['tecnico', 'relevador'].includes(req.user.rol) && rel.tecnico_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' })
  }

  await pool.execute(
    `UPDATE relevamientos SET
     tipo_trabajo_id=?, subtipo_trabajo_id=?,
     descripcion=?, herramientas=?, horas_estimadas=?,
     materiales_notas=?, fotos_drive=?, notas_adicionales=?, estado=?
     WHERE id=?`,
    [
      tipo_trabajo_id || rel.tipo_trabajo_id,
      subtipo_trabajo_id || rel.subtipo_trabajo_id,
      descripcion || rel.descripcion,
      herramientas || rel.herramientas,
      horas_estimadas || rel.horas_estimadas,
      materiales_notas || rel.materiales_notas,
      fotos_drive ? normalizeFotosParaGuardar(fotos_drive) : rel.fotos_drive,
      notas_adicionales || rel.notas_adicionales,
      estado || rel.estado,
    ]
  )

  // Si se marca como enviado, notificar admins, cerrar la visita asociada
  // (esto es lo que destraba el siguiente turno en la cola del relevador)
  // y generar automáticamente el borrador de presupuesto + el trabajo del
  // cliente ya vinculados, para que el admin solo tenga que completar los
  // precios en vez de tipear todo de nuevo a mano.
  if (estado === 'enviado' && rel.estado !== 'enviado') {
    await pool.execute(
      `UPDATE visitas_tecnicas SET estado='realizada' WHERE id=?`,
      [rel.visita_id]
    )

    const [[ctx]] = await pool.execute(
      `SELECT v.propiedad_id, v.cliente_id,
              p.nombre as propiedad_nombre, p.direccion,
              c.telefono, cu.nombre as cliente_nombre
       FROM visitas_tecnicas v
       JOIN propiedades p ON p.id = v.propiedad_id
       JOIN clientes c ON c.id = v.cliente_id
       JOIN users cu ON cu.id = c.user_id
       WHERE v.id = ?`,
      [rel.visita_id]
    )

    const tipoTrabajoId = tipo_trabajo_id || rel.tipo_trabajo_id
    let tipoTrabajoNombre = null
    if (tipoTrabajoId) {
      const [[tt]] = await pool.execute(`SELECT nombre FROM tipos_trabajo WHERE id = ?`, [tipoTrabajoId])
      tipoTrabajoNombre = tt?.nombre || null
    }

    const descripcionFinal = descripcion || rel.descripcion
    const horasFinal        = horas_estimadas || rel.horas_estimadas || 1
    const herramientasFinal = herramientas || rel.herramientas
    const materialesFinal   = materiales_notas || rel.materiales_notas
    const notasAdicFinal    = notas_adicionales || rel.notas_adicionales

    // Notas del presupuesto: volcamos todo lo que cargó el relevador para que
    // el admin tenga el contexto completo a la vista al momento de precificar.
    const notasPresupuesto = [
      descripcionFinal ? `Relevamiento: ${descripcionFinal}` : null,
      herramientasFinal ? `Herramientas necesarias: ${herramientasFinal}` : null,
      materialesFinal ? `Materiales: ${materialesFinal}` : null,
      notasAdicFinal ? `Notas adicionales: ${notasAdicFinal}` : null,
    ].filter(Boolean).join('\n')

    const [[{ maxNum }]] = await pool.query('SELECT COALESCE(MAX(numero), 480) as maxNum FROM presupuestos')
    const numero = maxNum + 1

    const [presRes] = await pool.execute(
      `INSERT INTO presupuestos
        (numero, fecha, cliente_nombre, cliente_telefono, cliente_domicilio,
         mano_obra, materiales, incluir_materiales,
         iva_porcentaje, solicitar_adelanto, porcentaje_adelanto,
         subtotal_mano_obra, subtotal_materiales, total, notas, estado)
       VALUES (?, CURDATE(), ?, ?, ?, ?, '[]', 0, 0, 0, 50, 0, 0, 0, ?, 'borrador')`,
      [
        numero,
        ctx.cliente_nombre,
        ctx.telefono || '',
        `${ctx.propiedad_nombre} — ${ctx.direccion}`,
        JSON.stringify([{ descripcion: tipoTrabajoNombre || 'Mano de obra', cantidad: horasFinal, precio_unitario: 0 }]),
        notasPresupuesto || null,
      ]
    )
    const presupuestoId = presRes.insertId

    await pool.execute(
      `INSERT INTO trabajos_cliente
        (propiedad_id, cliente_id, tipo_trabajo_id, subtipo_trabajo_id,
         visita_id, relevamiento_id, presupuesto_id, titulo, descripcion, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'presupuestando')`,
      [
        ctx.propiedad_id, ctx.cliente_id,
        tipoTrabajoId || null, subtipo_trabajo_id || rel.subtipo_trabajo_id || null,
        rel.visita_id, rel.id, presupuestoId,
        tipoTrabajoNombre || 'Trabajo a presupuestar',
        descripcionFinal,
      ]
    )

    await notificarAdmins(
      'Relevamiento enviado',
      `El técnico ${req.user.nombre} cargó el relevamiento de "${ctx.propiedad_nombre}". Ya generamos el borrador del presupuesto #${numero} — completá los precios y enviaselo al cliente.`,
      'visita',
      rel.visita_id
    )
  }

  res.json({ ok: true })
}

export async function deleteRelevamiento(req, res) {
  await pool.execute(`DELETE FROM relevamientos WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
}

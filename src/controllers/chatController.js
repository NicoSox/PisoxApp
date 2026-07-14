// src/controllers/chatController.js
import pool from '../utils/db.js'
import { notificar, notificarAdmins } from '../services/pushService.js'

// ── Helpers de permisos ────────────────────────────────────────────────────
function puedeVer(chat, user) {
  if (user.rol === 'superadmin') return true
  if (chat.iniciado_por_id === user.id) return true
  if (chat.responsable_id === user.id) return true
  // 'soporte' y 'equipo' sin tomar todavía van a la cola de admin/superadmin
  if (user.rol === 'admin' && ['soporte', 'equipo'].includes(chat.tipo)) return true
  return false
}

function puedeEscribir(chat, user) {
  return puedeVer(chat, user)
}

function puedeGestionar(chat, user) {
  // transferir / cerrar: el responsable actual, admin o superadmin
  return user.rol === 'admin' || user.rol === 'superadmin' || chat.responsable_id === user.id
}

// ── LISTAR ─────────────────────────────────────────────────────────────────
export async function listChats(req, res) {
  let sql = `
    SELECT c.*,
           u1.nombre as iniciador_nombre, u1.rol as iniciador_rol,
           u2.nombre as responsable_nombre, u2.rol as responsable_rol,
           p.nombre as propiedad_nombre,
           tk.codigo as ticket_codigo, tk.titulo as ticket_titulo,
           (SELECT mensaje FROM chat_mensajes m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as ultimo_mensaje,
           (SELECT created_at FROM chat_mensajes m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as ultimo_mensaje_at,
           (SELECT COUNT(*) FROM chat_mensajes m WHERE m.chat_id = c.id) as total_mensajes
    FROM chats c
    JOIN users u1 ON u1.id = c.iniciado_por_id
    LEFT JOIN users u2 ON u2.id = c.responsable_id
    LEFT JOIN visitas_tecnicas v ON v.id = c.visita_id
    LEFT JOIN propiedades p ON p.id = v.propiedad_id
    LEFT JOIN tickets tk ON tk.id = c.ticket_id
    WHERE 1=1`
  const params = []

  if (req.user.rol === 'superadmin') {
    // ve todo, sin filtro adicional
  } else if (req.user.rol === 'admin') {
    sql += ' AND (c.tipo IN ("soporte", "equipo") OR c.responsable_id = ?)'
    params.push(req.user.id)
  } else {
    // cliente, técnico, relevador: solo lo propio
    sql += ' AND (c.iniciado_por_id = ? OR c.responsable_id = ?)'
    params.push(req.user.id, req.user.id)
  }

  sql += ' ORDER BY c.updated_at DESC'
  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

// ── DETALLE ────────────────────────────────────────────────────────────────
export async function getChat(req, res) {
  const [[chat]] = await pool.execute(
    `SELECT c.*,
            u1.nombre as iniciador_nombre, u1.rol as iniciador_rol,
            u2.nombre as responsable_nombre, u2.rol as responsable_rol,
            p.nombre as propiedad_nombre, p.direccion,
            tk.codigo as ticket_codigo, tk.titulo as ticket_titulo
     FROM chats c
     JOIN users u1 ON u1.id = c.iniciado_por_id
     LEFT JOIN users u2 ON u2.id = c.responsable_id
     LEFT JOIN visitas_tecnicas v ON v.id = c.visita_id
     LEFT JOIN propiedades p ON p.id = v.propiedad_id
     LEFT JOIN tickets tk ON tk.id = c.ticket_id
     WHERE c.id = ?`,
    [req.params.id]
  )
  if (!chat) return res.status(404).json({ error: 'No encontrado' })
  if (!puedeVer(chat, req.user)) return res.status(403).json({ error: 'Sin permisos' })
  res.json(chat)
}

// ── MENSAJES ───────────────────────────────────────────────────────────────
export async function getMensajes(req, res) {
  const [[chat]] = await pool.execute(`SELECT * FROM chats WHERE id = ?`, [req.params.id])
  if (!chat) return res.status(404).json({ error: 'No encontrado' })
  if (!puedeVer(chat, req.user)) return res.status(403).json({ error: 'Sin permisos' })

  const { since } = req.query
  let sql = `SELECT m.*, u.nombre as autor_nombre, u.rol as autor_rol
             FROM chat_mensajes m
             JOIN users u ON u.id = m.autor_id
             WHERE m.chat_id = ?`
  const params = [req.params.id]
  if (since) { sql += ' AND m.created_at > ?'; params.push(since) }
  sql += ' ORDER BY m.created_at ASC'

  const [rows] = await pool.execute(sql, params)
  res.json(rows)
}

// ── CREAR CHAT ─────────────────────────────────────────────────────────────
export async function crearChat(req, res) {
  const { mensaje, visita_id, ticket_id, destino } = req.body
  let { tipo } = req.body

  if (!mensaje?.trim()) return res.status(400).json({ error: 'El mensaje es requerido' })

  let responsableId = null
  let tituloAuto    = null
  let visitaIdFinal = null
  let ticketIdFinal = null

  if (req.user.rol === 'user') {
    // Cliente: 'soporte' (va a la cola) o 'tecnico' (sobre una visita con técnico ya asignado)
    if (tipo === 'tecnico') {
      if (!visita_id) return res.status(400).json({ error: 'visita_id es requerido para chatear con el técnico' })
      const [[visita]] = await pool.execute(
        `SELECT v.*, c.user_id FROM visitas_tecnicas v
         JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`,
        [visita_id]
      )
      if (!visita) return res.status(404).json({ error: 'Visita no encontrada' })
      if (visita.user_id !== req.user.id) return res.status(403).json({ error: 'Sin permisos' })
      if (!visita.tecnico_asignado_id) return res.status(400).json({ error: 'Esta visita todavía no tiene técnico asignado' })
      responsableId = visita.tecnico_asignado_id
      tituloAuto    = `Consulta sobre visita #${visita_id}`
      visitaIdFinal = visita_id
    } else {
      tipo = 'soporte'
    }
  } else if (['tecnico', 'relevador'].includes(req.user.rol)) {
    if (tipo === 'equipo') {
      // Consulta de equipo: SIEMPRE vinculada a una visita (cliente) o a un
      // ticket interno — nunca queda "suelta". El destino puede ser el
      // propio cliente de esa visita, o la cola de admin/superadmin.
      if (visita_id) {
        const [[visita]] = await pool.execute(
          `SELECT v.*, c.user_id, u.nombre as cliente_nombre
           FROM visitas_tecnicas v
           JOIN clientes c ON c.id = v.cliente_id
           LEFT JOIN users u ON u.id = c.user_id
           WHERE v.id = ?`,
          [visita_id]
        )
        if (!visita) return res.status(404).json({ error: 'Visita no encontrada' })
        visitaIdFinal = visita_id

        if (destino === 'cliente') {
          if (visita.tecnico_asignado_id !== req.user.id) {
            return res.status(403).json({ error: 'Solo podés escribirle al cliente de una visita que tengas asignada' })
          }
          if (!visita.user_id) return res.status(400).json({ error: 'Este cliente todavía no tiene cuenta habilitada en la app' })
          responsableId = visita.user_id
          tipo          = 'tecnico' // misma categoría que el chat cliente↔técnico sobre esa visita
          tituloAuto    = `Consulta sobre visita #${visita_id}`
        } else {
          responsableId = null // a la cola de admin/superadmin
          tituloAuto     = `Consulta de equipo — ${visita.cliente_nombre || 'cliente'} (visita #${visita_id})`
        }
      } else if (ticket_id) {
        const [[ticket]] = await pool.execute(`SELECT * FROM tickets WHERE id = ?`, [ticket_id])
        if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
        ticketIdFinal  = ticket_id
        responsableId  = null
        tituloAuto     = `Consulta de equipo — Ticket ${ticket.codigo}`
      } else {
        return res.status(400).json({ error: 'Elegí a qué visita o ticket se refiere la consulta de equipo' })
      }
    } else {
      tipo = 'soporte' // consulta general con soporte, sin vincular a nada puntual
    }
  } else {
    // admin/superadmin creando un chat
    if (tipo === 'equipo' && (visita_id || ticket_id)) {
      if (visita_id) visitaIdFinal = visita_id
      if (ticket_id) ticketIdFinal = ticket_id
      responsableId = null
    } else {
      tipo          = 'soporte'
      responsableId = req.user.id
    }
  }

  const [r] = await pool.execute(
    `INSERT INTO chats (iniciado_por_id, responsable_id, tipo, visita_id, ticket_id, titulo)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, responsableId, tipo, visitaIdFinal, ticketIdFinal, tituloAuto]
  )
  const chatId = r.insertId

  await pool.execute(
    `INSERT INTO chat_mensajes (chat_id, autor_id, mensaje) VALUES (?, ?, ?)`,
    [chatId, req.user.id, mensaje.trim()]
  )

  if (responsableId) {
    await notificar(responsableId, 'Nuevo mensaje', `${req.user.nombre}: ${mensaje.trim()}`, 'chat', chatId)
  } else {
    const titulo = tipo === 'equipo' ? 'Nueva consulta de equipo' : 'Nueva consulta de soporte'
    await notificarAdmins(titulo, `${req.user.nombre}: ${mensaje.trim()}`, 'chat', chatId)
  }

  res.status(201).json({ id: chatId, ok: true })
}

// ── ENVIAR MENSAJE ─────────────────────────────────────────────────────────
export async function enviarMensaje(req, res) {
  const { mensaje } = req.body
  if (!mensaje?.trim()) return res.status(400).json({ error: 'El mensaje es requerido' })

  const [[chat]] = await pool.execute(`SELECT * FROM chats WHERE id = ?`, [req.params.id])
  if (!chat) return res.status(404).json({ error: 'No encontrado' })
  if (!puedeEscribir(chat, req.user)) return res.status(403).json({ error: 'Sin permisos' })
  if (chat.estado === 'cerrado') return res.status(400).json({ error: 'Esta conversación está cerrada' })

  // Si nadie tomó el caso todavía y responde un admin/superadmin, queda asignado
  if (!chat.responsable_id && ['admin', 'superadmin'].includes(req.user.rol)) {
    await pool.execute(`UPDATE chats SET responsable_id = ? WHERE id = ?`, [req.user.id, chat.id])
    chat.responsable_id = req.user.id
  }

  await pool.execute(
    `INSERT INTO chat_mensajes (chat_id, autor_id, mensaje) VALUES (?, ?, ?)`,
    [chat.id, req.user.id, mensaje.trim()]
  )
  await pool.execute(`UPDATE chats SET updated_at = NOW() WHERE id = ?`, [chat.id])

  // Notificar a los demás participantes (no al autor)
  const destinatarios = new Set([chat.iniciado_por_id, chat.responsable_id])
  destinatarios.delete(req.user.id)
  destinatarios.delete(null)
  await Promise.all(
    [...destinatarios].map(uid => notificar(uid, 'Nuevo mensaje', `${req.user.nombre}: ${mensaje.trim()}`, 'chat', chat.id))
  )

  res.status(201).json({ ok: true })
}

// ── TRANSFERIR (derivar a otro responsable, ej. soporte → superadmin) ─────
export async function transferirChat(req, res) {
  const { nuevo_responsable_id } = req.body
  if (!nuevo_responsable_id) return res.status(400).json({ error: 'nuevo_responsable_id es requerido' })

  const [[chat]] = await pool.execute(`SELECT * FROM chats WHERE id = ?`, [req.params.id])
  if (!chat) return res.status(404).json({ error: 'No encontrado' })
  if (!puedeGestionar(chat, req.user)) return res.status(403).json({ error: 'Sin permisos' })

  const [[nuevo]] = await pool.execute(
    `SELECT id, nombre, rol FROM users WHERE id = ? AND activo = 1`, [nuevo_responsable_id]
  )
  if (!nuevo) return res.status(404).json({ error: 'Usuario destino no encontrado' })
  if (!['admin', 'superadmin', 'tecnico', 'relevador'].includes(nuevo.rol)) {
    return res.status(400).json({ error: 'El destino debe ser staff (admin, superadmin, técnico o relevador)' })
  }

  await pool.execute(`UPDATE chats SET responsable_id = ? WHERE id = ?`, [nuevo_responsable_id, chat.id])
  await notificar(nuevo_responsable_id, 'Te derivaron una conversación', `${req.user.nombre} te derivó una conversación.`, 'chat', chat.id)

  res.json({ ok: true })
}

// ── CERRAR ─────────────────────────────────────────────────────────────────
export async function cerrarChat(req, res) {
  const [[chat]] = await pool.execute(`SELECT * FROM chats WHERE id = ?`, [req.params.id])
  if (!chat) return res.status(404).json({ error: 'No encontrado' })
  if (!puedeGestionar(chat, req.user)) return res.status(403).json({ error: 'Sin permisos' })

  await pool.execute(`UPDATE chats SET estado = 'cerrado', closed_at = NOW() WHERE id = ?`, [chat.id])

  if (chat.iniciado_por_id !== req.user.id) {
    await notificar(chat.iniciado_por_id, 'Conversación cerrada', 'Tu conversación de soporte fue marcada como resuelta.', 'chat', chat.id)
  }

  res.json({ ok: true })
}

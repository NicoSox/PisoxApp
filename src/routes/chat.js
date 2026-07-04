// src/routes/chat.js
import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import {
  listChats, getChat, getMensajes, crearChat,
  enviarMensaje, transferirChat, cerrarChat,
} from '../controllers/chatController.js'

const r = Router()

// Cualquier usuario autenticado (cliente, técnico, relevador, admin, superadmin)
// puede usar estas rutas — el filtrado de "qué puede ver/hacer" vive en el controller.
r.get   ('/',              requireAuth, listChats)
r.get   ('/:id',            requireAuth, getChat)
r.get   ('/:id/mensajes',   requireAuth, getMensajes)
r.post  ('/',              requireAuth, crearChat)
r.post  ('/:id/mensajes',   requireAuth, enviarMensaje)
r.patch ('/:id/transferir', requireAuth, transferirChat)
r.patch ('/:id/cerrar',     requireAuth, cerrarChat)

export default r

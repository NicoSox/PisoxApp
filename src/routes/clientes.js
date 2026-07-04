// src/routes/clientes.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import {
  listClientes, getCliente,
  getMiPerfil, updateMiPerfil, updatePushToken,
  getMisPropiedades, createPropiedad, updatePropiedad,
  deletePropiedad, getPropiedad,
} from '../controllers/clientesController.js'

const r = Router()
const admin = requireRole('admin','superadmin')

// Perfil del cliente logueado
r.get  ('/me',                    requireAuth, getMiPerfil)
r.put  ('/me',                    requireAuth, updateMiPerfil)
r.put  ('/me/push-token',         requireAuth, updatePushToken)

// Propiedades del cliente logueado
r.get  ('/me/propiedades',        requireAuth, getMisPropiedades)
r.post ('/me/propiedades',        requireAuth, createPropiedad)
r.put  ('/me/propiedades/:id',    requireAuth, updatePropiedad)
r.delete('/me/propiedades/:id',   requireAuth, deletePropiedad)
r.get  ('/me/propiedades/:id',    requireAuth, getPropiedad)

// Admin: listar y ver clientes
r.get  ('/',                      requireAuth, admin, listClientes)
r.get  ('/:id',                   requireAuth, admin, getCliente)

export default r

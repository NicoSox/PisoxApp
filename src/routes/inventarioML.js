// src/routes/inventarioML.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import {
  listarInventario, crearItem, actualizarCantidad,
  editarItem, eliminarItem, getAuditoria,
} from '../controllers/inventarioMLController.js'

const r = Router()
const staff = requireRole('admin', 'superadmin', 'tecnico', 'relevador')
const admin = requireRole('admin', 'superadmin')

// Ver y sumar/editar: todo el staff. Eliminar un ítem: solo admin/superadmin.
r.get   ('/',             requireAuth, staff, listarInventario)
r.get   ('/auditoria',    requireAuth, staff, getAuditoria)
r.post  ('/',             requireAuth, staff, crearItem)
r.patch ('/:id/cantidad', requireAuth, staff, actualizarCantidad)
r.put   ('/:id',          requireAuth, staff, editarItem)
r.delete('/:id',          requireAuth, admin, eliminarItem)

export default r

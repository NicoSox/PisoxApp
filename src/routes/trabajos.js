// src/routes/trabajos.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { listTrabajos, getMisTrabajos, getTrabajo, createTrabajo, updateTrabajo } from '../controllers/trabajosController.js'

const r = Router()
const admin = requireRole('admin','superadmin')
const staff = requireRole('admin','superadmin','tecnico')

r.get  ('/mis-trabajos',  requireAuth, getMisTrabajos)
r.get  ('/',              requireAuth, staff, listTrabajos)
r.get  ('/:id',           requireAuth, getTrabajo)
r.post ('/',              requireAuth, admin, createTrabajo)
r.put  ('/:id',           requireAuth, updateTrabajo)

export default r

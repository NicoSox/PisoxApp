// src/routes/trabajos.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { upload } from '../middlewares/upload.js'
import { rejectLargeUploads } from '../middlewares/security.js'
import {
  listTrabajos, getMisTrabajos, getTrabajo, createTrabajo, updateTrabajo,
  uploadFotoTrabajo, responderPresupuesto, agendarTrabajo,
  solicitarReprogramacion, habilitarReprogramacion,
} from '../controllers/trabajosController.js'

const r = Router()
const admin = requireRole('admin','superadmin')
const staff = requireRole('admin','superadmin','tecnico')

r.post  ('/upload-foto', requireAuth, staff, rejectLargeUploads, upload.single('foto'), uploadFotoTrabajo)

r.get   ('/mis-trabajos',              requireAuth, getMisTrabajos)
r.get   ('/',                          requireAuth, staff, listTrabajos)
r.get   ('/:id',                       requireAuth, getTrabajo)
r.post  ('/',                          requireAuth, admin, createTrabajo)
r.put   ('/:id',                       requireAuth, staff, updateTrabajo)
r.patch ('/:id/responder-presupuesto', requireAuth, responderPresupuesto)
r.post  ('/:id/agendar',               requireAuth, agendarTrabajo)
r.patch ('/:id/reprogramar',           requireAuth, solicitarReprogramacion)
r.patch ('/:id/habilitar-reprogramacion', requireAuth, admin, habilitarReprogramacion)

export default r

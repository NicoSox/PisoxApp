// src/routes/scheduleML.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { listarSchedule, crearSchedule, eliminarSchedule, getScheduleMes } from '../controllers/scheduleMLController.js'

const r = Router()
const admin = requireRole('admin','superadmin')

r.get   ('/',        requireAuth, admin, listarSchedule)
r.get   ('/mes',     requireAuth, admin, getScheduleMes)
r.post  ('/',        requireAuth, admin, crearSchedule)
r.delete('/:id',     requireAuth, admin, eliminarSchedule)

export default r

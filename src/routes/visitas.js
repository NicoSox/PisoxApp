// src/routes/visitas.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { getDisponibilidad, listVisitas, getMisVisitas, getVisita, createVisita, updateVisita } from '../controllers/visitasController.js'

const r = Router()
const admin = requireRole('admin','superadmin')
const staff = requireRole('admin','superadmin','tecnico','relevador')

r.get ('/disponibilidad',  requireAuth, getDisponibilidad)
r.get ('/mis-visitas',     requireAuth, getMisVisitas)
r.get ('/',                requireAuth, staff, listVisitas)
r.get ('/:id',             requireAuth, getVisita)
r.post('/',                requireAuth, createVisita)
r.put ('/:id',             requireAuth, staff, updateVisita)

export default r

// ─────────────────────────────────────────────────────────────────────────────

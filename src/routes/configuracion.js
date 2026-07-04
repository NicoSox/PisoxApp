// src/routes/configuracion.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { getConfiguracion, updateConfiguracion } from '../controllers/configuracionController.js'

const r = Router()

r.get('/',  requireAuth, getConfiguracion)
r.put('/',  requireAuth, requireRole('superadmin'), updateConfiguracion)

export default r

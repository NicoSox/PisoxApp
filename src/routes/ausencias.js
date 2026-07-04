// src/routes/ausencias.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { listAusencias, createAusencia, responderAusencia, deleteAusencia } from '../controllers/ausenciasController.js'

const r = Router()
const admin = requireRole('admin','superadmin')

r.get   ('/',          requireAuth, listAusencias)
r.post  ('/',          requireAuth, createAusencia)
r.patch ('/:id',       requireAuth, admin, responderAusencia)
r.delete('/:id',       requireAuth, deleteAusencia)

export default r

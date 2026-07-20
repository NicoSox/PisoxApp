// src/routes/entidades.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { upload } from '../middlewares/upload.js'
import { rejectLargeUploads } from '../middlewares/security.js'
import {
  listEntidades, getEntidad, createEntidad,
  updateEntidad, deleteEntidad, uploadFotoEntidad,
} from '../controllers/entidadesController.js'

const r = Router()
const admin = requireRole('admin', 'superadmin')
const staff = requireRole('admin', 'superadmin', 'tecnico', 'relevador')

r.post  ('/upload-foto', requireAuth, staff, rejectLargeUploads, upload.single('foto'), uploadFotoEntidad)

r.get   ('/',     requireAuth, listEntidades)   // cliente y staff necesitan verlas
r.get   ('/:id',  requireAuth, getEntidad)
r.post  ('/',     requireAuth, staff, createEntidad)
r.put   ('/:id',  requireAuth, staff, updateEntidad)
r.delete('/:id',  requireAuth, admin, deleteEntidad)

export default r

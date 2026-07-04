// src/routes/relevamientos.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { upload } from '../middlewares/upload.js'
import { rejectLargeUploads } from '../middlewares/security.js'
import {
  listRelevamientos, getRelevamiento, createRelevamiento,
  updateRelevamiento, deleteRelevamiento, uploadFotoRelevamiento,
} from '../controllers/relevamientosController.js'

const r = Router()
const admin = requireRole('admin', 'superadmin')
const staff = requireRole('admin', 'superadmin', 'tecnico', 'relevador')

r.post  ('/upload-foto', requireAuth, staff, rejectLargeUploads, upload.single('foto'), uploadFotoRelevamiento)

r.get   ('/',     requireAuth, staff, listRelevamientos)
r.get   ('/:id',  requireAuth, staff, getRelevamiento)
r.post  ('/',     requireAuth, staff, createRelevamiento)
r.put   ('/:id',  requireAuth, staff, updateRelevamiento)
r.delete('/:id',  requireAuth, admin, deleteRelevamiento)

export default r

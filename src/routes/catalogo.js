// src/routes/catalogo.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import {
  listProvincias, createProvincia, updateProvincia,
  listLocalidades, createLocalidad,
  listZonas, createZona, updateZona, deleteZona,
  listTiposTrabajo, createTipoTrabajo, updateTipoTrabajo, deleteTipoTrabajo,
  createSubtipo, updateSubtipo, deleteSubtipo,
  getTecnicoZonas, setTecnicoZonas,
} from '../controllers/catalogoController.js'

const r = Router()
const admin = requireRole('admin','superadmin')
const super_ = requireRole('superadmin')

// Provincias
r.get   ('/provincias',          requireAuth, listProvincias)
r.post  ('/provincias',          requireAuth, super_, createProvincia)
r.put   ('/provincias/:id',      requireAuth, super_, updateProvincia)

// Localidades
r.get   ('/localidades',         requireAuth, listLocalidades)
r.post  ('/localidades',         requireAuth, super_, createLocalidad)

// Zonas
r.get   ('/zonas',               requireAuth, listZonas)
r.post  ('/zonas',               requireAuth, admin, createZona)
r.put   ('/zonas/:id',           requireAuth, admin, updateZona)
r.delete('/zonas/:id',           requireAuth, super_, deleteZona)

// Tipos de trabajo
r.get   ('/tipos-trabajo',       requireAuth, listTiposTrabajo)
r.post  ('/tipos-trabajo',       requireAuth, super_, createTipoTrabajo)
r.put   ('/tipos-trabajo/:id',   requireAuth, super_, updateTipoTrabajo)
r.delete('/tipos-trabajo/:id',   requireAuth, super_, deleteTipoTrabajo)

// Subtipos
r.post  ('/subtipos/:id',        requireAuth, super_, createSubtipo)
r.put   ('/subtipos/:id',        requireAuth, super_, updateSubtipo)
r.delete('/subtipos/:id',        requireAuth, super_, deleteSubtipo)

// Técnico → Zonas
r.get   ('/tecnico-zonas/:tecnicoId',  requireAuth, getTecnicoZonas)
r.put   ('/tecnico-zonas/:tecnicoId',  requireAuth, admin, setTecnicoZonas)

export default r

import { Router } from 'express'
import {
  getAsistencias,
  getResumenUsuarios,
  toggleAsistencia,
  updateAsistencia,
} from '../controllers/asistenciasController.js'

const router = Router()

router.get('/',          getAsistencias)       // GET  /api/asistencias?user_id=X&mes=YYYY-MM
router.get('/usuarios',  getResumenUsuarios)   // GET  /api/asistencias/usuarios?mes=YYYY-MM
router.post('/toggle',   toggleAsistencia)     // POST /api/asistencias/toggle
router.put('/:id',       updateAsistencia)     // PUT  /api/asistencias/:id

export default router

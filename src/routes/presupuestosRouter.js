import { Router } from 'express'
import { requireRole } from '../middlewares/auth.js'
import { listar, obtener, crear, actualizar, eliminar } from '../controllers/presupuestosController.js'

const router = Router()

router.get('/',    listar)
router.get('/:id', obtener)
router.post('/',   crear)
router.put('/:id', actualizar)
router.delete('/:id', requireRole('admin', 'superadmin'), eliminar)

export default router

import { Router } from 'express'
import { requireRole } from '../middlewares/auth.js'
import { listar, obtener, crear, actualizar, eliminar } from '../controllers/presupuestosController.js'

const router = Router()
const staff = requireRole('admin', 'superadmin')

// requireAuth ya se aplica a nivel app.js; acá restringimos además por rol.
router.get('/',    staff, listar)
router.get('/:id', staff, obtener)
router.post('/',   staff, crear)
router.put('/:id', staff, actualizar)
router.delete('/:id', staff, eliminar)

export default router

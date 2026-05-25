import { Router } from 'express'
import { requireRole } from '../middlewares/auth.js'
import { createUser, deleteUser, listUsers, updateUser } from '../controllers/usersController.js'

const router = Router()

router.use(requireRole('superadmin'))

router.get('/', listUsers)
router.post('/', createUser)
router.put('/:id', updateUser)
router.delete('/:id', deleteUser)

export default router
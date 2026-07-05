import { Router } from 'express'
import { requireRole } from '../middlewares/auth.js'
import { createUser, deleteUser, listUsers, updateUser } from '../controllers/usersController.js'

const router = Router()
const staff = requireRole('admin', 'superadmin')
const superadminOnly = requireRole('superadmin')

router.get('/',        staff, listUsers)
router.post('/',       staff, createUser) // el controller restringe qué rol puede asignar un admin
router.put('/:id',     superadminOnly, updateUser)
router.delete('/:id',  superadminOnly, deleteUser)

export default router

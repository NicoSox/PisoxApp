import { Router } from 'express'
import { login, me, register, registerCliente } from '../controllers/authController.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()

router.post('/register', register)
router.post('/register-cliente', registerCliente)
router.post('/login', login)
router.get('/me', requireAuth, me)

export default router
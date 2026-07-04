// src/routes/turnos.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import {
  getTurnosDisponibles, getAgenda, crearTurno, updateEstadoTurno,
  getNotificaciones, marcarLeida, marcarTodasLeidas,
} from '../controllers/turnosController.js'

const r = Router()
const staff = requireRole('admin','superadmin','tecnico')

r.get  ('/disponibles',          requireAuth, getTurnosDisponibles)
r.get  ('/agenda',               requireAuth, getAgenda)
r.post ('/',                     requireAuth, crearTurno)
r.patch('/:id/estado',           requireAuth, updateEstadoTurno)

// Notificaciones
r.get  ('/notificaciones',       requireAuth, getNotificaciones)
r.patch('/notificaciones/:id',   requireAuth, marcarLeida)
r.patch('/notificaciones/todas', requireAuth, marcarTodasLeidas)

export default r

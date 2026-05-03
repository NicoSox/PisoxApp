import { Router } from 'express'
import {
  listTickets, createTicket, getTicket, updateTicket, deleteTicket,
  addComentario, deleteComentario,
  getHistorial,
  getStats, getMeta,
} from '../controllers/ticketsController.js'

const router = Router()

router.get('/stats', getStats)
router.get('/meta',  getMeta)

router.get   ('/',    listTickets)
router.post  ('/',    createTicket)
router.get   ('/:id', getTicket)
router.put   ('/:id', updateTicket)
router.delete('/:id', deleteTicket)

router.post  ('/:id/comentarios',      addComentario)
router.delete('/:id/comentarios/:cid', deleteComentario)

router.get('/:id/historial', getHistorial)

export default router

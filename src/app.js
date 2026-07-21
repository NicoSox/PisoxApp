import 'express-async-errors'
import express from 'express'
import cors    from 'cors'
import morgan  from 'morgan'
import path    from 'path'
import fs      from 'fs'
import { fileURLToPath } from 'url'

// Rutas existentes
import ticketsRouter       from './routes/tickets.js'
import authRouter          from './routes/auth.js'
import usersRouter         from './routes/users.js'
import ocrRouter           from './routes/ocr.js'
import presupuestosRouter  from './routes/presupuestosRouter.js'
import asistenciasRouter   from './routes/asistenciasRouter.js'

// Rutas nuevas — sistema de clientes
import catalogoRouter      from './routes/catalogo.js'
import scheduleMLRouter    from './routes/scheduleML.js'
import inventarioMLRouter  from './routes/inventarioML.js'
import clientesRouter      from './routes/clientes.js'
import visitasRouter       from './routes/visitas.js'
import relevamientosRouter from './routes/relevamientos.js'
import entidadesRouter     from './routes/entidades.js'
import trabajosRouter      from './routes/trabajos.js'
import turnosRouter        from './routes/turnos.js'
import configuracionRouter from './routes/configuracion.js'
import chatRouter          from './routes/chat.js'
import ausenciasRouter     from './routes/ausencias.js'

import { errorHandler }    from './middlewares/errorHandler.js'
import { rejectLargeUploads, securityHeaders, simpleRateLimit } from './middlewares/security.js'
import { requireAuth }     from './middlewares/auth.js'

const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR   = process.env.UPLOAD_DIR || 'uploads'
const DEBUG        = process.env.DEBUG === 'true'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Aceptar múltiples orígenes (app admin + app cliente)
const allowedOrigins = [
  FRONTEND_URL,
  process.env.FRONTEND_CLIENT_URL || 'http://localhost:5174',
  // Expo Go y APKs hacen requests desde null origin — permitirlo
].filter(Boolean)

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const app = express()

app.use(cors({
  origin: (origin, cb) => {
    // Permitir requests sin origin (APK, Postman, etc.)
    if (!origin) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS bloqueado: ${origin}`))
  },
  credentials: true,
}))

if (DEBUG) app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use(securityHeaders)
app.use(simpleRateLimit)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Servir imágenes guardadas
app.use(`/${UPLOAD_DIR}`, express.static(path.resolve(UPLOAD_DIR)))

// ── Rutas públicas ────────────────────────────────────────────────────────────
app.get('/', (_req, res) =>
  res.json({ ok: true, service: 'Pisox API' })
)
app.use('/api/auth', authRouter)

// ── Rutas existentes (requieren auth) ────────────────────────────────────────
app.use('/api/users',        requireAuth, usersRouter)
app.use('/api/tickets',      requireAuth, ticketsRouter)
app.use('/api/ocr',          requireAuth, rejectLargeUploads, ocrRouter)
app.use('/api/presupuestos', requireAuth, presupuestosRouter)
app.use('/api/asistencias',  requireAuth, asistenciasRouter)

// ── Rutas nuevas — sistema de clientes ───────────────────────────────────────
app.use('/api/catalogo',      catalogoRouter)       // auth dentro de cada ruta
app.use('/api/schedule-ml',   scheduleMLRouter)
app.use('/api/ml-inventario', inventarioMLRouter)
app.use('/api/clientes',      clientesRouter)
app.use('/api/visitas',       requireAuth, visitasRouter)
app.use('/api/relevamientos', requireAuth, relevamientosRouter)
app.use('/api/entidades',     entidadesRouter) // auth dentro de cada ruta, igual que catalogo
app.use('/api/trabajos',      requireAuth, trabajosRouter)
app.use('/api/turnos',        requireAuth, turnosRouter)
app.use('/api/configuracion', configuracionRouter)
app.use('/api/chat',          chatRouter) // requireAuth ya aplicado dentro de cada ruta
app.use('/api/ausencias',     ausenciasRouter) // requireAuth ya aplicado dentro de cada ruta

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
)

// Error handler siempre al final
app.use(errorHandler)
export default app

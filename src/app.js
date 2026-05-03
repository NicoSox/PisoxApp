import 'dotenv/config'
import 'express-async-errors'
import express from 'express'
import cors    from 'cors'
import morgan  from 'morgan'
import path    from 'path'
import fs      from 'fs'
import { fileURLToPath } from 'url'

import ticketsRouter    from './routes/tickets.js'
import ocrRouter        from './routes/ocr.js'
import { errorHandler } from './middlewares/errorHandler.js'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
const DEBUG      = process.env.DEBUG === 'true'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const app = express()

app.use(cors({ origin: FRONTEND_URL }))
if (DEBUG) app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Servir imágenes guardadas
app.use(`/${UPLOAD_DIR}`, express.static(path.resolve(UPLOAD_DIR)))

// Rutas
app.use('/api/tickets', ticketsRouter)
app.use('/api/ocr',     ocrRouter)

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
)

// Error handler siempre al final
app.use(errorHandler)

export default app

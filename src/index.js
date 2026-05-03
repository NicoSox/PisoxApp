import dotenv from 'dotenv'
import path from 'path'
import pool from './utils/db.js'
import app from './app.js'

// Cargar .env (ruta relativa al directorio del proyecto)
dotenv.config({ path: path.resolve('..', '.env') })

// Manejadores globales
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason)
  process.exit(1)
})

async function connectDB() {
  try {
    console.log('[connectDB] Intentando conectar a MySQL...')
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    console.log('✅ MySQL connection OK')
  } catch (err) {
    console.error('❌ MySQL connection error:', err.message)
    throw err
  }
}

export async function start() {
  console.log('[start] Iniciando función start()')
  try {
    console.log('[start] Llamando connectDB()...')
    await connectDB()

    const PORT = process.env.PORT || 8000
    const API_URL = process.env.API_URL || `http://localhost:${PORT}`
    const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

    console.log('[start] Variables cargadas:', { PORT, API_URL, UPLOAD_DIR, FRONTEND_URL })
    console.log('[start] Iniciando app.listen()...')

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🎫  Ticket Manager API → ${API_URL}`)
      console.log(`📂  Uploads            → ${API_URL}/${UPLOAD_DIR}`)
      console.log(`🌐  CORS Origin        → ${FRONTEND_URL}`)
      console.log(`🔑  Google Vision      → ${process.env.GOOGLE_APPLICATION_CREDENTIALS || '❌ FALTA configurar'}`)
      console.log(`🗄️   MySQL              → ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`)
    })

    console.log('[start] Servidor escuchando correctamente')
    return server
  } catch (err) {
    console.error('❌ Failed to start application:', err.message)
    console.error('❌ Stack:', err.stack)
    process.exit(1)
  }
}

// Solo exportar, sin top-level await
export { start }

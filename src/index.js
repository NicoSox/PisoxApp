import 'dotenv/config'
import pool from './utils/db.js'
import app from './app.js'

async function connectDB() {
  try {
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    console.log('✅ MySQL connection OK')
  } catch (err) {
    console.error('❌ MySQL connection error:', err.message)
    throw err
  }
}

async function start() {
  try {
    await connectDB()

    const PORT = process.env.PORT || 8000
    const API_URL = process.env.API_URL || `http://localhost:${PORT}`
    const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

    app.listen(PORT, () => {
      console.log(`\n🎫  Ticket Manager API → ${API_URL}`)
      console.log(`📂  Uploads            → ${API_URL}/${UPLOAD_DIR}`)
      console.log(`🌐  CORS Origin        → ${FRONTEND_URL}`)
      console.log(`🔑  Google Vision      → ${process.env.GOOGLE_APPLICATION_CREDENTIALS || '❌ FALTA configurar'}`)
      console.log(`🗄️   MySQL              → ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`)
    })
  } catch (err) {
    console.error('❌ Failed to start application:', err.message)
    process.exit(1)
  }
}

start()

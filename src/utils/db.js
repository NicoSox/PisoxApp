import mysql from 'mysql2/promise'

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
const missing = required.filter(k => !process.env[k])
if (missing.length) {
  throw new Error(`Faltan variables de entorno de base de datos: ${missing.join(', ')}`)
}

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
  charset:            'utf8mb4',
  collation:          'utf8mb4_unicode_ci',
})

// Forzar collation en cada conexión nueva
pool.on('connection', (connection) => {
  connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")
  connection.query("SET collation_connection = utf8mb4_unicode_ci")
})

export default pool

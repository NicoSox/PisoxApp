import pool from '../utils/db.js'
import { verifyJwt } from '../utils/jwt.js'

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const parts = authHeader.split(' ')

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  try {
    const payload = verifyJwt(parts[1])
    const userId = Number(payload.userId)

    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    const [rows] = await pool.execute(
      `SELECT id, nombre, email, rol, activo, created_at, updated_at, last_login_at
       FROM users
       WHERE id = ? AND activo = 1`,
      [userId]
    )

    if (!rows.length) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    req.user = rows[0]
    req.tokenPayload = payload
    next()
  } catch {
    return res.status(401).json({ error: 'No autorizado' })
  }
}

export function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' })
    }

    next()
  }
}
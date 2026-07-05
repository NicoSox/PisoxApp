import bcrypt from 'bcryptjs'
import pool from '../utils/db.js'
import { signJwt } from '../utils/jwt.js'

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeName(value) {
  return String(value || '').trim()
}

function validatePassword(password) {
  if (!password || !password.trim()) return 'La contraseña es obligatoria'
  if (!PASSWORD_REGEX.test(password)) {
    return 'La contraseña debe tener al menos 8 caracteres, una letra, un número y un caracter especial'
  }
  return null
}

function buildUserResponse(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    activo: user.activo,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at,
  }
}

async function getUsersCount() {
  const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM users')
  return Number(row?.total || 0)
}

export async function register(req, res) {
  const nombre = normalizeName(req.body.nombre)
  const email = normalizeEmail(req.body.email)
  const password = String(req.body.password || '')

  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!email) return res.status(400).json({ error: 'El email es obligatorio' })

  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ error: passwordError })

  const usersCount = await getUsersCount()
  if (usersCount > 0) {
    return res.status(403).json({ error: 'El registro inicial ya fue completado' })
  }

  const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
  if (existingRows.length) {
    return res.status(409).json({ error: 'Ese email ya está registrado' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const [result] = await pool.execute(
    `INSERT INTO users (nombre, email, password_hash, rol, activo)
     VALUES (?, ?, ?, 'superadmin', 1)`,
    [nombre, email, passwordHash]
  )

  const [rows] = await pool.execute(
    `SELECT id, nombre, email, rol, activo, created_at, updated_at, last_login_at
     FROM users
     WHERE id = ?`,
    [result.insertId]
  )

  const user = rows[0]
  const token = signJwt({ userId: user.id, email: user.email, rol: user.rol })
  res.status(201).json({
    token,
    user: buildUserResponse(user),
  })
}

// Registro de clientes — a diferencia de register() (que solo crea al primer
// superadmin y se cierra para siempre), este endpoint queda siempre abierto
// para que cualquier cliente nuevo pueda crear su cuenta desde la app.
export async function registerCliente(req, res) {
  const nombre   = normalizeName(req.body.nombre)
  const email    = normalizeEmail(req.body.email)
  const password = String(req.body.password || '')
  const telefono = String(req.body.telefono || '').trim()

  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!email)  return res.status(400).json({ error: 'El email es obligatorio' })

  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ error: passwordError })

  const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
  if (existingRows.length) {
    return res.status(409).json({ error: 'Ese email ya está registrado' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const [result] = await pool.execute(
    `INSERT INTO users (nombre, email, password_hash, rol, activo)
     VALUES (?, ?, ?, 'user', 1)`,
    [nombre, email, passwordHash]
  )
  const userId = result.insertId

  await pool.execute(
    `INSERT INTO clientes (user_id, telefono) VALUES (?, ?)`,
    [userId, telefono || null]
  )

  const [rows] = await pool.execute(
    `SELECT id, nombre, email, rol, activo, created_at, updated_at, last_login_at
     FROM users WHERE id = ?`,
    [userId]
  )

  const user = rows[0]
  const token = signJwt({ userId: user.id, email: user.email, rol: user.rol })
  res.status(201).json({
    token,
    user: buildUserResponse(user),
  })
}

export async function login(req, res) {
  const email = normalizeEmail(req.body.email)
  const password = String(req.body.password || '')

  if (!email) return res.status(400).json({ error: 'El email es obligatorio' })
  if (!password) return res.status(400).json({ error: 'La contraseña es obligatoria' })

  const [rows] = await pool.execute(
    `SELECT id, nombre, email, rol, activo, password_hash, created_at, updated_at, last_login_at
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  )

  if (!rows.length) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  const user = rows[0]
  if (!user.activo) {
    return res.status(403).json({ error: 'Usuario deshabilitado' })
  }

  const isValid = await bcrypt.compare(password, user.password_hash)
  if (!isValid) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])

  const token = signJwt({ userId: user.id, email: user.email, rol: user.rol })
  res.json({
    token,
    user: buildUserResponse(user),
  })
}

export async function me(req, res) {
  res.json({ user: buildUserResponse(req.user) })
}
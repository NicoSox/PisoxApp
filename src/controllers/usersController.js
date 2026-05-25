import bcrypt from 'bcryptjs'
import pool from '../utils/db.js'

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const ALLOWED_ROLES = ['tecnico', 'admin', 'user', 'superadmin']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function validatePassword(password) {
  if (!password || !password.trim()) return 'La contraseña es obligatoria'
  if (!PASSWORD_REGEX.test(password)) {
    return 'La contraseña debe tener al menos 8 caracteres, una letra, un número y un caracter especial'
  }
  return null
}

function normalizeRole(role) {
  const cleanRole = normalizeText(role).toLowerCase()
  return ALLOWED_ROLES.includes(cleanRole) ? cleanRole : null
}

function mapUser(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    activo: row.activo,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
  }
}

export async function listUsers(req, res) {
  const [rows] = await pool.execute(
    `SELECT id, nombre, email, rol, activo, created_at, updated_at, last_login_at
     FROM users
     ORDER BY created_at DESC`
  )

  res.json(rows.map(mapUser))
}

export async function createUser(req, res) {
  const nombre = normalizeText(req.body.nombre)
  const email = normalizeEmail(req.body.email)
  const password = String(req.body.password || '')
  const rol = normalizeRole(req.body.rol) || 'user'
  const activo = req.body.activo === undefined ? 1 : (req.body.activo ? 1 : 0)

  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!email) return res.status(400).json({ error: 'El email es obligatorio' })
  if (!normalizeRole(rol)) return res.status(400).json({ error: 'Rol inválido' })

  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ error: passwordError })

  const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
  if (existingRows.length) {
    return res.status(409).json({ error: 'Ese email ya está registrado' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const [result] = await pool.execute(
    `INSERT INTO users (nombre, email, password_hash, rol, activo)
     VALUES (?, ?, ?, ?, ?)`,
    [nombre, email, passwordHash, rol, activo]
  )

  const [rows] = await pool.execute(
    `SELECT id, nombre, email, rol, activo, created_at, updated_at, last_login_at
     FROM users
     WHERE id = ?`,
    [result.insertId]
  )

  res.status(201).json(mapUser(rows[0]))
}

export async function updateUser(req, res) {
  const id = Number(req.params.id)
  const nombre = normalizeText(req.body.nombre)
  const email = normalizeEmail(req.body.email)
  const rol = req.body.rol === undefined ? null : normalizeRole(req.body.rol)
  const activo = req.body.activo === undefined ? null : (req.body.activo ? 1 : 0)
  const password = req.body.password ? String(req.body.password) : ''

  if (!id) return res.status(400).json({ error: 'ID inválido' })
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!email) return res.status(400).json({ error: 'El email es obligatorio' })
  if (req.body.rol !== undefined && !rol) return res.status(400).json({ error: 'Rol inválido' })

  const [currentRows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id])
  if (!currentRows.length) return res.status(404).json({ error: 'Usuario no encontrado' })

  const current = currentRows[0]

  const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id])
  if (existingRows.length) {
    return res.status(409).json({ error: 'Ese email ya está registrado por otro usuario' })
  }

  let passwordHash = current.password_hash
  if (password) {
    const passwordError = validatePassword(password)
    if (passwordError) return res.status(400).json({ error: passwordError })
    passwordHash = await bcrypt.hash(password, 10)
  }

  await pool.execute(
    `UPDATE users SET nombre = ?, email = ?, password_hash = ?, rol = ?, activo = ?
     WHERE id = ?`,
    [
      nombre,
      email,
      passwordHash,
      rol || current.rol,
      activo === null ? current.activo : activo,
      id,
    ]
  )

  const [rows] = await pool.execute(
    `SELECT id, nombre, email, rol, activo, created_at, updated_at, last_login_at
     FROM users
     WHERE id = ?`,
    [id]
  )

  res.json(mapUser(rows[0]))
}

export async function deleteUser(req, res) {
  const id = Number(req.params.id)

  if (!id) return res.status(400).json({ error: 'ID inválido' })
  if (req.user && req.user.id === id) {
    return res.status(400).json({ error: 'No podés eliminar tu propio usuario' })
  }

  const [currentRows] = await pool.execute('SELECT id FROM users WHERE id = ?', [id])
  if (!currentRows.length) return res.status(404).json({ error: 'Usuario no encontrado' })

  await pool.execute('DELETE FROM users WHERE id = ?', [id])
  res.json({ ok: true })
}
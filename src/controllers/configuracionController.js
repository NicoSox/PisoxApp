// src/controllers/configuracionController.js
import pool from '../utils/db.js'

export async function getConfiguracion(req, res) {
  const [rows] = await pool.execute(
    `SELECT clave, valor, descripcion FROM configuracion ORDER BY clave ASC`
  )
  // Devolver como objeto clave:valor para fácil uso en el frontend
  const config = {}
  rows.forEach(r => { config[r.clave] = r.valor })
  res.json(config)
}

export async function updateConfiguracion(req, res) {
  const updates = req.body // { clave: valor, ... }
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body inválido' })
  }

  const entries = Object.entries(updates)
  if (!entries.length) return res.status(400).json({ error: 'Sin datos' })

  await Promise.all(entries.map(([clave, valor]) =>
    pool.execute(
      `UPDATE configuracion SET valor = ? WHERE clave = ?`,
      [String(valor), clave]
    )
  ))

  res.json({ ok: true })
}

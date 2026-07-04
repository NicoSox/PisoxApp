// src/services/pushService.js
// Envía notificaciones push via Expo Push API (gratuito, sin servidor propio)

import pool from '../utils/db.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * Envía una notificación push a un usuario y la guarda en la tabla notificaciones
 * @param {number} userId - ID del usuario destinatario
 * @param {string} titulo
 * @param {string} cuerpo
 * @param {string} tipo - 'presupuesto'|'turno'|'trabajo'|'visita'|'general'
 * @param {number|null} referenciaId - ID del objeto relacionado
 */
export async function notificar(userId, titulo, cuerpo, tipo = 'general', referenciaId = null) {
  // 1. Guardar en DB siempre
  await pool.execute(
    `INSERT INTO notificaciones (user_id, titulo, cuerpo, tipo, referencia_id)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, titulo, cuerpo, tipo, referenciaId]
  )

  // 2. Buscar push token del usuario
  const [[user]] = await pool.execute(
    `SELECT expo_push_token, push_activo FROM users WHERE id = ? AND activo = 1`,
    [userId]
  )

  if (!user?.expo_push_token || !user?.push_activo) return

  // 3. Enviar via Expo
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to:    user.expo_push_token,
        title: titulo,
        body:  cuerpo,
        data:  { tipo, referenciaId },
        sound: 'default',
      }),
    })

    if (res.ok) {
      // Marcar como enviada
      await pool.execute(
        `UPDATE notificaciones SET enviada_push = 1
         WHERE user_id = ? AND tipo = ? AND referencia_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [userId, tipo, referenciaId]
      )
    }
  } catch (err) {
    console.error('[Push] Error enviando notificación:', err.message)
  }
}

/**
 * Notifica a todos los admin y superadmin
 */
export async function notificarAdmins(titulo, cuerpo, tipo = 'general', referenciaId = null) {
  const [admins] = await pool.execute(
    `SELECT id FROM users WHERE rol IN ('admin','superadmin') AND activo = 1`
  )
  await Promise.all(admins.map(a => notificar(a.id, titulo, cuerpo, tipo, referenciaId)))
}

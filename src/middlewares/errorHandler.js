export function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message)

  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ error: 'Archivo demasiado grande' })

  if (err.code === 'ER_DUP_ENTRY')
    return res.status(409).json({ error: 'Ya existe un ticket con ese código' })

  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: err.message || 'Error interno del servidor' })
}

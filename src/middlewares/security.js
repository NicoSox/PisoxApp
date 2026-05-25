const WINDOW_MS = 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 120

const requestBuckets = new Map()

function getClientKey(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown'
}

function cleanupBucket(clientKey, now) {
  const bucket = requestBuckets.get(clientKey)
  if (!bucket) return null

  if (now - bucket.startedAt > WINDOW_MS) {
    requestBuckets.delete(clientKey)
    return null
  }

  return bucket
}

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
}

export function simpleRateLimit(req, res, next) {
  const now = Date.now()
  const clientKey = getClientKey(req)
  const bucket = cleanupBucket(clientKey, now)

  if (!bucket) {
    requestBuckets.set(clientKey, { startedAt: now, count: 1 })
    return next()
  }

  bucket.count += 1

  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intentá más tarde.' })
  }

  next()
}

export function requireApiKey(req, res, next) {
  const expectedKey = process.env.APP_API_KEY

  if (!expectedKey) {
    return next()
  }

  const providedKey = req.headers['x-api-key']
  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  next()
}

export function rejectLargeUploads(req, res, next) {
  const limitMb = Number(process.env.MAX_UPLOAD_MB || 8)
  const header = req.headers['content-length']

  if (!header) return next()

  const sizeBytes = Number(header)
  if (Number.isNaN(sizeBytes)) return next()

  if (sizeBytes > limitMb * 1024 * 1024) {
    return res.status(413).json({ error: `Archivo demasiado grande. Máximo ${limitMb} MB.` })
  }

  next()
}
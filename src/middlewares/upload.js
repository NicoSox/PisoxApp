import multer from 'multer'
import path   from 'path'
import { v4 as uuid } from 'uuid'

const UPLOAD_DIR  = process.env.UPLOAD_DIR || 'uploads'
const MAX_SIZE_MB  = parseInt(process.env.MAX_UPLOAD_MB || process.env.MAX_FILE_SIZE_MB || '10', 10)
const ALLOWED     = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff']

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename:    (_req,  file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg'
      cb(null, `tmp_${uuid().slice(0, 8)}${ext}`)
    },
  }),
  fileFilter: (_req, file, cb) => {
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Tipo no permitido: ${file.mimetype}`))
  },
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
})

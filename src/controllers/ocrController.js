import fs from 'fs/promises'
import { processTicketImage } from '../services/ocrService.js'

export async function ocrController(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })

  const filePath = req.file.path
  try {
    const result = await processTicketImage(filePath)
    res.json(result)
  } finally {
    await fs.unlink(filePath).catch(() => {})
  }
}

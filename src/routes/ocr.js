import { Router } from 'express'
import { upload }        from '../middlewares/upload.js'
import { ocrController } from '../controllers/ocrController.js'

const router = Router()
router.post('/', upload.single('file'), ocrController)
export default router

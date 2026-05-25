import { Router } from 'express'
import { upload }        from '../middlewares/upload.js'
import { ocrController } from '../controllers/ocrController.js'
import { rejectLargeUploads } from '../middlewares/security.js'

const router = Router()
router.post('/', rejectLargeUploads, upload.single('file'), ocrController)
export default router

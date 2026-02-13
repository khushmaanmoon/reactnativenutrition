import { Router } from 'express';
import verifyToken from '../auth/auth.middleware';
import { assignProgram, trainingProgram } from '../controllers/training.controllers';

const router = Router();

router.get('/training/current', verifyToken, trainingProgram);
router.post('/training/assign', verifyToken, assignProgram);

export default router;

import { Router } from 'express';
import verifyToken from '../auth/auth.middleware';
import {
  assignProgram,
  getTrainingHistory,
  getTrainingPrs,
  logTrainingSession,
  trainingProgram,
} from '../controllers/training.controllers';

const router = Router();

router.get('/training/current', verifyToken, trainingProgram);
router.post('/training/assign', verifyToken, assignProgram);
router.post('/training/log-session', verifyToken, logTrainingSession);
router.get('/training/history', verifyToken, getTrainingHistory);
router.get('/training/prs', verifyToken, getTrainingPrs);

export default router;

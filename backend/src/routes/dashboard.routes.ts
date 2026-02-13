import { Router } from 'express';
import verifyToken from '../auth/auth.middleware';
import {
  getDashboardSummary,
  getDashboardTrends,
} from '../controllers/dashboard.controllers';

const router = Router();

router.get('/dashboard/summary', verifyToken, getDashboardSummary);
router.get('/dashboard/trends', verifyToken, getDashboardTrends);

export default router;

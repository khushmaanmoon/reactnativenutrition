import { Router } from 'express';
import verifyToken from '../auth/auth.middleware';
import {
  getLatestMeasurement,
  getMeasurementHistory,
  getMeasurementTrends,
  upsertMeasurement,
} from '../controllers/measurements.controllers';

const router = Router();

router.post('/measurements', verifyToken, upsertMeasurement);
router.get('/measurements/latest', verifyToken, getLatestMeasurement);
router.get('/measurements/history', verifyToken, getMeasurementHistory);
router.get('/measurements/trends', verifyToken, getMeasurementTrends);

export default router;

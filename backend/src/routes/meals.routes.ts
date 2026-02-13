import { Router } from 'express';
import verifyToken from '../auth/auth.middleware';
import {
  generateMealPlan,
  getMealPlanByDate,
} from '../controllers/meals.controllers';

const router = Router();

router.post('/meals/generate', verifyToken, generateMealPlan);
router.get('/meals/:date', verifyToken, getMealPlanByDate);

export default router;

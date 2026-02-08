import { Router } from 'express';
import { calculateNutritionController } from '../controllers/nutrition.controllers';

const router = Router();

router.post('/nutrition/calculate', calculateNutritionController);

export default router;

import { Request, Response } from 'express';
import { getNutritionPlan } from '../services/nutrition.services';
import { NutritionInput } from '../types/nutrition.types';

export function calculateNutritionController(
  req: Request,
  res: Response
): Response {
    console.log("payload : ", req.body)
  try {
    console.log("try block has started")
    const payload = req.body as NutritionInput;
    console.log("Success on this")
    if (
      !payload.age ||
      !payload.weight ||
      !payload.height ||
      !payload.sex ||
      !payload.activityLevel ||
      !payload.goal
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input data',
      });
    }

    const result = getNutritionPlan(payload);
    console.log("This is the result", result)

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : 'Failed to calculate nutrition',
    });
  }
}

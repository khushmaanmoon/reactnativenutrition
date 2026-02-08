import { NutritionInput, NutritionResult } from '../types/nutrition.types';
import { calculateNutrition } from '../utils/nutritionCalculator';

export function getNutritionPlan(
  input: NutritionInput
): NutritionResult {
  // later: validation, logging, DB, caching
  return calculateNutrition(input);
}

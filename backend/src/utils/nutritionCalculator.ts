import { NutritionInput, NutritionResult } from '../types/nutrition.types';

export function calculateNutrition(
  input: NutritionInput
): NutritionResult {
  const {
    age,
    sex,
    height,
    weight,
    activityLevel,
    goal,
  } = input;

  // Mifflin-St Jeor
  const bmr =
    sex === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

  const activityMultiplier: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };

  let calories = bmr * activityMultiplier[activityLevel];

  if (goal === 'fat_loss') calories -= 500;
  if (goal === 'muscle_gain') calories += 300;

  const proteinGrams = weight * 2;
  const fatsGrams = weight * 0.8;
  const carbsGrams =
    (calories - proteinGrams * 4 - fatsGrams * 9) / 4;

  return {
    calories: Math.round(calories),
    protein: Math.round(proteinGrams),
    carbs: Math.round(carbsGrams),
    fats: Math.round(fatsGrams),
  };
}

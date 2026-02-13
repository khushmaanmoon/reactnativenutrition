import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AuthRequest } from '../auth/auth.middleware';
import { db } from '../utils/db';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type RecipeMacroRow = RowDataPacket & {
  recipe_id: number;
  recipe_name: string;
  meal_type: MealType;
  prep_minutes: number;
  recipe_kcal: number;
  recipe_protein: number;
  recipe_carbs: number;
  recipe_fats: number;
};

type MealPlanRow = RowDataPacket & {
  id: number;
  user_id: number;
  plan_date: Date;
  target_kcal: number;
  target_protein: number;
  target_carbs: number;
  target_fats: number;
};

type PlanItemRow = RowDataPacket & {
  item_id: number;
  meal_type: MealType;
  recipe_id: number;
  recipe_name: string;
  scale_factor: number;
  base_kcal: number;
  base_protein: number;
  base_carbs: number;
  base_fats: number;
};

type GeneratePlanPayload = {
  planDate?: string;
  targetKcal?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFats?: number;
};

type ChosenMeal = {
  mealType: MealType;
  recipeId: number;
  recipeName: string;
  scaleFactor: number;
  baseKcal: number;
  baseProtein: number;
  baseCarbs: number;
  baseFats: number;
  achievedKcal: number;
  achievedProtein: number;
  achievedCarbs: number;
  achievedFats: number;
};

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const DEFAULT_SPLIT: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getPlanDate(input?: string): string {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid planDate');
  }
  return date.toISOString().slice(0, 10);
}

function scoreRecipe(
  recipe: RecipeMacroRow,
  targetKcal: number,
  targetProtein: number,
  targetCarbs: number,
  targetFats: number
): number {
  return (
    0.5 * Math.abs(recipe.recipe_kcal - targetKcal) +
    3 * Math.abs(recipe.recipe_protein - targetProtein) +
    2 * Math.abs(recipe.recipe_carbs - targetCarbs) +
    2 * Math.abs(recipe.recipe_fats - targetFats)
  );
}

export async function generateMealPlan(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  const userId = Number(req.user?.userId);
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  try {
    const payload = req.body as GeneratePlanPayload;
    const planDate = getPlanDate(payload.planDate);

    const targetKcal = Number(payload.targetKcal);
    const targetProtein = Number(payload.targetProtein);
    const targetCarbs = Number(payload.targetCarbs);
    const targetFats = Number(payload.targetFats);

    if (
      !targetKcal ||
      !targetProtein ||
      !targetCarbs ||
      !targetFats ||
      targetKcal <= 0 ||
      targetProtein <= 0 ||
      targetCarbs <= 0 ||
      targetFats <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid macro targets are required',
      });
    }

    const [recipeRows] = await db.query<RecipeMacroRow[]>(
      `SELECT
         r.id AS recipe_id,
         r.name AS recipe_name,
         r.meal_type,
         r.prep_minutes,
         SUM((f.kcal_per_100g * ri.grams) / 100) AS recipe_kcal,
         SUM((f.protein_per_100g * ri.grams) / 100) AS recipe_protein,
         SUM((f.carbs_per_100g * ri.grams) / 100) AS recipe_carbs,
         SUM((f.fats_per_100g * ri.grams) / 100) AS recipe_fats
       FROM recipes r
       JOIN recipe_items ri ON ri.recipe_id = r.id
       JOIN foods f ON f.id = ri.food_id
       GROUP BY r.id, r.name, r.meal_type, r.prep_minutes`
    );

    if (recipeRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No recipes available to generate plan',
      });
    }

    const byMealType = recipeRows.reduce<Record<MealType, RecipeMacroRow[]>>(
      (acc, row) => {
        if (!acc[row.meal_type]) {
          acc[row.meal_type] = [];
        }
        acc[row.meal_type].push(row);
        return acc;
      },
      {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
      }
    );

    const chosenMeals: ChosenMeal[] = [];
    for (const mealType of MEAL_ORDER) {
      const candidates = byMealType[mealType];
      if (!candidates || candidates.length === 0) {
        return res.status(400).json({
          success: false,
          message: `No recipes configured for ${mealType}`,
        });
      }

      const mealTargetKcal = targetKcal * DEFAULT_SPLIT[mealType];
      const mealTargetProtein = targetProtein * DEFAULT_SPLIT[mealType];
      const mealTargetCarbs = targetCarbs * DEFAULT_SPLIT[mealType];
      const mealTargetFats = targetFats * DEFAULT_SPLIT[mealType];

      let best = candidates[0];
      let bestScore = scoreRecipe(
        best,
        mealTargetKcal,
        mealTargetProtein,
        mealTargetCarbs,
        mealTargetFats
      );

      for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i];
        const candidateScore = scoreRecipe(
          candidate,
          mealTargetKcal,
          mealTargetProtein,
          mealTargetCarbs,
          mealTargetFats
        );
        if (candidateScore < bestScore) {
          best = candidate;
          bestScore = candidateScore;
        }
      }

      const rawScale = mealTargetKcal / (best.recipe_kcal || 1);
      const scaleFactor = clamp(rawScale, 0.7, 1.5);

      chosenMeals.push({
        mealType,
        recipeId: best.recipe_id,
        recipeName: best.recipe_name,
        scaleFactor: round2(scaleFactor),
        baseKcal: round2(best.recipe_kcal),
        baseProtein: round2(best.recipe_protein),
        baseCarbs: round2(best.recipe_carbs),
        baseFats: round2(best.recipe_fats),
        achievedKcal: round2(best.recipe_kcal * scaleFactor),
        achievedProtein: round2(best.recipe_protein * scaleFactor),
        achievedCarbs: round2(best.recipe_carbs * scaleFactor),
        achievedFats: round2(best.recipe_fats * scaleFactor),
      });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [planInsert] = await connection.query<ResultSetHeader>(
        `INSERT INTO user_meal_plans
          (user_id, plan_date, target_kcal, target_protein, target_carbs, target_fats)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          target_kcal = VALUES(target_kcal),
          target_protein = VALUES(target_protein),
          target_carbs = VALUES(target_carbs),
          target_fats = VALUES(target_fats)`,
        [userId, planDate, targetKcal, targetProtein, targetCarbs, targetFats]
      );

      const mealPlanId = planInsert.insertId;

      await connection.query<ResultSetHeader>(
        `DELETE FROM user_meal_plan_items WHERE meal_plan_id = ?`,
        [mealPlanId]
      );

      for (const meal of chosenMeals) {
        await connection.query<ResultSetHeader>(
          `INSERT INTO user_meal_plan_items
            (meal_plan_id, meal_type, recipe_id, scale_factor)
           VALUES (?, ?, ?, ?)`,
          [mealPlanId, meal.mealType, meal.recipeId, meal.scaleFactor]
        );
      }

      await connection.commit();

      const totals = chosenMeals.reduce(
        (acc, meal) => {
          acc.kcal += meal.achievedKcal;
          acc.protein += meal.achievedProtein;
          acc.carbs += meal.achievedCarbs;
          acc.fats += meal.achievedFats;
          return acc;
        },
        { kcal: 0, protein: 0, carbs: 0, fats: 0 }
      );

      return res.status(201).json({
        success: true,
        data: {
          mealPlanId,
          userId,
          planDate,
          targets: {
            kcal: targetKcal,
            protein: targetProtein,
            carbs: targetCarbs,
            fats: targetFats,
          },
          achieved: {
            kcal: round2(totals.kcal),
            protein: round2(totals.protein),
            carbs: round2(totals.carbs),
            fats: round2(totals.fats),
          },
          meals: chosenMeals,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Meal plan generation error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate meal plan',
    });
  }
}

export async function getMealPlanByDate(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  const userId = Number(req.user?.userId);
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  try {
    const rawDate = Array.isArray(req.params.date)
      ? req.params.date[0]
      : req.params.date;
    const planDate = getPlanDate(rawDate);

    const [planRows] = await db.query<MealPlanRow[]>(
      `SELECT id, user_id, plan_date, target_kcal, target_protein, target_carbs, target_fats
       FROM user_meal_plans
       WHERE user_id = ? AND plan_date = ?
       LIMIT 1`,
      [userId, planDate]
    );

    if (planRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Meal plan not found for date',
      });
    }

    const mealPlan = planRows[0];
    const [itemRows] = await db.query<PlanItemRow[]>(
      `SELECT
         mpi.id AS item_id,
         mpi.meal_type,
         mpi.recipe_id,
         r.name AS recipe_name,
         mpi.scale_factor,
         SUM((f.kcal_per_100g * ri.grams) / 100) AS base_kcal,
         SUM((f.protein_per_100g * ri.grams) / 100) AS base_protein,
         SUM((f.carbs_per_100g * ri.grams) / 100) AS base_carbs,
         SUM((f.fats_per_100g * ri.grams) / 100) AS base_fats
       FROM user_meal_plan_items mpi
       JOIN recipes r ON r.id = mpi.recipe_id
       JOIN recipe_items ri ON ri.recipe_id = r.id
       JOIN foods f ON f.id = ri.food_id
       WHERE mpi.meal_plan_id = ?
       GROUP BY mpi.id, mpi.meal_type, mpi.recipe_id, r.name, mpi.scale_factor`,
      [mealPlan.id]
    );

    const meals = itemRows.map((item) => ({
      mealType: item.meal_type,
      recipeId: item.recipe_id,
      recipeName: item.recipe_name,
      scaleFactor: round2(item.scale_factor),
      achievedKcal: round2(item.base_kcal * item.scale_factor),
      achievedProtein: round2(item.base_protein * item.scale_factor),
      achievedCarbs: round2(item.base_carbs * item.scale_factor),
      achievedFats: round2(item.base_fats * item.scale_factor),
    }));

    const totals = meals.reduce(
      (acc, meal) => {
        acc.kcal += meal.achievedKcal;
        acc.protein += meal.achievedProtein;
        acc.carbs += meal.achievedCarbs;
        acc.fats += meal.achievedFats;
        return acc;
      },
      { kcal: 0, protein: 0, carbs: 0, fats: 0 }
    );

    return res.status(200).json({
      success: true,
      data: {
        mealPlanId: mealPlan.id,
        userId,
        planDate,
        targets: {
          kcal: mealPlan.target_kcal,
          protein: mealPlan.target_protein,
          carbs: mealPlan.target_carbs,
          fats: mealPlan.target_fats,
        },
        achieved: {
          kcal: round2(totals.kcal),
          protein: round2(totals.protein),
          carbs: round2(totals.carbs),
          fats: round2(totals.fats),
        },
        meals,
      },
    });
  } catch (error) {
    console.error('Meal plan fetch error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch meal plan',
    });
  }
}

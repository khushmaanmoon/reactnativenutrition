import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { AuthRequest } from '../auth/auth.middleware';
import { db } from '../utils/db';

type SummaryTrainingRow = RowDataPacket & {
  sessions_count: number;
  total_volume: number | null;
};

type AvgVolumeRow = RowDataPacket & {
  avg_session_volume: number | null;
};

type NutritionSummaryRow = RowDataPacket & {
  meal_days: number;
  avg_kcal_adherence: number | null;
  avg_protein_adherence: number | null;
};

type PrImprovementRow = RowDataPacket & {
  improved_count: number;
};

type WeeklyVolumeRow = RowDataPacket & {
  year_week: number;
  total_volume: number | null;
  sessions_count: number;
};

type WeeklyNutritionRow = RowDataPacket & {
  year_week: number;
  avg_kcal_adherence: number | null;
  avg_protein_adherence: number | null;
  meal_days: number;
};

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getDashboardSummary(
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

  const rawFrom = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
  const rawTo = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;
  const fromDate = parseDate(rawFrom as string | undefined);
  const toDate = parseDate(rawTo as string | undefined);

  if ((rawFrom && !fromDate) || (rawTo && !toDate)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date format in query. Use YYYY-MM-DD.',
    });
  }

  const to = toDate ?? new Date();
  to.setHours(0, 0, 0, 0);
  const from = fromDate ?? new Date(to);
  if (!fromDate) {
    from.setDate(from.getDate() - 30);
  }

  try {
    const [trainingRows] = await db.query<SummaryTrainingRow[]>(
      `SELECT
         COUNT(DISTINCT s.id) AS sessions_count,
         SUM(w.volume) AS total_volume
       FROM sessions s
       LEFT JOIN workouts w ON w.session_id = s.id
       WHERE s.user_id = ?
         AND s.session_date BETWEEN ? AND ?`,
      [userId, from, to]
    );

    const [avgVolumeRows] = await db.query<AvgVolumeRow[]>(
      `SELECT AVG(x.session_volume) AS avg_session_volume
       FROM (
         SELECT s.id, COALESCE(SUM(w.volume), 0) AS session_volume
         FROM sessions s
         LEFT JOIN workouts w ON w.session_id = s.id
         WHERE s.user_id = ?
           AND s.session_date BETWEEN ? AND ?
         GROUP BY s.id
       ) x`,
      [userId, from, to]
    );

    const [nutritionRows] = await db.query<NutritionSummaryRow[]>(
      `SELECT
         COUNT(*) AS meal_days,
         AVG(
           CASE
             WHEN mp.target_kcal > 0
             THEN LEAST((COALESCE(ach.achieved_kcal, 0) / mp.target_kcal) * 100, 200)
             ELSE NULL
           END
         ) AS avg_kcal_adherence,
         AVG(
           CASE
             WHEN mp.target_protein > 0
             THEN LEAST((COALESCE(ach.achieved_protein, 0) / mp.target_protein) * 100, 200)
             ELSE NULL
           END
         ) AS avg_protein_adherence
       FROM user_meal_plans mp
       LEFT JOIN (
         SELECT
           mpi.meal_plan_id,
           SUM(((f.kcal_per_100g * ri.grams) / 100) * mpi.scale_factor) AS achieved_kcal,
           SUM(((f.protein_per_100g * ri.grams) / 100) * mpi.scale_factor) AS achieved_protein
         FROM user_meal_plan_items mpi
         JOIN recipe_items ri ON ri.recipe_id = mpi.recipe_id
         JOIN foods f ON f.id = ri.food_id
         GROUP BY mpi.meal_plan_id
       ) ach ON ach.meal_plan_id = mp.id
       WHERE mp.user_id = ?
         AND mp.plan_date BETWEEN ? AND ?`,
      [userId, from, to]
    );

    const [prRows] = await db.query<PrImprovementRow[]>(
      `SELECT COUNT(*) AS improved_count
       FROM (
         SELECT
           wr.exercise_id,
           MAX(wr.weights) AS range_max,
           COALESCE(
             (
               SELECT MAX(wb.weights)
               FROM workouts wb
               JOIN sessions sb ON sb.id = wb.session_id
               WHERE sb.user_id = ?
                 AND wb.exercise_id = wr.exercise_id
                 AND sb.session_date < ?
             ),
             0
           ) AS previous_max
         FROM workouts wr
         JOIN sessions sr ON sr.id = wr.session_id
         WHERE sr.user_id = ?
           AND sr.session_date BETWEEN ? AND ?
         GROUP BY wr.exercise_id
       ) t
       WHERE t.range_max > t.previous_max`,
      [userId, from, userId, from, to]
    );

    const training = trainingRows[0] || { sessions_count: 0, total_volume: 0 };
    const avgVolume = avgVolumeRows[0] || { avg_session_volume: 0 };
    const nutrition = nutritionRows[0] || {
      meal_days: 0,
      avg_kcal_adherence: 0,
      avg_protein_adherence: 0,
    };
    const prs = prRows[0] || { improved_count: 0 };

    return res.status(200).json({
      success: true,
      data: {
        from,
        to,
        training: {
          sessionsCount: training.sessions_count || 0,
          totalVolume: Number(training.total_volume || 0),
          avgVolumePerSession: round2(Number(avgVolume.avg_session_volume || 0)),
        },
        nutrition: {
          mealDays: nutrition.meal_days || 0,
          avgKcalAdherencePct: round2(Number(nutrition.avg_kcal_adherence || 0)),
          avgProteinAdherencePct: round2(
            Number(nutrition.avg_protein_adherence || 0)
          ),
        },
        prs: {
          improvementsInRange: prs.improved_count || 0,
        },
      },
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary',
    });
  }
}

export async function getDashboardTrends(
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

  const rawWeeks = Array.isArray(req.query.weeks) ? req.query.weeks[0] : req.query.weeks;
  const weeks = Math.max(1, Math.min(52, Number(rawWeeks || 12)));

  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - weeks * 7);

  try {
    const [volumeRows] = await db.query<WeeklyVolumeRow[]>(
      `SELECT
         YEARWEEK(s.session_date, 1) AS year_week,
         SUM(w.volume) AS total_volume,
         COUNT(DISTINCT s.id) AS sessions_count
       FROM sessions s
       JOIN workouts w ON w.session_id = s.id
       WHERE s.user_id = ?
         AND s.session_date BETWEEN ? AND ?
       GROUP BY YEARWEEK(s.session_date, 1)
       ORDER BY year_week ASC`,
      [userId, from, to]
    );

    const [nutritionRows] = await db.query<WeeklyNutritionRow[]>(
      `SELECT
         YEARWEEK(mp.plan_date, 1) AS year_week,
         AVG(
           CASE
             WHEN mp.target_kcal > 0
             THEN LEAST((COALESCE(ach.achieved_kcal, 0) / mp.target_kcal) * 100, 200)
             ELSE NULL
           END
         ) AS avg_kcal_adherence,
         AVG(
           CASE
             WHEN mp.target_protein > 0
             THEN LEAST((COALESCE(ach.achieved_protein, 0) / mp.target_protein) * 100, 200)
             ELSE NULL
           END
         ) AS avg_protein_adherence,
         COUNT(*) AS meal_days
       FROM user_meal_plans mp
       LEFT JOIN (
         SELECT
           mpi.meal_plan_id,
           SUM(((f.kcal_per_100g * ri.grams) / 100) * mpi.scale_factor) AS achieved_kcal,
           SUM(((f.protein_per_100g * ri.grams) / 100) * mpi.scale_factor) AS achieved_protein
         FROM user_meal_plan_items mpi
         JOIN recipe_items ri ON ri.recipe_id = mpi.recipe_id
         JOIN foods f ON f.id = ri.food_id
         GROUP BY mpi.meal_plan_id
       ) ach ON ach.meal_plan_id = mp.id
       WHERE mp.user_id = ?
         AND mp.plan_date BETWEEN ? AND ?
       GROUP BY YEARWEEK(mp.plan_date, 1)
       ORDER BY year_week ASC`,
      [userId, from, to]
    );

    const nutritionMap = new Map(
      nutritionRows.map((row) => [row.year_week, row])
    );

    const merged = volumeRows.map((volumeRow) => {
      const n = nutritionMap.get(volumeRow.year_week);
      return {
        yearWeek: volumeRow.year_week,
        totalVolume: Number(volumeRow.total_volume || 0),
        sessionsCount: volumeRow.sessions_count,
        avgKcalAdherencePct: round2(Number(n?.avg_kcal_adherence || 0)),
        avgProteinAdherencePct: round2(Number(n?.avg_protein_adherence || 0)),
        mealDays: n?.meal_days || 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        from,
        to,
        weeks,
        trend: merged,
      },
    });
  } catch (error) {
    console.error('Dashboard trends error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard trends',
    });
  }
}

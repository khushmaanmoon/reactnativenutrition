import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AuthRequest } from '../auth/auth.middleware';
import { db } from '../utils/db';

type MeasurementRow = RowDataPacket & {
  id: number;
  user_id: number;
  measurement_date: Date;
  bodyweight: number | null;
  neck: number | null;
  arms: number | null;
  waist: number | null;
  shoulders: number | null;
  quads: number | null;
  hips: number | null;
  calves: number | null;
  front_pic: string | null;
  back_pic: string | null;
  left_pic: string | null;
  right_pic: string | null;
};

type MeasurementPayload = {
  measurementDate?: string;
  bodyweight?: number | null;
  neck?: number | null;
  arms?: number | null;
  waist?: number | null;
  shoulders?: number | null;
  quads?: number | null;
  hips?: number | null;
  calves?: number | null;
  frontPic?: string | null;
  backPic?: string | null;
  leftPic?: string | null;
  rightPic?: string | null;
};

const NUMERIC_FIELDS: Array<keyof MeasurementPayload> = [
  'bodyweight',
  'neck',
  'arms',
  'waist',
  'shoulders',
  'quads',
  'hips',
  'calves',
];

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function measurementToDto(row: MeasurementRow) {
  return {
    id: row.id,
    userId: row.user_id,
    measurementDate: row.measurement_date,
    bodyweight: row.bodyweight,
    neck: row.neck,
    arms: row.arms,
    waist: row.waist,
    shoulders: row.shoulders,
    quads: row.quads,
    hips: row.hips,
    calves: row.calves,
    frontPic: row.front_pic,
    backPic: row.back_pic,
    leftPic: row.left_pic,
    rightPic: row.right_pic,
  };
}

export async function upsertMeasurement(
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

  const payload = req.body as MeasurementPayload;
  const measurementDate = parseDate(payload.measurementDate);
  if (!measurementDate) {
    return res.status(400).json({
      success: false,
      message: 'measurementDate is required in YYYY-MM-DD format',
    });
  }

  const bodyweight = normalizeNumber(payload.bodyweight);
  const neck = normalizeNumber(payload.neck);
  const arms = normalizeNumber(payload.arms);
  const waist = normalizeNumber(payload.waist);
  const shoulders = normalizeNumber(payload.shoulders);
  const quads = normalizeNumber(payload.quads);
  const hips = normalizeNumber(payload.hips);
  const calves = normalizeNumber(payload.calves);

  try {
    const [existing] = await db.query<MeasurementRow[]>(
      `SELECT *
       FROM measurements
       WHERE user_id = ? AND measurement_date = ?
       LIMIT 1`,
      [userId, measurementDate]
    );

    if (existing.length > 0) {
      await db.query<ResultSetHeader>(
        `UPDATE measurements
         SET bodyweight = ?,
             neck = ?,
             arms = ?,
             waist = ?,
             shoulders = ?,
             quads = ?,
             hips = ?,
             calves = ?,
             front_pic = ?,
             back_pic = ?,
             left_pic = ?,
             right_pic = ?
         WHERE user_id = ? AND measurement_date = ?`,
        [
          bodyweight,
          neck,
          arms,
          waist,
          shoulders,
          quads,
          hips,
          calves,
          payload.frontPic ?? null,
          payload.backPic ?? null,
          payload.leftPic ?? null,
          payload.rightPic ?? null,
          userId,
          measurementDate,
        ]
      );
    } else {
      await db.query<ResultSetHeader>(
        `INSERT INTO measurements
          (user_id, measurement_date, bodyweight, neck, arms, waist, shoulders, quads, hips, calves,
           front_pic, back_pic, left_pic, right_pic)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          measurementDate,
          bodyweight,
          neck,
          arms,
          waist,
          shoulders,
          quads,
          hips,
          calves,
          payload.frontPic ?? null,
          payload.backPic ?? null,
          payload.leftPic ?? null,
          payload.rightPic ?? null,
        ]
      );
    }

    const [savedRows] = await db.query<MeasurementRow[]>(
      `SELECT *
       FROM measurements
       WHERE user_id = ? AND measurement_date = ?
       LIMIT 1`,
      [userId, measurementDate]
    );

    return res.status(201).json({
      success: true,
      data: measurementToDto(savedRows[0]),
    });
  } catch (error) {
    console.error('Measurement upsert error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save measurement',
    });
  }
}

export async function getLatestMeasurement(
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
    const [rows] = await db.query<MeasurementRow[]>(
      `SELECT *
       FROM measurements
       WHERE user_id = ?
       ORDER BY measurement_date DESC
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No measurements found',
      });
    }

    return res.status(200).json({
      success: true,
      data: measurementToDto(rows[0]),
    });
  } catch (error) {
    console.error('Latest measurement fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch latest measurement',
    });
  }
}

export async function getMeasurementHistory(
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

  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.max(1, Math.min(100, Number(rawLimit || 20)));

  try {
    const [rows] = await db.query<MeasurementRow[]>(
      `SELECT *
       FROM measurements
       WHERE user_id = ?
       ORDER BY measurement_date DESC
       LIMIT ?`,
      [userId, limit]
    );

    return res.status(200).json({
      success: true,
      data: rows.map(measurementToDto),
    });
  } catch (error) {
    console.error('Measurement history fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch measurement history',
    });
  }
}

export async function getMeasurementTrends(
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
    from.setDate(from.getDate() - 90);
  }

  try {
    const [rows] = await db.query<MeasurementRow[]>(
      `SELECT *
       FROM measurements
       WHERE user_id = ?
         AND measurement_date BETWEEN ? AND ?
       ORDER BY measurement_date ASC`,
      [userId, from, to]
    );

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          points: [],
          deltas: {},
        },
      });
    }

    const first = rows[0];
    const latest = rows[rows.length - 1];
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;

    const deltas: Record<string, { fromStart: number | null; fromPrevious: number | null }> =
      {};
    for (const field of NUMERIC_FIELDS) {
      const firstValue = first[field] as number | null | undefined;
      const latestValue = latest[field] as number | null | undefined;
      const previousValue = previous ? (previous[field] as number | null | undefined) : null;

      deltas[field] = {
        fromStart:
          firstValue === null || firstValue === undefined || latestValue === null || latestValue === undefined
            ? null
            : latestValue - firstValue,
        fromPrevious:
          previousValue === null || previousValue === undefined || latestValue === null || latestValue === undefined
            ? null
            : latestValue - previousValue,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        from,
        to,
        points: rows.map(measurementToDto),
        deltas,
      },
    });
  } catch (error) {
    console.error('Measurement trend fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch measurement trends',
    });
  }
}

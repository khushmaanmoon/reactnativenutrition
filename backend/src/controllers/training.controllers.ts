import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AuthRequest } from '../auth/auth.middleware';
import { db } from '../utils/db';

type AssignmentRow = RowDataPacket & {
  id: number;
  program_id: number;
  is_active?: number;
  start_date: Date;
  end_date: Date;
};

type ProgramRow = RowDataPacket & {
  id: number;
  name: string;
  duration_weeks: number;
};

type ProgramExerciseRow = RowDataPacket & {
  week_no: number;
  day_no: number;
  sort_order: number;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  notes: string | null;
  exercise_id: number;
  exercise_name: string;
};

type SessionLogEntry = {
  exerciseId: number;
  sets: number;
  reps: number;
  weights: number;
};

type SessionHistoryRow = RowDataPacket & {
  session_id: number;
  session_date: Date;
  total_volume: number | null;
  exercises_logged: number;
};

type WeeklyVolumeRow = RowDataPacket & {
  year_week: number;
  week_start: Date;
  week_end: Date;
  total_volume: number | null;
  sessions_count: number;
};

type PrRawRow = RowDataPacket & {
  exercise_id: number;
  exercise_name: string;
  weights: number;
  reps: number | null;
  sets: number | null;
  volume: number | null;
  session_date: Date;
};

function getCurrentWeek(startDate: Date): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceStart = Math.floor((today.getTime() - start.getTime()) / msPerDay);
  const computedWeek = Math.floor(daysSinceStart / 7) + 1;

  return Math.max(1, Math.min(6, computedWeek));
}

export async function logTrainingSession(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  const userId = Number(req.user?.userId);
  const { sessionDate, entries } = req.body as {
    sessionDate?: string;
    entries?: SessionLogEntry[];
  };

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'entries are required',
    });
  }

  const normalizedEntries = entries.map((entry) => ({
    exerciseId: Number(entry.exerciseId),
    sets: Number(entry.sets),
    reps: Number(entry.reps),
    weights: Number(entry.weights),
  }));

  const hasInvalidEntry = normalizedEntries.some(
    (entry) =>
      !entry.exerciseId ||
      entry.sets <= 0 ||
      entry.reps <= 0 ||
      entry.weights < 0
  );

  if (hasInvalidEntry) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session entry values',
    });
  }

  const dateToUse = sessionDate ? new Date(sessionDate) : new Date();
  if (Number.isNaN(dateToUse.getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Invalid sessionDate',
    });
  }
  dateToUse.setHours(0, 0, 0, 0);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [sessionInsert] = await connection.query<ResultSetHeader>(
      `INSERT INTO sessions (user_id, session_date)
       VALUES (?, ?)`,
      [userId, dateToUse]
    );

    const sessionId = sessionInsert.insertId;
    let totalVolume = 0;

    for (const entry of normalizedEntries) {
      const volume = entry.sets * entry.reps * entry.weights;
      totalVolume += volume;

      await connection.query<ResultSetHeader>(
        `INSERT INTO workouts
           (session_id, sets, reps, weights, volume, exercise_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sessionId, entry.sets, entry.reps, entry.weights, volume, entry.exerciseId]
      );
    }

    await connection.commit();
    return res.status(201).json({
      success: true,
      data: {
        sessionId,
        userId,
        sessionDate: dateToUse,
        exercisesLogged: normalizedEntries.length,
        totalVolume,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Session log error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to log training session',
    });
  } finally {
    connection.release();
  }
}

export async function trainingProgram(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const userId = Number(req.user?.userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const [assignments] = await db.query<AssignmentRow[]>(
      `SELECT id, program_id, start_date, end_date
       FROM user_program_assignments
       WHERE user_id = ?
         AND is_active = 1
         AND CURDATE() BETWEEN start_date AND end_date
       ORDER BY start_date DESC
       LIMIT 1`,
      [userId]
    );

    if (assignments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active program assignment found',
      });
    }

    const assignment = assignments[0];
    const currentWeek = getCurrentWeek(assignment.start_date);

    const [programRows] = await db.query<ProgramRow[]>(
      `SELECT id, name, duration_weeks
       FROM programs
       WHERE id = ?
       LIMIT 1`,
      [assignment.program_id]
    );

    if (programRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assigned program not found',
      });
    }

    const [exerciseRows] = await db.query<ProgramExerciseRow[]>(
      `SELECT
         pe.week_no,
         pe.day_no,
         pe.sort_order,
         pe.sets,
         pe.reps,
         pe.rest_seconds,
         pe.notes,
         e.id AS exercise_id,
         e.name AS exercise_name
       FROM program_exercises pe
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.program_id = ?
         AND pe.week_no = ?
       ORDER BY pe.day_no ASC, pe.sort_order ASC`,
      [assignment.program_id, currentWeek]
    );

    return res.status(200).json({
      success: true,
      data: {
        assignmentId: assignment.id,
        userId,
        program: programRows[0],
        startDate: assignment.start_date,
        endDate: assignment.end_date,
        currentWeek,
        exercises: exerciseRows,
      },
    });
  } catch (error) {
    console.error('Training program fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch training program',
    });
  }
}


export async function assignProgram(req : AuthRequest, res : Response){
    const userId = Number(req.user?.userId);
    const { programId } = req.body as { programId?: number };

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const normalizedProgramId = Number(programId);
    if (!normalizedProgramId) {
      return res.status(400).json({
        success: false,
        message: 'programId is required',
      });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [programRows] = await connection.query<ProgramRow[]>(
        `SELECT id, name, duration_weeks
         FROM programs
         WHERE id = ?
         LIMIT 1`,
        [normalizedProgramId]
      );

      if (programRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Program not found',
        });
      }

      await connection.query<ResultSetHeader>(
        `UPDATE user_program_assignments
         SET is_active = 0
         WHERE user_id = ? AND is_active = 1`,
        [userId]
      );

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const durationWeeks = programRows[0].duration_weeks || 6;

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationWeeks * 7);

      const [insertResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO user_program_assignments
           (user_id, program_id, start_date, end_date, is_active, assigned_by)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [userId, normalizedProgramId, startDate, endDate, userId]
      );

      await connection.commit();
      return res.status(201).json({
        success: true,
        data: {
          assignmentId: insertResult.insertId,
          userId,
          programId: normalizedProgramId,
          startDate,
          endDate,
          durationWeeks,
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error('Program assignment error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to assign program',
      });
    } finally {
      connection.release();
    }
}

function parseDateParam(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getTrainingHistory(
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
  const fromDate = parseDateParam(rawFrom as string | undefined);
  const toDate = parseDateParam(rawTo as string | undefined);

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
    const [sessionRows] = await db.query<SessionHistoryRow[]>(
      `SELECT
         s.id AS session_id,
         s.session_date,
         SUM(w.volume) AS total_volume,
         COUNT(w.id) AS exercises_logged
       FROM sessions s
       LEFT JOIN workouts w ON w.session_id = s.id
       WHERE s.user_id = ?
         AND s.session_date BETWEEN ? AND ?
       GROUP BY s.id, s.session_date
       ORDER BY s.session_date DESC`,
      [userId, from, to]
    );

    const [weeklyRows] = await db.query<WeeklyVolumeRow[]>(
      `SELECT
         YEARWEEK(s.session_date, 1) AS year_week,
         MIN(s.session_date) AS week_start,
         MAX(s.session_date) AS week_end,
         SUM(w.volume) AS total_volume,
         COUNT(DISTINCT s.id) AS sessions_count
       FROM sessions s
       JOIN workouts w ON w.session_id = s.id
       WHERE s.user_id = ?
         AND s.session_date BETWEEN ? AND ?
       GROUP BY YEARWEEK(s.session_date, 1)
       ORDER BY year_week DESC`,
      [userId, from, to]
    );

    return res.status(200).json({
      success: true,
      data: {
        from,
        to,
        sessions: sessionRows.map((row) => ({
          sessionId: row.session_id,
          sessionDate: row.session_date,
          totalVolume: Number(row.total_volume || 0),
          exercisesLogged: row.exercises_logged,
        })),
        weekly: weeklyRows.map((row) => ({
          yearWeek: row.year_week,
          weekStart: row.week_start,
          weekEnd: row.week_end,
          totalVolume: Number(row.total_volume || 0),
          sessionsCount: row.sessions_count,
        })),
      },
    });
  } catch (error) {
    console.error('Training history fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch training history',
    });
  }
}

export async function getTrainingPrs(
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
    const [rows] = await db.query<PrRawRow[]>(
      `SELECT
         w.exercise_id,
         e.name AS exercise_name,
         w.weights,
         w.reps,
         w.sets,
         w.volume,
         s.session_date
       FROM workouts w
       JOIN sessions s ON s.id = w.session_id
       JOIN exercises e ON e.id = w.exercise_id
       WHERE s.user_id = ?
       ORDER BY w.exercise_id ASC, w.weights DESC, s.session_date DESC`,
      [userId]
    );

    const grouped = new Map<number, PrRawRow[]>();
    for (const row of rows) {
      if (!grouped.has(row.exercise_id)) {
        grouped.set(row.exercise_id, []);
      }
      grouped.get(row.exercise_id)?.push(row);
    }

    const prs = Array.from(grouped.values()).map((exerciseRows) => {
      const top = exerciseRows[0];
      const previous =
        exerciseRows.find((row) => row.weights < top.weights) || null;

      return {
        exerciseId: top.exercise_id,
        exerciseName: top.exercise_name,
        prWeight: top.weights,
        prDate: top.session_date,
        prReps: top.reps,
        prSets: top.sets,
        prVolume: top.volume,
        previousPrWeight: previous?.weights ?? null,
        deltaWeight:
          previous && previous.weights !== null
            ? top.weights - previous.weights
            : null,
      };
    });

    prs.sort((a, b) => b.prWeight - a.prWeight);

    return res.status(200).json({
      success: true,
      data: {
        prs,
      },
    });
  } catch (error) {
    console.error('PR fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch PR data',
    });
  }
}

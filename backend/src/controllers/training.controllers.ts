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

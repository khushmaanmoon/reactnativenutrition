import {Router, Request, Response} from 'express';
import {db} from '../utils/db'

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT name FROM users');
    console.log(rows);

    return res.status(200).json({
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('DB ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Database error',
    });
  }
});

export default router

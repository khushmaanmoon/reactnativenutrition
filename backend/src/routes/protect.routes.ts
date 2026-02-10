import {Router} from 'express';
import verifyToken from '../auth/auth.middleware';
import { protectedTest } from '../controllers/protect.controllers';

const router = Router();


router.get(
  '/protected',
  verifyToken,
  protectedTest
);


export default router;
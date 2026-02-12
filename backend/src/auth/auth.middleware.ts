import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.config';


export interface AuthRequest extends Request {
  user?: any;
}

export default function verifyToken(
  req: AuthRequest, 
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: 'Authorization header missing',
    });
  }

  // Expecting: "Bearer <token>"
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      message: 'Token missing',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // attach payload for controllers
    
    next(); // ✅ move to next middleware/controller
  } catch (err) {
    return res.status(401).json({
      message: 'Invalid or expired token',
    });
  }
}

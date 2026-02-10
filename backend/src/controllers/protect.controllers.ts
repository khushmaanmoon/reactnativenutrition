import { AuthRequest } from "../auth/auth.middleware";
import { Request, Response } from "express";




export function protectedTest(req: AuthRequest, res: Response) {
  return res.json({
    success: true,
    message: 'Protected route accessed',
    user: req.user,
  });
}

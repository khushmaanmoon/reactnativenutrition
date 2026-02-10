import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../utils/db';
import { RegisterPayload, User } from './auth.types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

export async function tokenProvider(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { name, email } = req.body as RegisterPayload;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required',
      });
    }

    /** 1️⃣ Check if user already exists */
    const [existing] = await db.query<any[]>(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User already exists',
      });
    }

    /** 2️⃣ Insert user */
    const [result] = await db.query<any>(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [name, email]
    );

    const userId = result.insertId;

    /** 3️⃣ Sign JWT using DB userId */
    const token = jwt.sign(
      {
        userId,
        email,
      },
      JWT_SECRET,
      {
        expiresIn: '7d',
      }
    );

    const user: User = {
      id: userId.toString(),
      name,
      email,
    };

    return res.status(201).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
}

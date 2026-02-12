import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../utils/db';
import { JWT_SECRET } from './auth.config';
import { LoginPayload, RegisterPayload, User } from './auth.types';

type DbUserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  password: string;
};

function signAuthToken(userId: number, email: string): string {
  return jwt.sign(
    {
      userId,
      email,
    },
    JWT_SECRET,
    {
      expiresIn: '7d',
    }
  );
}

export async function tokenProvider(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { name, email, password } = req.body as RegisterPayload;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    /** 1️⃣ Check if user already exists */
    const [existing] = await db.query<DbUserRow[]>(
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
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, passwordHash]
    );

    const userId = result.insertId;

    /** 3️⃣ Sign JWT using DB userId */
    const token = signAuthToken(userId, email);

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

export async function loginProvider(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { email, password } = req.body as Partial<LoginPayload>;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const [rows] = await db.query<DbUserRow[]>(
      'SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const userRow = rows[0];
    const isPasswordValid = await bcrypt.compare(password, userRow.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = signAuthToken(userRow.id, userRow.email);
    const user: User = {
      id: userRow.id.toString(),
      name: userRow.name,
      email: userRow.email,
    };

    return res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
}

import mysql from 'mysql2/promise';
import { ENV } from '../config/env';

const ca = ENV.DB_CA ? ENV.DB_CA.replace(/\\n/g, '\n') : undefined;

export const db = mysql.createPool({
  host: ENV.DB_HOST,
  user: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  database: ENV.DB_NAME,
  port: ENV.DB_PORT,
  ssl: ca
    ? {
        ca,
        rejectUnauthorized: true,
      }
    : undefined,
});

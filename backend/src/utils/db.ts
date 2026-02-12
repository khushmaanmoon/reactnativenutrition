import mysql from 'mysql2/promise';
import { ENV } from '../config/env';

const ca = ENV.DB_CA ? ENV.DB_CA.replace(/\\n/g, '\n') : undefined;
const useSsl = ENV.DB_SSL;

export const db = mysql.createPool({
  host: ENV.DB_HOST,
  user: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  database: ENV.DB_NAME,
  port: ENV.DB_PORT,
  ssl: useSsl
    ? {
        ...(ca ? { ca } : {}),
        rejectUnauthorized: ENV.DB_SSL_REJECT_UNAUTHORIZED,
      }
    : undefined,
});

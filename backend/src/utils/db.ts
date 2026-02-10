import mysql from 'mysql2/promise';
import fs from 'fs';

const caPath = process.env.DB_CA?.trim();

const ssl = caPath
  ? { ca: fs.readFileSync(caPath) }
  : undefined;

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  ssl,
});

import mysql from 'mysql2/promise';
import fs from 'fs';

const ssl =
  process.env.DB_CA
    ? { ca: fs.readFileSync(process.env.DB_CA) }
    : undefined;

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  ssl,
});

import mysql from 'mysql2/promise';
import fs from 'fs';

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    ca: fs.readFileSync(process.env.DB_CA as string),
  },

  waitForConnections: true,
  connectionLimit: 10,
});

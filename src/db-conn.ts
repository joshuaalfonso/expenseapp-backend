import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()
// Create a MySQL connection pool

const dbPortStr = process.env.DB_PORT?.trim() || '3306';
const dbPort = parseInt(dbPortStr, 10);

if (isNaN(dbPort)) {
  throw new Error(`Invalid DB_PORT value: "${process.env.DB_PORT}"`);
}

export const conn = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
})


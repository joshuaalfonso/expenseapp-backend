
import { Hono } from "hono";
import { conn } from "../db-conn.js";
import { verifyGoogleToken } from "../utils/verifyGoogleToken.js";
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config();
export const authGoogle = new Hono();


authGoogle.post('/', async (c) => {    

    const { idToken } = await c.req.json();

    const userInfo = await verifyGoogleToken(idToken);

    if (!userInfo) {
        return c.json({ error: 'Invalid Google token' }, 401)
    }

    const { email, name, picture, sub: google_Id } = userInfo;

    const [rows] = await conn.execute(
      `SELECT * FROM users WHERE email = ?`,
      [userInfo.email]
    );

    let user = (rows as any[])[0];

    if (!user) {
        // Insert user if not exists
        const [result]: any = await conn.execute(
            `INSERT INTO users (email, name, picture, google_id) VALUES (?, ?, ?, ?)`,
            [email, name, picture, google_Id]
        )

        // You may want to fetch the inserted user again
        const [newRows]: any = await conn.execute(
            `SELECT * FROM users WHERE id = ?`,
            [result.insertId]
        )
        user = newRows[0]
    }

     // Create JWT
    const token = jwt.sign(
        {
            userId: user.id,
            email: user.email,
        },
            process.env.JWT_SECRET!,
            { expiresIn: '7d' }
    )

    
    return c.json({ 
        message: 'Authenticated', 
        user: userInfo,
        token 
    })

})

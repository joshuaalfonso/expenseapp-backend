import { Hono } from "hono";
import { decodeJwt, SignJWT } from "jose";
import { conn } from "../db-conn.js";


export const authGoogle = new Hono();

authGoogle.post('/', async (c) => {

    const body = await c.req.json();
    const code = body.code;

    if (!code) return c.json({ error: 'Missing code' }, 400);

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code',
        }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
        return c.json({ error: 'Token exchange failed', details: tokenData }, 500);
    }

    const { id_token } = tokenData;

    // Decode Google ID token to get user info
    const user = decodeJwt(id_token);

    const { email, name, picture, sub: google_Id } = user;

    // check if the user exist in db
    const [rows] = await conn.execute(
        `SELECT * FROM users WHERE email = ?`,
        [email]
    );
    
    let existingUsers = (rows as any[])[0];
    let user_id = null;

    if (!existingUsers) {
        
        // Insert user if not exists
        const [result]: any = await conn.execute(
            `INSERT INTO users (email, name, picture, google_id) VALUES (?, ?, ?, ?)`,
            [email, name, picture, google_Id]
        )

        const insertId = result.insertId;

        // Insert initial total for user
        await conn.execute(
            `INSERT INTO user_totals (user_id, total_expense) VALUES (?, ?)`,
            [insertId, 0]
        );

        // You may want to fetch the inserted user again
        const [newRows]: any = await conn.execute(
            `SELECT * FROM users WHERE id = ?`,
            [insertId]
        )
        const newUser = newRows[0];
        user_id = newUser.id;
    } 
    
    else {
        user_id = existingUsers.id;
    }

    const tokenPayload = {
        user_id,
        sub: user.sub,
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 7200, // Math.floor(Date.now() / 1000) + 10
    };

     // Create custom JWT
    const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const customToken = await new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(tokenPayload.exp)
    .sign(jwtSecret);

    return c.json({ jwt: customToken, user: {...user, exp: tokenPayload.exp, user_id} });

})
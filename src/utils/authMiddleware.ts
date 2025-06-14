// import type { MiddlewareHandler } from 'hono';
// import jwt from 'jsonwebtoken';

// export const authMiddleware: MiddlewareHandler = async (c, next) => {
//   const authHeader = c.req.header('Authorization');

//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     return c.json({ error: 'Unauthorized' }, 401);
//   }

//   const token = authHeader.split(' ')[1];

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET!);
//     c.set('user', decoded); // Set user info to context for use in routes
//     await next();
//   } catch (err) {
//     return c.json({ error: 'Invalid or expired token' }, 401);
//   }
// };

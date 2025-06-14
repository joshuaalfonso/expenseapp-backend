import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import categories from './routes/categories.js';
import { cors } from 'hono/cors';
import { expenses } from './routes/expenses.js';
import { authGoogle } from './routes/authGoogle.js';
import { dashboard } from './routes/dashboard.js';

const app = new Hono();

app.use('*', cors());

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('/categories', categories);

app.route('/auth/google', authGoogle);

app.route('expenses', expenses);

app.route('dashboard', dashboard);

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

import { Hono } from "hono";
import { conn } from "../db-conn.js";
import { authMiddleware } from "../middleware/auth.js";
import { type ResultSetHeader } from 'mysql2';

export const expenses = new Hono();

expenses.use('*', authMiddleware);

expenses.get('/', async (c) => {

    const {user_id} = c.get('jwtPayload');

    const [rows] = await conn.execute(
        `
          SELECT 
              e.id,
              e.date,
              c.id AS category_id,
              c.category_name,
              c.category_icon,
              e.amount,
              e.description,
              u.id AS user_id,
              u.name,
              u.email,
              u.picture
          FROM 
              expenses AS e
          LEFT JOIN
              categories AS c
              ON e.category_id = c.id
          LEFT JOIN
              users AS u
              ON e.user_id = u.id
            WHERE e.user_id = ?
        `,
        [user_id]
    );
    return c.json(rows);
})


expenses.get('/page/:page', async (c) => {

  const page = parseInt(c.req.param('page') || '1');

  const {user_id} = c.get('jwtPayload');

  const limit = 4;
  const offset = (page - 1) * limit;

  const [rows] = await conn.execute(
    `
      SELECT 
        e.id,
        e.date,
        c.id AS category_id,
        c.category_name,
        c.category_icon,
        e.amount,
        e.description,
        u.id AS user_id,
        u.name,
        u.email,
        u.picture
      FROM 
        expenses AS e
      LEFT JOIN
        categories AS c
        ON e.category_id = c.id
      LEFT JOIN
        users AS u
        ON e.user_id = u.id
      WHERE 
        e.user_id = ? 
        ORDER BY date 
        DESC LIMIT ? OFFSET ?
    `,
    [user_id, String(limit), String(offset)]
  );

  const [totalResponse] = await conn.execute(
    `SELECT COUNT(*) as total FROM expenses WHERE user_id = ?`,
    [user_id]
  );

  const total = (totalResponse as any[])[0].total;
  // console.log(total)

  return c.json({
    data: rows,                
    currentPage: page,         
    perPage: limit, 
    total,
    totalPages: Math.ceil(total / limit)
  });

})


expenses.post('/', async (c) => {

  const body = await c.req.json();

  const {user_id} = c.get('jwtPayload');

  const { id, date, category_id, amount, description } = body;

  const year = new Date(date).getFullYear();
  const month = new Date(date).getMonth() + 1;

  const transaction_conn = await conn.getConnection();

  try {

    await transaction_conn.beginTransaction();

    const [result] = await transaction_conn.execute(
      `INSERT INTO expenses (id, date, category_id, amount, description, user_id)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [id, date, category_id, amount, description, user_id]
    );

    await transaction_conn.execute(
      `UPDATE user_totals SET total_expense = total_expense + ? WHERE user_id = ?`,
      [amount, user_id]
    )

    await transaction_conn.execute(`
      INSERT INTO monthly_totals (user_id, year, month, total)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE total = total + VALUES(total)
    `, [user_id, year, month, amount]);

    await transaction_conn.commit();
    return c.json({ success: true, result });
  } 

  catch (error) {
    await transaction_conn.rollback();
    console.error(error);
    return c.json({ success: false, error: 'Failed to insert expense.' }, 500);
  }

  finally {
    transaction_conn.release();
  }

})


expenses.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const {user_id} = c.get('jwtPayload');

  const { 
    date: newDate, 
    category_id: newCategoryId, 
    amount: newAmount,  
    description: newDescription 
  } = body;

  const transaction_conn = await conn.getConnection();

  try {
    await transaction_conn.beginTransaction();

    // 1. Get the original expense
    const [rows] = await transaction_conn.execute(
      `SELECT amount, date FROM expenses WHERE id = ? AND user_id = ?`,
      [id, user_id]
    );

    if ((rows as any[]).length === 0) {
      return c.json({ success: false, message: 'Expense not found' }, 404);
    }

    const { 
      amount: oldAmount, 
      date: OldDate  
    } = (rows as any[])[0];

    const oldYear = new Date(OldDate).getFullYear();
    const oldMonth = new Date(OldDate).getMonth() + 1;

    const newYear = new Date(newDate).getFullYear();
    const newMonth = new Date(newDate).getMonth() + 1;

    // Subtract from old month
    await transaction_conn.execute(
      `UPDATE monthly_totals SET total = total - ? WHERE user_id = ? AND year = ? AND month = ?`,
      [oldAmount, user_id, oldYear, oldMonth]
    );

    await transaction_conn.execute(`
      DELETE FROM monthly_totals
      WHERE user_id = ? AND year = ? AND month = ? AND total <= 0
    `, [user_id, oldYear, oldMonth]);

    // Add to new month (INSERT ON DUPLICATE KEY UPDATE)
    await transaction_conn.execute(
      `
        INSERT INTO monthly_totals (user_id, year, month, total)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE total = total + VALUES(total)
      `,
      [user_id, newYear, newMonth, newAmount]
    );

    const [result] = await transaction_conn.execute(
      `UPDATE expenses
       SET date = ?, category_id = ?, amount = ?, description = ?
       WHERE id = ?`,
      [newDate, newCategoryId, newAmount, newDescription, id]
    );

    if ((result as any[]).length === 0) {
      return c.json({ success: false, error: 'Expense not found.' }, 404);
    }

    await transaction_conn.execute(
      `UPDATE user_totals SET total_expense = total_expense - ? + ? WHERE user_id = ?`,
      [oldAmount, newAmount, user_id]
    )

    await transaction_conn.commit();
    return c.json({ success: true, result, message: 'Successfully updated!' });
  } 
  
  catch (error) {
    await transaction_conn.rollback();
    console.error('Update error:', error);
    return c.json({ success: false, error: 'Failed to update expense.' }, 500);
  }

  finally {
    transaction_conn.release();
  }
  
});


expenses.delete('/:expense_id/:amount', async (c) => {

  const id = c.req.param('expense_id');
  const amount = c.req.param('amount');

  const {user_id} = c.get('jwtPayload');

  const transaction_conn = await conn.getConnection();

  try {
    await transaction_conn.beginTransaction();

    // Step 1: Get the expense info
    const [rows] = await transaction_conn.execute(
      `SELECT amount, date FROM expenses WHERE id = ? AND user_id = ?`,
      [id, user_id]
    );

    if ((rows as any[]).length === 0) {
      return c.json({ success: false, message: 'Expense not found' }, 404);
    }

    const { date } = (rows as any[])[0];
    const year = new Date(date).getFullYear();
    const month = new Date(date).getMonth() + 1;

    //  Update monthly summary
    await transaction_conn.execute(
      `
        UPDATE monthly_totals
        SET total = total - ?
        WHERE user_id = ? AND year = ? AND month = ?
      `,
      [amount, user_id, year, month]
    );

    await transaction_conn.execute(`
      DELETE FROM monthly_totals
      WHERE user_id = ? AND year = ? AND month = ? AND total <= 0
    `, [user_id, year, month]);

    const [result] = await transaction_conn.execute<ResultSetHeader>(
      `
        DELETE FROM 
          expenses
        WHERE 
          id = ?
      `,
      [id]
    )

    if (result.affectedRows === 0) {
      return c.json({ success: false, message: 'No expense found with that ID.' }, 404);
    }

    await transaction_conn.execute(
      `UPDATE user_totals SET total_expense = total_expense - ? WHERE user_id = ?`,
      [amount, user_id]
    )

    await transaction_conn.commit();

    return c.json({ success: true, result, message: 'Successfully deleted!' });
  }

  catch(error) {
    await transaction_conn.rollback();
    console.error('Delete error: ' + error);
    return c.json({ success: false, message: 'Failed to delete expense.' }, 500);
  }
  
  finally {
    transaction_conn.release();
  }

})
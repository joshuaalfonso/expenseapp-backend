import { Hono } from "hono";
import { conn } from "../db-conn.js";
import { jwt } from "hono/jwt";
import { authMiddleware } from "../middleware/auth.js";
import { type ResultSetHeader } from 'mysql2';

const categories = new Hono();

categories.use('*', authMiddleware);

categories.get('/',  async(c) => {

    const {user_id} = c.get('jwtPayload');
  
    const [rows] = await conn.execute(
      `SELECT * from categories WHERE user_id = ? AND is_del = ?`,
      [user_id, 0] 
    );
    return c.json(rows);
})

categories.post('/', async (c) => {
  const body = await c.req.json();

  const { id, category_name, category_icon, date_created } = body;

  const {user_id} = c.get('jwtPayload');

  try {
    const [result] = await conn.execute(
      `INSERT INTO categories (id, user_id, category_name, category_icon, date_created)
       VALUES (?, ?, ?, ?, ?)`,
      [id, user_id, category_name, category_icon, date_created]
    );

    return c.json({ success: true, result });
  } 
  
  catch (error) {
    console.error(error);
    return c.json({ success: false, error: 'Failed to insert category.' }, 500);
  }

});

categories.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const { category_name, category_icon, date_created } = body;

  try {
    const [result] = await conn.execute(
      `UPDATE 
        categories
       SET 
        category_name = ?, category_icon = ?, date_created = ?
       WHERE 
        id = ?`,
      [category_name, category_icon, date_created, id]
    );

    if ((result as any[]).length === 0) {
      return c.json({ success: false, error: 'Category not found.' }, 404);
    }

    return c.json({ success: true, result });
  } 
  
  catch (error) {
    console.error('Update error:', error);
    return c.json({ success: false, error: 'Failed to update category.' }, 500);
  }
  
});


categories.delete('/:categories_id', async (c) => {
    const id = c.req.param('categories_id');

    try {

      const [result] = await conn.execute<ResultSetHeader>(
          `
            UPDATE 
              categories 
            SET 
              is_del = ? 
            WHERE 
              id = ?`, 
          [1, id]
      )

      if (result.affectedRows === 0) {
        return c.json({ success: false, message: 'No expense found with that ID.' }, 404);
      }

      return c.json({ success: true, result });
    }

    catch {
        return c.json({ success: false, message: 'Failed to delete category.' }, 500);
    }

})

export default categories;
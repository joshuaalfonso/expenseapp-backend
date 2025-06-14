import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { conn } from "../db-conn.js";

export const dashboard = new Hono();

dashboard.use('*', authMiddleware);

dashboard.get('/summary', async (c) => {

    const {user_id} = c.get('jwtPayload');
    const yearNow = new Date().getFullYear();

    const [totalRows] = await conn.execute(
        `
            SELECT 
                total_expense
            FROM 
                user_totals
            WHERE 
                user_id = ?
        `,
        [user_id]
    )


    const [monthRows] = await conn.execute(
        `
            SELECT 
                SUM(amount) AS month_expense
            FROM 
                expenses
            WHERE 
                amount > 0 AND MONTH(date) = MONTH(CURRENT_DATE())
                AND YEAR(date) = YEAR(CURRENT_DATE())
                AND user_id = ?
        `,
        [user_id]
    )

    const [categoryRows] = await conn.execute(
        `
            SELECT 
                category_id, categories.category_name, COUNT(*) AS count
            FROM 
                expenses
            LEFT JOIN
                categories
            ON
                expenses.category_id = categories.id
            WHERE 
                expenses.user_id = ?
            GROUP BY 
                category_id
            ORDER 
                BY count DESC
            LIMIT 5
        `,
        [user_id]
    )

    const [monthsExpense] = await conn.execute(
        `
            SELECT
                m.month_number,
                m.month_name,
                IFNULL(u.total, 0) AS total
            FROM (
                SELECT 1 AS month_number, 'January' AS month_name UNION
                SELECT 2, 'February' UNION
                SELECT 3, 'March' UNION
                SELECT 4, 'April' UNION
                SELECT 5, 'May' UNION
                SELECT 6, 'June' UNION
                SELECT 7, 'July' UNION
                SELECT 8, 'August' UNION
                SELECT 9, 'September' UNION
                SELECT 10, 'October' UNION
                SELECT 11, 'November' UNION
                SELECT 12, 'December'
            ) AS m
            LEFT JOIN 
                monthly_totals u
            ON 
                u.month = m.month_number AND u.user_id = ? AND u.year = ?
            ORDER BY 
                m.month_number;
        `,
        [user_id, yearNow]
    )
    
    const [averagePerMonth] = await conn.execute(
        `
            SELECT 
                AVG(total) AS average_monthly
            FROM 
                monthly_totals
            WHERE 
                user_id = ? AND year = ?;
        `,
        [user_id, yearNow]
    )


    return c.json({
        totalExpense: (totalRows as any[])[0]?.total_expense ?? 0,
        monthExpense: (monthRows as any[])[0]?.month_expense ?? 0,
        topCategories: categoryRows,
        monthsExpense: monthsExpense,
        averagePerMonth: (averagePerMonth as any[])[0].average_monthly ?? 0
    })

})


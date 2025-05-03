const jwt = require('jsonwebtoken');
const pool = require('../config/db');  // Assuming your pool configuration is in db.js
const fs = require('fs');
const { format } = require('fast-csv');
const path = require('path');
const PDFDocument = require('pdfkit');

exports.getUser = async (req, res) => {
    try {
        const user = await pool.query("SELECT user_name, user_email,user_notification FROM user_table WHERE user_id = $1", [req.user]);

        if (user.rows.length === 0) {
            return res.status(404).json({
                status: false,
                message: "User not found."
            });
        }

        return res.status(200).json({
            status: true,
            message: "User details retrieved successfully.",
            user: {
                name: user.rows[0].user_name,
                email: user.rows[0].user_email,
                isNotified: user.rows[0].user_notification
            }
        });

    } catch (error) {
        console.error("Error in getUser:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.getGroups = async (req, res) => {
    try {

        const groups = await pool.query(
            `SELECT  g.group_name, g.group_id 
                 FROM groups g
                 INNER JOIN group_members gm ON g.group_id = gm.group_id
                 WHERE gm.user_id = $1 
                 and g.group_is_active = true
                 and gm.user_is_active = true`,
            [req.user]
        );

        if (groups.rows.length === 0) {
            return res.status(200).json({
                status: true,
                message: "User is not a member of any group.",
                groups: []
            });
        }

        return res.status(200).json({
            status: true,
            message: "Groups retrieved successfully.",
            groups: groups.rows
        });

    } catch (error) {
        console.error("Error in getGroups:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.updateUser = async (req, res) => {

    try {
        const { name, notification } = req.body;
        const result = await pool.query(
            `UPDATE user_table set user_name = $1 , user_notification = $2 where user_id = $3 `,
            [name, notification, req.user]
        );
        if (result.rowCount === 0) {
            return res.status(401).json({
                status: false,
                message: "User Not Found or No Changes Were made."
            })
        }
        return res.status(200).json({
            status: true,
            message: "Profile Updated Successfully"
        })
    } catch (error) {
        console.error("Error in getGroups:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }

}

exports.getUserPersonalExpense = async (req, res) => {
    try {

        const result = await pool.query(`
                SELECT 
                    COALESCE(SUM(expenses_amount), 0) AS personal_expense
                FROM expenses 
                WHERE user_id = $1 AND expenses_group_id IS NULL;
            `, [req.user]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                status: false,
                message: "No expenses found for the user."
            });
        }

        return res.status(200).json({
            status: true,
            message: "Total expense retrieved successfully.",
            total_expense: result.rows[0].personal_expense,
        });

    } catch (error) {
        console.error("Error in getUserTotalExpense:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.getUserGroupTotalExpense = async (req, res) => {
    try {

        const { rows } = await pool.query(
            `
                SELECT 
                    g.group_id, 
                    g.group_name, 
                    COALESCE(SUM(es.split_value), 0) AS amount,
                    (SELECT COALESCE(SUM(es2.split_value), 0) 
                     FROM expense_splits es2
                     WHERE es2.user_id = $1) AS total_amount
                FROM groups g
                LEFT JOIN expenses e ON g.group_id = e.expenses_group_id
                LEFT JOIN expense_splits es ON e.expenses_id = es.expense_id 
                    AND es.user_id = $1
                GROUP BY g.group_id, g.group_name
                ORDER BY g.group_id ASC;
                `,
            [req.user]
        );

        const totalExpense = rows.length > 0 ? rows[0].total_amount : 0;

        const formattedData = rows.map(row => ({
            group_id: row.group_id,
            group_name: row.group_name,
            amount: row.amount
        }));

        return res.status(200).json({
            status: true,
            message: "User group expenses retrieved successfully.",
            data: formattedData,
            total_expense: totalExpense
        });

    } catch (error) {
        console.error("Error in getUserGroupTotalExpense:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.getUserExpenseCategoryWise = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `
                SELECT 
                    expenses_category AS category, 
                    COALESCE(SUM(expenses_amount), 0) AS amount 
                FROM expenses  
                WHERE user_id = $1 
                AND expenses_group_id IS NULL 
                GROUP BY expenses_category;
                `,
            [req.user]
        );

        const formattedData = rows.map(row => ({
            category: row.category,
            amount: row.amount
        }));

        return res.status(200).json({
            status: true,
            message: "User expenses retrieved successfully.",
            data: formattedData
        });

    } catch (error) {
        console.error("Error in getUserExpenseCategoryWise:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.getUserExpenseHistory = async (req, res) => {
    try {
        const { rows } = await pool.query(` SELECT 
                expenses_id AS id, 
                expenses_category AS category, 
                expenses_amount AS amount, 
                expenses_text AS description, 
                TO_CHAR(expenses_date, 'YYYY-MM-DD') AS date
            FROM expenses 
            WHERE user_id = $1 AND expenses_group_id IS NULL;
            `, [req.user]);
        const formattedData = rows.map(row => ({
            id: row.id,
            category: row.category,
            amount: row.amount,
            description: row.description,
            date: row.date
        }));

        return res.status(200).json({
            status: true,
            message: "User Personal Transaction Taken Successfully",
            data: formattedData
        })

    } catch (error) {
        console.error("Error in getUserExpenseCategoryWise:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.addPersonalExpense = async (req, res) => {
    try {
        const { amount, category, text, date } = req.body.data;

        const result = await pool.query(`insert into expenses (expenses_amount,expenses_category,expenses_text,expenses_date,user_id) values ($1,$2,$3,$4,$5);`, [amount, category, text, date, req.user]);
        if (result.rowCount == 0) {
            return res.status(400).json({
                status: false,
                message: "Something Went Wrong"
            })
        }
        return res.status(200).json({
            status: true,
            message: "Expense added Successfully"
        })


    } catch (error) {
        console.error("Error in getUserExpenseCategoryWise:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.deletePersonalExpense = async (req, res) => {
    try {

        const { id } = req.body;
        const result = await pool.query(`delete from expenses where expenses_id = $1 and user_id = $2`, [id, req.user]);
        if (result.rowCount == 0) {
            return res.status(400).json({
                status: false,
                message: "Something Went Wrong"
            })
        }
        return res.status(200).json({
            status: true,
            message: "Expense deleted Successfully"
        })


    } catch (error) {
        console.error("Error in getUserExpenseCategoryWise:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.updatePersonalExpense = async (req, res) => {
    try {
        const { amount, category, description, date, id } = req.body.data;

        const result = await pool.query(`update expenses set expenses_amount=$1,expenses_category=$2,expenses_text=$3,expenses_date=$4 where user_id=$5 and expenses_id=$6`, [amount, category, description, date, req.user, id]);
        if (result.rowCount == 0) {
            return res.status(400).json({
                status: false,
                message: "Something Went Wrong"
            })
        }
        return res.status(200).json({
            status: true,
            message: "Expense Updated Successfully"
        })


    } catch (error) {
        console.error("Error in getUserExpenseCategoryWise:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.personalBarChart = async (req, res) => {
    try {
        const user_id = req.user;
        const { year } = req.body;

        if (!year || isNaN(year) || String(year).length !== 4) {
            return res.status(400).json({
                status: false,
                message: "Please provide a valid year in 'YYYY' format."
            });
        }

        const query = `
            WITH months AS (
                SELECT generate_series(
                    date_trunc('year', TO_DATE($2::TEXT, 'YYYY')),
                    date_trunc('year', TO_DATE($2::TEXT, 'YYYY')) + INTERVAL '11 months',
                    '1 month'
                )::DATE AS month_start
            )
            SELECT 
                TO_CHAR(m.month_start, 'YYYY-MM') AS month,
                COALESCE(SUM(CASE 
                    WHEN e.expenses_group_id IS NULL AND e.user_id = $1 
                    THEN e.expenses_amount 
                    ELSE 0 
                END), 0) AS personal_expenses,
                
                COALESCE(SUM(CASE 
                    WHEN ec.user_id = $1 
                    THEN ec.amount_paid 
                    ELSE 0 
                END), 0) AS group_contributions,
                
                COALESCE(SUM(CASE 
                    WHEN e.expenses_group_id IS NULL AND e.user_id = $1 
                    THEN e.expenses_amount 
                    WHEN ec.user_id = $1 
                    THEN ec.amount_paid 
                    ELSE 0 
                END), 0) AS total_spending

            FROM months m
            LEFT JOIN expenses e ON date_trunc('month', e.expenses_date) = m.month_start
            LEFT JOIN expense_contributions ec ON ec.expense_id = e.expenses_id

            GROUP BY m.month_start
            ORDER BY m.month_start;
        `;

        const result = await pool.query(query, [user_id, year]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                status: false,
                message: "No expenses found for the specified year."
            });
        }

        return res.status(200).json({
            status: true,
            message: "Monthly spending data retrieved successfully.",
            data: result.rows
        });

    } catch (error) {
        console.error("Error in personalBarChart:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.groupWiseActiveExpenses = async (req, res) => {
    try {
        const user_id = req.user;

        const query = `
            SELECT 
                e.expenses_id,
                e.expenses_text,
                e.expenses_amount,
                e.expenses_date,
                e.expenses_category,
                g.group_id,
                g.group_name,
                COALESCE(ec.amount_paid, 0) AS amount_paid,
                COALESCE(es.split_value, 0) AS amount_owed,
                GREATEST(COALESCE(es.split_value, 0) - COALESCE(ec.amount_paid, 0), 0) AS owe,
                GREATEST(COALESCE(ec.amount_paid, 0) - COALESCE(es.split_value, 0), 0) AS debt
            FROM expenses e
            LEFT JOIN groups g ON e.expenses_group_id = g.group_id
            LEFT JOIN expense_contributions ec ON e.expenses_id = ec.expense_id
            LEFT JOIN expense_splits es ON e.expenses_id = es.expense_id AND ec.user_id = es.user_id
            LEFT JOIN user_table u ON u.user_id = ec.user_id
            LEFT JOIN group_members gm ON gm.group_id = g.group_id AND gm.user_id = u.user_id
            WHERE 
                u.user_id = $1 
                AND gm.user_is_active = true 
                AND g.group_is_active = true
            ORDER BY e.expenses_date DESC, g.group_id, e.expenses_id, u.user_id;
        `;

        const result = await pool.query(query, [user_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                status: false,
                message: "No active group expenses found for the user."
            });
        }

        return res.status(200).json({
            status: true,
            message: "Active group-wise expenses retrieved successfully.",
            data: result.rows
        });

    } catch (error) {
        console.error("Error in groupWiseActiveExpenses:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.downloadTransactionsCSV = async (req, res) => {
    try {
        const user_id = req.user;

        const query = `
            SELECT 
                e.expenses_id,
                e.expenses_text AS description,
                e.expenses_amount AS amount_total,
                e.expenses_date AS date,
                e.expenses_category AS category,
                CASE 
                    WHEN e.expenses_group_id IS NULL THEN 'No Group (Personal)'
                    ELSE g.group_name 
                END AS group_name,
                COALESCE(ec.amount_paid, 0) AS contribution,
                GREATEST(COALESCE(es.split_value, 0) - COALESCE(ec.amount_paid, 0), 0) AS owe,
                GREATEST(COALESCE(ec.amount_paid, 0) - COALESCE(es.split_value, 0), 0) AS debt,
                CASE 
                    WHEN e.expenses_group_id IS NULL THEN 'Personal' 
                    ELSE 'Group' 
                END AS expense_type
            FROM expenses e
            LEFT JOIN expense_contributions ec ON e.expenses_id = ec.expense_id
            LEFT JOIN expense_splits es ON e.expenses_id = es.expense_id AND ec.user_id = es.user_id
            LEFT JOIN user_table u ON u.user_id = COALESCE(ec.user_id, e.user_id)
            LEFT JOIN groups g ON e.expenses_group_id = g.group_id
            WHERE e.user_id = $1 OR u.user_id = $1
            ORDER BY e.expenses_date DESC;
        `;

        const result = await pool.query(query, [user_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: false, message: "No transactions found for the user." });
        }

        const csvFilePath = path.join(__dirname, `transactions_${user_id}.csv`);
        const writableStream = fs.createWriteStream(csvFilePath);
        const csvStream = format({ headers: true });

        csvStream.pipe(writableStream);
        result.rows.forEach(row => csvStream.write(row));
        csvStream.end();

        writableStream.on('finish', () => {
            res.download(csvFilePath, (err) => {
                if (err) console.error('Download error:', err);
                fs.unlinkSync(csvFilePath);
            });
        });

    } catch (error) {
        console.error("Error in downloadTransactionsCSV:", error);
        return res.status(500).json({ status: false, message: "Internal server error." });
    }
};

exports.downloadTransactionsPDF = async (req, res) => {
    try {
        const user_id = req.user;

        const query = `
            SELECT 
                e.expenses_id,
                e.expenses_text AS description,
                e.expenses_amount AS amount_total,
                e.expenses_date AS date,
                e.expenses_category AS category,
                CASE 
                    WHEN e.expenses_group_id IS NULL THEN 'No Group (Personal)'
                    ELSE g.group_name 
                END AS group_name,
                COALESCE(ec.amount_paid, 0) AS contribution,
                GREATEST(COALESCE(es.split_value, 0) - COALESCE(ec.amount_paid, 0), 0) AS owe,
                GREATEST(COALESCE(ec.amount_paid, 0) - COALESCE(es.split_value, 0), 0) AS debt,
                CASE 
                    WHEN e.expenses_group_id IS NULL THEN 'Personal' 
                    ELSE 'Group' 
                END AS expense_type
            FROM expenses e
            LEFT JOIN expense_contributions ec ON e.expenses_id = ec.expense_id
            LEFT JOIN expense_splits es ON e.expenses_id = es.expense_id AND ec.user_id = es.user_id
            LEFT JOIN user_table u ON u.user_id = COALESCE(ec.user_id, e.user_id)
            LEFT JOIN groups g ON e.expenses_group_id = g.group_id
            WHERE e.user_id = $1 OR u.user_id = $1
            ORDER BY e.expenses_date DESC;
        `;

        const result = await pool.query(query, [user_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: false, message: "No transactions found for the user." });
        }

        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=transactions_${user_id}.pdf`);

        doc.pipe(res);
        doc.fontSize(20).text(`Transaction History`, { align: 'center' });
        doc.moveDown();

        result.rows.forEach(row => {
            doc.fontSize(14).text(`Description: ${row.description}`);
            doc.text(`Amount: ${row.amount_total}`);
            doc.text(`Date: ${row.date}`);
            doc.text(`Category: ${row.category}`);
            doc.text(`Group: ${row.group_name}`);
            doc.text(`Contribution: ${row.contribution}`);
            doc.text(`Owe: ${row.owe}`);
            doc.text(`Debt: ${row.debt}`);
            doc.text(`Expense Type: ${row.expense_type}`);
            doc.moveDown();
        });

        doc.end();

    } catch (error) {
        console.error("Error in downloadTransactionsPDF:", error);
        return res.status(500).json({ status: false, message: "Internal server error." });
    }
};

const jwt = require('jsonwebtoken');
const pool = require('../config/db');  // Assuming your pool configuration is in db.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '21csrud026@ldce.ac.in',
        pass: 'jxzj lehp fwjl hhpz'
    },
    logger: true
})


exports.getTotalOfGroup = async (req, res) => {
    try {
        // // Retrieve the token from the Authorization header
        // const token = req.headers.authorization && req.headers.authorization.split(" ")[1]; // Extract token from 'Bearer <token>'
        // if (!token) {
        //     return res.status(401).json({
        //         status: false,
        //         message: "No token provided. Please login."
        //     });
        // }

        // jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        //     if (err) {
        //         return res.status(401).json({
        //             status: false,
        //             message: "Invalid or expired token."
        //         })
        //     }
        const { id } = req.body;
        //    console.log(id)

        const result = await pool.query(
            `SELECT COALESCE(SUM(expenses_amount), 0) AS total 
             FROM expenses 
             WHERE expenses_group_id = $1;`, [id]);
        return res.status(200).json({
            status: true,
            message: "The Total Retrived Successfully",
            total: result.rows[0].total
        })


        // })


    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
}
exports.createGroup = async (req, res) => {




    const email_list = req.body.data.email_list;
    if (!Array.isArray(email_list) || email_list.length === 0) {
        return res.status(400).json({
            status: false,
            message: "Email list is required and should not be empty."
        });
    }

    // Retrieve the creator's email from the database
    let creatorEmail;
    let creatorName;
    try {
        const creatorResult = await pool.query(
            `SELECT user_email,user_name FROM user_table WHERE user_id = $1`,
            [req.user]
        );

        if (creatorResult.rowCount === 0) {
            return res.status(404).json({
                status: false,
                message: "Creator not found in the system."
            });
        }
        creatorEmail = creatorResult.rows[0].user_email;
        creatorName = creatorResult.rows[0].user_name;
    } catch (error) {
        console.error("Error fetching creator email:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error while fetching creator email."
        });
    }

    // Check if the creator's email is in the provided list
    if (email_list.includes(creatorEmail)) {
        return res.status(400).json({
            status: false,
            message: "The creator's email cannot be added to the group manually. It is added by default."
        });
    }

    // Check for duplicate emails in the provided list
    const duplicateEmails = email_list.filter((item, index) => email_list.indexOf(item) !== index);
    if (duplicateEmails.length > 0) {
        return res.status(409).json({
            status: false,
            message: "Duplicate emails found in the provided list.",
            duplicateEmails
        });
    }

    let existarray = [req.user];
    let retarray = [];
    try {
        // Start a transaction
        const client = await pool.connect();
        await client.query('BEGIN');

        // Check for existing users
        for (const email of email_list) {
            const result = await client.query(
                `SELECT user_id, user_email FROM user_table WHERE user_email = $1`,
                [email]
            );
            if (result.rowCount === 0) {
                const mailOptions = {
                    from: "21csrud026@ldce.ac.in",
                    to: email,
                    subject: "Invitation to Join Expense Tracker Group",
                    text: `Hello,Your friend ${creatorName} wants to add you to the group "${req.body.data.name}" on the Expense Tracker app.Since you're not registered yet, please sign up to join the group and start managing expenses seamlessly.Looking forward to having you on board!
                               Best regards,  
                               Expense Tracker Team`,
                };

                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) {
                        console.error("Email error:", err);
                    }
                    console.log("Email sent:", info.response);
                });





                retarray.push({
                    email: email,
                    message: "The User Does not Exist"
                });
            } else {
                existarray.push(result.rows[0].user_id);
            }
        }

        // If any invalid emails found, rollback and return error
        if (retarray.length !== 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: false,
                invalidlist: retarray,
            });
        }

        // Create the group
        const group_create = await client.query(
            `INSERT INTO groups (group_name, created_by) 
                 VALUES ($1, $2) RETURNING group_id`,
            [req.body.data.name, req.user]
        );

        if (group_create.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(500).json({
                status: false,
                message: "Failed to create the group. Please try again later."
            });
        }

        const group_id = group_create.rows[0].group_id;

        // Insert group members
        for (const user_id of existarray) {
            const insert_user = await client.query(
                `INSERT INTO group_members (group_id, user_id) 
                     VALUES ($1, $2)`,
                [group_id, user_id]
            );

            if (insert_user.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(500).json({
                    status: false,
                    message: "Failed to add members to the group. Transaction rolled back."
                });
            }
        }

        // Commit the transaction
        await client.query('COMMIT');
        client.release();
        return res.status(200).json({
            status: true,
            message: "Group created successfully and members added successfully."
        });

    } catch (error) {
        console.error("Error in createGroup:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }

};



exports.getGroupMembersWithTotal = async (req, res) => {
    try {
        const { group_id } = req.body;

        if (!group_id) {
            return res.status(400).json({
                status: false,
                message: "Group ID is required."
            });
        }

        const result = await pool.query(`
            SELECT
                u.user_id,
                u.user_email, 
                u.user_name,  
                COALESCE(SUM(ec.amount_paid), 0) AS total_contribution
            FROM group_members gm
            INNER JOIN user_table u ON u.user_id = gm.user_id 
            LEFT JOIN expense_contributions ec 
                ON ec.user_id = u.user_id 
                AND gm.group_id = ec.group_id
            WHERE gm.group_id = $1 
                AND gm.user_is_active = true
            GROUP BY u.user_id, u.user_name
            ORDER BY u.user_id;
        `, [group_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                status: false,
                message: "No active members found in this group."
            });
        }

        return res.status(200).json({
            status: true,
            message: "Group members and their total contributions retrieved successfully.",
            data: result.rows
        });

    } catch (error) {
        console.error("Error in getGroupMembersWithTotal:", error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: "Invalid or expired token. Please login again."
            });
        }

        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};


exports.createGroupExpense = async (req, res) => {
    try {
        const body = req.body.data;
        const { split_type, payment_vals, text, category, amount, date, group_id, group_name } = body;

        if (!split_type || !Array.isArray(payment_vals) || payment_vals.length === 0) {
            return res.status(400).json({
                status: false,
                message: "Split type and payment values are required."
            });
        }

        const client = await pool.connect();
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO expenses(user_id, expenses_group_id, expenses_amount, expenses_category, expenses_text, expenses_date) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING expenses_id`,
            [req.user, group_id, amount, category, text, date]
        );

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: false,
                message: "Error while inserting expenses."
            });
        }

        const expense_id = result.rows[0].expenses_id;

        for (const element of payment_vals) {
            let split_value = 0;
            let split_type_value = split_type;

            if (split_type === "equal") {
                split_value = parseFloat(amount / payment_vals.length);
            } else if (split_type === "percentage") {
                split_value = parseFloat((element.percent * amount) / 100);
            } else if (split_type === "unequal") {
                split_value = element.amount;
            } else {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Invalid split type provided."
                });
            }

            const insertSplit = await client.query(
                `INSERT INTO expense_splits (expense_id, user_id, split_type, split_value) 
                 VALUES ($1, $2, $3, $4)`,
                [expense_id, element.user_id, split_type_value, split_value]
            );

            if (insertSplit.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Error while inserting expense splits."
                });
            }

            const insertContribution = await client.query(
                `INSERT INTO expense_contributions (expense_id, user_id, amount_paid, group_id) 
                 VALUES ($1, $2, $3, $4)`,
                [expense_id, element.user_id, element.paid_amount, group_id]
            );

            if (insertContribution.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Error while inserting expense contributions."
                });
            }

            const insertSettlement = await client.query(
                `INSERT INTO settlement(e_id,u_id,g_id,paid_amount,split_amount) values ($1,$2,$3,$4,$5)`,
                [expense_id,element.user_id,group_id,element.paid_amount,split_value]
            );

            if (insertContribution.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Error while inserting expense contributions."
                });
            }

            console.log("i am before email")
            // Fetch user notification preference and email
            const result1 = await client.query(
                `SELECT user_notification, user_email FROM user_table WHERE user_id = $1`,
                [element.user_id]
            );

            console.log(body);
            if (result1.rowCount > 0 && result1.rows[0].user_notification === true) {
                const mailOptions = {
                    from: "21csrud026@ldce.ac.in",
                    to: result1.rows[0].user_email,
                    subject: `Expense Added in the Group ${req.body.group_name}`,
                    text: `Hello,

                    An expense of amount ${amount} has been added to the group ${req.body.group_name} with the description "${text}".
                    
                    Please check the Expense Tracker app for more details.
                    
                    Best regards,
                    Expense Tracker Team`,
                };
                console.log("i am here berfore mail")

                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) {
                        console.error("Email error:", err);
                    } else {
                        console.log("Email sent:", info.response);
                    }
                });
            }
        }

        await client.query('COMMIT');
        client.release();

        return res.status(200).json({
            status: true,
            message: "Transaction Added Successfully"
        });

    } catch (error) {
        console.error("Error in createGroupExpense:", error);
        await pool.query('ROLLBACK');

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: "Invalid or expired token. Please login again."
            });
        }

        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};



exports.UpdateGroupExpense = async (req, res) => {
    try {
        const body = req.body.data;
        const { e_id, split_type, payment_vals, text, category, amount, date, group_id } = body;

        if (!split_type || !Array.isArray(payment_vals) || payment_vals.length === 0) {
            return res.status(400).json({
                status: false,
                message: "Split type and payment values are required."
            });
        }

        const client = await pool.connect();
        await client.query('BEGIN');

        const result = await client.query(
            `update  expenses set user_id = $1, expenses_amount=$2, expenses_category=$3, expenses_text=$4, expenses_date=$5
             where expenses_id = $6`,
            [req.user, amount, category, text, date, e_id]
        );

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: false,
                message: "Error while Updating expenses."
            });
        }

        for (const element of payment_vals) {
            let split_value = 0;
            let split_type_value = split_type;

            if (split_type === "equal") {
                const n = payment_vals.length;
                split_value = parseFloat(amount / n);
                split_type_value = 'equal';
            }
            else if (split_type === "percentage") {
                split_value = parseFloat((element.percent * amount) / 100);
                split_type_value = 'percentage';
            }
            else if (split_type === "unequal") {
                split_value = element.amount;
                split_type_value = 'unequal';
            }
            else {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Invalid split type provided."
                });
            }

            const insertSplit = await client.query(
                `Update expense_splits set split_type = $1, split_value =$2
                where  expense_id = $3 and user_id = $4`,
                [split_type_value, split_value, e_id, element.user_id,]
            );

            if (insertSplit.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Error while inserting expense splits."
                });
            }

            const insertContribution = await client.query(
                `Update expense_contributions set amount_paid = $1
                where  expense_id = $2 and user_id = $3`,
                [element.paid_amount, e_id, element.user_id,]
            );

            if (insertContribution.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Error while inserting expense contributions."
                });
            }

            const updateSettlement = await client.query(
                `Update settlement set paid_amount = $1,split_amount = $2
                where  e_id = $3 and u_id = $4`,
                [element.paid_amount,split_value, e_id, element.user_id]
            );

            if (updateSettlement.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: false,
                    message: "Error while Updating settlement"
                });
            }


        }

        await client.query('COMMIT');
        client.release();

        return res.status(200).json({
            status: true,
            message: "Transaction Updated Successfully"
        });

    } catch (error) {
        console.error("Error in UpdateGroupExpense:", error);

        await pool.query('ROLLBACK');

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: "Invalid or expired token. Please login again."
            });
        }

        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

exports.deleteGroupExpense = async (req, res) => {
    // Retrieve the token from the Authorization header
    try {
        const { e_id } = req.body;
        console.log("i am inside delete")
        if (!e_id) {
            return res.status(400).json({
                status: false,
                message: "Expense ID (e_id) is required."
            });
        }

        const client = await pool.connect();
        await client.query('BEGIN');

        const deleteSettle = await client.query(
            `DELETE FROM settlement WHERE e_id = $1`,
            [e_id]
        );

        if (deleteSettle.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: false,
                message: "No related splits found for the given expense ID."
            });
        }



        const deleteSplits = await client.query(
            `DELETE FROM expense_splits WHERE expense_id = $1`,
            [e_id]
        );

        if (deleteSplits.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: false,
                message: "No related splits found for the given expense ID."
            });
        }

        const deleteContributions = await client.query(
            `DELETE FROM expense_contributions WHERE expense_id = $1`,
            [e_id]
        );

        if (deleteContributions.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: false,
                message: "No contributions found for the given expense ID."
            });
        }

        // Now safely delete the expense itself
        const deleteExpense = await client.query(
            `DELETE FROM expenses WHERE expenses_id = $1 AND user_id = $2`,
            [e_id, req.user]
        );

        if (deleteExpense.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: false,
                message: "Expense not found or you are not authorized to delete it."
            });
        }
        

        await client.query('COMMIT');
        client.release();

        return res.status(200).json({
            status: true,
            message: "Expense deleted successfully."
        });

    } catch (error) {
        console.error("Error in deleteGroupExpense:", error);

        // Rollback transaction if any error occurs
        await pool.query('ROLLBACK');

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: "Invalid or expired token. Please login again."
            });
        }

        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};
exports.getGroupTransactions = async (req, res) => {
    try {
        const { g_id } = req.body;
        const user_id = req.user;

        if (!g_id) {
            return res.status(400).json({
                status: false,
                message: "Group ID (g_id) is required."
            });
        }

        // Fetch expenses, contributions, and splits
        const query = `
        SELECT 
            e.expenses_id,
            e.expenses_text AS description,
            e.expenses_amount AS amount_total,
            e.expenses_date AS date,
            e.expenses_category AS category,
            COALESCE(MAX(es.split_type), 'equal') AS split_type,  
            COALESCE(u_exp.user_name, 'Unknown User') AS recorded_by,
        
            json_agg(
                DISTINCT jsonb_build_object(
                    'user_id', COALESCE(ec.user_id, es.user_id),  -- Ensure all users are included
                    'user', COALESCE(u.user_name, 'Unknown User'),
                    'contribution', COALESCE(ec.amount_paid, 0),
                    'owe', GREATEST(COALESCE(es.split_value, 0) - COALESCE(ec.amount_paid, 0), 0),
                    'debt', GREATEST(COALESCE(ec.amount_paid, 0) - COALESCE(es.split_value, 0), 0)
                )
            ) AS details
        
        FROM expenses e
        LEFT JOIN expense_splits es ON e.expenses_id = es.expense_id
        LEFT JOIN expense_contributions ec ON e.expenses_id = ec.expense_id AND ec.user_id = es.user_id
        LEFT JOIN user_table u ON u.user_id = COALESCE(ec.user_id, es.user_id)
        LEFT JOIN user_table u_exp ON u_exp.user_id = e.user_id
        
        WHERE e.expenses_group_id = $1
        GROUP BY e.expenses_id, u_exp.user_name
        ORDER BY e.expenses_date DESC;
        `;

        const result = await pool.query(query, [g_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                status: false,
                message: "No transactions found for the specified group."
            });
        }

        // Process each expense to compute optimized transactions
        let transactionsWithSettlements = result.rows.map(expense => {
            let balances = {};
            let users = JSON.parse(JSON.stringify(expense.details));

            users.forEach(user => {
                const balance = user.debt - user.owe;
                if (!balances[user.user_id]) {
                    balances[user.user_id] = { name: user.user, balance: 0 };
                }
                balances[user.user_id].balance += balance;
            });

            let optimizedTransactions = minimizeTransactions(balances);
            return {
                ...expense,
                optimized_transactions: optimizedTransactions
            };
        });

        return res.status(200).json({
            status: true,
            message: "Group transactions retrieved successfully.",
            data: transactionsWithSettlements
        });

    } catch (error) {
        console.error("Error in getGroupTransactions:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }
};

// Function to optimize and minimize transactions
function minimizeTransactions(balances) {
    let debtors = [], creditors = [];

    for (const [user_id, data] of Object.entries(balances)) {
        if (data.balance < 0) debtors.push({ user_id, name: data.name, balance: data.balance });
        if (data.balance > 0) creditors.push({ user_id, name: data.name, balance: data.balance });
    }

    debtors.sort((a, b) => a.balance - b.balance);
    creditors.sort((a, b) => b.balance - a.balance);

    let transactions = [];
    let i = 0, j = 0;

    while (i < debtors.length && j < creditors.length) {
        let debtor = debtors[i];
        let creditor = creditors[j];

        let amount = Math.min(-debtor.balance, creditor.balance);
        transactions.push({
            from_id: debtor.user_id,
            from: debtor.name,
            to_id: creditor.user_id,
            to: creditor.name,
            amount: parseFloat(amount.toFixed(2))  // Avoid floating point issues
        });

        debtor.balance += amount;
        creditor.balance -= amount;

        if (Math.abs(debtor.balance) < 0.01) i++;  
        if (Math.abs(creditor.balance) < 0.01) j++;  
    }

    return transactions;
}

// exports.getGroupTransactions = async (req, res) => {
//     try {
//         const { g_id } = req.body;
//         const user_id = req.user;

//         if (!g_id) {
//             return res.status(400).json({
//                 status: false,
//                 message: "Group ID (g_id) is required."
//             });
//         }

//         // Fetch all expenses and contributions along with the split type
//         const query = `
//         SELECT 
//             e.expenses_id,
//             e.expenses_text AS description,
//             e.expenses_amount AS amount_total,
//             e.expenses_date AS date,
//             e.expenses_category AS category,
//             COALESCE(MAX(es.split_type), 'equal') AS split_type,  -- Fetching one split_type per expense
//             COALESCE(u_exp.user_name, 'Unknown User') AS recorded_by,
        
//             json_agg(
//                 DISTINCT jsonb_build_object(  -- Using DISTINCT to avoid duplicates
//                     'user_id', u.user_id,
//                     'user', u.user_name,
//                     'contribution', COALESCE(ec.amount_paid, 0),
//                     'owe', GREATEST(COALESCE(es.split_value, 0) - COALESCE(ec.amount_paid, 0), 0),
//                     'debt', GREATEST(COALESCE(ec.amount_paid, 0) - COALESCE(es.split_value, 0), 0)
//                 )
//             ) AS details
        
//         FROM expenses e
//         LEFT JOIN expense_contributions ec ON e.expenses_id = ec.expense_id
//         LEFT JOIN expense_splits es ON e.expenses_id = es.expense_id  -- Now using MAX(es.split_type)
//         LEFT JOIN user_table u ON u.user_id = ec.user_id
//         LEFT JOIN user_table u_exp ON u_exp.user_id = e.user_id
        
//         WHERE e.expenses_group_id = $1
//         GROUP BY e.expenses_id, u_exp.user_name
//         ORDER BY e.expenses_date DESC;

//         `;

//         const result = await pool.query(query, [g_id]);

//         if (result.rowCount === 0) {
//             return res.status(404).json({
//                 status: false,
//                 message: "No transactions found for the specified group."
//             });
//         }

//         // Process each expense to compute optimal transactions
//         let transactionsWithSettlements = result.rows.map(expense => {
//             let balances = {};
//             let users = JSON.parse(JSON.stringify(expense.details)); // Clone to avoid mutation
            
//             users.forEach(user => {
//                 const balance = user.debt - user.owe; // Net balance
//                 balances[user.user_id] = { name: user.user, balance };
//             });
         
//             let optimizedTransactions = minimizeTransactions(balances);
//             // console.log(balances);
//             return {
//                 ...expense,
//                 optimized_transactions: optimizedTransactions
//             };
//         });

//         return res.status(200).json({
//             status: true,
//             message: "Group transactions retrieved successfully.",
//             data: transactionsWithSettlements
//         });

//     } catch (error) {
//         console.error("Error in getGroupTransactions:", error);
//         return res.status(500).json({
//             status: false,
//             message: "Internal server error."
//         });
//     }
// };

// // Function to minimize transactions per expense
// function minimizeTransactions(balances) {
//     let debtors = [], creditors = [];

//     for (const [user_id, data] of Object.entries(balances)) {
//         if (data.balance < 0) debtors.push({ user_id, name: data.name, balance: data.balance });
//         if (data.balance > 0) creditors.push({ user_id, name: data.name, balance: data.balance });
//     }

//     debtors.sort((a, b) => a.balance - b.balance);
//     creditors.sort((a, b) => b.balance - a.balance);

//     let transactions = [];
//     let i = 0, j = 0;

//     while (i < debtors.length && j < creditors.length) {
//         let debtor = debtors[i];
//         let creditor = creditors[j];

//         let amount = Math.min(-debtor.balance, creditor.balance);
//         transactions.push({
//             from_id: debtor.user_id, // Added user IDs
//             from: debtor.name,
//             to_id: creditor.user_id, // Added user IDs
//             to: creditor.name,
//             amount: amount
//         });

//         debtor.balance += amount;
//         creditor.balance -= amount;

//         if (debtor.balance === 0) i++;
//         if (creditor.balance === 0) j++;
//     }

//     return transactions;
// }


exports.exitFromGroup = async (req, res) => {
    try {
        const { group_id } = req.body;
        const result = await pool.query(`Update group_members set user_is_active = $1 where group_id = $2 and user_id = $3`, [false, group_id, req.user])
        if (result.rowCount === 0) {
            return res.status(400).json({
                status: false,
                message: "Unable to Exit the Group"
            })
        }
        return res.status(200).json({
            status: true,
            message: "Exited From Group Successfully"
        })



    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Internal server error."
        });
    }

}





// exports.addMembersInGrop = async (req, res) => {
//     try {
//         // Retrieve the token from the Authorization header
//         const token = req.headers.authorization && req.headers.authorization.split(" ")[1]; // Extract token from 'Bearer <token>'
//         if (!token) {
//             return res.status(401).json({
//                 status: false,
//                 message: "No token provided. Please login."
//             });
//         }
//         jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
//             if (err) {
//                 return res.status(401).send({
//                     status: false,
//                     message: "Invalid or expired token. Please login again."
//                 });
//             }

//         })
//     } catch (error) {
//         return res.status(500).json({
//             status: false,
//             message: "Internal server error."
//         });
//     }

// }
// exports.getMinTransactions = async (req,res) =>{
//     try{
    
//     }catch(error){

//     }
// }
const pool = require("../config/db");
const bcrypt = require("bcrypt");
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const nodemailer = require('nodemailer');
const jwt = require("jsonwebtoken");



const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '21csrud026@ldce.ac.in',
        pass: 'jxzj lehp fwjl hhpz'
    },
    logger: true
})



function OTPGenerator() {
    return Math.floor(100000 + Math.random() * 900000);
}

function validatePassword(password) {
    const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?/~\\|-]).{8,}$/;
    return pattern.test(password);
}

exports.register = async (req, res) => {
    try {
        console.log("I am in Register")
        // Handle user registration (hash password, store in DB, send response)
        const { name, email, password, confirmPassword } = req.body;

        // Input validation
        if (!email?.trim() || !name?.trim() || !password || !confirmPassword || !validatePassword(password) || password !== confirmPassword) {
            return res.status(406).json({
                status: false,
                message: "Please enter correct data.",
            });
        }

        // Check if user already exists
        const user = await pool.query("SELECT 1 FROM user_table WHERE user_email = $1", [email]);
        if (user.rows.length > 0) {
            return res.status(406).json({
                status: false,
                message: "User already exists.",
            });
        }

        // Hash password and generate OTP/token
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = OTPGenerator();
        const verify_token = uuidv4();

        // Insert new user into the database
        await pool.query(
            "INSERT INTO user_table (user_name, user_email, user_pass, user_otp, user_otp_time, user_otp_token, user_agree_to_terms) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [name, email, hashedPassword, otp, new Date(), verify_token, true]
        );

        // Send OTP email
        const mailOptions = {
            from: "21csrud026@ldce.ac.in",
            to: email,
            subject: "OTP FOR REGISTRATION",
            text: `Hello ${name}, Your OTP for Registration of Expense Tracker is ${otp}`,
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error("Email error:", err);
                return res.status(500).json({
                    status: false,
                    message: "User registered, but failed to send OTP email.",
                });
            }
            console.log("Email sent:", info.response);
        });

        // res.cookie("verify_token", verify_token, {
        //     httpOnly: false,
        //     secure: false,
        //     sameSite: "Lax",
        //     path: "/",
        // });

        return res.status(200).json({
            status: true,
            message: "User registered successfully. OTP sent.",
            verify_token:verify_token
        });
    } catch (error) {
        console.error("Registration error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error.",
        });
    }
};


exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const ger_user = await pool.query("SELECT * FROM user_table WHERE user_email = $1", [email]);
        if (ger_user.rows.length === 0) {
            return res.status(401).json({
                status: false,
                message: "User not found.",
            });
        }
        const user = ger_user.rows[0];
        const hashedPassword = user.user_pass;
        const isPasswordValid = await bcrypt.compare(password, hashedPassword);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: false,
                message: "Invalid password.",
            });
        }
        if (!user.user_isverified) {
            const otp = OTPGenerator();
            const verify_token = uuidv4();
            await pool.query(
                "UPDATE user_table SET user_otp = $1, user_otp_time = $2, user_otp_token = $3 WHERE user_id = $4",
                [otp, new Date(), verify_token, user.user_id]
            );
            // Send OTP email
            const mailOptions = {
                from: "21csrud026@ldce.ac.in",
                to: email,
                subject: "OTP FOR REGISTRATION",
                text: `Hello ${user.user_name}, Your OTP for Registration of Expense Tracker is ${otp}`,
            };

            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error("Email error:", err);
                    return res.status(500).json({
                        status: false,
                        message: "User registered, but failed to send OTP email.",
                    });
                }
                console.log("Email sent:", info.response);
            });

            // res.cookie("verify_token", verify_token, {
            //     httpOnly: false,
            //     secure: false,
            //     sameSite: "Lax",
            //     path: "/",
            // });
            return res.status(406).json({
                status: false,
                message: "User not verified.",
                verify_token:verify_token,
            });
        }
        const token = jwt.sign({ user_id: user.user_id }, process.env.JWT_SECRET, {
            expiresIn: "24h",
        });
        // res.cookie("token", token, {
        //     httpOnly: true,
        //     secure: false,
        //     sameSite: "Lax",
        // });
        return res.status(200).json({
            status: true,
            message: "User logged in successfully.",
            token: token,
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error.",
        });
    }
};
exports.verifyOTP = async (req, res) => {
    // Verify user OTP (match with DB, update verification status)
    try {
        const { otp } = req.body;

        // Get verify_token from Authorization header
        const verify_token = req.headers.authorization?.split(" ")[1];  // Extract token after "Bearer "
        
        if (!verify_token) {
            return res.status(401).json({
                status: false,
                message: "No session found.",
            });
        }

        const user = await pool.query("SELECT * FROM user_table WHERE user_otp_token = $1", [verify_token]);
        if (!user.rows[0]) {
            return res.status(401).json({
                status: false,
                message: "No User found.",
            });
        }

        if (user.rows[0].user_otp !== otp) {
            return res.status(409).json({
                status: false,
                message: "Invalid OTP.",
            });
        }

        if (user.rows[0].user_otp_time < new Date(new Date().getTime() - 5 * 60000)) {
            return res.status(409).json({
                status: false,
                message: "OTP expired.",
            });
        }

        // Update user verification status
        await pool.query(
            "UPDATE user_table SET user_isverified = $1 WHERE user_otp_token = $2",
            [true, verify_token]
        );

        const token = jwt.sign({ user_id: user.rows[0].user_id }, process.env.JWT_SECRET, {
            expiresIn: "1h",
        });

        return res.status(200).json({
            status: true,
            message: "User verified successfully.",
            token: token
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error.",
        });
    }
};

exports.resendOTP = async (req, res) => {
    // Generate and resend a new OTP (update in DB, send response)
    try {
        // Retrieve the verify_token from the Authorization header
        const verifyToken = req.headers.authorization && req.headers.authorization.split(" ")[1]; // Extract token from 'Bearer <token>'
        
        if (!verifyToken) {
            return res.status(406).json({
                status: false,
                message: "No session found.",
            });
        }

        // Query user based on the verify_token
        const user = await pool.query("SELECT * FROM user_table WHERE user_otp_token = $1", [verifyToken]);
        
        if (!user.rows[0]) {
            return res.status(401).json({
                status: false,
                message: "No User found.",
            });
        }

        // Generate new OTP
        const otp = OTPGenerator();
        
        // Update OTP in the database
        await pool.query(
            "UPDATE user_table SET user_otp = $1, user_otp_time = $2 WHERE user_otp_token = $3",
            [otp, new Date(), verifyToken]
        );

        // Send OTP email
        const user1 = user.rows[0];
        const mailOptions = {
            from: "21csrud026@ldce.ac.in",
            to: user1.user_email,
            subject: "OTP FOR REGISTRATION",
            text: `Hello ${user1.user_name}, Your OTP for Registration of Expense Tracker is ${otp}`,
        };

        await transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error("Email error:", err);
            }
        });

        return res.status(200).json({
            status: true,
            message: "OTP sent successfully.",
        });
    } catch (error) {
        console.error("Error in resendOTP:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error.",
        });
    }
};


exports.addPassword = async (req, res) => {
    // Handle adding a password (update user password in DB)
    //in this email requirement will be checked by frontend ----> if email is not present then this route will not be called

    try {
        const { email } = req.body;
        const user = await pool.query("SELECT * FROM user_table WHERE user_email = $1", [email]);
        if (!user.rows[0]) {
            return res.status(401).json({
                status: false,
                message: "No User found.",
            });
        }
        if (user.rows[0].pass === "") {
            return res.status(401).json({
                status: false,
                message: "User Not Loged In With Google.",
            });
        }
        const otp = OTPGenerator();
        const verify_token = uuidv4();
        //add otp and verify_token to user_table first  and then send mail it to user 
        const update_user = await pool.query(
            "UPDATE user_table SET user_otp = $1, user_otp_time = $2, user_otp_token = $3 WHERE user_email = $4",
            [otp, new Date(), verify_token, email]
        );
        // Send OTP email
        const user1 = user.rows[0];
        const mailOptions = {
            from: "21csrud026@ldce.ac.in",
            to: email,
            subject: "OTP FOR REGISTRATION",
            text: `Hello ${user1.user_name}, Your OTP for Registration of Expense Tracker is ${otp}`,
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error("Email error:", err);
            }
        });
        // res.cookie("verify_token", verify_token, {
        //     httpOnly: false,
        //     secure: false,
        //     sameSite: "Lax",
        // });

        return res.status(200).json({
            status: true,
            message: "OTP sent successfully.",
            verify_token:verify_token
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error.",
        });
    }

};

exports.checkAndAddPass = async (req, res) => {
    // Verify OTP and update password if OTP is correct
    try {
        const { otp, password } = req.body;

        // Retrieve the verify_token from the Authorization header
        const verifyToken = req.headers.authorization && req.headers.authorization.split(" ")[1]; // Extract token from 'Bearer <token>'
        
        if (!verifyToken) {
            return res.status(401).json({
                status: false,
                message: "No session found.",
            });
        }

        if (!password || !validatePassword(password)) {
            return res.status(406).json({
                status: false,
                message: "Please enter correct password.",
            });
        }

        const user = await pool.query("SELECT * FROM user_table WHERE user_otp_token = $1", [verifyToken]);

        if (user.rows.length === 0) {
            return res.status(401).json({
                status: false,
                message: "No User found.",
            });
        }

        if (user.rows[0].user_otp !== otp) {
            return res.status(400).json({
                status: false,
                message: "Invalid OTP.",
            });
        }

        if (user.rows[0].user_otp_time < new Date(new Date().getTime() - 5 * 60000)) {
            return res.status(409).json({
                status: false,
                message: "OTP expired.",
            });
        }

        // Update password in database
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query("UPDATE user_table SET user_pass = $1 WHERE user_id = $2", [hashedPassword, user.rows[0].user_id]);

        const token = jwt.sign({ user_id: user.rows[0].user_id }, process.env.JWT_SECRET, {
            expiresIn: "1h",
        });

        return res.status(200).json({
            status: true,
            message: "Password updated successfully.",
            token: token
        });
    } catch (error) {
        console.error("Error in checkAndAddPass:", error);

        return res.status(500).json({
            status: false,
            message: "Internal server error.",
        });
    }
};


const clientID = '278212426766-1c3eiva073kk4re08os3uutsu6fh27o5.apps.googleusercontent.com';
const clientSecret = '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';
const redirect_uri = "https://965f-182-70-123-229.ngrok-free.app/api/auth/google/callback";

exports.googleAuth = (req, res) => {
    try {
        const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientID}&redirect_uri=${redirect_uri}&response_type=code&scope=email%20profile&prompt=select_account`;
        res.redirect(authUrl);
    } catch (error) {
        console.error("Google Auth Error:", error);
        return res.status(500).json({ status: false, message: "Internal server error." });
    }
};
exports.googleCallback = async (req, res) => {
    try {
        const requestToken = req.query.code;
        if (!requestToken) {
            return res.status(400).json({ status: false, message: "Authorization code missing." });
        }

        // Exchange authorization code for access token
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientID,
                client_secret: clientSecret,
                code: requestToken,
                grant_type: "authorization_code",
                redirect_uri: redirect_uri,
            }),
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            return res.status(400).json({ status: false, message: "Failed to retrieve access token." });
        }

        // Fetch user information
        const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const userData = await userResponse.json();
        const email = userData.email;
        const name = userData.given_name;
        const newToken = uuidv4();

        const existingUser = await pool.query("SELECT * FROM user_table WHERE user_email = $1", [email]);

        if (existingUser.rows.length === 0) {
            await pool.query(
                "INSERT INTO user_table (user_name, user_email, user_pass, user_isverified, user_agree_to_terms) VALUES ($1, $2, $3, $4, $5)",
                [name, email, "", true, true]
            );
        }
        const user = await pool.query("SELECT user_id FROM user_table WHERE user_email = $1", [email]);
        const userId = user.rows[0].user_id;

        const Token = jwt.sign({ user_id: userId }, process.env.JWT_SECRET, { expiresIn: "24h" });

        // Redirect with token as query parameter
        return res.redirect(`http://localhost:3000/homepage?token=${Token}`);
    } catch (error) {
        console.error("Google Callback Error:", error);
        return res.status(500).json({ status: false, message: "Internal server error." });
    }
};

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const groupRoutes = require("./routes/groupRoutes");
const authMiddleware = require("./middlewares/authMiddleware");

const options = {
    origin: ["http://localhost:3000", "http://localhost:3001", "http://192.168.1.118:3000", "https://ace-data-analytics.stoplight.io", "http://192.168.1.161:3000", "https://expense-tracker-frontend-f6so.onrender.com"],
    credentials: true,
}

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors(options));

// Use authentication routes
app.use("/api/auth", authRoutes);

// Use user-related routes for  user
app.use("/api/user", authMiddleware, userRoutes);

app.use("/api/group", authMiddleware, groupRoutes);

app.get("/", (req, res) => {
    res.status(200).json({ message: "Expense Tracker API is running!" });
});

module.exports = app;  // Export for server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const connectDB = require("./config/mongodb");
require("dotenv").config();

process.env.TZ = 'Asia/Kolkata';

const app = express();

// Connect to MongoDB
connectDB();

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "https://patel-enterprise-kappa.vercel.app",
            "https://sfpinventory.techorses.com",
        ],
        credentials: true,
    })
);

// Middleware
app.use(express.json());
app.use(cookieParser());

// ========== IMPORT ROUTES ==========

// Auth Routes
const { router: authRoutes } = require("./routes/auth");

// Inventory Upload Routes
const uploadRoutes = require("./routes/upload");
const dashboardRoutes = require('./routes/dashboard');
const inventoryRoutes = require('./routes/inventory');


// ========== USE ROUTES ==========

// Auth routes - Register, Login, Me, Logout
app.use("/auth", authRoutes);

// Upload routes - for uploading Excel files
app.use("/upload", uploadRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/inventory', inventoryRoutes);



// Test route
app.get("/", (req, res) => {
    res.send("Patel Enterprise Stock Management new is Running OK!");
});

// ========== ERROR HANDLING MIDDLEWARE ==========

// 404 Not Found handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Global error:', err.stack);

    // Multer error handling
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 10MB.'
        });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 3 files allowed.'
        });
    }

    if (err.message && err.message.includes('Only Excel')) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }

    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 4050;

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
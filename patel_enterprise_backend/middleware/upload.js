const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // ✅ FIXED: Get source from file.fieldname (online, offline, showroom)
        const source = file.fieldname;
        const { date } = req.body;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const fileName = `${source}_${date}_${timestamp}${ext}`;
        cb(null, fileName);
    }
});

// File filter - only accept Excel files
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv' // .csv
    ];
    
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.xlsx', '.xls', '.csv'];
    
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
        files: 3 // Max 3 files per request
    }
});

// Middleware to handle multiple files with different field names
const uploadMiddleware = upload.fields([
    { name: 'online', maxCount: 1 },
    { name: 'offline', maxCount: 1 },
    { name: 'showroom', maxCount: 1 }
]);

// Cleanup function to remove uploaded files after processing
const cleanupFiles = (files) => {
    if (!files) return;
    
    const allFiles = [];
    if (files.online) allFiles.push(...files.online);
    if (files.offline) allFiles.push(...files.offline);
    if (files.showroom) allFiles.push(...files.showroom);
    
    allFiles.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Cleaned up: ${file.filename}`);
            } catch (err) {
                console.error(`❌ Failed to cleanup ${file.path}:`, err);
            }
        }
    });
};

module.exports = {
    uploadMiddleware,
    cleanupFiles
};
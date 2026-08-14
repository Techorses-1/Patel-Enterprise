const mongoose = require('mongoose');

const LogsSchema = new mongoose.Schema({
    // Action type
    action: {
        type: String,
        required: true,
        enum: ['UPLOAD', 'DELETE'],
        description: 'Type of action performed'
    },

    // Admin who performed the action
    admin: {
        type: String,
        required: true,
        trim: true,
        description: 'Username of admin who performed action'
    },

    // Inventory date (the date for which data was uploaded/deleted)
    date: {
        type: String,
        required: true,
        match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
        description: 'Inventory date (YYYY-MM-DD)'
    },

    // Source type
    source: {
        type: String,
        required: true,
        enum: ['online', 'offline', 'showroom', 'all'],
        default: 'all',
        description: 'Source type or all'
    },

    // Status of action
    status: {
        type: String,
        required: true,
        enum: ['success', 'failed'],
        description: 'Whether action was successful or failed'
    },

    // Details of the action (depends on action type)
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        description: 'Action specific details'
    },

    // Error message if failed
    error: {
        type: String,
        trim: true,
        default: null,
        description: 'Error message if action failed'
    },

    // Timestamp of action
    timestamp: {
        type: Date,
        default: Date.now,
        description: 'When the action was performed'
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// ============================================
// INDEXES FOR FAST QUERIES
// ============================================

// Index for date queries
LogsSchema.index({ date: 1 });

// Index for admin queries
LogsSchema.index({ admin: 1 });

// Index for action queries
LogsSchema.index({ action: 1 });

// Index for timestamp (for sorting)
LogsSchema.index({ timestamp: -1 });

// Compound index for combined queries
LogsSchema.index({ action: 1, date: 1, status: 1 });

// ============================================
// STATIC METHODS
// ============================================

// Get all logs for a specific date
LogsSchema.statics.getLogsByDate = function (date) {
    return this.find({ date: date }).sort({ timestamp: -1 });
};

// Get all logs for a specific admin
LogsSchema.statics.getLogsByAdmin = function (admin) {
    return this.find({ admin: admin }).sort({ timestamp: -1 });
};

// Get recent logs (limit)
LogsSchema.statics.getRecentLogs = function (limit = 50) {
    return this.find({}).sort({ timestamp: -1 }).limit(limit);
};

// Get logs by action type
LogsSchema.statics.getLogsByAction = function (action) {
    return this.find({ action: action }).sort({ timestamp: -1 });
};

// Get logs with pagination
LogsSchema.statics.getLogsWithPagination = function (page = 1, limit = 20, filter = {}) {
    const skip = (page - 1) * limit;
    return this.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);
};

// Count logs with filter
LogsSchema.statics.countLogs = function (filter = {}) {
    return this.countDocuments(filter);
};

// ============================================
// INSTANCE METHODS
// ============================================

// Get formatted log message
LogsSchema.methods.getLogMessage = function () {
    const statusEmoji = this.status === 'success' ? '✅' : '❌';
    return `${statusEmoji} ${this.admin} ${this.action} ${this.date} (${this.source}) - ${this.status}`;
};

// Check if log is recent (within last 7 days)
LogsSchema.methods.isRecent = function () {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return this.timestamp >= sevenDaysAgo;
};

// ============================================
// VIRTUALS
// ============================================

// Get formatted date
LogsSchema.virtual('formattedDate').get(function () {
    return this.timestamp.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
});

// ============================================
// TO JSON
// ============================================
LogsSchema.set('toJSON', { virtuals: true });
LogsSchema.set('toObject', { virtuals: true });

const Logs = mongoose.model('Logs', LogsSchema);

module.exports = Logs;
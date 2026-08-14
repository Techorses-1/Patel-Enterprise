const mongoose = require('mongoose');

const OnlineInventorySchema = new mongoose.Schema({
    // Unique identifier for the product
    item_no: {
        type: String,
        required: [true, 'Item number is required'],
        unique: true,
        trim: true,
        index: true
    },
    
    // Product name (stored once)
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true
    },
    
    // Source type (fixed for this collection)
    source_type: {
        type: String,
        enum: ['online'],
        default: 'online',
        required: true
    },
    
    // History array containing all date-wise snapshots
    history: [
        {
            date: {
                type: String,           // Format: "2026-07-01"
                required: true,
                index: true,
                match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
            },
            qty: {
                type: Number,
                required: true,
                min: [0, 'Quantity cannot be negative']
            },
            value: {
                type: Number,
                required: true,
                min: [0, 'Value cannot be negative']
            },
            uploaded_at: {
                type: Date,
                required: true,
                default: Date.now
            },
            batch_id: {
                type: String,
                required: true,
                trim: true
            }
        }
    ]
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// Compound index for faster queries
OnlineInventorySchema.index({ item_no: 1, 'history.date': -1 });

// Index for batch_id lookups
OnlineInventorySchema.index({ 'history.batch_id': 1 });

// Method to get latest inventory
OnlineInventorySchema.methods.getLatestHistory = function() {
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1];
};

// Method to get inventory for specific date
OnlineInventorySchema.methods.getHistoryByDate = function(date) {
    return this.history.find(h => h.date === date);
};

// Static method to get all items for a specific date
OnlineInventorySchema.statics.getItemsByDate = function(date) {
    return this.find({
        'history.date': date
    });
};

// Static method to check if date exists
OnlineInventorySchema.statics.dateExists = function(date) {
    return this.findOne({
        'history.date': date
    });
};

// Virtual for total items count
OnlineInventorySchema.virtual('totalHistoryEntries').get(function() {
    return this.history.length;
});

// Ensure virtuals are included in JSON
OnlineInventorySchema.set('toJSON', { virtuals: true });
OnlineInventorySchema.set('toObject', { virtuals: true });

const OnlineInventory = mongoose.model('OnlineInventory', OnlineInventorySchema);

module.exports = OnlineInventory;
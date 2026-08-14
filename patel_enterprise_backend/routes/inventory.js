const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Models
const OnlineInventory = require('../models/OnlineInventory');
const OfflineInventory = require('../models/OfflineInventory');
const ShowroomInventory = require('../models/ShowroomInventory');
const Admin = require('../models/AdminSchema');

// ============================================
// MIDDLEWARE: Check if user is Admin
// ============================================
const isAdmin = async (req, res, next) => {
    try {
        let token = req.cookies?.adminToken;

        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided. Please login as admin.'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token. Please login again.'
            });
        }

        const admin = await Admin.findById(decoded.id);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (!admin.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account deactivated. Please contact admin.'
            });
        }

        req.admin = admin;
        next();

    } catch (error) {
        console.error('❌ Admin check error:', error);
        return res.status(401).json({
            success: false,
            message: 'Not authorized. Admin access required.'
        });
    }
};

// ============================================
// ROUTE: GET /api/inventory/:source/:date
// Get inventory data for a specific source and date
// 🔒 Protected - Admin only
// ============================================
router.get('/:source/:date', isAdmin, async (req, res) => {
    try {
        const { source, date } = req.params;

        // ✅ Get query params for search, filter, pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const filter = req.query.filter || 'all'; // all, in-stock, out-of-stock, low-stock
        const lowStockThreshold = parseInt(req.query.threshold) || 5;

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Date must be in YYYY-MM-DD format'
            });
        }

        // Map source to model
        const modelMap = {
            online: OnlineInventory,
            offline: OfflineInventory,
            showroom: ShowroomInventory
        };

        const Model = modelMap[source];
        if (!Model) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source. Must be: online, offline, showroom'
            });
        }

        console.log(`📊 Fetching ${source} inventory for date: ${date}`);
        console.log(`   Search: "${search}", Filter: ${filter}, Page: ${page}, Limit: ${limit}`);

        // ✅ Step 1: Get all items for the date (without pagination first)
        let items = await Model.find(
            { 'history.date': date },
            {
                item_no: 1,
                description: 1,
                source_type: 1,
                history: { $elemMatch: { date: date } }
            }
        );

        // ✅ Step 2: Format items
        let formattedItems = items.map(item => {
            const historyEntry = item.history[0] || {};
            return {
                item_no: item.item_no,
                description: item.description,
                source_type: item.source_type,
                qty: historyEntry.qty || 0,
                value: historyEntry.value || 0,
                batch_id: historyEntry.batch_id || null,
                uploaded_at: historyEntry.uploaded_at || null
            };
        });

        // ✅ Step 3: Apply Search Filter (by item_no or description)
        if (search && search.trim() !== '') {
            const searchLower = search.toLowerCase().trim();
            formattedItems = formattedItems.filter(item =>
                item.item_no.toLowerCase().includes(searchLower) ||
                item.description.toLowerCase().includes(searchLower)
            );
        }

        // ✅ Step 4: Apply Stock Filter
        if (filter === 'in-stock') {
            formattedItems = formattedItems.filter(item => item.qty > 0);
        } else if (filter === 'out-of-stock') {
            formattedItems = formattedItems.filter(item => item.qty === 0);
        } else if (filter === 'low-stock') {
            formattedItems = formattedItems.filter(item => item.qty > 0 && item.qty <= lowStockThreshold);
        }
        // 'all' - no filter

        // ✅ Step 5: Calculate totals BEFORE pagination
        const totalItems = formattedItems.length;
        const totalQty = formattedItems.reduce((sum, item) => sum + item.qty, 0);
        const totalValue = formattedItems.reduce((sum, item) => sum + item.value, 0);

        // ✅ Step 6: Apply Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedItems = formattedItems.slice(startIndex, endIndex);

        // ✅ Step 7: Calculate pagination info
        const totalPages = Math.ceil(totalItems / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.json({
            success: true,
            data: {
                source: source,
                date: date,
                items: paginatedItems,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalItems: totalItems,
                    limit: limit,
                    hasNextPage: hasNextPage,
                    hasPrevPage: hasPrevPage,
                    startIndex: startIndex + 1,
                    endIndex: Math.min(endIndex, totalItems)
                },
                summary: {
                    totalQty: totalQty,
                    totalValue: totalValue,
                    filteredItems: totalItems,
                    totalItemsInSource: items.length
                },
                filters: {
                    search: search || '',
                    filter: filter,
                    lowStockThreshold: lowStockThreshold
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching inventory:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching inventory data',
            error: error.message
        });
    }
});

// ============================================
// ROUTE: GET /api/inventory/dates
// Get all available dates from all sources
// 🔒 Protected - Admin only
// ============================================
router.get('/dates', isAdmin, async (req, res) => {
    try {
        console.log('📊 Fetching all available dates');

        const [onlineDates, offlineDates, showroomDates] = await Promise.all([
            OnlineInventory.distinct('history.date'),
            OfflineInventory.distinct('history.date'),
            ShowroomInventory.distinct('history.date')
        ]);

        // Combine and get unique dates, sorted (newest first)
        const allDates = [...new Set([...onlineDates, ...offlineDates, ...showroomDates])].sort().reverse();

        // Get count of items for each date
        const dateSummary = await Promise.all(allDates.map(async (date) => {
            const [onlineCount, offlineCount, showroomCount] = await Promise.all([
                OnlineInventory.countDocuments({ 'history.date': date }),
                OfflineInventory.countDocuments({ 'history.date': date }),
                ShowroomInventory.countDocuments({ 'history.date': date })
            ]);

            return {
                date: date,
                online: { items: onlineCount },
                offline: { items: offlineCount },
                showroom: { items: showroomCount },
                totalItems: onlineCount + offlineCount + showroomCount
            };
        }));

        res.json({
            success: true,
            data: {
                totalDates: allDates.length,
                dates: dateSummary
            }
        });

    } catch (error) {
        console.error('❌ Error fetching dates:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dates',
            error: error.message
        });
    }
});

// ============================================
// ROUTE: GET /api/inventory/:source/:date/:itemNo
// Get specific item data for a source and date
// 🔒 Protected - Admin only
// ============================================
router.get('/:source/:date/:itemNo', isAdmin, async (req, res) => {
    try {
        const { source, date, itemNo } = req.params;

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Date must be in YYYY-MM-DD format'
            });
        }

        // Map source to model
        const modelMap = {
            online: OnlineInventory,
            offline: OfflineInventory,
            showroom: ShowroomInventory
        };

        const Model = modelMap[source];
        if (!Model) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source. Must be: online, offline, showroom'
            });
        }

        console.log(`📊 Fetching item ${itemNo} from ${source} for date: ${date}`);

        const item = await Model.findOne(
            {
                item_no: itemNo,
                'history.date': date
            },
            {
                item_no: 1,
                description: 1,
                source_type: 1,
                history: { $elemMatch: { date: date } }
            }
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found for this date'
            });
        }

        const historyEntry = item.history[0] || {};

        res.json({
            success: true,
            data: {
                item_no: item.item_no,
                description: item.description,
                source_type: item.source_type,
                date: date,
                qty: historyEntry.qty || 0,
                value: historyEntry.value || 0,
                batch_id: historyEntry.batch_id || null,
                uploaded_at: historyEntry.uploaded_at || null
            }
        });

    } catch (error) {
        console.error('❌ Error fetching item:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching item data',
            error: error.message
        });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

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
// HELPER: Get all available dates
// ============================================
const getAllDates = async () => {
    const [onlineDates, offlineDates, showroomDates] = await Promise.all([
        OnlineInventory.distinct('history.date'),
        OfflineInventory.distinct('history.date'),
        ShowroomInventory.distinct('history.date')
    ]);
    return [...new Set([...onlineDates, ...offlineDates, ...showroomDates])].sort();
};

// ============================================
// HELPER: Get data for specific source and date
// ============================================
const getSourceData = async (source, date) => {
    const modelMap = {
        online: OnlineInventory,
        offline: OfflineInventory,
        showroom: ShowroomInventory
    };
    
    const Model = modelMap[source];
    if (!Model) return null;
    
    const items = await Model.find(
        { 'history.date': date },
        { item_no: 1, description: 1, history: { $elemMatch: { date: date } } }
    );
    
    return items.map(item => ({
        item_no: item.item_no,
        description: item.description,
        qty: item.history[0]?.qty || 0,
        value: item.history[0]?.value || 0,
        batch_id: item.history[0]?.batch_id || null
    }));
};

// ============================================
// HELPER: Get previous date for a source
// ============================================
const getPreviousDate = async (source, currentDate) => {
    const modelMap = {
        online: OnlineInventory,
        offline: OfflineInventory,
        showroom: ShowroomInventory
    };
    
    const Model = modelMap[source];
    if (!Model) return null;
    
    const dates = await Model.distinct('history.date');
    const sortedDates = dates.filter(d => d < currentDate).sort();
    return sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
};

// ============================================
// HELPER: Get item data for specific date
// ============================================
const getItemsForDate = async (source, date) => {
    const modelMap = {
        online: OnlineInventory,
        offline: OfflineInventory,
        showroom: ShowroomInventory
    };
    
    const Model = modelMap[source];
    if (!Model) return [];
    
    const items = await Model.find(
        { 'history.date': date },
        { item_no: 1, description: 1, history: { $elemMatch: { date: date } } }
    );
    
    return items.map(item => ({
        item_no: item.item_no,
        description: item.description,
        qty: item.history[0]?.qty || 0,
        value: item.history[0]?.value || 0
    }));
};

// ============================================
// ROUTE 1: GET /api/dashboard/kpi
// Get KPI data for a specific date
// ============================================
router.get('/kpi', isAdmin, async (req, res) => {
    try {
        const { date, source = 'all' } = req.query;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Date must be in YYYY-MM-DD format'
            });
        }
        
        console.log(`📊 Fetching KPI for date: ${date}, source: ${source}`);
        
        const sources = source === 'all' ? ['online', 'offline', 'showroom'] : [source];
        
        let allItems = [];
        let totalValue = 0;
        let totalQty = 0;
        let activeSKUs = 0;
        let deadStock = 0;
        let sourceWise = {};
        let itemMap = {};
        
        // Get data for each source
        for (const src of sources) {
            const items = await getItemsForDate(src, date);
            sourceWise[src] = {
                totalValue: 0,
                totalQty: 0,
                items: items
            };
            
            items.forEach(item => {
                sourceWise[src].totalValue += item.value;
                sourceWise[src].totalQty += item.qty;
                
                if (item.qty > 0) {
                    activeSKUs++;
                } else {
                    deadStock++;
                }
                
                totalValue += item.value;
                totalQty += item.qty;
                
                // Track item across sources for comparison
                if (!itemMap[item.item_no]) {
                    itemMap[item.item_no] = {
                        description: item.description,
                        sources: {}
                    };
                }
                itemMap[item.item_no].sources[src] = {
                    qty: item.qty,
                    value: item.value
                };
            });
        }
        
        // Get previous date data for change comparison
        let valueChange = 0;
        let qtyChange = 0;
        let valueChangePercent = 0;
        let qtyChangePercent = 0;
        let prevTotalValue = 0;
        let prevTotalQty = 0;
        
        const prevDate = await getPreviousDate(sources[0], date);
        if (prevDate) {
            let prevItems = [];
            for (const src of sources) {
                const items = await getItemsForDate(src, prevDate);
                prevItems = prevItems.concat(items);
            }
            
            prevTotalValue = prevItems.reduce((sum, item) => sum + item.value, 0);
            prevTotalQty = prevItems.reduce((sum, item) => sum + item.qty, 0);
            
            valueChange = totalValue - prevTotalValue;
            qtyChange = totalQty - prevTotalQty;
            valueChangePercent = prevTotalValue > 0 ? (valueChange / prevTotalValue) * 100 : 0;
            qtyChangePercent = prevTotalQty > 0 ? (qtyChange / prevTotalQty) * 100 : 0;
        }
        
        res.json({
            success: true,
            data: {
                date: date,
                source: source,
                totalValue: totalValue,
                totalQty: totalQty,
                activeSKUs: activeSKUs,
                deadStock: deadStock,
                sourceWise: sourceWise,
                change: {
                    value: valueChange,
                    valuePercent: valueChangePercent,
                    qty: qtyChange,
                    qtyPercent: qtyChangePercent,
                    prevDate: prevDate,
                    prevTotalValue: prevTotalValue,
                    prevTotalQty: prevTotalQty
                },
                summary: {
                    totalItems: Object.keys(itemMap).length
                }
            }
        });
        
    } catch (error) {
        console.error('❌ KPI error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching KPI data',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 2: GET /api/dashboard/comparison
// Cross-source comparison for a specific date
// ============================================
router.get('/comparison', isAdmin, async (req, res) => {
    try {
        const { date, itemNo } = req.query;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Date must be in YYYY-MM-DD format'
            });
        }
        
        console.log(`📊 Fetching comparison for date: ${date}`);
        
        // Get data from all 3 sources
        const [onlineData, offlineData, showroomData] = await Promise.all([
            getItemsForDate('online', date),
            getItemsForDate('offline', date),
            getItemsForDate('showroom', date)
        ]);
        
        // Create maps for quick lookup
        const onlineMap = {};
        onlineData.forEach(item => {
            onlineMap[item.item_no] = item;
        });
        
        const offlineMap = {};
        offlineData.forEach(item => {
            offlineMap[item.item_no] = item;
        });
        
        const showroomMap = {};
        showroomData.forEach(item => {
            showroomMap[item.item_no] = item;
        });
        
        // Get all unique item numbers
        const allItemNos = new Set([
            ...Object.keys(onlineMap),
            ...Object.keys(offlineMap),
            ...Object.keys(showroomMap)
        ]);
        
        // Build comparison data
        const comparison = [];
        const mismatches = [];
        
        allItemNos.forEach(itemNo => {
            const online = onlineMap[itemNo] || { qty: 0, value: 0, description: 'N/A' };
            const offline = offlineMap[itemNo] || { qty: 0, value: 0, description: 'N/A' };
            const showroom = showroomMap[itemNo] || { qty: 0, value: 0, description: 'N/A' };
            
            const totalQty = online.qty + offline.qty + showroom.qty;
            const totalValue = online.value + offline.value + showroom.value;
            
            const itemData = {
                item_no: itemNo,
                description: online.description || offline.description || showroom.description || 'N/A',
                online_qty: online.qty,
                online_value: online.value,
                offline_qty: offline.qty,
                offline_value: offline.value,
                showroom_qty: showroom.qty,
                showroom_value: showroom.value,
                total_qty: totalQty,
                total_value: totalValue
            };
            
            comparison.push(itemData);
            
            // Check for mismatches (item present in one source but missing in another)
            const presentIn = [];
            if (online.qty > 0) presentIn.push('online');
            if (offline.qty > 0) presentIn.push('offline');
            if (showroom.qty > 0) presentIn.push('showroom');
            
            if (presentIn.length > 0 && presentIn.length < 3) {
                mismatches.push({
                    item_no: itemNo,
                    description: itemData.description,
                    presentIn: presentIn.join(', '),
                    missingIn: ['online', 'offline', 'showroom']
                        .filter(s => !presentIn.includes(s))
                        .join(', ')
                });
            }
        });
        
        // Calculate totals
        const totalValue = comparison.reduce((sum, item) => sum + item.total_value, 0);
        const totalQty = comparison.reduce((sum, item) => sum + item.total_qty, 0);
        const onlineTotal = comparison.reduce((sum, item) => sum + item.online_value, 0);
        const offlineTotal = comparison.reduce((sum, item) => sum + item.offline_value, 0);
        const showroomTotal = comparison.reduce((sum, item) => sum + item.showroom_value, 0);
        
        res.json({
            success: true,
            data: {
                date: date,
                comparison: comparison,
                mismatches: mismatches,
                totals: {
                    overall: {
                        totalValue: totalValue,
                        totalQty: totalQty
                    },
                    sources: {
                        online: { totalValue: onlineTotal, totalQty: onlineData.reduce((sum, i) => sum + i.qty, 0) },
                        offline: { totalValue: offlineTotal, totalQty: offlineData.reduce((sum, i) => sum + i.qty, 0) },
                        showroom: { totalValue: showroomTotal, totalQty: showroomData.reduce((sum, i) => sum + i.qty, 0) }
                    }
                },
                summary: {
                    totalItems: allItemNos.size,
                    mismatches: mismatches.length
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Comparison error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching comparison data',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 3: GET /api/dashboard/trend
// Time-based trend for a specific source
// ============================================
router.get('/trend', isAdmin, async (req, res) => {
    try {
        const { source = 'all', startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }
        
        console.log(`📊 Fetching trend for source: ${source}, from ${startDate} to ${endDate}`);
        
        const sources = source === 'all' ? ['online', 'offline', 'showroom'] : [source];
        const result = {};
        
        // Get all dates in range
        const allDates = await getAllDates();
        const filteredDates = allDates.filter(d => d >= startDate && d <= endDate);
        
        // For each source, get data for each date
        for (const src of sources) {
            result[src] = [];
            for (const date of filteredDates) {
                const items = await getItemsForDate(src, date);
                const totalValue = items.reduce((sum, item) => sum + item.value, 0);
                const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
                const itemCount = items.length;
                
                result[src].push({
                    date: date,
                    totalValue: totalValue,
                    totalQty: totalQty,
                    itemCount: itemCount
                });
            }
        }
        
        // Calculate overall (all sources combined)
        if (source === 'all') {
            result.overall = [];
            for (const date of filteredDates) {
                let totalValue = 0;
                let totalQty = 0;
                let itemCount = 0;
                
                for (const src of sources) {
                    const items = await getItemsForDate(src, date);
                    totalValue += items.reduce((sum, item) => sum + item.value, 0);
                    totalQty += items.reduce((sum, item) => sum + item.qty, 0);
                    itemCount += items.length;
                }
                
                result.overall.push({
                    date: date,
                    totalValue: totalValue,
                    totalQty: totalQty,
                    itemCount: itemCount
                });
            }
        }
        
        res.json({
            success: true,
            data: {
                startDate: startDate,
                endDate: endDate,
                source: source,
                dates: filteredDates,
                trend: result
            }
        });
        
    } catch (error) {
        console.error('❌ Trend error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching trend data',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 4: GET /api/dashboard/item/:itemNo
// Item-level drill down for a specific item
// ============================================
router.get('/item/:itemNo', isAdmin, async (req, res) => {
    try {
        const { itemNo } = req.params;
        const { source = 'all' } = req.query;
        
        console.log(`📊 Fetching item details for: ${itemNo}`);
        
        const sources = source === 'all' ? ['online', 'offline', 'showroom'] : [source];
        const result = {
            item_no: itemNo,
            description: '',
            history: {}
        };
        
        for (const src of sources) {
            const modelMap = {
                online: OnlineInventory,
                offline: OfflineInventory,
                showroom: ShowroomInventory
            };
            
            const Model = modelMap[src];
            if (!Model) continue;
            
            const item = await Model.findOne({ item_no: itemNo });
            
            if (!item) {
                result.history[src] = [];
                continue;
            }
            
            if (!result.description) {
                result.description = item.description;
            }
            
            // Get history sorted by date
            const history = item.history.sort((a, b) => a.date.localeCompare(b.date));
            result.history[src] = history.map(h => ({
                date: h.date,
                qty: h.qty,
                value: h.value,
                batch_id: h.batch_id
            }));
        }
        
        // Get latest data across all sources
        const latestData = {};
        for (const src of sources) {
            const history = result.history[src] || [];
            if (history.length > 0) {
                latestData[src] = history[history.length - 1];
            } else {
                latestData[src] = { qty: 0, value: 0 };
            }
        }
        
        res.json({
            success: true,
            data: {
                item_no: itemNo,
                description: result.description,
                history: result.history,
                latest: latestData,
                sources: sources
            }
        });
        
    } catch (error) {
        console.error('❌ Item detail error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching item details',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 5: GET /api/dashboard/dead-stock
// Dead stock and imbalance analysis
// ============================================
router.get('/dead-stock', isAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }
        
        console.log(`📊 Fetching dead stock for date: ${date}`);
        
        const [onlineData, offlineData, showroomData] = await Promise.all([
            getItemsForDate('online', date),
            getItemsForDate('offline', date),
            getItemsForDate('showroom', date)
        ]);
        
        // Combine all items
        const allItems = {};
        
        onlineData.forEach(item => {
            if (!allItems[item.item_no]) {
                allItems[item.item_no] = {
                    description: item.description,
                    online: { qty: item.qty, value: item.value },
                    offline: { qty: 0, value: 0 },
                    showroom: { qty: 0, value: 0 }
                };
            } else {
                allItems[item.item_no].online = { qty: item.qty, value: item.value };
            }
        });
        
        offlineData.forEach(item => {
            if (!allItems[item.item_no]) {
                allItems[item.item_no] = {
                    description: item.description,
                    online: { qty: 0, value: 0 },
                    offline: { qty: item.qty, value: item.value },
                    showroom: { qty: 0, value: 0 }
                };
            } else {
                allItems[item.item_no].offline = { qty: item.qty, value: item.value };
            }
        });
        
        showroomData.forEach(item => {
            if (!allItems[item.item_no]) {
                allItems[item.item_no] = {
                    description: item.description,
                    online: { qty: 0, value: 0 },
                    offline: { qty: 0, value: 0 },
                    showroom: { qty: item.qty, value: item.value }
                };
            } else {
                allItems[item.item_no].showroom = { qty: item.qty, value: item.value };
            }
        });
        
        // Find dead stock (qty = 0 in all sources)
        const deadStockItems = [];
        const imbalanceItems = [];
        
        Object.keys(allItems).forEach(itemNo => {
            const item = allItems[itemNo];
            const totalQty = item.online.qty + item.offline.qty + item.showroom.qty;
            
            // Dead stock: total qty = 0
            if (totalQty === 0) {
                deadStockItems.push({
                    item_no: itemNo,
                    description: item.description,
                    online_qty: item.online.qty,
                    offline_qty: item.offline.qty,
                    showroom_qty: item.showroom.qty,
                    total_qty: 0
                });
            }
            
            // Imbalance: qty = 0 in one source but > 0 in another
            const hasOnline = item.online.qty > 0;
            const hasOffline = item.offline.qty > 0;
            const hasShowroom = item.showroom.qty > 0;
            const presentCount = [hasOnline, hasOffline, hasShowroom].filter(Boolean).length;
            
            if (totalQty > 0 && presentCount > 0 && presentCount < 3) {
                imbalanceItems.push({
                    item_no: itemNo,
                    description: item.description,
                    online_qty: item.online.qty,
                    offline_qty: item.offline.qty,
                    showroom_qty: item.showroom.qty,
                    total_qty: totalQty,
                    present_in: [
                        hasOnline ? 'online' : null,
                        hasOffline ? 'offline' : null,
                        hasShowroom ? 'showroom' : null
                    ].filter(Boolean).join(', ')
                });
            }
        });
        
        res.json({
            success: true,
            data: {
                date: date,
                deadStock: {
                    count: deadStockItems.length,
                    items: deadStockItems
                },
                imbalance: {
                    count: imbalanceItems.length,
                    items: imbalanceItems
                },
                summary: {
                    totalItems: Object.keys(allItems).length,
                    activeItems: Object.keys(allItems).length - deadStockItems.length
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Dead stock error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dead stock data',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 6: GET /api/dashboard/value-concentration
// Value concentration (Pareto)
// ============================================
router.get('/value-concentration', isAdmin, async (req, res) => {
    try {
        const { date, source = 'all' } = req.query;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }
        
        console.log(`📊 Fetching value concentration for date: ${date}, source: ${source}`);
        
        const sources = source === 'all' ? ['online', 'offline', 'showroom'] : [source];
        const itemValueMap = {};
        
        for (const src of sources) {
            const items = await getItemsForDate(src, date);
            items.forEach(item => {
                if (!itemValueMap[item.item_no]) {
                    itemValueMap[item.item_no] = {
                        description: item.description,
                        totalValue: 0
                    };
                }
                itemValueMap[item.item_no].totalValue += item.value;
            });
        }
        
        // Convert to array and sort by value descending
        const sortedItems = Object.keys(itemValueMap).map(itemNo => ({
            item_no: itemNo,
            description: itemValueMap[itemNo].description,
            value: itemValueMap[itemNo].totalValue
        })).sort((a, b) => b.value - a.value);
        
        const totalValue = sortedItems.reduce((sum, item) => sum + item.value, 0);
        
        // Calculate cumulative percentage
        let cumulative = 0;
        const paretoData = sortedItems.map((item, index) => {
            cumulative += item.value;
            const cumulativePercent = totalValue > 0 ? (cumulative / totalValue) * 100 : 0;
            return {
                ...item,
                rank: index + 1,
                valuePercent: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
                cumulativePercent: cumulativePercent
            };
        });
        
        // Find 80% threshold
        const eightyPercentIndex = paretoData.findIndex(item => item.cumulativePercent >= 80);
        const topItems = paretoData.slice(0, 20); // Top 20 items
        
        res.json({
            success: true,
            data: {
                date: date,
                source: source,
                totalValue: totalValue,
                totalItems: sortedItems.length,
                pareto: paretoData,
                top20: topItems,
                eightyPercent: {
                    itemsCount: eightyPercentIndex + 1,
                    items: paretoData.slice(0, eightyPercentIndex + 1),
                    value: paretoData.slice(0, eightyPercentIndex + 1).reduce((sum, i) => sum + i.value, 0)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Value concentration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching value concentration data',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 7: GET /api/dashboard/audit-flags
// Data quality / audit flags
// ============================================
router.get('/audit-flags', isAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }
        
        console.log(`📊 Fetching audit flags for date: ${date}`);
        
        const [onlineData, offlineData, showroomData] = await Promise.all([
            getItemsForDate('online', date),
            getItemsForDate('offline', date),
            getItemsForDate('showroom', date)
        ]);
        
        const alerts = [];
        
        // Check for negative values
        const checkNegative = (items, source) => {
            items.forEach(item => {
                if (item.qty < 0 || item.value < 0) {
                    alerts.push({
                        type: 'negative',
                        severity: 'critical',
                        source: source,
                        item_no: item.item_no,
                        description: item.description,
                        message: `Negative ${item.qty < 0 ? 'Qty' : 'Value'}: ${item.qty < 0 ? item.qty : item.value}`,
                        qty: item.qty,
                        value: item.value
                    });
                }
            });
        };
        
        checkNegative(onlineData, 'online');
        checkNegative(offlineData, 'offline');
        checkNegative(showroomData, 'showroom');
        
        // Check for sharp mismatches (qty > 0 but value = 0, or vice versa)
        const checkMismatch = (items, source) => {
            items.forEach(item => {
                if ((item.qty > 0 && item.value === 0) || (item.qty === 0 && item.value > 0)) {
                    alerts.push({
                        type: 'mismatch',
                        severity: 'warning',
                        source: source,
                        item_no: item.item_no,
                        description: item.description,
                        message: `Qty ${item.qty} but Value ${item.value}`,
                        qty: item.qty,
                        value: item.value
                    });
                }
            });
        };
        
        checkMismatch(onlineData, 'online');
        checkMismatch(offlineData, 'offline');
        checkMismatch(showroomData, 'showroom');
        
        // Check for items that never appear in other sources
        const allItemNos = {};
        onlineData.forEach(item => {
            if (!allItemNos[item.item_no]) allItemNos[item.item_no] = { sources: [] };
            allItemNos[item.item_no].sources.push('online');
        });
        offlineData.forEach(item => {
            if (!allItemNos[item.item_no]) allItemNos[item.item_no] = { sources: [] };
            allItemNos[item.item_no].sources.push('offline');
        });
        showroomData.forEach(item => {
            if (!allItemNos[item.item_no]) allItemNos[item.item_no] = { sources: [] };
            allItemNos[item.item_no].sources.push('showroom');
        });
        
        Object.keys(allItemNos).forEach(itemNo => {
            const sources = allItemNos[itemNo].sources;
            if (sources.length === 1) {
                const item = onlineData.find(i => i.item_no === itemNo) ||
                           offlineData.find(i => i.item_no === itemNo) ||
                           showroomData.find(i => i.item_no === itemNo);
                if (item) {
                    alerts.push({
                        type: 'single_source',
                        severity: 'info',
                        source: sources[0],
                        item_no: itemNo,
                        description: item.description || 'N/A',
                        message: `Item only exists in ${sources[0]}`,
                        qty: item.qty,
                        value: item.value
                    });
                }
            }
        });
        
        res.json({
            success: true,
            data: {
                date: date,
                totalAlerts: alerts.length,
                alerts: alerts,
                summary: {
                    critical: alerts.filter(a => a.severity === 'critical').length,
                    warning: alerts.filter(a => a.severity === 'warning').length,
                    info: alerts.filter(a => a.severity === 'info').length
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Audit flags error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching audit flags',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 8: GET /api/dashboard/dates
// Get all available dates
// ============================================
router.get('/dates', isAdmin, async (req, res) => {
    try {
        const dates = await getAllDates();
        
        // Get summary for each date
        const dateSummary = await Promise.all(dates.map(async (date) => {
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
                totalDates: dates.length,
                dates: dateSummary
            }
        });
        
    } catch (error) {
        console.error('❌ Dates error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dates',
            error: error.message
        });
    }
});

// ============================================
// ROUTE 9: GET /api/dashboard/export
// Export comparison data (Excel/PDF ready)
// ============================================
router.get('/export', isAdmin, async (req, res) => {
    try {
        const { date1, date2, source1 = 'all', source2 = 'all' } = req.query;
        
        if (!date1 || !date2) {
            return res.status(400).json({
                success: false,
                message: 'Both dates are required for comparison'
            });
        }
        
        console.log(`📊 Exporting comparison between ${date1} and ${date2}`);
        
        const sources1 = source1 === 'all' ? ['online', 'offline', 'showroom'] : [source1];
        const sources2 = source2 === 'all' ? ['online', 'offline', 'showroom'] : [source2];
        
        // Get data for both dates
        let data1 = {};
        let data2 = {};
        
        for (const src of sources1) {
            const items = await getItemsForDate(src, date1);
            data1[src] = items;
        }
        
        for (const src of sources2) {
            const items = await getItemsForDate(src, date2);
            data2[src] = items;
        }
        
        // Combine all items
        const allItems = {};
        
        // Process date1 items
        Object.keys(data1).forEach(src => {
            data1[src].forEach(item => {
                if (!allItems[item.item_no]) {
                    allItems[item.item_no] = {
                        description: item.description,
                        date1: { qty: 0, value: 0 },
                        date2: { qty: 0, value: 0 }
                    };
                }
                allItems[item.item_no].date1 = {
                    qty: allItems[item.item_no].date1.qty + item.qty,
                    value: allItems[item.item_no].date1.value + item.value
                };
            });
        });
        
        // Process date2 items
        Object.keys(data2).forEach(src => {
            data2[src].forEach(item => {
                if (!allItems[item.item_no]) {
                    allItems[item.item_no] = {
                        description: item.description,
                        date1: { qty: 0, value: 0 },
                        date2: { qty: 0, value: 0 }
                    };
                }
                allItems[item.item_no].date2 = {
                    qty: allItems[item.item_no].date2.qty + item.qty,
                    value: allItems[item.item_no].date2.value + item.value
                };
            });
        });
        
        // Build comparison table
        const comparisonTable = Object.keys(allItems).map(itemNo => {
            const item = allItems[itemNo];
            const qtyDelta = item.date2.qty - item.date1.qty;
            const valueDelta = item.date2.value - item.date1.value;
            const qtyPercent = item.date1.qty > 0 ? (qtyDelta / item.date1.qty) * 100 : 0;
            const valuePercent = item.date1.value > 0 ? (valueDelta / item.date1.value) * 100 : 0;
            
            let status = 'unchanged';
            if (item.date1.qty === 0 && item.date2.qty > 0) status = 'new';
            else if (item.date1.qty > 0 && item.date2.qty === 0) status = 'removed';
            else if (qtyDelta > 0) status = 'restocked';
            else if (qtyDelta < 0) status = 'sold';
            
            return {
                item_no: itemNo,
                description: item.description,
                date1_qty: item.date1.qty,
                date1_value: item.date1.value,
                date2_qty: item.date2.qty,
                date2_value: item.date2.value,
                qty_delta: qtyDelta,
                value_delta: valueDelta,
                qty_percent: qtyPercent,
                value_percent: valuePercent,
                status: status
            };
        });
        
        // Calculate summary
        const totalDate1Value = comparisonTable.reduce((sum, i) => sum + i.date1_value, 0);
        const totalDate2Value = comparisonTable.reduce((sum, i) => sum + i.date2_value, 0);
        const totalDate1Qty = comparisonTable.reduce((sum, i) => sum + i.date1_qty, 0);
        const totalDate2Qty = comparisonTable.reduce((sum, i) => sum + i.date2_qty, 0);
        
        const newItems = comparisonTable.filter(i => i.status === 'new');
        const removedItems = comparisonTable.filter(i => i.status === 'removed');
        const restockedItems = comparisonTable.filter(i => i.status === 'restocked');
        const soldItems = comparisonTable.filter(i => i.status === 'sold');
        
        res.json({
            success: true,
            data: {
                comparison: {
                    date1: date1,
                    date2: date2,
                    source1: source1,
                    source2: source2,
                    items: comparisonTable
                },
                summary: {
                    date1_total_value: totalDate1Value,
                    date2_total_value: totalDate2Value,
                    date1_total_qty: totalDate1Qty,
                    date2_total_qty: totalDate2Qty,
                    value_change: totalDate2Value - totalDate1Value,
                    qty_change: totalDate2Qty - totalDate1Qty,
                    value_percent: totalDate1Value > 0 ? ((totalDate2Value - totalDate1Value) / totalDate1Value) * 100 : 0,
                    qty_percent: totalDate1Qty > 0 ? ((totalDate2Qty - totalDate1Qty) / totalDate1Qty) * 100 : 0,
                    new_items: newItems.length,
                    removed_items: removedItems.length,
                    restocked_items: restockedItems.length,
                    sold_items: soldItems.length
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Export error:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting data',
            error: error.message
        });
    }
});

module.exports = router;
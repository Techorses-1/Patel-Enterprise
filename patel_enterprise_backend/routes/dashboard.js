const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

// Models
const OnlineInventory = require('../models/OnlineInventory');
const OfflineInventory = require('../models/OfflineInventory');
const ShowroomInventory = require('../models/ShowroomInventory');
const Admin = require('../models/AdminSchema');

// ============================================
// MIDDLEWARE: Check if user is Admin
// (Same as upload.js - consider moving to middleware/isAdmin.js
//  and importing in both files to avoid duplication)
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
// HELPER: Map source string -> Model
// ============================================
const getModel = (source) => {
    const map = {
        online: OnlineInventory,
        offline: OfflineInventory,
        showroom: ShowroomInventory
    };
    return map[source] || null;
};

const ALL_SOURCES = ['online', 'offline', 'showroom'];

// ============================================
// HELPER: Get status label for a delta
// ============================================
const getStatus = (prevQty, currQty) => {
    if (prevQty === undefined || prevQty === null) return 'new';
    if (currQty === undefined || currQty === null) return 'removed';
    if (currQty > prevQty) return 'restocked';
    if (currQty < prevQty) return 'sold';
    return 'unchanged';
};

// ============================================
// SHARED HELPER: Build previous-vs-current comparison for ONE source
// Used by: GET /comparison (single source + "all" mode) and
//          GET /export/comparison (excel export)
// ============================================
const buildComparisonForSource = async (source, currentDate, previousDate) => {
    const Model = getModel(source);
    if (!Model) {
        throw new Error(`Invalid source: ${source}`);
    }

    const docs = await Model.find({
        $or: [{ 'history.date': currentDate }, { 'history.date': previousDate }]
    });

    const deltaTable = [];
    let newItemsCount = 0;
    let removedItemsCount = 0;
    let soldCount = 0;
    let restockedCount = 0;

    let prevTotalValue = 0;
    let currTotalValue = 0;
    let prevTotalQty = 0;
    let currTotalQty = 0;

    docs.forEach(doc => {
        const prevEntry = doc.history.find(h => h.date === previousDate) || null;
        const currEntry = doc.history.find(h => h.date === currentDate) || null;

        // Skip items that don't appear in either of these two exact dates
        if (!prevEntry && !currEntry) return;

        const prevQty = prevEntry ? prevEntry.qty : null;
        const currQty = currEntry ? currEntry.qty : null;
        const prevValue = prevEntry ? prevEntry.value : null;
        const currValue = currEntry ? currEntry.value : null;

        const status = getStatus(prevQty, currQty);

        if (status === 'new') newItemsCount++;
        if (status === 'removed') removedItemsCount++;
        if (status === 'sold') soldCount++;
        if (status === 'restocked') restockedCount++;

        prevTotalValue += prevValue || 0;
        currTotalValue += currValue || 0;
        prevTotalQty += prevQty || 0;
        currTotalQty += currQty || 0;

        deltaTable.push({
            item_no: doc.item_no,
            description: doc.description,
            prevQty,
            currQty,
            qtyDelta: (currQty ?? 0) - (prevQty ?? 0),
            prevValue,
            currValue,
            valueDelta: +(((currValue ?? 0) - (prevValue ?? 0)).toFixed(2)),
            status
        });
    });

    const topIncrease = [...deltaTable]
        .filter(d => d.qtyDelta > 0)
        .sort((a, b) => b.qtyDelta - a.qtyDelta)
        .slice(0, 10);

    const topDecrease = [...deltaTable]
        .filter(d => d.qtyDelta < 0)
        .sort((a, b) => a.qtyDelta - b.qtyDelta)
        .slice(0, 10);

    return {
        source,
        previousDate,
        currentDate,
        summary: {
            prevTotalQty,
            currTotalQty,
            qtyChange: currTotalQty - prevTotalQty,
            prevTotalValue: +prevTotalValue.toFixed(2),
            currTotalValue: +currTotalValue.toFixed(2),
            valueChange: +(currTotalValue - prevTotalValue).toFixed(2),
            newItemsCount,
            removedItemsCount,
            soldCount,
            restockedCount
        },
        deltaTable,
        topIncrease,
        topDecrease
    };
};

// ============================================
// ROUTE: GET /dashboard/kpis?date=YYYY-MM-DD
// Top-level KPI cards - totals per source + combined + vs previous date
// ============================================
router.get('/kpis', isAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'date query param is required' });
        }

        const sourceResults = {};
        let combinedQty = 0;
        let combinedValue = 0;

        for (const source of ALL_SOURCES) {
            const Model = getModel(source);

            const docs = await Model.find({ 'history.date': date });

            let totalQty = 0;
            let totalValue = 0;
            let activeSkus = 0;
            let deadStock = 0;

            docs.forEach(doc => {
                const entry = doc.history.find(h => h.date === date);
                if (!entry) return;
                totalQty += entry.qty;
                totalValue += entry.value;
                if (entry.qty > 0) activeSkus++;
                else deadStock++;
            });

            const prevDoc = await Model.aggregate([
                { $unwind: '$history' },
                { $match: { 'history.date': { $lt: date } } },
                { $group: { _id: '$history.date' } },
                { $sort: { _id: -1 } },
                { $limit: 1 }
            ]);
            const previousDate = prevDoc.length > 0 ? prevDoc[0]._id : null;

            let prevTotalQty = 0;
            let prevTotalValue = 0;

            if (previousDate) {
                const prevDocs = await Model.find({ 'history.date': previousDate });
                prevDocs.forEach(doc => {
                    const entry = doc.history.find(h => h.date === previousDate);
                    if (!entry) return;
                    prevTotalQty += entry.qty;
                    prevTotalValue += entry.value;
                });
            }

            const qtyChange = totalQty - prevTotalQty;
            const valueChange = totalValue - prevTotalValue;
            const qtyChangePct = prevTotalQty > 0 ? +((qtyChange / prevTotalQty) * 100).toFixed(2) : null;
            const valueChangePct = prevTotalValue > 0 ? +((valueChange / prevTotalValue) * 100).toFixed(2) : null;

            sourceResults[source] = {
                date,
                totalQty,
                totalValue: +totalValue.toFixed(2),
                activeSkus,
                deadStock,
                previousDate,
                qtyChange,
                valueChange: +valueChange.toFixed(2),
                qtyChangePct,
                valueChangePct
            };

            combinedQty += totalQty;
            combinedValue += totalValue;
        }

        res.json({
            success: true,
            message: 'KPI data fetched successfully',
            data: {
                date,
                combined: {
                    totalQty: combinedQty,
                    totalValue: +combinedValue.toFixed(2)
                },
                bySource: sourceResults
            }
        });

    } catch (error) {
        console.error('❌ KPI fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching KPI data', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/cross-source?date=YYYY-MM-DD
// Compare Online vs Offline vs Showroom on the same date
// ============================================
router.get('/cross-source', isAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'date query param is required' });
        }

        const itemMap = new Map();
        const sourceTotals = {};

        for (const source of ALL_SOURCES) {
            const Model = getModel(source);
            const docs = await Model.find({ 'history.date': date });

            let qtySum = 0;
            let valueSum = 0;

            docs.forEach(doc => {
                const entry = doc.history.find(h => h.date === date);
                if (!entry) return;

                qtySum += entry.qty;
                valueSum += entry.value;

                if (!itemMap.has(doc.item_no)) {
                    itemMap.set(doc.item_no, {
                        item_no: doc.item_no,
                        description: doc.description,
                        online: null,
                        offline: null,
                        showroom: null
                    });
                }
                itemMap.get(doc.item_no)[source] = { qty: entry.qty, value: entry.value };
            });

            sourceTotals[source] = { totalQty: qtySum, totalValue: +valueSum.toFixed(2) };
        }

        const allItems = Array.from(itemMap.values());

        const mismatches = allItems.filter(item => {
            const presentIn = ALL_SOURCES.filter(s => item[s] !== null);
            return presentIn.length > 0 && presentIn.length < ALL_SOURCES.length;
        });

        res.json({
            success: true,
            message: 'Cross-source comparison fetched successfully',
            data: {
                date,
                sourceTotals,
                items: allItems,
                mismatches
            }
        });

    } catch (error) {
        console.error('❌ Cross-source fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching cross-source data', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/comparison?source=online|offline|showroom|all&currentDate=&previousDate=
// Previous vs current comparison - single source OR all sources at once
// ============================================
router.get('/comparison', isAdmin, async (req, res) => {
    try {
        const { source, currentDate, previousDate } = req.query;

        if (!source || !currentDate || !previousDate) {
            return res.status(400).json({
                success: false,
                message: 'source, currentDate and previousDate query params are required'
            });
        }

        if (previousDate === currentDate) {
            return res.status(400).json({
                success: false,
                message: 'previousDate and currentDate must be different'
            });
        }

        // ---- ALL SOURCES MODE ----
        if (source === 'all') {
            const bySource = {};

            for (const src of ALL_SOURCES) {
                bySource[src] = await buildComparisonForSource(src, currentDate, previousDate);
            }

            // Combined summary across all 3 sources
            const combinedSummary = ALL_SOURCES.reduce((acc, src) => {
                const s = bySource[src].summary;
                acc.prevTotalQty += s.prevTotalQty;
                acc.currTotalQty += s.currTotalQty;
                acc.prevTotalValue += s.prevTotalValue;
                acc.currTotalValue += s.currTotalValue;
                acc.newItemsCount += s.newItemsCount;
                acc.removedItemsCount += s.removedItemsCount;
                acc.soldCount += s.soldCount;
                acc.restockedCount += s.restockedCount;
                return acc;
            }, {
                prevTotalQty: 0, currTotalQty: 0,
                prevTotalValue: 0, currTotalValue: 0,
                newItemsCount: 0, removedItemsCount: 0,
                soldCount: 0, restockedCount: 0
            });
            combinedSummary.qtyChange = combinedSummary.currTotalQty - combinedSummary.prevTotalQty;
            combinedSummary.valueChange = +(combinedSummary.currTotalValue - combinedSummary.prevTotalValue).toFixed(2);
            combinedSummary.prevTotalValue = +combinedSummary.prevTotalValue.toFixed(2);
            combinedSummary.currTotalValue = +combinedSummary.currTotalValue.toFixed(2);

            return res.json({
                success: true,
                message: 'All-source comparison data fetched successfully',
                data: {
                    source: 'all',
                    previousDate,
                    currentDate,
                    combinedSummary,
                    sources: bySource
                }
            });
        }

        // ---- SINGLE SOURCE MODE (unchanged behavior) ----
        if (!getModel(source)) {
            return res.status(400).json({ success: false, message: `Invalid source: ${source}` });
        }

        const result = await buildComparisonForSource(source, currentDate, previousDate);

        res.json({
            success: true,
            message: 'Comparison data fetched successfully',
            data: result
        });

    } catch (error) {
        console.error('❌ Comparison fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching comparison data', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/trend?source=online&itemNo=optional
// Time series trend - either total (all items) or a single item
// ============================================
router.get('/trend', isAdmin, async (req, res) => {
    try {
        const { source, itemNo } = req.query;

        if (!source) {
            return res.status(400).json({ success: false, message: 'source query param is required' });
        }

        const Model = getModel(source);
        if (!Model) {
            return res.status(400).json({ success: false, message: `Invalid source: ${source}` });
        }

        if (itemNo) {
            const doc = await Model.findOne({ item_no: itemNo });
            if (!doc) {
                return res.status(404).json({ success: false, message: `Item ${itemNo} not found in ${source}` });
            }

            const sortedHistory = [...doc.history].sort((a, b) => a.date.localeCompare(b.date));

            return res.json({
                success: true,
                message: 'Item trend fetched successfully',
                data: {
                    source,
                    item_no: doc.item_no,
                    description: doc.description,
                    trend: sortedHistory.map(h => ({ date: h.date, qty: h.qty, value: h.value }))
                }
            });
        }

        const trendMap = new Map();

        const docs = await Model.find({}, { history: 1 });
        docs.forEach(doc => {
            doc.history.forEach(h => {
                if (!trendMap.has(h.date)) {
                    trendMap.set(h.date, { date: h.date, totalQty: 0, totalValue: 0 });
                }
                const entry = trendMap.get(h.date);
                entry.totalQty += h.qty;
                entry.totalValue += h.value;
            });
        });

        const trend = Array.from(trendMap.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(t => ({ ...t, totalValue: +t.totalValue.toFixed(2) }));

        res.json({
            success: true,
            message: 'Overall trend fetched successfully',
            data: { source, trend }
        });

    } catch (error) {
        console.error('❌ Trend fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching trend data', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/item/:itemNo
// Item-level drill down across ALL 3 sources
// ============================================
router.get('/item/:itemNo', isAdmin, async (req, res) => {
    try {
        const { itemNo } = req.params;

        const result = {};

        for (const source of ALL_SOURCES) {
            const Model = getModel(source);
            const doc = await Model.findOne({ item_no: itemNo });

            if (!doc) {
                result[source] = null;
                continue;
            }

            const sortedHistory = [...doc.history].sort((a, b) => a.date.localeCompare(b.date));
            result[source] = {
                description: doc.description,
                trend: sortedHistory.map(h => ({ date: h.date, qty: h.qty, value: h.value }))
            };
        }

        const foundInAny = ALL_SOURCES.some(s => result[s] !== null);
        if (!foundInAny) {
            return res.status(404).json({ success: false, message: `Item ${itemNo} not found in any source` });
        }

        res.json({
            success: true,
            message: 'Item drill-down fetched successfully',
            data: { item_no: itemNo, sources: result }
        });

    } catch (error) {
        console.error('❌ Item drill-down error:', error);
        res.status(500).json({ success: false, message: 'Error fetching item data', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/dead-stock?date=YYYY-MM-DD
// ============================================
router.get('/dead-stock', isAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'date query param is required' });
        }

        const itemMap = new Map();

        for (const source of ALL_SOURCES) {
            const Model = getModel(source);
            const docs = await Model.find({ 'history.date': date });

            docs.forEach(doc => {
                const entry = doc.history.find(h => h.date === date);
                if (!entry) return;

                if (!itemMap.has(doc.item_no)) {
                    itemMap.set(doc.item_no, {
                        item_no: doc.item_no,
                        description: doc.description,
                        online: null,
                        offline: null,
                        showroom: null
                    });
                }
                itemMap.get(doc.item_no)[source] = entry.qty;
            });
        }

        const allItems = Array.from(itemMap.values());

        const deadEverywhere = allItems.filter(item => {
            const presentSources = ALL_SOURCES.filter(s => item[s] !== null);
            if (presentSources.length === 0) return false;
            return presentSources.every(s => item[s] === 0);
        });

        const imbalance = allItems.filter(item => {
            const presentSources = ALL_SOURCES.filter(s => item[s] !== null);
            const zeroIn = presentSources.filter(s => item[s] === 0);
            const healthyIn = presentSources.filter(s => item[s] > 0);
            return zeroIn.length > 0 && healthyIn.length > 0;
        });

        res.json({
            success: true,
            message: 'Dead stock data fetched successfully',
            data: { date, deadEverywhere, imbalance }
        });

    } catch (error) {
        console.error('❌ Dead stock fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching dead stock data', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/pareto?date=YYYY-MM-DD&source=online|offline|showroom|all
// ============================================
router.get('/pareto', isAdmin, async (req, res) => {
    try {
        const { date, source = 'all' } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'date query param is required' });
        }

        const sourcesToQuery = source === 'all' ? ALL_SOURCES : [source];
        const itemValueMap = new Map();

        for (const src of sourcesToQuery) {
            const Model = getModel(src);
            if (!Model) continue;

            const docs = await Model.find({ 'history.date': date });
            docs.forEach(doc => {
                const entry = doc.history.find(h => h.date === date);
                if (!entry) return;

                if (!itemValueMap.has(doc.item_no)) {
                    itemValueMap.set(doc.item_no, { item_no: doc.item_no, description: doc.description, value: 0 });
                }
                itemValueMap.get(doc.item_no).value += entry.value;
            });
        }

        const items = Array.from(itemValueMap.values()).sort((a, b) => b.value - a.value);
        const grandTotal = items.reduce((sum, i) => sum + i.value, 0);

        let running = 0;
        const pareto = items.map(item => {
            running += item.value;
            return {
                ...item,
                value: +item.value.toFixed(2),
                cumulativePct: grandTotal > 0 ? +((running / grandTotal) * 100).toFixed(2) : 0
            };
        });

        res.json({
            success: true,
            message: 'Pareto data fetched successfully',
            data: { date, source, grandTotal: +grandTotal.toFixed(2), items: pareto }
        });

    } catch (error) {
        console.error('❌ Pareto fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching pareto data', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/top-items?date=YYYY-MM-DD&source=online|offline|showroom|all&limit=10
// ============================================
router.get('/top-items', isAdmin, async (req, res) => {
    try {
        const { date, source = 'all', limit = 10 } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'date query param is required' });
        }

        const sourcesToQuery = source === 'all' ? ALL_SOURCES : [source];
        const itemValueMap = new Map();

        for (const src of sourcesToQuery) {
            const Model = getModel(src);
            if (!Model) continue;

            const docs = await Model.find({ 'history.date': date });
            docs.forEach(doc => {
                const entry = doc.history.find(h => h.date === date);
                if (!entry) return;

                if (!itemValueMap.has(doc.item_no)) {
                    itemValueMap.set(doc.item_no, {
                        item_no: doc.item_no,
                        description: doc.description,
                        qty: 0,
                        value: 0
                    });
                }
                const item = itemValueMap.get(doc.item_no);
                item.qty += entry.qty;
                item.value += entry.value;
            });
        }

        const topItems = Array.from(itemValueMap.values())
            .sort((a, b) => b.value - a.value)
            .slice(0, parseInt(limit, 10))
            .map(i => ({ ...i, value: +i.value.toFixed(2) }));

        res.json({
            success: true,
            message: 'Top items fetched successfully',
            data: { date, source, topItems }
        });

    } catch (error) {
        console.error('❌ Top items fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching top items', error: error.message });
    }
});

// ============================================
// HELPER: Style a header row on a worksheet
// ============================================
const styleHeaderRow = (row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3F3F91' } };
    row.alignment = { vertical: 'middle', horizontal: 'left' };
};

// ============================================
// ROUTE: GET /dashboard/export/date?date=YYYY-MM-DD
// Excel export - full snapshot of a single date (all 3 sources + summary)
// Now includes Prev Qty / Prev Value columns (vs each source's previous
// upload date) with a visual gap column between previous and current.
// ============================================
router.get('/export/date', isAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'date query param is required' });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Patel Enterprise Stock Management';
        workbook.created = new Date();

        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Source', key: 'source', width: 18 },
            { header: 'Total Qty', key: 'qty', width: 16 },
            { header: 'Total Value', key: 'value', width: 18 },
            { header: 'Active SKUs', key: 'active', width: 14 },
            { header: 'Dead Stock', key: 'dead', width: 14 },
        ];
        styleHeaderRow(summarySheet.getRow(1));

        let combinedQty = 0;
        let combinedValue = 0;

        for (const source of ALL_SOURCES) {
            const Model = getModel(source);

            // ---- Find previous upload date for this source (latest before `date`) ----
            const prevDateAgg = await Model.aggregate([
                { $unwind: '$history' },
                { $match: { 'history.date': { $lt: date } } },
                { $group: { _id: '$history.date' } },
                { $sort: { _id: -1 } },
                { $limit: 1 }
            ]);
            const previousDate = prevDateAgg.length > 0 ? prevDateAgg[0]._id : null;

            // ---- Fetch docs for current date, and previous date (if it exists) ----
            const currentDocs = await Model.find({ 'history.date': date });

            let prevDocsMap = new Map(); // item_no -> { qty, value }
            if (previousDate) {
                const prevDocs = await Model.find({ 'history.date': previousDate });
                prevDocs.forEach(doc => {
                    const entry = doc.history.find(h => h.date === previousDate);
                    if (entry) {
                        prevDocsMap.set(doc.item_no, { qty: entry.qty, value: entry.value });
                    }
                });
            }

            // ---- Build sheet ----
            const sheet = workbook.addWorksheet(source.charAt(0).toUpperCase() + source.slice(1));
            sheet.columns = [
                { header: 'Item No.', key: 'item_no', width: 18 },
                { header: 'Description', key: 'description', width: 38 },
                { header: `Qty (${date})`, key: 'qty', width: 16 },
                { header: 'Value', key: 'value', width: 16 },
                 { header: '', key: 'gap', width: 5 },
                { header: `Prev Qty${previousDate ? ` (${previousDate})` : ''}`, key: 'prevQty', width: 20 },
                { header: 'Prev Value', key: 'prevValue', width: 16 },
               
                
            ];
            styleHeaderRow(sheet.getRow(1));

            let totalQty = 0;
            let totalValue = 0;
            let activeSkus = 0;
            let deadStock = 0;

            currentDocs.forEach(doc => {
                const entry = doc.history.find(h => h.date === date);
                if (!entry) return;

                const prev = prevDocsMap.get(doc.item_no) || null;

                sheet.addRow({
                    item_no: doc.item_no,
                    description: doc.description,
                    prevQty: prev ? prev.qty : '',
                    prevValue: prev ? prev.value : '',
                    gap: '',
                    qty: entry.qty,
                    value: entry.value
                });

                totalQty += entry.qty;
                totalValue += entry.value;
                if (entry.qty > 0) activeSkus++;
                else deadStock++;
            });

            sheet.getColumn('prevValue').numFmt = '₹#,##0.00';
            sheet.getColumn('value').numFmt = '₹#,##0.00';

            // Style the gap column so it visually separates the two groups
            sheet.getColumn('gap').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

            summarySheet.addRow({
                source: source.charAt(0).toUpperCase() + source.slice(1),
                qty: totalQty,
                value: totalValue,
                active: activeSkus,
                dead: deadStock
            });

            combinedQty += totalQty;
            combinedValue += totalValue;
        }

        summarySheet.addRow({});
        const totalRow = summarySheet.addRow({
            source: 'TOTAL (All Sources)',
            qty: combinedQty,
            value: combinedValue
        });
        totalRow.font = { bold: true };
        summarySheet.getColumn('value').numFmt = '₹#,##0.00';

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Inventory_Snapshot_${date}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('❌ Date export error:', error);
        res.status(500).json({ success: false, message: 'Error exporting date snapshot', error: error.message });
    }
});

// ============================================
// ROUTE: GET /dashboard/export/comparison?source=online|offline|showroom|all&currentDate=&previousDate=
// Excel export - previous vs current comparison
// ============================================
router.get('/export/comparison', isAdmin, async (req, res) => {
    try {
        const { source, currentDate, previousDate } = req.query;

        if (!source || !currentDate || !previousDate) {
            return res.status(400).json({
                success: false,
                message: 'source, currentDate and previousDate query params are required'
            });
        }

        if (previousDate === currentDate) {
            return res.status(400).json({
                success: false,
                message: 'previousDate and currentDate must be different'
            });
        }

        const sourcesToExport = source === 'all' ? ALL_SOURCES : [source];

        if (source !== 'all' && !getModel(source)) {
            return res.status(400).json({ success: false, message: `Invalid source: ${source}` });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Patel Enterprise Stock Management';
        workbook.created = new Date();

        const addComparisonSheet = (sheetName, result) => {
            const sheet = workbook.addWorksheet(sheetName);

            // Summary block at the top
            sheet.addRow(['Previous Date', result.previousDate]);
            sheet.addRow(['Current Date', result.currentDate]);
            sheet.addRow(['Prev Total Qty', result.summary.prevTotalQty, 'Curr Total Qty', result.summary.currTotalQty]);
            sheet.addRow(['Prev Total Value', result.summary.prevTotalValue, 'Curr Total Value', result.summary.currTotalValue]);
            sheet.addRow(['New Items', result.summary.newItemsCount, 'Removed Items', result.summary.removedItemsCount]);
            sheet.addRow(['Restocked', result.summary.restockedCount, 'Sold', result.summary.soldCount]);
            sheet.addRow([]);

            const headerRowIndex = sheet.rowCount + 1;
            sheet.addRow(['Item No.', 'Description', 'Prev Qty', 'Curr Qty', 'Qty Diff', 'Prev Value', 'Curr Value', 'Value Δ', 'Status']);
            styleHeaderRow(sheet.getRow(headerRowIndex));

            result.deltaTable.forEach(row => {
                sheet.addRow([
                    row.item_no,
                    row.description,
                    row.prevQty ?? '',
                    row.currQty ?? '',
                    row.qtyDelta,
                    row.prevValue ?? '',
                    row.currValue ?? '',
                    row.valueDelta,
                    row.status
                ]);
            });

            sheet.columns = [
                { width: 18 }, { width: 40 }, { width: 12 }, { width: 12 },
                { width: 10 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }
            ];
        };

        const allResults = {};
        for (const src of sourcesToExport) {
            const result = await buildComparisonForSource(src, currentDate, previousDate);
            allResults[src] = result;
            addComparisonSheet(src.charAt(0).toUpperCase() + src.slice(1), result);
        }

        // If exporting all sources, add a combined summary sheet at the front
        if (source === 'all') {
            const combinedSheet = workbook.addWorksheet('Combined Summary');
            workbook.worksheets.unshift(workbook.worksheets.pop()); // move to front

            combinedSheet.columns = [
                { header: 'Source', key: 'source', width: 18 },
                { header: 'Prev Qty', key: 'prevQty', width: 14 },
                { header: 'Curr Qty', key: 'currQty', width: 14 },
                { header: 'Qty Diff', key: 'qtyDelta', width: 12 },
                { header: 'Prev Value', key: 'prevValue', width: 16 },
                { header: 'Curr Value', key: 'currValue', width: 16 },
                { header: 'Value Δ', key: 'valueDelta', width: 16 },
                { header: 'New', key: 'newC', width: 10 },
                { header: 'Removed', key: 'removed', width: 10 },
                { header: 'Restocked', key: 'restocked', width: 12 },
                { header: 'Sold', key: 'sold', width: 10 },
            ];
            styleHeaderRow(combinedSheet.getRow(1));

            ALL_SOURCES.forEach(src => {
                const s = allResults[src].summary;
                combinedSheet.addRow({
                    source: src.charAt(0).toUpperCase() + src.slice(1),
                    prevQty: s.prevTotalQty,
                    currQty: s.currTotalQty,
                    qtyDelta: s.qtyChange,
                    prevValue: s.prevTotalValue,
                    currValue: s.currTotalValue,
                    valueDelta: s.valueChange,
                    newC: s.newItemsCount,
                    removed: s.removedItemsCount,
                    restocked: s.restockedCount,
                    sold: s.soldCount
                });
            });
        }

        const filenameSource = source === 'all' ? 'AllSources' : source;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Comparison_${filenameSource}_${previousDate}_vs_${currentDate}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('❌ Comparison export error:', error);
        res.status(500).json({ success: false, message: 'Error exporting comparison report', error: error.message });
    }
});

module.exports = router;
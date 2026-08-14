const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Models
const OnlineInventory = require('../models/OnlineInventory');
const OfflineInventory = require('../models/OfflineInventory');
const ShowroomInventory = require('../models/ShowroomInventory');
const Admin = require('../models/AdminSchema');
const Logs = require('../models/LogsSchema');

// Middleware
const { uploadMiddleware, cleanupFiles } = require('../middleware/upload');
const { parseMultipleFiles } = require('../utils/excelParser');

// ============================================
// HELPER: Create Audit Excel File
// ============================================
const createAuditFile = (date, admin, results, parsedResults, errors, status) => {
    try {
        // Create workbook
        const workbook = XLSX.utils.book_new();

        // ============================================
        // TAB 1: SUMMARY
        // ============================================
        const summaryData = [
            ['INVENTORY UPLOAD AUDIT REPORT'],
            [''],
            ['Upload Date', new Date().toLocaleString()],
            ['Inventory Date', date],
            ['Uploaded By', admin],
            ['Status', status],
            [''],
            ['Source', 'Status', 'Items Inserted', 'Items Updated', 'Total Value', 'Total Qty', 'File Name'],
        ];

        const sources = ['online', 'offline', 'showroom'];
        let totalItemsInserted = 0;
        let totalItemsUpdated = 0;
        let totalValue = 0;
        let totalQty = 0;

        for (const source of sources) {
            const result = results[source] || {};
            const parsed = parsedResults[source] || {};

            summaryData.push([
                source.charAt(0).toUpperCase() + source.slice(1),
                result.success ? '✅ Success' : '❌ Failed',
                result.inserted || 0,
                result.updated || 0,
                result.totalValue || 0,
                result.totalQty || 0,
                parsed.fileName || 'N/A'
            ]);

            totalItemsInserted += result.inserted || 0;
            totalItemsUpdated += result.updated || 0;
            totalValue += result.totalValue || 0;
            totalQty += result.totalQty || 0;
        }

        summaryData.push([]);
        summaryData.push(['TOTAL', '', totalItemsInserted, totalItemsUpdated, totalValue, totalQty, '']);

        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'SUMMARY');

        // ============================================
        // TAB 2: ACTUAL DATA (All sources combined)
        // ============================================
        const allItems = [];
        const headers = ['#', 'Source', 'Item No.', 'Name', 'Qty', 'Value', 'Status'];

        let serialNo = 1;
        for (const source of sources) {
            const parsed = parsedResults[source] || {};
            if (parsed.items && parsed.items.length > 0) {
                for (const item of parsed.items) {
                    allItems.push([
                        serialNo++,
                        source.charAt(0).toUpperCase() + source.slice(1),
                        item.item_no,
                        item.description,
                        item.qty,
                        item.value,
                        '✅ Valid'
                    ]);
                }
            }
        }

        const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...allItems]);
        XLSX.utils.book_append_sheet(workbook, dataSheet, 'DATA');

        // ============================================
        // TAB 3: ERRORS (if any)
        // ============================================
        const errorRows = [
            ['#', 'Source', 'Item No.', 'Name', 'Error', 'Reason']
        ];

        let errorNo = 1;
        let hasErrors = false;

        // Check for parse errors
        for (const source of sources) {
            const parsed = parsedResults[source] || {};
            if (parsed.error) {
                hasErrors = true;
                errorRows.push([
                    errorNo++,
                    source.charAt(0).toUpperCase() + source.slice(1),
                    'N/A',
                    'N/A',
                    'Parse Error',
                    parsed.error
                ]);
            }
        }

        // Check for validation errors from results
        for (const source of sources) {
            const result = results[source] || {};
            if (result.success === false && result.error) {
                hasErrors = true;
                errorRows.push([
                    errorNo++,
                    source.charAt(0).toUpperCase() + source.slice(1),
                    'N/A',
                    'N/A',
                    'Upload Error',
                    result.error
                ]);
            }
        }

        // Check for individual item errors
        for (const source of sources) {
            const parsed = parsedResults[source] || {};
            if (parsed.items) {
                for (const item of parsed.items) {
                    if (item.qty < 0 || item.value < 0) {
                        hasErrors = true;
                        errorRows.push([
                            errorNo++,
                            source.charAt(0).toUpperCase() + source.slice(1),
                            item.item_no,
                            item.description,
                            'Invalid Value',
                            `Qty: ${item.qty}, Value: ${item.value}`
                        ]);
                    }
                }
            }
        }

        if (!hasErrors) {
            errorRows.push(['', '', '', '', '✅ No errors found', '']);
        }

        const errorSheet = XLSX.utils.aoa_to_sheet(errorRows);
        XLSX.utils.book_append_sheet(workbook, errorSheet, 'ERRORS');

        // ============================================
        // SAVE FILE
        // ============================================
        const auditDir = path.join(__dirname, '../audit-files');
        if (!fs.existsSync(auditDir)) {
            fs.mkdirSync(auditDir, { recursive: true });
        }

        const fileName = `audit_${date}_${Date.now()}.xlsx`;
        const filePath = path.join(auditDir, fileName);

        XLSX.writeFile(workbook, filePath);

        return {
            fileName: fileName,
            filePath: filePath,
            hasErrors: hasErrors,
            errorCount: errorNo - 1
        };

    } catch (error) {
        console.error('❌ Error creating audit file:', error);
        return null;
    }
};

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
// ROUTE: POST /upload
// Upload inventory files (Online, Offline, Showroom)
// 🔒 Protected - Admin only
// ✅ Supports: Any combination of files (1, 2, or all 3)
// ✅ Blocks: Only duplicate sources on same date
// ============================================
router.post(
    '/',
    isAdmin,
    uploadMiddleware,
    [
        body('date')
            .notEmpty()
            .withMessage('Date is required')
            .matches(/^\d{4}-\d{2}-\d{2}$/)
            .withMessage('Date must be in YYYY-MM-DD format'),
        body('sourceType')
            .optional()
            .isIn(['all'])
            .withMessage('Source type must be "all"')
    ],
    async (req, res) => {
        let files = req.files;

        try {
            // 1. Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                if (files) cleanupFiles(files);
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { date } = req.body;

            // 2. Check if files were uploaded
            if (!files || Object.keys(files).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please upload at least one inventory file'
                });
            }

            console.log(`📤 Admin ${req.admin.username} uploading inventory for date: ${date}`);
            console.log(`   Files uploaded: ${Object.keys(files).join(', ')}`);

            // ============================================
            // 3. Check ONLY the sources being uploaded
            // ============================================
            const [onlineExists, offlineExists, showroomExists] = await Promise.all([
                OnlineInventory.dateExists(date),
                OfflineInventory.dateExists(date),
                ShowroomInventory.dateExists(date)
            ]);

            const uploadedSources = Object.keys(files);
            const conflictingSources = [];

            if (uploadedSources.includes('online') && onlineExists) {
                conflictingSources.push('online');
            }
            if (uploadedSources.includes('offline') && offlineExists) {
                conflictingSources.push('offline');
            }
            if (uploadedSources.includes('showroom') && showroomExists) {
                conflictingSources.push('showroom');
            }

            if (conflictingSources.length > 0) {
                cleanupFiles(files);
                const parsedResults = parseMultipleFiles(files);
                const auditFile = createAuditFile(
                    date,
                    req.admin.username,
                    {},
                    parsedResults,
                    [`Data already exists for date ${date} in: ${conflictingSources.join(', ')}`],
                    'FAILED'
                );

                await Logs.create({
                    action: 'UPLOAD',
                    admin: req.admin.username,
                    date: date,
                    source: 'all',
                    status: 'failed',
                    details: {
                        files: Object.keys(files).map(key => files[key][0].originalname),
                        existingSources: conflictingSources,
                        auditFile: auditFile ? auditFile.fileName : null
                    },
                    error: `Data already exists for date ${date} in: ${conflictingSources.join(', ')}`
                });

                return res.status(409).json({
                    success: false,
                    message: `Data already exists for date ${date} in: ${conflictingSources.join(', ')}`,
                    existingSources: conflictingSources,
                    suggestion: `Please delete existing data for these sources first before re-uploading: ${conflictingSources.join(', ')}`
                });
            }

            // 4. Parse all uploaded files
            const parsedResults = parseMultipleFiles(files);

            // ✅ FIXED: Only check for parse errors in uploaded files
            const hasParseErrors = uploadedSources.some(source => parsedResults[source]?.error);

            if (hasParseErrors) {
                const errorsList = Object.entries(parsedResults)
                    .filter(([source, r]) => r.error && uploadedSources.includes(source))
                    .map(([source, r]) => ({ source, error: r.error }));

                const auditFile = createAuditFile(
                    date,
                    req.admin.username,
                    {},
                    parsedResults,
                    errorsList,
                    'FAILED'
                );

                await Logs.create({
                    action: 'UPLOAD',
                    admin: req.admin.username,
                    date: date,
                    source: 'all',
                    status: 'failed',
                    details: {
                        files: Object.keys(files).map(key => files[key][0].originalname),
                        parseErrors: errorsList,
                        auditFile: auditFile ? auditFile.fileName : null
                    },
                    error: 'Failed to parse files'
                });

                cleanupFiles(files);
                return res.status(400).json({
                    success: false,
                    message: 'Failed to parse files',
                    errors: errorsList
                });
            }

            // 5. Prepare batch operations
            const batchId = `BATCH_${date.replace(/-/g, '')}`;
            const uploadTime = new Date();

            const sourceMapping = {
                online: { model: OnlineInventory, data: parsedResults.online, type: 'online' },
                offline: { model: OfflineInventory, data: parsedResults.offline, type: 'offline' },
                showroom: { model: ShowroomInventory, data: parsedResults.showroom, type: 'showroom' }
            };

            const results = {};
            let totalItemsInserted = 0;
            let totalItemsUpdated = 0;
            let totalValue = 0;
            let totalQty = 0;

            // Process each source type
            for (const [source, config] of Object.entries(sourceMapping)) {
                const { model, data, type } = config;

                // Skip if this source wasn't uploaded or has error
                if (data.error || !data.items || data.items.length === 0) {
                    if (data.error) {
                        console.warn(`⚠️ Skipping ${source} - ${data.error}`);
                        results[source] = { success: false, error: data.error };
                    } else {
                        console.warn(`⚠️ No valid items in ${source} file`);
                        results[source] = {
                            success: true,
                            inserted: 0,
                            updated: 0,
                            totalItems: 0,
                            totalValue: 0,
                            totalQty: 0,
                            message: 'No valid items found'
                        };
                    }
                    continue;
                }

                console.log(`📦 Processing ${source}: ${data.items.length} items`);

                // Prepare bulk operations
                const bulkOps = [];
                const itemNos = data.items.map(item => item.item_no);

                console.log(`🔍 Fetching existing items for ${source}...`);

                // Fetch existing items in one query
                const existingItems = await model.find(
                    { item_no: { $in: itemNos } },
                    { item_no: 1, history: 1 }
                );

                console.log(`🔍 Found ${existingItems.length} existing items for ${source}`);

                const existingMap = new Map();
                existingItems.forEach(item => {
                    existingMap.set(item.item_no, item);
                });

                let insertedCount = 0;
                let updatedCount = 0;

                for (const item of data.items) {
                    const historyEntry = {
                        date: date,
                        qty: item.qty,
                        value: item.value,
                        uploaded_at: uploadTime,
                        batch_id: batchId
                    };

                    if (existingMap.has(item.item_no)) {
                        bulkOps.push({
                            updateOne: {
                                filter: { item_no: item.item_no },
                                update: {
                                    $push: { history: historyEntry },
                                    $set: {
                                        description: item.description,
                                        updated_at: uploadTime
                                    }
                                }
                            }
                        });
                        updatedCount++;
                    } else {
                        bulkOps.push({
                            insertOne: {
                                document: {
                                    item_no: item.item_no,
                                    description: item.description,
                                    source_type: type,
                                    history: [historyEntry],
                                    created_at: uploadTime,
                                    updated_at: uploadTime
                                }
                            }
                        });
                        insertedCount++;
                    }
                }

                console.log(`📊 ${source}: ${insertedCount} inserts, ${updatedCount} updates, ${bulkOps.length} total ops`);

                if (bulkOps.length > 0) {
                    console.log(`💾 Saving ${bulkOps.length} operations for ${source}...`);
                    await model.bulkWrite(bulkOps);
                    console.log(`✅ ${source} saved successfully!`);

                    const sourceTotalValue = data.items.reduce((sum, item) => sum + item.value, 0);
                    const sourceTotalQty = data.items.reduce((sum, item) => sum + item.qty, 0);

                    results[source] = {
                        success: true,
                        inserted: insertedCount,
                        updated: updatedCount,
                        totalItems: data.totalItems,
                        totalValue: sourceTotalValue,
                        totalQty: sourceTotalQty,
                        fileName: data.fileName
                    };

                    totalItemsInserted += insertedCount;
                    totalItemsUpdated += updatedCount;
                    totalValue += sourceTotalValue;
                    totalQty += sourceTotalQty;
                } else {
                    console.log(`⚠️ No operations for ${source}`);
                    results[source] = {
                        success: true,
                        inserted: 0,
                        updated: 0,
                        totalItems: 0,
                        totalValue: 0,
                        totalQty: 0,
                        message: 'No operations performed'
                    };
                }
            }

            // 6. CREATE AUDIT FILE
            console.log('📄 Creating SUCCESS audit file...');
            const auditFile = createAuditFile(
                date,
                req.admin.username,
                results,
                parsedResults,
                [],
                'SUCCESS'
            );
            console.log('✅ Audit file created with SUCCESS status');

            // 7. LOG: Upload Success
            await Logs.create({
                action: 'UPLOAD',
                admin: req.admin.username,
                date: date,
                source: 'all',
                status: 'success',
                details: {
                    files: Object.keys(files).map(key => files[key][0].originalname),
                    itemsInserted: totalItemsInserted,
                    itemsUpdated: totalItemsUpdated,
                    totalValue: totalValue,
                    totalQty: totalQty,
                    batchId: batchId,
                    results: results,
                    auditFile: auditFile ? auditFile.fileName : null,
                    auditFilePath: auditFile ? auditFile.filePath : null,
                    hasErrors: auditFile ? auditFile.hasErrors : false,
                    errorCount: auditFile ? auditFile.errorCount : 0
                }
            });

            // Cleanup uploaded files
            cleanupFiles(files);

            console.log(`✅ Upload complete: ${totalItemsInserted} new, ${totalItemsUpdated} updated`);
            console.log(`📄 Audit file created: ${auditFile ? auditFile.fileName : 'N/A'}`);

            res.status(201).json({
                success: true,
                message: 'Inventory uploaded successfully',
                data: {
                    date: date,
                    batchId: batchId,
                    uploadTime: uploadTime,
                    uploadedBy: req.admin.username,
                    results: results,
                    auditFile: auditFile ? {
                        fileName: auditFile.fileName,
                        filePath: auditFile.filePath,
                        hasErrors: auditFile.hasErrors,
                        errorCount: auditFile.errorCount
                    } : null,
                    summary: {
                        totalItemsInserted: totalItemsInserted,
                        totalItemsUpdated: totalItemsUpdated,
                        totalItemsProcessed: totalItemsInserted + totalItemsUpdated,
                        totalValue: totalValue,
                        totalQty: totalQty
                    }
                }
            });

        } catch (error) {
            console.error('❌ Upload error:', error);
            if (files) cleanupFiles(files);

            // Create audit file for unexpected error
            let auditFile = null;
            try {
                const parsedResults = files ? parseMultipleFiles(files) : {};
                auditFile = createAuditFile(
                    req.body?.date || 'Unknown',
                    req.admin?.username || 'Unknown',
                    {},
                    parsedResults,
                    [error.message || 'Unknown error'],
                    'FAILED'
                );
            } catch (auditError) {
                console.error('❌ Failed to create audit file:', auditError);
            }

            // LOG: Upload Failed - Unexpected error
            try {
                await Logs.create({
                    action: 'UPLOAD',
                    admin: req.admin?.username || 'Unknown',
                    date: req.body?.date || 'Unknown',
                    source: 'all',
                    status: 'failed',
                    details: {
                        files: files ? Object.keys(files).map(key => files[key][0].originalname) : [],
                        auditFile: auditFile ? auditFile.fileName : null
                    },
                    error: error.message || 'Unknown error'
                });
            } catch (logError) {
                console.error('❌ Failed to save error log:', logError);
            }

            res.status(500).json({
                success: false,
                message: 'Error uploading inventory',
                error: error.message
            });
        }
    }
);

// ============================================
// ROUTE: DELETE /upload/:date
// Delete all inventory data for a specific date
// 🔒 Protected - Admin only
// ============================================
router.delete('/:date', isAdmin, async (req, res) => {
    try {
        const { date } = req.params;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Date must be in YYYY-MM-DD format'
            });
        }

        console.log(`🗑️ Admin ${req.admin.username} deleting inventory data for date: ${date}`);

        // Get data counts before deletion for audit
        const [onlineCount, offlineCount, showroomCount] = await Promise.all([
            OnlineInventory.countDocuments({ 'history.date': date }),
            OfflineInventory.countDocuments({ 'history.date': date }),
            ShowroomInventory.countDocuments({ 'history.date': date })
        ]);

        const [onlineResult, offlineResult, showroomResult] = await Promise.all([
            OnlineInventory.updateMany(
                {},
                { $pull: { history: { date: date } } }
            ),
            OfflineInventory.updateMany(
                {},
                { $pull: { history: { date: date } } }
            ),
            ShowroomInventory.updateMany(
                {},
                { $pull: { history: { date: date } } }
            )
        ]);

        const [onlineDeleted, offlineDeleted, showroomDeleted] = await Promise.all([
            OnlineInventory.deleteMany({ history: { $size: 0 } }),
            OfflineInventory.deleteMany({ history: { $size: 0 } }),
            ShowroomInventory.deleteMany({ history: { $size: 0 } })
        ]);

        const totalDeleted = onlineResult.modifiedCount + offlineResult.modifiedCount + showroomResult.modifiedCount;

        console.log(`✅ Deleted ${totalDeleted} history entries for date ${date}`);

        // LOG: Delete Success
        await Logs.create({
            action: 'DELETE',
            admin: req.admin.username,
            date: date,
            source: 'all',
            status: 'success',
            details: {
                entriesRemoved: totalDeleted,
                beforeDelete: {
                    online: { items: onlineCount },
                    offline: { items: offlineCount },
                    showroom: { items: showroomCount }
                },
                collections: {
                    online: { entriesRemoved: onlineResult.modifiedCount, documentsRemoved: onlineDeleted.deletedCount },
                    offline: { entriesRemoved: offlineResult.modifiedCount, documentsRemoved: offlineDeleted.deletedCount },
                    showroom: { entriesRemoved: showroomResult.modifiedCount, documentsRemoved: showroomDeleted.deletedCount }
                }
            }
        });

        res.json({
            success: true,
            message: `Inventory data for ${date} deleted successfully`,
            data: {
                date: date,
                entriesRemoved: totalDeleted,
                deletedBy: req.admin.username,
                collections: {
                    online: { entriesRemoved: onlineResult.modifiedCount, documentsRemoved: onlineDeleted.deletedCount },
                    offline: { entriesRemoved: offlineResult.modifiedCount, documentsRemoved: offlineDeleted.deletedCount },
                    showroom: { entriesRemoved: showroomResult.modifiedCount, documentsRemoved: showroomDeleted.deletedCount }
                }
            }
        });

    } catch (error) {
        console.error('❌ Delete error:', error);

        // LOG: Delete Failed
        try {
            await Logs.create({
                action: 'DELETE',
                admin: req.admin?.username || 'Unknown',
                date: req.params?.date || 'Unknown',
                source: 'all',
                status: 'failed',
                error: error.message || 'Unknown error'
            });
        } catch (logError) {
            console.error('❌ Failed to save error log:', logError);
        }

        res.status(500).json({
            success: false,
            message: 'Error deleting inventory data',
            error: error.message
        });
    }
});

// ============================================
// ROUTE: GET /upload/dates
// Get all unique dates with inventory data
// 🔒 Protected - Admin only
// ============================================
router.get('/dates', isAdmin, async (req, res) => {
    try {
        const [onlineDates, offlineDates, showroomDates] = await Promise.all([
            OnlineInventory.distinct('history.date'),
            OfflineInventory.distinct('history.date'),
            ShowroomInventory.distinct('history.date')
        ]);

        const allDates = [...new Set([...onlineDates, ...offlineDates, ...showroomDates])].sort();

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

module.exports = router;
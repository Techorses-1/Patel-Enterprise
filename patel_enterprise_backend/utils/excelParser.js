const XLSX = require('xlsx');
const path = require('path');

/**
 * Parse Excel/CSV file and extract inventory data
 */
const parseInventoryFile = (filePath, sourceType) => {
    try {
        const workbook = XLSX.readFile(filePath);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        const data = XLSX.utils.sheet_to_json(firstSheet, {
            defval: '',
            blankrows: false,
            raw: false,
        });
        
        console.log(`📊 Parsing ${sourceType} file: ${path.basename(filePath)}`);
        console.log(`   Found ${data.length} rows`);
        
        if (data.length > 0) {
            console.log(`   📋 Columns: ${Object.keys(data[0]).join(', ')}`);
            console.log(`   📋 First row sample:`, JSON.stringify(data[0], null, 2));
        }
        
        const items = [];
        let totalValue = 0;
        let validItems = 0;
        let skippedItems = 0;
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            
            // ✅ FIX: Look for "Item No" first, NOT "#"
            // Priority: "Item No" > "Item No." > "item_no" > "#"
            let itemNo = null;
            let name = null;
            let qty = 0;
            let value = 0;
            
            // ✅ Try to find Item No - EXACT match
            if (row['Item No'] !== undefined && row['Item No'] !== '') {
                itemNo = row['Item No'];
            } else if (row['Item No.'] !== undefined && row['Item No.'] !== '') {
                itemNo = row['Item No.'];
            } else if (row['item_no'] !== undefined && row['item_no'] !== '') {
                itemNo = row['item_no'];
            } else if (row['itemNo'] !== undefined && row['itemNo'] !== '') {
                itemNo = row['itemNo'];
            } else if (row['#'] !== undefined && row['#'] !== '') {
                // ✅ Only use "#" as fallback, but check if it's a real item number
                const hashValue = row['#'].toString().trim();
                // If it's a number > 10000000, it's probably a real item number
                if (!isNaN(hashValue) && Number(hashValue) > 10000000) {
                    itemNo = hashValue;
                } else {
                    // It's just a row number, skip using it
                    itemNo = null;
                }
            }
            
            // ✅ Get Name
            if (row['Name'] !== undefined && row['Name'] !== '') {
                name = row['Name'];
            } else if (row['name'] !== undefined && row['name'] !== '') {
                name = row['name'];
            } else if (row['Description'] !== undefined && row['Description'] !== '') {
                name = row['Description'];
            }
            
            // ✅ Get Qty
            if (row['Qty'] !== undefined && row['Qty'] !== '') {
                qty = parseFloat(row['Qty']) || 0;
            } else if (row['qty'] !== undefined && row['qty'] !== '') {
                qty = parseFloat(row['qty']) || 0;
            } else if (row['Cumulative Qty'] !== undefined && row['Cumulative Qty'] !== '') {
                qty = parseFloat(row['Cumulative Qty']) || 0;
            }
            
            // ✅ Get Value
            if (row['Value'] !== undefined && row['Value'] !== '') {
                value = parseFloat(row['Value']) || 0;
            } else if (row['value'] !== undefined && row['value'] !== '') {
                value = parseFloat(row['value']) || 0;
            } else if (row['Cumulative Value'] !== undefined && row['Cumulative Value'] !== '') {
                value = parseFloat(row['Cumulative Value']) || 0;
            }
            
            // ✅ DEBUG: Log first few rows
            if (i < 5) {
                console.log(`   Row ${i + 1}: ItemNo=${itemNo}, Name=${name}, Qty=${qty}, Value=${value}`);
            }
            
            // ✅ Skip if no item number or empty
            if (!itemNo || itemNo.toString().trim() === '') {
                skippedItems++;
                continue;
            }
            
            const itemNoStr = itemNo.toString().trim();
            
            // ✅ Skip if it's a row number (1, 2, 3...) - ONLY if it's small
            // Real item numbers are 9+ digits (100010506)
            if (!isNaN(itemNoStr) && Number(itemNoStr) < 10000000) {
                skippedItems++;
                continue;
            }
            
            // Skip 'TOTAL'
            if (itemNoStr.toUpperCase().includes('TOTAL')) {
                skippedItems++;
                continue;
            }
            
            const nameStr = name ? name.toString().trim() : '';
            
            items.push({
                item_no: itemNoStr,
                description: nameStr || `Item ${itemNoStr}`,
                qty: qty,
                value: value
            });
            
            totalValue += value;
            validItems++;
        }
        
        console.log(`   ✅ Valid items: ${validItems}, Skipped: ${skippedItems}`);
        console.log(`   💰 Total Value: ${totalValue.toFixed(2)}`);
        
        return {
            items,
            totalItems: validItems,
            totalValue: totalValue,
            skippedItems: skippedItems,
            fileName: path.basename(filePath)
        };
        
    } catch (error) {
        console.error(`❌ Error parsing file ${filePath}:`, error);
        throw new Error(`Failed to parse file: ${error.message}`);
    }
};

/**
 * Validate file structure before parsing
 */
const validateFileStructure = (filePath) => {
    try {
        const workbook = XLSX.readFile(filePath);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(firstSheet, { defval: '', blankrows: false });
        
        if (data.length === 0) {
            throw new Error('File is empty');
        }
        
        const firstRow = data[0];
        const columnKeys = Object.keys(firstRow);
        console.log(`   📋 Available columns: ${columnKeys.join(', ')}`);
        
        return true;
    } catch (error) {
        throw new Error(`Invalid file structure: ${error.message}`);
    }
};

/**
 * Batch process multiple files
 */
const parseMultipleFiles = (files) => {
    const results = {};
    const sourceTypes = ['online', 'offline', 'showroom'];
    
    for (const source of sourceTypes) {
        if (files[source] && files[source].length > 0) {
            const file = files[source][0];
            try {
                results[source] = parseInventoryFile(file.path, source);
                results[source].filePath = file.path;
                results[source].fileName = file.filename;
            } catch (error) {
                results[source] = {
                    error: error.message,
                    fileName: file.filename,
                    filePath: file.path
                };
            }
        } else {
            results[source] = {
                error: `No ${source} file uploaded`,
                items: [],
                totalItems: 0,
                totalValue: 0
            };
        }
    }
    
    return results;
};

module.exports = {
    parseInventoryFile,
    validateFileStructure,
    parseMultipleFiles
};
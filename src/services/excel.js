import * as XLSX from 'xlsx';
import { formatDateStr, formatDateTime, calculateShelfLifeMetrics } from '../utils/date';
import { validateAuditRecord } from './validation';

const formatDuration = (ms) => {
  if (ms < 0) return '0 secs';
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const parts = [];
  if (hrs > 0) parts.push(`${hrs} hr${hrs > 1 ? 's' : ''}`);
  if (mins > 0) parts.push(`${mins} min${mins > 1 ? 's' : ''}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} sec${secs > 1 ? 's' : ''}`);
  return parts.join(' ');
};

const sanitizeFormulaVal = (val) => {
  if (typeof val === 'string' && /^[=\+\-\@\t\r]/.test(val)) {
    return `'${val}`;
  }
  return val;
};

export const exportAuditToExcel = (records, sessionMetadata, bookStock = []) => {
  const auditor = sessionMetadata?.auditor || 'Unknown';
  const clientName = sessionMetadata?.clientName || 'Unknown';
  const location = sessionMetadata?.location || 'Unknown';
  const auditDate = sessionMetadata?.auditDate || '';
  const scanType = sessionMetadata?.scanType || 'audit';
  
  // Mappings
  const mapping = sessionMetadata?.mapping || {};
  const bookMapping = sessionMetadata?.bookMapping || {};

  // Selected columns (default to all if not specified)
  const selectedColumns = sessionMetadata?.selectedColumns || [
    'Barcode', 'Item Code', 'Item Name', 'Product Group', 'Sub Category',
    'SKU Type', 'Pack Type', 'HSN', 'Box Qty', 'Loose Qty', 'Units Per Box',
    'Physical Total Qty', 'MRP', 'MFD', 'EXP', 'Shelved shelf life Days (elapsed days)',
    'Bal shelf life Days', 'Shelf-Life in %', 'Batch Number', 'Remarks',
    'Scanned At', 'Auditor', 'Location'
  ];

  // 1. Prepare Scanned Records Data
  const scannedRecordsData = records.map((r) => {
    const { shelvedDays, balDays, pct } = calculateShelfLifeMetrics(r.mfd, r.exp, auditDate);
    const fullRow = {
      'Barcode': r.barcode || '',
      'Item Code': r.itemCode || '',
      'Item Name': r.itemName || '',
      'Product Group': r.product || '',
      'Sub Category': r.subCategory || '',
      'SKU Type': r.skuType || '',
      'Pack Type': r.packType || '',
      'HSN': r.hsn || '',
      'Box Qty': typeof r.boxQty === 'number' ? r.boxQty : Number(r.boxQty) || 0,
      'Loose Qty': typeof r.looseQty === 'number' ? r.looseQty : Number(r.looseQty) || 0,
      'Units Per Box': typeof r.unitsPerBox === 'number' ? r.unitsPerBox : Number(r.unitsPerBox) || 1,
      'Physical Total Qty': typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0,
      'MRP': typeof r.mrp === 'number' ? r.mrp : Number(r.mrp) || 0,
      'MFD': formatDateStr(r.mfd),
      'EXP': formatDateStr(r.exp),
      'Shelved shelf life Days (elapsed days)': shelvedDays,
      'Bal shelf life Days': balDays,
      'Shelf-Life in %': pct !== '' ? `${pct}%` : '',
      'Batch Number': r.batchNumber || '',
      'Remarks': r.remarks || '',
      'Scanned At': formatDateTime(r.scannedAt),
      'Auditor': auditor,
      'Location': location
    };

    const filteredRow = {};
    selectedColumns.forEach((colName) => {
      if (fullRow.hasOwnProperty(colName)) {
        filteredRow[colName] = sanitizeFormulaVal(fullRow[colName]);
      }
    });

    if (r.customFields) {
      Object.entries(r.customFields).forEach(([key, val]) => {
        filteredRow[key] = sanitizeFormulaVal(val || '');
      });
    }

    return filteredRow;
  });

  // 2. Prepare Exceptions Sheet Data
  const exceptionsData = [];
  records.forEach((r) => {
    const errs = validateAuditRecord(r, r.isManualEntry);
    if (Object.keys(errs).length > 0) {
      const qty = typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0;
      const mrpVal = typeof r.mrp === 'number' ? r.mrp : Number(r.mrp) || 0;
      exceptionsData.push({
        'Barcode': sanitizeFormulaVal(r.barcode || ''),
        'Item Code': sanitizeFormulaVal(r.itemCode || ''),
        'Item Name': sanitizeFormulaVal(r.itemName || ''),
        'Batch Number': sanitizeFormulaVal(r.batchNumber || ''),
        'Net Qty': qty,
        'MRP': mrpVal,
        'Validation Issues': sanitizeFormulaVal(Object.values(errs).join('; ')),
        'Scanned At': formatDateTime(r.scannedAt),
        'Auditor': sanitizeFormulaVal(auditor)
      });
    }
  });

  // 3. Prepare Not Found (Manual Entries) Sheet Data
  const notFoundData = records
    .filter((r) => r.isManualEntry || r.itemCode === 'UNREG')
    .map((r) => ({
      'Barcode': sanitizeFormulaVal(r.barcode || ''),
      'Manual Item Name': sanitizeFormulaVal(r.itemName || ''),
      'Scanned Qty': typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0,
      'MRP': typeof r.mrp === 'number' ? r.mrp : Number(r.mrp) || 0,
      'Batch Number': sanitizeFormulaVal(r.batchNumber || ''),
      'Scanned At': formatDateTime(r.scannedAt),
      'Remarks': sanitizeFormulaVal(r.remarks || '')
    }));

  // 4. Prepare Duplicates Sheet Data
  // Group by barcode + batch
  const barcodeBatchCounts = {};
  records.forEach((r) => {
    const key = `${r.barcode || ''}_${(r.batchNumber || '').trim().toUpperCase()}`;
    barcodeBatchCounts[key] = (barcodeBatchCounts[key] || 0) + 1;
  });

  const duplicatesData = records
    .filter((r) => {
      const key = `${r.barcode || ''}_${(r.batchNumber || '').trim().toUpperCase()}`;
      return barcodeBatchCounts[key] > 1;
    })
    .map((r) => ({
      'Barcode': sanitizeFormulaVal(r.barcode || ''),
      'Item Code': sanitizeFormulaVal(r.itemCode || ''),
      'Item Name': sanitizeFormulaVal(r.itemName || ''),
      'Batch Number': sanitizeFormulaVal(r.batchNumber || ''),
      'Qty': typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0,
      'MRP': typeof r.mrp === 'number' ? r.mrp : Number(r.mrp) || 0,
      'Scanned At': formatDateTime(r.scannedAt),
      'Auditor': sanitizeFormulaVal(auditor)
    }));

  // 5. Prepare Variance Reconciliation Sheet Data
  const varianceReportData = [];
  if (bookStock && bookStock.length > 0) {
    const scannedQtyMap = {};
    records.forEach((r) => {
      if (r.barcode) {
        const qty = typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0;
        scannedQtyMap[r.barcode] = (scannedQtyMap[r.barcode] || 0) + qty;
      }
    });

    const bookStockMap = {};
    bookStock.forEach((item) => {
      const barcode = String(item.barcode).trim();
      if (barcode) {
        bookStockMap[barcode] = item;
      }
    });

    const allBarcodes = new Set([
      ...Object.keys(bookStockMap),
      ...Object.keys(scannedQtyMap)
    ]);

    allBarcodes.forEach((barcode) => {
      const bookItem = bookStockMap[barcode];
      const scannedQty = scannedQtyMap[barcode] || 0;
      const bookQty = bookItem ? Number(bookItem.qty) || 0 : 0;
      const variance = scannedQty - bookQty;

      const physicalMatch = records.find(r => r.barcode === barcode);
      const itemName = physicalMatch ? physicalMatch.itemName : (bookItem?.itemName || `Item ${barcode}`);
      const itemCode = physicalMatch ? physicalMatch.itemCode : (bookItem?.itemCode || 'ERP_STOCK');
      
      let status = 'MATCHED';
      if (variance < 0) status = 'DEFICIT (MISSING)';
      if (variance > 0) status = 'SURPLUS (EXCESS)';

      varianceReportData.push({
        'Barcode': sanitizeFormulaVal(barcode),
        'Item Code': sanitizeFormulaVal(itemCode),
        'Item Name': sanitizeFormulaVal(itemName),
        'Book Stock Qty (System)': bookQty,
        'Physical Scanned Qty': scannedQty,
        'Variance (Diff)': variance,
        'Reconciliation Status': sanitizeFormulaVal(status)
      });
    });
  }

  // 6. Prepare Dashboard & Summary Data
  let earliestScan = null;
  let latestScan = null;
  let totalQty = 0;
  records.forEach((r) => {
    if (r.scannedAt) {
      const d = new Date(r.scannedAt);
      if (!earliestScan || d < earliestScan) earliestScan = d;
      if (!latestScan || d > latestScan) latestScan = d;
    }
    totalQty += typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0;
  });

  let durationStr = 'N/A';
  if (earliestScan && latestScan) {
    const diff = latestScan.getTime() - earliestScan.getTime();
    durationStr = formatDuration(diff);
  }

  const scannedBarcodes = new Set(records.map(r => r.barcode).filter(Boolean));

  const dashboardData = [
    { 'Metric Name': '--- AUDIT PARAMETERS ---', 'Value': '' },
    { 'Metric Name': 'Client Name', 'Value': sanitizeFormulaVal(clientName) },
    { 'Metric Name': 'Auditor Name', 'Value': sanitizeFormulaVal(auditor) },
    { 'Metric Name': 'Location / Warehouse', 'Value': sanitizeFormulaVal(location) },
    { 'Metric Name': 'Audit Date', 'Value': sanitizeFormulaVal(formatDateStr(auditDate) || formatDateStr(new Date().toISOString().split('T')[0])) },
    { 'Metric Name': 'Audit Flow Type', 'Value': scanType.toUpperCase() },
    { 'Metric Name': 'Start Time', 'Value': sessionMetadata?.startTime ? formatDateTime(sessionMetadata.startTime) : 'N/A' },
    
    { 'Metric Name': '--- SCANNED STATISTICS ---', 'Value': '' },
    { 'Metric Name': 'Total Scanned Records', 'Value': records.length },
    { 'Metric Name': 'Unique Barcodes Scanned', 'Value': scannedBarcodes.size },
    { 'Metric Name': 'Total Physical Verified Quantity', 'Value': totalQty },
    
    { 'Metric Name': '--- AUDIT INTEGRITY METRICS ---', 'Value': '' },
    { 'Metric Name': 'Validation Exceptions', 'Value': exceptionsData.length },
    { 'Metric Name': 'Manual / Unregistered Items Scanned', 'Value': notFoundData.length },
    { 'Metric Name': 'Duplicate Scans Found', 'Value': duplicatesData.length },
    
    { 'Metric Name': '--- DURATION METRICS ---', 'Value': '' },
    { 'Metric Name': 'Active Audit Duration', 'Value': sanitizeFormulaVal(durationStr) },
    { 'Metric Name': 'First Scan Stamp', 'Value': earliestScan ? formatDateTime(earliestScan.toISOString()) : 'N/A' },
    { 'Metric Name': 'Last Scan Stamp', 'Value': latestScan ? formatDateTime(latestScan.toISOString()) : 'N/A' }
  ];

  // 7. Assemble Workbook Sheets
  const wb = XLSX.utils.book_new();

  // Helper function to prepare sheet settings (frozen headers, column widths)
  const configureSheet = (ws, data) => {
    // Enable Autofilters
    ws['!autofilter'] = { ref: ws['!ref'] };

    // Freeze Header Row (Row 1)
    ws['!views'] = [
      { state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activePane: 'bottomLeft' }
    ];

    // Auto-fit widths
    if (data && data.length > 0) {
      const keys = Object.keys(data[0]);
      ws['!cols'] = keys.map((key) => {
        let maxLen = key.toString().length;
        data.forEach((row) => {
          const val = row[key];
          if (val !== undefined && val !== null) {
            maxLen = Math.max(maxLen, val.toString().length);
          }
        });
        return { wch: Math.min(maxLen + 3, 50) };
      });
    }
  };

  // Sheet A: Dashboard (No filters on Dashboard)
  const wsDashboard = XLSX.utils.json_to_sheet(dashboardData);
  wsDashboard['!cols'] = [{ wch: 35 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsDashboard, 'Summary Dashboard');

  // Sheet B: Scanned Records
  const wsScanned = XLSX.utils.json_to_sheet(scannedRecordsData);
  configureSheet(wsScanned, scannedRecordsData);
  XLSX.utils.book_append_sheet(wb, wsScanned, 'Scanned Records');

  // Sheet C: Variance Reconciliation
  if (varianceReportData.length > 0) {
    const wsVariance = XLSX.utils.json_to_sheet(varianceReportData);
    configureSheet(wsVariance, varianceReportData);
    XLSX.utils.book_append_sheet(wb, wsVariance, 'Variance Reconciliation');
  }

  // Sheet D: Validation Exceptions
  const wsExceptions = XLSX.utils.json_to_sheet(exceptionsData);
  configureSheet(wsExceptions, exceptionsData);
  XLSX.utils.book_append_sheet(wb, wsExceptions, 'Validation Exceptions');

  // Sheet E: Not Found
  const wsNotFound = XLSX.utils.json_to_sheet(notFoundData);
  configureSheet(wsNotFound, notFoundData);
  XLSX.utils.book_append_sheet(wb, wsNotFound, 'Not Found (Manual)');

  // Sheet F: Duplicates
  const wsDuplicates = XLSX.utils.json_to_sheet(duplicatesData);
  configureSheet(wsDuplicates, duplicatesData);
  XLSX.utils.book_append_sheet(wb, wsDuplicates, 'Session Duplicates');

  // Save Workbook
  const dateStr = new Date().toISOString().split('T')[0];
  const cleanClientName = clientName.replace(/\s+/g, '_');
  const fileName = `AuditReport_${cleanClientName}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

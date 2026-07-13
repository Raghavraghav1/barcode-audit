import * as XLSX from 'xlsx';
import { formatDateStr, formatDateTime, calculateShelfLifeMetrics } from '../utils/date';

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

export const exportAuditToExcel = (records, sessionMetadata, bookStock = []) => {
  const auditor = sessionMetadata?.auditor || 'Unknown';
  const clientName = sessionMetadata?.clientName || 'Unknown';
  const location = sessionMetadata?.location || 'Unknown';
  const auditDate = sessionMetadata?.auditDate || '';
  
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

  // 1. Prepare Audit Report Data
  const auditData = records.map((r) => {
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

    // Filter columns based on user preferences
    const filteredRow = {};
    selectedColumns.forEach((colName) => {
      if (fullRow.hasOwnProperty(colName)) {
        filteredRow[colName] = fullRow[colName];
      }
    });

    // Dynamically append any mapped custom fields at the end of the row
    if (r.customFields) {
      Object.entries(r.customFields).forEach(([key, val]) => {
        filteredRow[key] = val || '';
      });
    }

    return filteredRow;
  });

  // 2. Prepare Exception Report Data
  const exceptions = [];
  const scannedBarcodes = new Set();

  records.forEach((r) => {
    if (r.barcode) {
      scannedBarcodes.add(r.barcode);
    }
  });

  records.forEach((r) => {
    const reasons = [];

    const qty = typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0;
    if (qty <= 0) {
      reasons.push('Quantity must be greater than 0');
    }

    const mrpVal = typeof r.mrp === 'number' ? r.mrp : Number(r.mrp) || 0;
    if (mrpVal <= 0) {
      reasons.push('MRP must be greater than 0');
    }

    if (r.mfd && r.exp) {
      const mfdDate = new Date(r.mfd);
      const expDate = new Date(r.exp);
      if (!isNaN(mfdDate.getTime()) && !isNaN(expDate.getTime()) && expDate <= mfdDate) {
        reasons.push('Expiry Date must be after Manufacturing Date');
      }
    }

    const now = new Date();
    if (r.mfd && new Date(r.mfd) > now) {
      reasons.push('Manufacturing Date cannot be in the future');
    }

    if (reasons.length > 0) {
      exceptions.push({
        'Barcode': r.barcode || '',
        'Item Code': r.itemCode || '',
        'Item Name': r.itemName || '',
        'Batch Number': r.batchNumber || '',
        'Net Qty': qty,
        'MRP': mrpVal,
        'Exception Reason(s)': reasons.join('; '),
        'Scanned At': formatDateTime(r.scannedAt),
        'Auditor': auditor
      });
    }
  });

  // 3. Prepare Variance Reconciliation Report Data
  const varianceReportData = [];
  
  if (bookStock && bookStock.length > 0) {
    // Map of barcode -> sum of physical scanned quantities
    const scannedQtyMap = {};
    records.forEach((r) => {
      if (r.barcode) {
        const qty = typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0;
        scannedQtyMap[r.barcode] = (scannedQtyMap[r.barcode] || 0) + qty;
      }
    });

    // Map of barcode -> book stock item
    const bookStockMap = {};
    bookStock.forEach((item) => {
      const barcode = String(item.barcode).trim();
      if (barcode) {
        bookStockMap[barcode] = item;
      }
    });

    // Generate union of all barcodes
    const allBarcodes = new Set([
      ...Object.keys(bookStockMap),
      ...Object.keys(scannedQtyMap)
    ]);

    allBarcodes.forEach((barcode) => {
      const bookItem = bookStockMap[barcode];
      const scannedQty = scannedQtyMap[barcode] || 0;
      const bookQty = bookItem ? Number(bookItem.qty) || 0 : 0;
      const variance = scannedQty - bookQty;

      // Find item details from physical records
      const physicalMatch = records.find(r => r.barcode === barcode);
      const itemName = physicalMatch ? physicalMatch.itemName : `Item ${barcode}`;
      const itemCode = physicalMatch ? physicalMatch.itemCode : 'MANUAL';
      
      let status = 'MATCHED';
      if (variance < 0) status = 'DEFICIT (MISSING)';
      if (variance > 0) status = 'SURPLUS (EXCESS)';

      varianceReportData.push({
        'Barcode': barcode,
        'Item Code': itemCode,
        'Item Name': itemName,
        'Book Stock Qty (System)': bookQty,
        'Physical Scanned Qty': scannedQty,
        'Variance (Diff)': variance,
        'Reconciliation Status': status
      });
    });
  }

  // 4. Prepare Summary Report Data
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

  const summaryData = [
    { 'Metric': 'Client Name', 'Value': clientName },
    { 'Metric': 'Auditor Name', 'Value': auditor },
    { 'Metric': 'Location', 'Value': location },
    { 'Metric': 'Audit Date', 'Value': formatDateStr(auditDate) || formatDateStr(new Date().toISOString().split('T')[0]) },
    { 'Metric': 'Total Scanned Entries', 'Value': records.length },
    { 'Metric': 'Unique Products Scanned', 'Value': scannedBarcodes.size },
    { 'Metric': 'Total Verified Item Quantity', 'Value': totalQty },
    { 'Metric': 'Validation Exceptions Found', 'Value': exceptions.length },
    { 'Metric': 'Audit Time Duration', 'Value': durationStr },
    { 'Metric': 'First Scan Timestamp', 'Value': earliestScan ? formatDateTime(earliestScan.toISOString()) : 'N/A' },
    { 'Metric': 'Last Scan Timestamp', 'Value': latestScan ? formatDateTime(latestScan.toISOString()) : 'N/A' }
  ];

  // 5. Create Workbook
  const wb = XLSX.utils.book_new();

  const wsAudit = XLSX.utils.json_to_sheet(auditData);
  const wsException = XLSX.utils.json_to_sheet(exceptions);
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);

  // Auto-fit column widths
  const fitWidth = (data) => {
    if (!data || data.length === 0) return [];
    const keys = Object.keys(data[0]);
    return keys.map((key) => {
      let maxLen = key.toString().length;
      data.forEach((row) => {
        const val = row[key];
        if (val !== undefined && val !== null) {
          maxLen = Math.max(maxLen, val.toString().length);
        }
      });
      return { wch: Math.min(maxLen + 3, 50) };
    });
  };

  wsAudit['!cols'] = fitWidth(auditData);
  wsException['!cols'] = fitWidth(exceptions);
  wsSummary['!cols'] = fitWidth(summaryData);

  XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit Report');
  XLSX.utils.book_append_sheet(wb, wsException, 'Exception Report');
  
  if (varianceReportData.length > 0) {
    const wsVariance = XLSX.utils.json_to_sheet(varianceReportData);
    wsVariance['!cols'] = fitWidth(varianceReportData);
    XLSX.utils.book_append_sheet(wb, wsVariance, 'Variance Reconciliation');
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Report');

  const fileName = `Audit_Avengers_Report_${clientName.replace(/\s+/g, '_')}_${formatDateTime(new Date()).split(' ')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

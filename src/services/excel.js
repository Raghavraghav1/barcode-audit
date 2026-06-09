import * as XLSX from 'xlsx';

/**
 * Formats a Date string into standard local format YYYY-MM-DD HH:MM:SS
 */
const formatDateTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return '';
  }
};

/**
 * Formats a duration in milliseconds to "X hrs Y mins Z secs"
 */
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

/**
 * Exports audit data to an Excel workbook containing Audit, Exception, and Summary sheets
 */
export const exportAuditToExcel = (records, sessionMetadata) => {
  const auditor = sessionMetadata?.auditor || 'Unknown';
  const clientName = sessionMetadata?.clientName || 'Unknown';
  const location = sessionMetadata?.location || 'Unknown';
  const auditDate = sessionMetadata?.auditDate || '';

  // 1. Prepare Audit Report Data
  const auditData = records.map((r) => ({
    'Barcode': r.barcode || '',
    'Item Code': r.itemCode || '',
    'Item Name': r.itemName || '',
    'Product': r.product || '',
    'Sub Category': r.subCategory || '',
    'SKU Type': r.skuType || '',
    'Pack Type': r.packType || '',
    'HSN': r.hsn || '',
    'Net Qty': typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0,
    'MRP': typeof r.mrp === 'number' ? r.mrp : Number(r.mrp) || 0,
    'MFD': r.mfd || '',
    'EXP': r.exp || '',
    'Batch Number': r.batchNumber || '',
    'Remarks': r.remarks || '',
    'Scanned At': formatDateTime(r.scannedAt),
    'Auditor': auditor,
    'Location': location
  }));

  // 2. Prepare Exception Report Data
  const exceptions = [];
  const scannedBarcodes = new Set();
  const duplicateBarcodes = new Set();

  // Find duplicate barcodes in the current session
  records.forEach((r) => {
    if (r.barcode) {
      if (scannedBarcodes.has(r.barcode)) {
        duplicateBarcodes.add(r.barcode);
      }
      scannedBarcodes.add(r.barcode);
    }
  });

  records.forEach((r) => {
    const reasons = [];

    // Rule 1: Net Qty mandatory and must be > 0
    const qty = typeof r.netQty === 'number' ? r.netQty : Number(r.netQty) || 0;
    if (qty <= 0) {
      reasons.push('Quantity must be greater than 0');
    }

    // Rule 2: MRP must be > 0
    const mrpVal = typeof r.mrp === 'number' ? r.mrp : Number(r.mrp) || 0;
    if (mrpVal <= 0) {
      reasons.push('MRP must be greater than 0');
    }

    // Rule 3: EXP > MFD
    if (r.mfd && r.exp) {
      const mfdDate = new Date(r.mfd);
      const expDate = new Date(r.exp);
      if (!isNaN(mfdDate.getTime()) && !isNaN(expDate.getTime()) && expDate <= mfdDate) {
        reasons.push('Expiry Date must be after Manufacturing Date');
      }
    }

    // Rule 4: Future date check
    const now = new Date();
    if (r.mfd && new Date(r.mfd) > now) {
      reasons.push('Manufacturing Date cannot be in the future');
    }
    if (r.exp && new Date(r.exp) > new Date(now.getFullYear() + 20, 11, 31)) {
      reasons.push('Expiry Date is excessively far in the future');
    }

    // Rule 5: Duplicate scans in session
    if (r.barcode && duplicateBarcodes.has(r.barcode)) {
      reasons.push('Duplicate barcode scan in active session');
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

  // 3. Prepare Summary Report Data
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
    { 'Metric': 'Audit Date', 'Value': auditDate || formatDateTime(new Date()).split(' ')[0] },
    { 'Metric': 'Total Scans Count', 'Value': records.length },
    { 'Metric': 'Unique Products Audited', 'Value': scannedBarcodes.size },
    { 'Metric': 'Total Items Count (Sum of Qty)', 'Value': totalQty },
    { 'Metric': 'Duplicate Scans Found', 'Value': duplicateBarcodes.size },
    { 'Metric': 'Exception Records Count', 'Value': exceptions.length },
    { 'Metric': 'Audit Duration', 'Value': durationStr },
    { 'Metric': 'First Scan At', 'Value': earliestScan ? formatDateTime(earliestScan.toISOString()) : 'N/A' },
    { 'Metric': 'Last Scan At', 'Value': latestScan ? formatDateTime(latestScan.toISOString()) : 'N/A' }
  ];

  // 4. Create Workbook
  const wb = XLSX.utils.book_new();

  // Create sheets
  const wsAudit = XLSX.utils.json_to_sheet(auditData);
  const wsException = XLSX.utils.json_to_sheet(exceptions);
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);

  // Auto-fit column widths (basic implementation)
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
      return { wch: Math.min(maxLen + 3, 50) }; // cap column width at 50 chars
    });
  };

  wsAudit['!cols'] = fitWidth(auditData);
  wsException['!cols'] = fitWidth(exceptions);
  wsSummary['!cols'] = fitWidth(summaryData);

  // Append sheets
  XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit Report');
  XLSX.utils.book_append_sheet(wb, wsException, 'Exception Report');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Report');

  // Write file
  const fileName = `Barcode_Audit_${clientName.replace(/\s+/g, '_')}_${formatDateTime(new Date()).split(' ')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

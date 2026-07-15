/**
 * Security & Validation Engine Service
 */

/**
 * Sanitizes input to protect against CSV/Excel Formula Injection and XSS vectors.
 * If a string begins with standard Excel formula characters (=, +, -, @),
 * we prepend a single quote to neutralize it. We also escape basic HTML tags.
 */
export const sanitizeInputText = (val) => {
  if (typeof val !== 'string') return val;
  let clean = val.trim();
  
  // Protect against Excel formula injection
  if (/^[=\+\-\@\t\r]/.test(clean)) {
    clean = `'${clean}`;
  }
  
  // Simple XSS sanitization by replacing HTML tag characters
  return clean
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

/**
 * Validates a single record entry in the audit logger.
 * Returns an object containing error messages if any validation rules fail.
 */
export const validateAuditRecord = (data, isNewBarcode) => {
  const errors = {};
  
  const bQty = Number(data.boxQty) || 0;
  const lQty = Number(data.looseQty) || 0;
  const unitsPerBox = Number(data.unitsPerBox) || 1;
  const totalQty = (bQty * unitsPerBox) + lQty;

  if (bQty < 0 || lQty < 0) {
    errors.quantity = 'Quantities cannot be negative';
  } else if (totalQty <= 0) {
    errors.quantity = 'At least one of Box Qty or Loose Qty is required and must be greater than 0';
  }

  if (isNaN(unitsPerBox) || unitsPerBox <= 0) {
    errors.unitsPerBox = 'Units per box must be greater than 0';
  }

  const mrpVal = Number(data.mrp);
  if (!data.mrp || isNaN(mrpVal) || mrpVal <= 0) {
    errors.mrp = 'MRP is required and must be greater than 0';
  }

  const now = new Date();

  if (data.mfd) {
    const mfdDate = new Date(data.mfd);
    if (isNaN(mfdDate.getTime())) {
      errors.mfd = 'Invalid Manufacturing Date';
    } else if (mfdDate > now) {
      errors.mfd = 'MFD cannot be in the future';
    }
  }

  if (data.exp) {
    const expDate = new Date(data.exp);
    if (isNaN(expDate.getTime())) {
      errors.exp = 'Invalid Expiry Date';
    } else if (data.mfd) {
      const mfdDate = new Date(data.mfd);
      if (!isNaN(mfdDate.getTime()) && expDate <= mfdDate) {
        errors.exp = 'EXP date must be after MFD date';
      }
    }
  }

  if (isNewBarcode && (!data.itemName || !data.itemName.trim())) {
    errors.itemName = 'Item name is required for unregistered products';
  }

  return errors;
};

/**
 * Checks for a duplicate scan of the same barcode and batch number.
 */
export const checkDuplicateBatchScan = (batchNumber, barcode, recordId, existingRecords) => {
  if (!batchNumber || !barcode) return false;
  
  const cleanBatch = batchNumber.trim().toUpperCase();
  return existingRecords.some(
    (r) => r.id !== recordId && r.barcode === barcode && r.batchNumber.trim().toUpperCase() === cleanBatch
  );
};

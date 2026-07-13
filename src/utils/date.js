/**
 * Parses a YYYY-MM-DD string into a local Date object without timezone shifting.
 */
export const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Formats a YYYY-MM-DD date string (or similar) into DD-MM-YYYY format.
 */
export const formatDateStr = (str) => {
  if (!str) return '';
  const parsed = parseLocalDate(str);
  if (!parsed) return str;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(parsed.getDate())}-${pad(parsed.getMonth() + 1)}-${parsed.getFullYear()}`;
};

/**
 * Formats an ISO datetime string into DD-MM-YYYY HH:MM:SS format.
 */
export const formatDateTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return '';
  }
};

/**
 * Computes shelf life statistics in days and percentage relative to the audit date.
 * All calculations are done in local timezone dates.
 */
export const calculateShelfLifeMetrics = (mfdStr, expStr, auditDateStr) => {
  const mfd = parseLocalDate(mfdStr);
  const exp = parseLocalDate(expStr);
  const audit = parseLocalDate(auditDateStr);

  if (!mfd || !exp || !audit) {
    return { shelvedDays: '', balDays: '', pct: '' };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  
  // Difference calculations
  const totalLife = Math.round((exp.getTime() - mfd.getTime()) / msPerDay);
  if (totalLife <= 0) {
    return { shelvedDays: '', balDays: '', pct: '' };
  }

  const shelvedDays = Math.round((audit.getTime() - mfd.getTime()) / msPerDay);
  const balDays = Math.round((exp.getTime() - audit.getTime()) / msPerDay);
  
  // Calculate percentage remaining: (Bal shelf life Days / Total shelf life Days) * 100
  const pct = Number(((balDays / totalLife) * 100).toFixed(2));

  return {
    shelvedDays,
    balDays,
    pct
  };
};

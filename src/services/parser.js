import * as XLSX from 'xlsx';

/**
 * Reads an uploaded file (XLSX, XLS, or CSV) in the browser
 * and parses its headers and rows.
 * @param {File} file - Browser File object
 * @returns {Promise<{headers: string[], rows: object[]}>}
 */
export const parseSpreadsheetFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (workbook.SheetNames.length === 0) {
          throw new Error('The uploaded file contains no sheets.');
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Extract headers in exact column order
        let headers = [];
        if (sheet['!ref']) {
          const range = XLSX.utils.decode_range(sheet['!ref']);
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ c: C, r: range.s.r });
            const cell = sheet[cellRef];
            const val = cell && cell.v !== undefined ? String(cell.v).trim() : `Column_${C + 1}`;
            headers.push(val);
          }
        }

        // Parse rows as objects
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Clean up keys of row objects to match standard header strings
        // (SheetJS might clean them up or trim them slightly differently)
        const cleanRows = rows.map((row) => {
          const cleanRow = {};
          // Map properties based on case-insensitive matches to headers
          headers.forEach((header) => {
            // Find key in row that matches header
            const key = Object.keys(row).find(
              (k) => k.trim().toLowerCase() === header.trim().toLowerCase()
            );
            cleanRow[header] = key !== undefined ? row[key] : '';
          });
          return cleanRow;
        });

        resolve({
          headers: headers.filter(Boolean),
          rows: cleanRows
        });
      } catch (err) {
        console.error('File parsing failed:', err);
        reject(new Error(err.message || 'Failed to parse spreadsheet file.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading error.'));
    };

    reader.readAsArrayBuffer(file);
  });
};

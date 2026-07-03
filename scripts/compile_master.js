import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const EXCEL_FILE = path.join(process.cwd(), 'Item Master.xlsx');
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'item_master.json');

try {
  console.log(`Reading Excel file from: ${EXCEL_FILE}...`);
  if (!fs.existsSync(EXCEL_FILE)) {
    throw new Error(`Item Master.xlsx not found at ${EXCEL_FILE}`);
  }

  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log(`Parsed ${rows.length} rows from sheet "${sheetName}".`);

  const lookupMap = {};
  let totalValid = 0;
  let totalMissingBarcode = 0;

  rows.forEach((row) => {
    const cleanRow = {};
    Object.keys(row).forEach((k) => {
      cleanRow[k.trim().toUpperCase()] = row[k];
    });

    const rawBarcode = cleanRow['BARCODE'];
    
    if (rawBarcode === undefined || rawBarcode === null || String(rawBarcode).trim() === '') {
      totalMissingBarcode++;
      return;
    }

    const barcode = String(rawBarcode).trim();

    const itemCode = cleanRow['ITEM CODE'] ? String(cleanRow['ITEM CODE']).trim() : '';
    const itemName = cleanRow['ITEM NAME'] ? String(cleanRow['ITEM NAME']).trim() : '';
    const product = cleanRow['PRODUCT'] ? String(cleanRow['PRODUCT']).trim() : '';
    const subCategory = cleanRow['SUB PRODUCT CATEGORY'] ? String(cleanRow['SUB PRODUCT CATEGORY']).trim() : '';
    const skuType = cleanRow['SKU TYPE'] ? String(cleanRow['SKU TYPE']).trim() : '';
    const packType = cleanRow['PACK TYPE'] ? String(cleanRow['PACK TYPE']).trim() : '';
    const hsn = cleanRow['HSN'] ? String(cleanRow['HSN']).trim() : '';
    const unitsPerBox = cleanRow['UNIT/PACK'] ? Number(cleanRow['UNIT/PACK']) || 1 : 1;

    const record = {
      barcode,
      itemCode,
      itemName,
      product,
      subCategory,
      skuType,
      packType,
      hsn,
      unitsPerBox
    };

    if (!lookupMap[barcode]) {
      lookupMap[barcode] = [];
    }
    
    const isDuplicate = lookupMap[barcode].some(r => 
      r.itemCode === record.itemCode && 
      r.itemName === record.itemName && 
      r.unitsPerBox === record.unitsPerBox
    );
    
    if (!isDuplicate) {
      lookupMap[barcode].push(record);
      totalValid++;
    }
  });

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(lookupMap, null, 2), 'utf-8');
  console.log(`\nCompilation finished successfully!`);
  console.log(`Processed records with barcode: ${totalValid}`);
  console.log(`Records skipped due to missing barcode: ${totalMissingBarcode}`);
  console.log(`Unique barcode groups: ${Object.keys(lookupMap).length}`);
  console.log(`Saved compiled lookup database to: ${OUTPUT_FILE}`);

} catch (err) {
  console.error("Compilation error:", err.message);
  process.exit(1);
}

import React, { useState, useEffect } from 'react';
import { useSession } from '../store/SessionContext';
import { parseSpreadsheetFile } from '../services/parser';
import { 
  ClipboardList, Upload, MapPin, User, Calendar, CheckCircle2, 
  Sparkles, Layers, ArrowRight, ShieldAlert, BookOpen, AlertTriangle
} from 'lucide-react';

// Synonym mapping dictionaries for Auto-detection
const MASTER_SYNONYMS = {
  barcodeCol: ['barcode', 'ean', 'upc', 'code', 'barcode number', 'item barcode', 'material barcode'],
  nameCol: ['name', 'description', 'desc', 'title', 'item name', 'display name', 'material name', 'product name'],
  itemCodeCol: ['itemcode', 'item code', 'material number', 'material no', 'material num', 'sku code', 'product code', 'id'],
  productCol: ['product', 'group', 'category', 'department', 'family', 'division'],
  subCategoryCol: ['subcategory', 'sub category', 'category', 'group'],
  skuTypeCol: ['sku type', 'skutype', 'type', 'channel', 'status'],
  packTypeCol: ['pack type', 'packtype', 'pack', 'packaging', 'container'],
  hsnCol: ['hsn', 'hsn code', 'hsncode', 'tax code', 'taxcode'],
  unitsPerBoxCol: ['unit/pack', 'units/pack', 'units per pack', 'units per box', 'pack size', 'box size', 'case size', 'qty/pack', 'qty per pack', 'quantity per pack']
};

const BOOK_SYNONYMS = {
  barcodeCol: ['barcode', 'ean', 'upc', 'code', 'barcode number', 'item barcode'],
  qtyCol: ['qty', 'quantity', 'stock', 'book', 'system', 'system qty', 'book qty', 'stock qty', 'current stock']
};

// Smart columns auto-detection utility
const autoDetectColumn = (headers, synonyms) => {
  if (!headers || headers.length === 0) return '';
  
  // Clean headers (lowercase, strip space/underscores)
  const cleanHeaders = headers.map(h => ({
    raw: h,
    clean: h.toLowerCase().trim().replace(/[\s_\-]/g, '')
  }));

  for (const synonym of synonyms) {
    const cleanSyn = synonym.toLowerCase().replace(/[\s_\-]/g, '');
    
    // Look for exact matches first
    const exact = cleanHeaders.find(h => h.clean === cleanSyn);
    if (exact) return exact.raw;

    // Look for substring matches
    const substring = cleanHeaders.find(h => h.clean.includes(cleanSyn) || cleanSyn.includes(h.clean));
    if (substring) return substring.raw;
  }
  
  return headers[0]; // fallback
};

export default function SetupWizard() {
  const {
    setupStep,
    templates,
    startSetup,
    saveMasterCatalog,
    saveBookStockCatalog,
    skipBookStock,
    saveColumnPreferences,
    saveMappingTemplate
  } = useSession();

  const ALL_COLUMNS = [
    'Barcode', 'Item Code', 'Item Name', 'Product Group', 'Sub Category',
    'SKU Type', 'Pack Type', 'HSN', 'Box Qty', 'Loose Qty', 'Units Per Box',
    'Physical Total Qty', 'MRP', 'MFD', 'EXP', 'Shelved shelf life Days (elapsed days)',
    'Bal shelf life Days', 'Shelf-Life in %', 'Batch Number', 'Remarks',
    'Scanned At', 'Auditor', 'Location'
  ];

  const MANDATORY_COLUMNS = ['Barcode', 'Item Name', 'Physical Total Qty', 'MRP'];

  const [selectedCols, setSelectedCols] = useState(ALL_COLUMNS);

  const handleToggleColumn = (col) => {
    if (MANDATORY_COLUMNS.includes(col)) return;
    setSelectedCols(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleSelectAllCols = () => {
    setSelectedCols(ALL_COLUMNS);
  };

  const handleClearOptionalCols = () => {
    setSelectedCols(MANDATORY_COLUMNS);
  };

  // Step 1: Session Details States
  const [auditorName, setAuditorName] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [scanType, setScanType] = useState('audit'); // 'audit' | 'inward' | 'outward'

  // Step 2: Master File States
  const [masterFile, setMasterFile] = useState(null);
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterRows, setMasterRows] = useState([]);
  const [masterMapping, setMasterMapping] = useState({
    barcodeCol: '',
    nameCol: '',
    itemCodeCol: '',
    productCol: '',
    subCategoryCol: '',
    skuTypeCol: '',
    packTypeCol: '',
    hsnCol: '',
    unitsPerBoxCol: ''
  });
  const [customCols, setCustomCols] = useState([]); // Array of { id: string, key: string, col: string }

  const handleAddCustomCol = () => {
    setCustomCols(prev => [...prev, { id: String(Date.now()), key: '', col: '' }]);
  };

  const handleUpdateCustomCol = (id, field, value) => {
    setCustomCols(prev => prev.map(cc => cc.id === id ? { ...cc, [field]: value } : cc));
  };

  const handleRemoveCustomCol = (id) => {
    setCustomCols(prev => prev.filter(cc => cc.id !== id));
  };
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);
  const [masterError, setMasterError] = useState('');
  const [parsingFile, setParsingFile] = useState(false);
  const [ingestingData, setIngestingData] = useState(false);

  // Step 3: Book Stock States
  const [bookFile, setBookFile] = useState(null);
  const [bookHeaders, setBookHeaders] = useState([]);
  const [bookRows, setBookRows] = useState([]);
  const [bookMapping, setBookMapping] = useState({
    barcodeCol: '',
    qtyCol: ''
  });
  const [bookError, setBookError] = useState('');

  // Apply templates
  const handleTemplateChange = (e) => {
    const name = e.target.value;
    setSelectedTemplateName(name);
    
    if (name) {
      const t = templates.find(temp => temp.clientName === name);
      if (t) {
        setClientName(t.clientName);
        if (t.mapping) {
          setMasterMapping(t.mapping);
          if (t.mapping.customCols) {
            setCustomCols(t.mapping.customCols);
          } else {
            setCustomCols([]);
          }
        }
        if (t.bookMapping) setBookMapping(t.bookMapping);
      }
    }
  };

  // Step 1 Submit
  const handleDetailsSubmit = (e) => {
    e.preventDefault();
    if (!auditorName.trim() || !clientName.trim() || !location.trim() || !auditDate) {
      setSessionError('All metadata fields are required to start an audit session.');
      return;
    }
    setSessionError('');
    startSetup({
      auditor: auditorName.trim(),
      clientName: clientName.trim(),
      location: location.trim(),
      auditDate: auditDate,
      scanType: scanType
    });
  };

  // Step 2 Upload Master
  const handleMasterUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMasterFile(file);
    setMasterError('');
    setParsingFile(true);

    try {
      const { headers, rows } = await parseSpreadsheetFile(file);
      setMasterHeaders(headers);
      setMasterRows(rows);

      // Auto-detect mappings using synonyms
      const newMapping = {};
      Object.keys(MASTER_SYNONYMS).forEach(field => {
        newMapping[field] = autoDetectColumn(headers, MASTER_SYNONYMS[field]);
      });
      setMasterMapping(newMapping);
    } catch (err) {
      setMasterError(err.message || 'Failed to parse master file.');
      setMasterFile(null);
    } finally {
      setParsingFile(false);
    }
  };

  // Step 2 Ingest
  const handleMasterIngest = async () => {
    if (!masterMapping.barcodeCol || !masterMapping.nameCol) {
      setMasterError('Barcode Column and Product Name Column are mandatory mappings.');
      return;
    }

    setIngestingData(true);
    setMasterError('');
    
    try {
      const mappingWithCustom = {
        ...masterMapping,
        customCols: customCols.filter(cc => cc.key.trim() && cc.col)
      };

      // Map parsed raw rows to standard structure based on user selected columns
      const standardizedItems = masterRows.map((r) => {
        const item = {
          barcode: String(r[masterMapping.barcodeCol] || '').trim(),
          itemCode: String(r[masterMapping.itemCodeCol] || '').trim(),
          itemName: String(r[masterMapping.nameCol] || '').trim(),
          product: String(r[masterMapping.productCol] || '').trim(),
          subCategory: String(r[masterMapping.subCategoryCol] || '').trim(),
          skuType: String(r[masterMapping.skuTypeCol] || '').trim(),
          packType: String(r[masterMapping.packTypeCol] || '').trim(),
          hsn: String(r[masterMapping.hsnCol] || '').trim(),
          unitsPerBox: Number(r[masterMapping.unitsPerBoxCol]) || 1,
          customFields: {}
        };
        
        mappingWithCustom.customCols.forEach((cc) => {
          item.customFields[cc.key.trim()] = String(r[cc.col] || '').trim();
        });

        return item;
      });

      // Deduplicate master items to prevent multiple identical options in SKU selector
      const uniqueItemsMap = new Map();
      standardizedItems.forEach((item) => {
        const customFieldsStr = JSON.stringify(item.customFields);
        const key = `${item.barcode}_${item.itemCode}_${item.itemName}_${item.unitsPerBox}_${customFieldsStr}`;
        if (!uniqueItemsMap.has(key)) {
          uniqueItemsMap.set(key, item);
        }
      });
      const deduplicatedItems = Array.from(uniqueItemsMap.values());

      // Ingest to IndexedDB
      await saveMasterCatalog(deduplicatedItems, mappingWithCustom);

      // Save template if checked
      if (saveAsTemplate) {
        await saveMappingTemplate(clientName, mappingWithCustom, bookMapping);
      }
    } catch (err) {
      setMasterError('IndexedDB Ingestion failed: ' + (err.message || err.toString()));
    } finally {
      setIngestingData(false);
    }
  };

  // Step 3 Upload Book Stock
  const handleBookUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBookFile(file);
    setBookError('');
    setParsingFile(true);

    try {
      const { headers, rows } = await parseSpreadsheetFile(file);
      setBookHeaders(headers);
      setBookRows(rows);

      // Auto-detect mappings
      const newMapping = {};
      Object.keys(BOOK_SYNONYMS).forEach(field => {
        newMapping[field] = autoDetectColumn(headers, BOOK_SYNONYMS[field]);
      });
      setBookMapping(newMapping);
    } catch (err) {
      setBookError(err.message || 'Failed to parse book stock file.');
      setBookFile(null);
    } finally {
      setParsingFile(false);
    }
  };

  // Step 3 Ingest
  const handleBookIngest = async () => {
    if (!bookMapping.barcodeCol || !bookMapping.qtyCol) {
      setBookError('Barcode Column and Book Quantity Column are mandatory mappings.');
      return;
    }

    setIngestingData(true);
    setBookError('');

    try {
      // Standardize and aggregate book stock items by summing quantities of duplicate barcodes
      const aggregatedStockMap = new Map();
      bookRows.forEach((r) => {
        const barcode = String(r[bookMapping.barcodeCol] || '').trim();
        const qty = Number(r[bookMapping.qtyCol]) || 0;
        if (barcode) {
          aggregatedStockMap.set(barcode, (aggregatedStockMap.get(barcode) || 0) + qty);
        }
      });
      const standardizedStock = Array.from(aggregatedStockMap.entries()).map(([barcode, qty]) => ({
        barcode,
        qty
      }));

      await saveBookStockCatalog(standardizedStock, bookMapping);
      
      // Update template with book mapping
      await saveMappingTemplate(clientName, masterMapping, bookMapping);
    } catch (err) {
      setBookError('IndexedDB Ingestion failed: ' + (err.message || err.toString()));
    } finally {
      setIngestingData(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto my-6 p-4">
      {/* Onboarding Steps Indicators */}
      <div className="flex items-center justify-between mb-8 max-w-2xl mx-auto">
        <div className="flex flex-col items-center">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-bold text-sm transition-all duration-300 ${
            setupStep === 'metadata' 
              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)]' 
              : 'bg-teal-600/30 border-teal-500 text-teal-400'
          }`}>
            1
          </div>
          <span className="text-xs text-slate-400 mt-2 font-medium">Session Info</span>
        </div>
        <div className="flex-1 h-0.5 bg-slate-800 mx-2" />
        <div className="flex flex-col items-center">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-bold text-sm transition-all duration-300 ${
            setupStep === 'master_upload' 
              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
              : setupStep === 'book_stock_upload' || setupStep === 'column_select' || setupStep === 'active'
              ? 'bg-teal-600/30 border-teal-500 text-teal-400'
              : 'bg-slate-900 border-slate-800 text-slate-600'
          }`}>
            2
          </div>
          <span className="text-xs text-slate-400 mt-2 font-medium">Map Master</span>
        </div>
        <div className="flex-1 h-0.5 bg-slate-800 mx-2" />
        <div className="flex flex-col items-center">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-bold text-sm transition-all duration-300 ${
            setupStep === 'book_stock_upload' 
              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)]' 
              : setupStep === 'column_select' || setupStep === 'active'
              ? 'bg-teal-600/30 border-teal-500 text-teal-400'
              : 'bg-slate-900 border-slate-800 text-slate-600'
          }`}>
            3
          </div>
          <span className="text-xs text-slate-400 mt-2 font-medium">Book Stock</span>
        </div>
        <div className="flex-1 h-0.5 bg-slate-800 mx-2" />
        <div className="flex flex-col items-center">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center border font-bold text-sm transition-all duration-300 ${
            setupStep === 'column_select' 
              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)]' 
              : setupStep === 'active'
              ? 'bg-teal-600/30 border-teal-500 text-teal-400'
              : 'bg-slate-900 border-slate-800 text-slate-600'
          }`}>
            4
          </div>
          <span className="text-xs text-slate-400 mt-2 font-medium">Report Columns</span>
        </div>
      </div>

      {/* Hero Header Section */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
          Audit Avengers Operations Control
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
          Configure a dynamic barcode audit engine tailored to any client database.
        </p>
      </div>

      {/* STEP 1: METADATA & CLIENT INFO */}
      {setupStep === 'metadata' && (
        <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden animate-zoom-in grid grid-cols-1 md:grid-cols-2">
          {/* Left panel: Info & Visual placeholder */}
          <div className="bg-gradient-to-br from-amber-600/10 via-orange-600/5 to-slate-950 p-8 flex flex-col justify-between border-r border-slate-800">
            <div className="space-y-4">
              <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Setup Protocol
              </span>
              <h3 className="text-xl font-bold text-slate-50">Enterprise Auditor Console</h3>
              <p className="text-xs leading-relaxed text-slate-400">
                Initialize an audit session by entering Auditor metadata and selecting client configuration mappings. 
                If this client has been audited before, select their mapping template to auto-fill configurations.
              </p>
            </div>
            
            {/* Visual Barcode SVG illustration */}
            <div className="my-6 flex justify-center">
              <svg className="w-48 h-28 text-amber-500/30" viewBox="0 0 100 50" fill="currentColor">
                <rect x="5" y="5" width="2" height="40" />
                <rect x="10" y="5" width="4" height="40" />
                <rect x="17" y="5" width="1" height="40" />
                <rect x="20" y="5" width="3" height="40" />
                <rect x="26" y="5" width="2" height="40" />
                <rect x="30" y="5" width="5" height="40" />
                <rect x="38" y="5" width="1" height="40" />
                <rect x="42" y="5" width="2" height="40" />
                <rect x="47" y="5" width="3" height="40" />
                <rect x="52" y="5" width="4" height="40" />
                <rect x="58" y="5" width="1" height="40" />
                <rect x="62" y="5" width="2" height="40" />
                <rect x="67" y="5" width="4" height="40" />
                <rect x="73" y="5" width="2" height="40" />
                <rect x="77" y="5" width="3" height="40" />
                <rect x="83" y="5" width="1" height="40" />
                <rect x="86" y="5" width="2" height="40" />
                <rect x="91" y="5" width="4" height="40" />
                <line x1="0" y1="25" x2="100" y2="25" stroke="#f59e0b" strokeWidth="1.5" className="animate-pulse" />
              </svg>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">SYSTEM READY // IDB LOG v2.0</p>
          </div>

          {/* Right panel: Setup Form */}
          <form onSubmit={handleDetailsSubmit} className="p-8 space-y-4 flex flex-col justify-center">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Audit Parameters</h4>
            
            {sessionError && (
              <p className="p-3 text-xs bg-red-950/40 border border-red-900/30 text-red-400 rounded-xl font-medium">
                {sessionError}
              </p>
            )}

            {/* Template select */}
            {templates.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Apply Saved Mappings</label>
                <select
                  value={selectedTemplateName}
                  onChange={handleTemplateChange}
                  className="w-full bg-slate-950 border border-slate-700/60 rounded-xl px-4 py-2.5 text-xs text-amber-400 focus:outline-none focus:border-amber-500 transition-colors"
                >
                  <option value="">-- Start New Mapping --</option>
                  {templates.map(t => (
                    <option key={t.clientName} value={t.clientName}>
                      {t.clientName} (Mapping Config)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Auditor Name
              </label>
              <input
                type="text"
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
                placeholder="Enter auditor's full name"
                className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client account e.g. Reliance Retail"
                className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Warehouse Site / Bay Number"
                className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Audit Date
              </label>
              <input
                type="date"
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 animate-pulse" /> Operation Flow (Scanning Type)
              </label>
              <select
                value={scanType}
                onChange={(e) => setScanType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors font-bold"
              >
                <option value="audit">Audit (Stock Take)</option>
                <option value="inward">Inward (+)</option>
                <option value="outward">Outward (-)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full mt-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold py-3 rounded-xl transition shadow-lg shadow-orange-950/20 hover:shadow-xl flex items-center justify-center gap-1.5"
            >
              Start Setup Session
              <ArrowRight className="h-4 w-4 text-slate-950" />
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: MASTER FILE UPLOAD & MAPPING */}
      {setupStep === 'master_upload' && (
        <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-700/60 shadow-2xl p-8 animate-zoom-in">
          <h3 className="text-xl font-bold text-slate-50 mb-2 flex items-center gap-2">
            <Upload className="h-5 w-5 text-amber-500" />
            Upload Master Catalog File
          </h3>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Upload the item catalog (Excel/CSV) containing item codes, barcodes, names, and subcategories. 
            The system will read the headers and automatically suggest mapping values.
          </p>

          {masterError && (
            <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/5 text-red-400 text-xs mb-6 flex items-start gap-2">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              <span>{masterError}</span>
            </div>
          )}

          {/* File input / dropper */}
          {!masterFile ? (
            <div className="border-2 border-dashed border-slate-700 rounded-2xl p-10 text-center bg-slate-950/20 hover:border-amber-500/50 transition cursor-pointer relative group">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleMasterUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="h-10 w-10 mx-auto text-slate-500 mb-3 group-hover:text-amber-400 group-hover:scale-105 transition-all" />
              {parsingFile ? (
                <p className="text-sm text-amber-400 font-semibold animate-pulse">Reading file columns...</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-300">Click to upload or drag & drop spreadsheet</p>
                  <p className="text-xs text-slate-500 mt-1">Accepts XLSX, XLS, or CSV files (max 20MB)</p>
                </>
              )}
            </div>
          ) : (
            /* Column Mapping Form */
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Selected File</span>
                  <p className="text-sm font-semibold text-teal-400 font-mono truncate">{masterFile.name}</p>
                </div>
                <button
                  onClick={() => {
                    setMasterFile(null);
                    setMasterHeaders([]);
                    setMasterRows([]);
                  }}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Change File
                </button>
              </div>

              {/* Grid Mapping form */}
              <div>
                <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                  Smart Column Mappings
                </h4>
                <p className="text-xs text-slate-400 mb-4">
                  Match the target audit fields to the corresponding columns detected in your uploaded file.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Barcode mapping */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Barcode Column <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={masterMapping.barcodeCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, barcodeCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Name mapping */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Product Name Column <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={masterMapping.nameCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, nameCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Item Code */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Item Code Column</label>
                    <select
                      value={masterMapping.itemCodeCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, itemCodeCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Product Category */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Product Category Column</label>
                    <select
                      value={masterMapping.productCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, productCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Sub category */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Sub-Category Column</label>
                    <select
                      value={masterMapping.subCategoryCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, subCategoryCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* SKU Type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">SKU Type Column</label>
                    <select
                      value={masterMapping.skuTypeCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, skuTypeCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Pack Type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Pack Type Column</label>
                    <select
                      value={masterMapping.packTypeCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, packTypeCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* HSN */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">HSN Column</label>
                    <select
                      value={masterMapping.hsnCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, hsnCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Units Per Box */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Units Per Box (Pack Size) Column</label>
                    <select
                      value={masterMapping.unitsPerBoxCol}
                      onChange={(e) => setMasterMapping({ ...masterMapping, unitsPerBoxCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                {/* Custom Column Mappings Section */}
                <div className="border-t border-slate-800 pt-6 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-amber-400" />
                        Custom Mapped Columns
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">
                        Auditing additional data? Map any other columns from your spreadsheet here.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomCol}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition cursor-pointer"
                    >
                      + Add Custom Column
                    </button>
                  </div>

                  {customCols.length === 0 ? (
                    <p className="text-xs text-slate-500 italic bg-slate-950/20 p-3.5 rounded-xl border border-dashed border-slate-800 text-center font-medium">
                      No custom columns mapped yet. Click button above to map custom fields.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {customCols.map((cc) => (
                        <div key={cc.id} className="flex flex-col sm:flex-row gap-3 items-end sm:items-center bg-slate-950/20 border border-slate-800 p-3.5 rounded-xl animate-fade-in">
                          <div className="flex-1 w-full">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Field Label / Key</label>
                            <input
                              type="text"
                              placeholder="e.g. Brand, Vendor, Rack No"
                              value={cc.key}
                              onChange={(e) => handleUpdateCustomCol(cc.id, 'key', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-bold"
                            />
                          </div>
                          <div className="flex-1 w-full">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Excel Column Header</label>
                            <select
                              value={cc.col}
                              onChange={(e) => handleUpdateCustomCol(cc.id, 'col', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                            >
                              <option value="">-- Select Excel Header --</option>
                              {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomCol(cc.id)}
                            className="px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition text-xs font-semibold cursor-pointer border border-rose-500/20 shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Save Template Checkbox */}
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/20 border border-slate-800">
                <input
                  id="save-template-cb"
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="h-4.5 w-4.5 text-amber-500 rounded bg-slate-950 border-slate-700 focus:ring-0"
                />
                <label htmlFor="save-template-cb" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                  Save this configuration template for future audits (Client: {clientName})
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={handleMasterIngest}
                  disabled={ingestingData || !masterMapping.barcodeCol || !masterMapping.nameCol}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm shadow-md transition disabled:opacity-40 flex items-center gap-1.5"
                >
                  {ingestingData ? 'Ingesting rows...' : 'Process Master File'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: BOOK STOCK FILE UPLOAD (OPTIONAL) */}
      {setupStep === 'book_stock_upload' && (
        <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-700/60 shadow-2xl p-8 animate-zoom-in">
          <h3 className="text-xl font-bold text-slate-50 mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-amber-500" />
            Upload Book Stock / Dump File (Optional)
          </h3>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Upload the system stock report (ERP/SAP export) containing barcode keys and current system quantities. 
            This enables real-time physical stock reconciliation and variance calculations.
          </p>

          {bookError && (
            <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/5 text-red-400 text-xs mb-6 flex items-start gap-2">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              <span>{bookError}</span>
            </div>
          )}

          {!bookFile ? (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-700 rounded-2xl p-10 text-center bg-slate-950/20 hover:border-amber-500/50 transition cursor-pointer relative group">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleBookUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="h-10 w-10 mx-auto text-slate-500 mb-3 group-hover:text-amber-400 group-hover:scale-105 transition-all" />
                {parsingFile ? (
                  <p className="text-sm text-amber-400 font-semibold animate-pulse">Reading file columns...</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-300">Click to upload or drag & drop Book Stock file</p>
                    <p className="text-xs text-slate-500 mt-1">Accepts XLSX, XLS, or CSV files</p>
                  </>
                )}
              </div>

              {/* Skipper Option */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/5 border border-amber-500/25 text-amber-400 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Reconciliation will be disabled if skipped</p>
                    <p className="opacity-80 mt-0.5">You can still upload Book Stock later at any point during the audit.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={skipBookStock}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition"
                >
                  Skip & Start Audit
                </button>
              </div>
            </div>
          ) : (
            /* Mapping Book Stock Form */
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Book Stock File</span>
                  <p className="text-sm font-semibold text-teal-400 font-mono truncate">{bookFile.name}</p>
                </div>
                <button
                  onClick={() => {
                    setBookFile(null);
                    setBookHeaders([]);
                    setBookRows([]);
                  }}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Change File
                </button>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                  Book Stock Column Mappings
                </h4>
                <p className="text-xs text-slate-400 mb-4">
                  Match the Barcode and System Quantity values.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Barcode mapping */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Barcode Column <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={bookMapping.barcodeCol}
                      onChange={(e) => setBookMapping({ ...bookMapping, barcodeCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {bookHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Quantity mapping */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      System Quantity Column <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={bookMapping.qtyCol}
                      onChange={(e) => setBookMapping({ ...bookMapping, qtyCol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select Column --</option>
                      {bookHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={skipBookStock}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-755 text-slate-400 hover:text-slate-200 transition text-sm font-semibold"
                >
                  Skip & Start Audit
                </button>
                <button
                  onClick={handleBookIngest}
                  disabled={ingestingData || !bookMapping.barcodeCol || !bookMapping.qtyCol}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm shadow-md transition disabled:opacity-40 flex items-center gap-1.5"
                >
                  {ingestingData ? 'Processing...' : 'Reconcile & Start Audit'}
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: COLUMN SELECTION */}
      {setupStep === 'column_select' && (
        <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-700/60 shadow-2xl p-8 animate-zoom-in">
          <h3 className="text-xl font-bold text-slate-50 mb-2 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-amber-500" />
            Configure Report Columns
          </h3>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Select the columns that you want to include in the exported Audit Excel Report.
            Core columns are mandatory and cannot be disabled.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            
            {/* Category 1: Product Details */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-800">
                Product Details
              </h4>
              <div className="space-y-2.5">
                {['Barcode', 'Item Code', 'Item Name', 'Product Group', 'Sub Category', 'SKU Type', 'Pack Type', 'HSN'].map((col) => {
                  const isMandatory = ['Barcode', 'Item Name'].includes(col);
                  const isChecked = selectedCols.includes(col);
                  return (
                    <label key={col} className="flex items-center gap-2.5 text-xs text-slate-300 font-medium select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isMandatory}
                        onChange={() => handleToggleColumn(col)}
                        className="h-4.5 w-4.5 text-amber-500 rounded bg-slate-950 border-slate-700 focus:ring-0 disabled:opacity-55"
                      />
                      <span>{col}</span>
                      {isMandatory && <span className="text-[10px] text-slate-500">(Required)</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Category 2: Quantities & Verification */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-800">
                Quantities & Dates
              </h4>
              <div className="space-y-2.5">
                {['Box Qty', 'Loose Qty', 'Units Per Box', 'Physical Total Qty', 'MRP', 'MFD', 'EXP', 'Batch Number', 'Remarks'].map((col) => {
                  const isMandatory = ['Physical Total Qty', 'MRP'].includes(col);
                  const isChecked = selectedCols.includes(col);
                  return (
                    <label key={col} className="flex items-center gap-2.5 text-xs text-slate-300 font-medium select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isMandatory}
                        onChange={() => handleToggleColumn(col)}
                        className="h-4.5 w-4.5 text-amber-500 rounded bg-slate-950 border-slate-700 focus:ring-0 disabled:opacity-55"
                      />
                      <span>{col}</span>
                      {isMandatory && <span className="text-[10px] text-slate-500">(Required)</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Category 3: Calculations & Metadata */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-800">
                Calculations & Session
              </h4>
              <div className="space-y-2.5">
                {['Shelved shelf life Days (elapsed days)', 'Bal shelf life Days', 'Shelf-Life in %', 'Scanned At', 'Auditor', 'Location'].map((col) => {
                  const isChecked = selectedCols.includes(col);
                  return (
                    <label key={col} className="flex items-center gap-2.5 text-xs text-slate-300 font-medium select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleColumn(col)}
                        className="h-4.5 w-4.5 text-amber-500 rounded bg-slate-950 border-slate-700 focus:ring-0"
                      />
                      <span className="leading-tight">{col}</span>
                    </label>
                  );
                })}
              </div>
            </div>

          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllCols}
                className="px-3 py-1.5 rounded bg-slate-850 hover:bg-slate-800 text-xs text-slate-300 transition"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearOptionalCols}
                className="px-3 py-1.5 rounded bg-slate-850 hover:bg-slate-800 text-xs text-slate-300 transition"
              >
                Reset to Core
              </button>
            </div>
            
            <button
              onClick={() => saveColumnPreferences(selectedCols)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm shadow-md transition flex items-center gap-1.5 cursor-pointer animate-pulse"
            >
              Start Active Audit
              <CheckCircle2 className="h-4.5 w-4.5 text-slate-950" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

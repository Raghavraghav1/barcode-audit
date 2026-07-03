import React, { useState, useMemo } from 'react';
import { useSession } from '../store/SessionContext';
import { parseSpreadsheetFile } from '../services/parser';
import { 
  AlertTriangle, CheckCircle, Search, ArrowDownCircle, 
  ArrowUpCircle, ShieldCheck, Upload, BookOpen, Sparkles
} from 'lucide-react';

const BOOK_SYNONYMS = {
  barcodeCol: ['barcode', 'ean', 'upc', 'code', 'barcode number', 'item barcode'],
  qtyCol: ['qty', 'quantity', 'stock', 'book', 'system', 'system qty', 'book qty', 'stock qty', 'current stock']
};

const autoDetectColumn = (headers, synonyms) => {
  if (!headers || headers.length === 0) return '';
  const cleanHeaders = headers.map(h => ({
    raw: h,
    clean: h.toLowerCase().trim().replace(/[\s_\-]/g, '')
  }));
  for (const synonym of synonyms) {
    const cleanSyn = synonym.toLowerCase().replace(/[\s_\-]/g, '');
    const exact = cleanHeaders.find(h => h.clean === cleanSyn);
    if (exact) return exact.raw;
    const substring = cleanHeaders.find(h => h.clean.includes(cleanSyn) || cleanSyn.includes(h.clean));
    if (substring) return substring.raw;
  }
  return headers[0];
};

export default function Reconciliation() {
  const {
    sessionMetadata,
    records,
    bookStock,
    saveBookStockCatalog
  } = useSession();

  // Internal upload states for uploading mid-session
  const [bookFile, setBookFile] = useState(null);
  const [bookHeaders, setBookHeaders] = useState([]);
  const [bookRows, setBookRows] = useState([]);
  const [bookMapping, setBookMapping] = useState({ barcodeCol: '', qtyCol: '' });
  const [uploadError, setUploadError] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Table states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('mismatch'); // 'all', 'mismatch', 'deficit', 'surplus', 'matched'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const hasBookStock = sessionMetadata?.hasBookStock && bookStock && bookStock.length > 0;
  
  // Mid-session upload handlers
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBookFile(file);
    setUploadError('');
    setLoadingFile(true);

    try {
      const { headers, rows } = await parseSpreadsheetFile(file);
      setBookHeaders(headers);
      setBookRows(rows);

      const newMapping = {};
      Object.keys(BOOK_SYNONYMS).forEach(field => {
        newMapping[field] = autoDetectColumn(headers, BOOK_SYNONYMS[field]);
      });
      setBookMapping(newMapping);
    } catch (err) {
      setUploadError(err.message || 'Failed to parse file.');
      setBookFile(null);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleIngestSubmit = async () => {
    if (!bookMapping.barcodeCol || !bookMapping.qtyCol) {
      setUploadError('Barcode Column and Book Quantity Column are required.');
      return;
    }
    setProcessing(true);
    setUploadError('');
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
    } catch (err) {
      setUploadError('Failed to save book stock: ' + (err.message || err.toString()));
    } finally {
      setProcessing(false);
    }
  };

  // Reconciled list calculator
  const reconciledList = useMemo(() => {
    if (!hasBookStock) return [];

    const barcodeKey = sessionMetadata.bookMapping?.barcodeCol;
    const qtyKey = sessionMetadata.bookMapping?.qtyCol;
    const itemCodeKey = sessionMetadata.mapping?.itemCodeCol;
    const itemNameKey = sessionMetadata.mapping?.nameCol;

    // 1. Group physical scans
    const scannedQtyMap = {};
    records.forEach((r) => {
      if (r.barcode) {
        const qty = Number(r.netQty) || 0;
        scannedQtyMap[r.barcode] = (scannedQtyMap[r.barcode] || 0) + qty;
      }
    });

    // 2. Group book stock
    const bookStockMap = {};
    bookStock.forEach((item) => {
      if (item.barcode) {
        bookStockMap[item.barcode] = item.qty;
      }
    });

    // 3. Union of all barcodes
    const allBarcodes = new Set([
      ...Object.keys(bookStockMap),
      ...Object.keys(scannedQtyMap)
    ]);

    return Array.from(allBarcodes).map((barcode) => {
      const bookQty = bookStockMap[barcode] || 0;
      const scannedQty = scannedQtyMap[barcode] || 0;
      const variance = scannedQty - bookQty;

      // Find item details from records or book stock mapping
      const physicalMatch = records.find(r => r.barcode === barcode);
      const itemName = physicalMatch?.itemName || `Item ${barcode}`;
      const itemCode = physicalMatch?.itemCode || 'MANUAL';

      let status = 'matched';
      if (variance < 0) status = 'deficit';
      if (variance > 0) status = 'surplus';

      return {
        barcode,
        itemCode,
        itemName,
        bookQty,
        scannedQty,
        variance,
        status
      };
    });
  }, [records, bookStock, sessionMetadata, hasBookStock]);

  // Filtered List
  const filteredList = useMemo(() => {
    return reconciledList.filter((item) => {
      const searchLower = searchQuery.toLowerCase().trim();
      const matchesSearch = !searchLower || 
        item.barcode.toLowerCase().includes(searchLower) ||
        item.itemName.toLowerCase().includes(searchLower) ||
        item.itemCode.toLowerCase().includes(searchLower);

      let matchesStatus = true;
      if (statusFilter === 'mismatch') matchesStatus = item.variance !== 0;
      else if (statusFilter === 'deficit') matchesStatus = item.variance < 0;
      else if (statusFilter === 'surplus') matchesStatus = item.variance > 0;
      else if (statusFilter === 'matched') matchesStatus = item.variance === 0;

      return matchesSearch && matchesStatus;
    });
  }, [reconciledList, searchQuery, statusFilter]);

  // Sorted List
  const sortedList = useMemo(() => {
    // Sort deficits first (descending magnitude of variance), then surplus, then matched
    return [...filteredList].sort((a, b) => {
      return a.variance - b.variance;
    });
  }, [filteredList]);

  // Paginated List
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedList.slice(start, start + pageSize);
  }, [sortedList, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedList.length / pageSize));

  // KPI calculations
  const kpis = useMemo(() => {
    if (!hasBookStock) return null;
    
    let totalBook = 0;
    let totalPhysical = 0;
    let deficitCount = 0;
    let surplusCount = 0;
    let matchCount = 0;

    reconciledList.forEach(item => {
      totalBook += item.bookQty;
      totalPhysical += item.scannedQty;
      if (item.variance < 0) deficitCount++;
      else if (item.variance > 0) surplusCount++;
      else matchCount++;
    });

    const netVariance = totalPhysical - totalBook;
    const discrepancyRate = reconciledList.length > 0 
      ? ((deficitCount + surplusCount) / reconciledList.length) * 100 
      : 0;

    return {
      totalBook,
      totalPhysical,
      netVariance,
      deficitCount,
      surplusCount,
      matchCount,
      discrepancyRate: discrepancyRate.toFixed(1)
    };
  }, [reconciledList, hasBookStock]);

  // Reset page
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  if (!hasBookStock) {
    return (
      <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-700/50 p-8 shadow-xl animate-fade-in max-w-xl mx-auto">
        <div className="text-center space-y-4">
          <BookOpen className="h-12 w-12 mx-auto text-amber-500 opacity-60" />
          <h3 className="text-lg font-bold text-slate-100">Variance Reconciliation Disabled</h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            You haven't uploaded a Book Stock / Dump file for this session. 
            Upload one now to compare physical counts against system records in real-time.
          </p>
          
          {uploadError && (
            <p className="p-3 text-xs bg-red-950/40 border border-red-900/30 text-red-400 rounded-xl font-medium">
              {uploadError}
            </p>
          )}

          {/* Inline Upload Form */}
          {!bookFile ? (
            <div className="relative border-2 border-dashed border-slate-750 hover:border-amber-500/50 rounded-xl p-6 bg-slate-950/20 cursor-pointer group transition duration-300">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="h-6 w-6 text-slate-500 group-hover:text-amber-400 mx-auto mb-2 transition" />
              {loadingFile ? (
                <p className="text-xs text-amber-400 font-semibold animate-pulse">Parsing file columns...</p>
              ) : (
                <p className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition">
                  Click to upload Book Stock (XLSX, XLS, CSV)
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-left p-4 rounded-xl border border-slate-750 bg-slate-950/40 animate-fade-in">
              <p className="text-xs font-mono text-teal-400 truncate font-semibold">{bookFile.name}</p>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Barcode</label>
                  <select
                    value={bookMapping.barcodeCol}
                    onChange={(e) => setBookMapping({ ...bookMapping, barcodeCol: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-750 text-xs text-slate-350 rounded-lg p-2 focus:outline-none focus:border-amber-500"
                  >
                    {bookHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Qty</label>
                  <select
                    value={bookMapping.qtyCol}
                    onChange={(e) => setBookMapping({ ...bookMapping, qtyCol: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-750 text-xs text-slate-350 rounded-lg p-2 focus:outline-none focus:border-amber-500"
                  >
                    {bookHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setBookFile(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 bg-slate-800 hover:bg-slate-750 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIngestSubmit}
                  disabled={processing}
                  className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 rounded-lg transition"
                >
                  {processing ? 'Processing...' : 'Process Stock'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-700/50 p-6 shadow-xl space-y-6">
      
      {/* 1. KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-4 relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">System Book Stock</span>
          <div className="text-2xl font-bold text-slate-200 mt-1">{kpis.totalBook}</div>
          <p className="text-[10px] text-slate-500 mt-1">Expected quantity</p>
        </div>
        <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-4 relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Physical Verified</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">{kpis.totalPhysical}</div>
          <p className="text-[10px] text-slate-500 mt-1">Actual scanned quantity</p>
        </div>
        <div className={`bg-slate-950/40 rounded-xl border p-4 relative overflow-hidden ${
          kpis.netVariance === 0 
            ? 'border-slate-800' 
            : kpis.netVariance < 0 
            ? 'border-rose-500/20' 
            : 'border-amber-500/20'
        }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Net Variance</span>
          <div className={`text-2xl font-bold mt-1 ${
            kpis.netVariance === 0 
              ? 'text-slate-300' 
              : kpis.netVariance < 0 
              ? 'text-rose-400' 
              : 'text-amber-500'
          }`}>
            {kpis.netVariance > 0 ? `+${kpis.netVariance}` : kpis.netVariance}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Deficit vs surplus net count</p>
        </div>
        <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-4 relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Discrepancy Rate</span>
          <div className="text-2xl font-bold text-orange-400 mt-1">{kpis.discrepancyRate}%</div>
          <p className="text-[10px] text-slate-500 mt-1">Mismatched SKU ratio</p>
        </div>
      </div>

      {/* 2. Filter & Search Control */}
      <div className="flex flex-col md:flex-row justify-between items-stretch gap-4 border-b border-slate-850 pb-4">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search barcode, description..."
            className="w-full bg-slate-950/80 border border-slate-750 text-slate-200 text-sm rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-2 rounded-lg font-bold border transition ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-slate-200 border-slate-700'
                : 'bg-transparent text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            All Items ({reconciledList.length})
          </button>
          <button
            onClick={() => setStatusFilter('mismatch')}
            className={`px-3.5 py-2 rounded-lg font-bold border transition ${
              statusFilter === 'mismatch'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-sm shadow-amber-950/10'
                : 'bg-transparent text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            Mismatches ({reconciledList.filter(item => item.variance !== 0).length})
          </button>
          <button
            onClick={() => setStatusFilter('deficit')}
            className={`px-3.5 py-2 rounded-lg font-bold border transition flex items-center gap-1.5 ${
              statusFilter === 'deficit'
                ? 'bg-rose-500/10 text-rose-450 border-rose-500/20'
                : 'bg-transparent text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            <ArrowDownCircle className="h-3.5 w-3.5 text-rose-500" />
            Deficit ({kpis.deficitCount})
          </button>
          <button
            onClick={() => setStatusFilter('surplus')}
            className={`px-3.5 py-2 rounded-lg font-bold border transition flex items-center gap-1.5 ${
              statusFilter === 'surplus'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-transparent text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            <ArrowUpCircle className="h-3.5 w-3.5 text-amber-500" />
            Surplus ({kpis.surplusCount})
          </button>
          <button
            onClick={() => setStatusFilter('matched')}
            className={`px-3.5 py-2 rounded-lg font-bold border transition flex items-center gap-1.5 ${
              statusFilter === 'matched'
                ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20'
                : 'bg-transparent text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Matched ({kpis.matchCount})
          </button>
        </div>
      </div>

      {/* 3. Variance Table */}
      <div className="overflow-x-auto border border-slate-750 rounded-xl bg-slate-950/20">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-950/60 border-b border-slate-750 text-slate-300 font-semibold">
              <th className="px-4 py-3">Item Description</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3 text-center w-24">Book Stock</th>
              <th className="px-4 py-3 text-center w-24">Physical Count</th>
              <th className="px-4 py-3 text-center w-24">Variance</th>
              <th className="px-4 py-3 text-center w-32">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850 text-slate-350 font-medium">
            {paginatedList.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-10 text-center text-slate-500 font-medium bg-slate-900/10">
                  No inventory discrepancies match the selected filter.
                </td>
              </tr>
            ) : (
              paginatedList.map((item) => (
                <tr
                  key={item.barcode}
                  className={`hover:bg-slate-850/20 transition-colors ${
                    item.status === 'deficit'
                      ? 'bg-rose-500/2'
                      : item.status === 'surplus'
                      ? 'bg-amber-500/2'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-200 block truncate max-w-sm">{item.itemName}</span>
                    <span className="text-[10px] text-slate-500 font-mono">Code: {item.itemCode}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{item.barcode}</td>
                  <td className="px-4 py-3 text-center text-slate-450">{item.bookQty}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-200">{item.scannedQty}</td>
                  <td className={`px-4 py-3 text-center font-mono font-bold text-sm ${
                    item.variance === 0 
                      ? 'text-slate-400' 
                      : item.variance < 0 
                      ? 'text-rose-400' 
                      : 'text-amber-500'
                  }`}>
                    {item.variance > 0 ? `+${item.variance}` : item.variance}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      item.status === 'matched'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-450'
                        : item.status === 'deficit'
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-405'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-450'
                    }`}>
                      {item.status === 'matched' ? 'MATCHED' : item.status === 'deficit' ? 'DEFICIT' : 'SURPLUS'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-750">
          <div className="text-xs text-slate-450">
            Showing Page <strong className="text-slate-300">{currentPage}</strong> of <strong className="text-slate-300">{totalPages}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-450 hover:bg-slate-800 hover:text-slate-300 transition disabled:opacity-40"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-450 hover:bg-slate-800 hover:text-slate-300 transition disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-455 hover:bg-slate-800 hover:text-slate-300 transition disabled:opacity-40"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-450 hover:bg-slate-800 hover:text-slate-300 transition disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

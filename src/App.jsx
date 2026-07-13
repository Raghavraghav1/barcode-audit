import React, { useState, useEffect } from 'react';
import { SessionProvider, useSession } from './store/SessionContext';
import Dashboard from './components/Dashboard';
import ScanBox from './components/ScanBox';
import AuditForm from './components/AuditForm';
import SkuSelector from './components/SkuSelector';
import AuditGrid from './components/AuditGrid';
import SetupWizard from './components/SetupWizard';
import Reconciliation from './components/Reconciliation';
import { 
  FileDown, RefreshCw, LogOut, CheckCircle2, ClipboardCheck, 
  Layers, ChevronRight, User, MapPin, Calendar, HelpCircle,
  AlertTriangle
} from 'lucide-react';
import { formatDateStr } from './utils/date';

function AuditApp() {
  const {
    sessionActive,
    sessionMetadata,
    records,
    loading,
    endSession,
    addRecord,
    updateRecord,
    removeRecord,
    saveColumnPreferences,
    exportData
  } = useSession();

  // Active workspace tab: 'scan' | 'reconciliation'
  const [activeTab, setActiveTab] = useState('scan');

  const scanType = sessionMetadata?.scanType || 'audit';
  const scanTypeBadge = scanType === 'inward' ? (
    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
      Inward (+)
    </span>
  ) : scanType === 'outward' ? (
    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider animate-pulse">
      Outward (-)
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
      Audit (Stock Take)
    </span>
  );
  
  // Scanned item states
  const [activeProduct, setActiveProduct] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [endSessionConfirmOpen, setEndSessionConfirmOpen] = useState(false);

  // Sku Resolution Modal States
  const [skuModalOpen, setSkuModalOpen] = useState(false);

  // Column Select Modal States
  const ALL_COLUMNS = [
    'Barcode', 'Item Code', 'Item Name', 'Product Group', 'Sub Category',
    'SKU Type', 'Pack Type', 'HSN', 'Box Qty', 'Loose Qty', 'Units Per Box',
    'Physical Total Qty', 'MRP', 'MFD', 'EXP', 'Shelved shelf life Days (elapsed days)',
    'Bal shelf life Days', 'Shelf-Life in %', 'Batch Number', 'Remarks',
    'Scanned At', 'Auditor', 'Location'
  ];
  const MANDATORY_COLUMNS = ['Barcode', 'Item Name', 'Physical Total Qty', 'MRP'];
  
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [activeColumns, setActiveColumns] = useState(ALL_COLUMNS);

  useEffect(() => {
    if (sessionMetadata && sessionMetadata.selectedColumns) {
      setActiveColumns(sessionMetadata.selectedColumns);
    } else {
      setActiveColumns(ALL_COLUMNS);
    }
  }, [sessionMetadata, columnModalOpen]);

  const handleToggleColumn = (col) => {
    if (MANDATORY_COLUMNS.includes(col)) return;
    setActiveColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };
  const [skuModalBarcode, setSkuModalBarcode] = useState('');
  const [skuModalOptions, setSkuModalOptions] = useState([]);

  // Global F3 shortcut handler for Excel Export
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        if (sessionActive) {
          exportData();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionActive, records]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans">
        <RefreshCw className="h-8 w-8 text-amber-500 animate-spin mb-4" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Initializing Database Engine...</p>
      </div>
    );
  }

  // --- Scan Callbacks ---
  const handleScanMatch = (product) => {
    setActiveProduct({ ...product, isEditing: false });
  };

  const handleScanNotFound = (barcode) => {
    setActiveProduct({
      barcode,
      itemCode: 'UNREG',
      itemName: '',
      product: '',
      subCategory: 'MANUAL',
      skuType: 'RETAIL',
      packType: 'BOX',
      hsn: '',
      isManualEntry: true,
      isEditing: false
    });
  };

  const handleScanMultiple = (barcode, options) => {
    setSkuModalBarcode(barcode);
    setSkuModalOptions(options);
    setSkuModalOpen(true);
  };

  // --- Sku Resolution Callbacks ---
  const handleSkuSelect = (selectedProduct) => {
    setActiveProduct({ ...selectedProduct, isEditing: false });
    setSkuModalOpen(false);
  };

  const handleSkuCancel = () => {
    setSkuModalOpen(false);
    setActiveProduct(null);
  };

  // --- Audit Form Callbacks ---
  const handleSaveRecord = async (recordData) => {
    try {
      if (activeProduct && activeProduct.scannedAt) {
        await updateRecord({
          ...recordData,
          id: activeProduct.id,
          scannedAt: activeProduct.scannedAt
        });
      } else {
        const newRecord = { ...recordData };
        delete newRecord.id;
        await addRecord(newRecord);
      }
      setActiveProduct(null);
    } catch (err) {
      alert('Failed to save record offline.');
    }
  };

  const handleCancelForm = () => {
    setActiveProduct(null);
  };

  // --- Grid Row Handlers ---
  const handleEditGridRow = (rowRecord) => {
    // Set tab to scan workspace
    setActiveTab('scan');
    setActiveProduct(rowRecord);
    // Scroll smoothly to details form
    const entryEl = document.getElementById('audit-entry-panel');
    if (entryEl) {
      entryEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDeleteGridRow = async (id) => {
    try {
      await removeRecord(id);
      if (activeProduct && activeProduct.id === id) {
        setActiveProduct(null);
      }
    } catch (err) {
      alert('Failed to delete item.');
    }
  };

  const handleBulkDeleteRows = async (ids) => {
    try {
      for (const id of ids) {
        await removeRecord(id);
        if (activeProduct && activeProduct.id === id) {
          setActiveProduct(null);
        }
      }
    } catch (err) {
      alert('Failed to delete selected items.');
    }
  };

  const handleEndSessionSubmit = () => {
    setEndSessionConfirmOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      
      {/* Visual background accents */}
      <div className="fixed -left-64 -top-64 h-[500px] w-[500px] bg-orange-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed -right-64 bottom-0 h-[600px] w-[600px] bg-amber-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header Shell */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-850 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="Audit Avengers Logo" 
              className="h-12 w-auto object-contain"
              onError={(e) => {
                // Fail-safe icon fallback if logo is not found
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            {/* Fail-safe fallback container */}
            <div className="hidden h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 items-center justify-center shadow-lg font-black text-slate-950">
              AA
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 block">Enterprise Service</span>
              <h1 className="text-sm font-black tracking-wider text-slate-50 uppercase">Audit Avengers</h1>
            </div>
          </div>

          {sessionActive && (
            <div className="flex items-center gap-2">
              {/* Columns Selector Button */}
              <button
                type="button"
                onClick={() => setColumnModalOpen(true)}
                title="Customize Columns"
                className="flex items-center justify-center p-2.5 rounded-xl bg-slate-900 border border-slate-750 text-slate-300 hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <ClipboardCheck className="h-4.5 w-4.5 text-amber-500" />
                <span className="hidden sm:inline text-xs font-bold ml-1.5">Columns</span>
              </button>

              <button
                type="button"
                onClick={exportData}
                title="Export Excel Report (F3)"
                className="flex items-center justify-center p-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-md transition cursor-pointer shrink-0"
              >
                <FileDown className="h-4.5 w-4.5" />
                <span className="hidden sm:inline text-xs font-extrabold ml-1.5">Export Report (F3)</span>
              </button>
              
              <button
                type="button"
                onClick={handleEndSessionSubmit}
                title="End Audit Session"
                className="flex items-center justify-center p-2.5 rounded-xl bg-slate-900 border border-slate-750 text-rose-400 hover:bg-slate-800 hover:text-rose-300 transition cursor-pointer shrink-0"
              >
                <LogOut className="h-4.5 w-4.5" />
                <span className="hidden sm:inline text-xs font-bold ml-1.5">End Audit</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 z-10">
        
        {!sessionActive ? (
          
          /* SETUP & ONBOARDING SYSTEM */
          <SetupWizard />

        ) : (

          /* ACTIVE AUDITING INTERFACE */
          <div className="space-y-6">
            
            {/* Active Session Info strip */}
            <div className="bg-slate-900/50 backdrop-blur-md rounded-xl border border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-md">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Client</span>
                  <strong className="text-slate-100">{sessionMetadata.clientName}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Location</span>
                  <strong className="text-slate-100">{sessionMetadata.location}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Auditor</span>
                  <strong className="text-slate-100">{sessionMetadata.auditor}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Date</span>
                  <strong className="text-slate-100">{formatDateStr(sessionMetadata.auditDate)}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Flow</span>
                  {scanTypeBadge}
                </div>
              </div>

              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                <span>Start Time:</span>
                <span>{new Date(sessionMetadata.startTime).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* TAB SELECTOR CONTROL */}
            <div className="flex border-b border-slate-800">
              <button
                onClick={() => setActiveTab('scan')}
                className={`px-6 py-3.5 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'scan'
                    ? 'border-amber-500 text-amber-450 bg-slate-900/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ClipboardCheck className="h-4 w-4" />
                Audit Scanner Workspace
              </button>
              <button
                onClick={() => setActiveTab('reconciliation')}
                className={`px-6 py-3.5 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'reconciliation'
                    ? 'border-amber-500 text-amber-450 bg-slate-900/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="h-4 w-4" />
                Variance Reconciliation
                {sessionMetadata.hasBookStock && (
                  <span className="ml-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded-full font-bold">
                    Active
                  </span>
                )}
              </button>
            </div>

            {/* RENDER ACTIVE TAB */}
            {activeTab === 'scan' ? (
              
              /* WORKSPACE A: Live Audit Scanner */
              <div className="space-y-6 animate-fade-in">
                {/* Stats dashboard */}
                <Dashboard records={records} />

                {/* Scanners panel */}
                <ScanBox
                  onScanMatch={handleScanMatch}
                  onScanNotFound={handleScanNotFound}
                  onScanMultiple={handleScanMultiple}
                  isEditing={isEditing}
                  recordsCount={records.length}
                />

                {/* SKU Resolution Modal */}
                <SkuSelector
                  isOpen={skuModalOpen}
                  barcode={skuModalBarcode}
                  options={skuModalOptions}
                  onSelect={handleSkuSelect}
                  onCancel={handleSkuCancel}
                />

                {/* Audit Form */}
                <div id="audit-entry-panel" className="scroll-mt-24">
                  <AuditForm
                    activeProduct={activeProduct}
                    onSave={handleSaveRecord}
                    onCancel={handleCancelForm}
                    existingRecords={records}
                    setIsEditing={setIsEditing}
                  />
                </div>

                {/* Data Grid table */}
                <AuditGrid
                  records={records}
                  onEdit={handleEditGridRow}
                  onDelete={handleDeleteGridRow}
                  onBulkDelete={handleBulkDeleteRows}
                />
              </div>

            ) : (

              /* WORKSPACE B: Variance Reconciliation Sheet */
              <div className="animate-fade-in">
                <Reconciliation />
              </div>

            )}

          </div>
        )}
      </main>

      {/* Mid-session Columns Customization Modal */}
      {columnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl animate-zoom-in">
            {/* Header */}
            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ClipboardCheck className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">Customize Report Columns</h3>
                  <p className="text-xs text-slate-400 font-medium">Select columns to include in the exported spreadsheet</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-1 mb-6">
                
                {/* Product Details */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Product Details</h4>
                  {['Barcode', 'Item Code', 'Item Name', 'Product Group', 'Sub Category', 'SKU Type', 'Pack Type', 'HSN'].map((col) => {
                    const isMandatory = ['Barcode', 'Item Name'].includes(col);
                    const isChecked = activeColumns.includes(col);
                    return (
                      <label key={col} className="flex items-center gap-2 text-xs text-slate-300 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isMandatory}
                          onChange={() => handleToggleColumn(col)}
                          className="h-4.5 w-4.5 text-amber-500 rounded bg-slate-950 border-slate-700 focus:ring-0 disabled:opacity-55"
                        />
                        <span>{col}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Quantities & Dates */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Quantities & Dates</h4>
                  {['Box Qty', 'Loose Qty', 'Units Per Box', 'Physical Total Qty', 'MRP', 'MFD', 'EXP', 'Batch Number', 'Remarks'].map((col) => {
                    const isMandatory = ['Physical Total Qty', 'MRP'].includes(col);
                    const isChecked = activeColumns.includes(col);
                    return (
                      <label key={col} className="flex items-center gap-2 text-xs text-slate-300 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isMandatory}
                          onChange={() => handleToggleColumn(col)}
                          className="h-4.5 w-4.5 text-amber-500 rounded bg-slate-950 border-slate-700 focus:ring-0 disabled:opacity-55"
                        />
                        <span>{col}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Calculations & Session */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Calculations & Session</h4>
                  {['Shelved shelf life Days (elapsed days)', 'Bal shelf life Days', 'Shelf-Life in %', 'Scanned At', 'Auditor', 'Location'].map((col) => {
                    const isChecked = activeColumns.includes(col);
                    return (
                      <label key={col} className="flex items-center gap-2 text-xs text-slate-300 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleColumn(col)}
                          className="h-4 w-4 text-amber-500 rounded bg-slate-950 border-slate-700 focus:ring-0"
                        />
                        <span className="leading-tight">{col}</span>
                      </label>
                    );
                  })}
                </div>

              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveColumns(ALL_COLUMNS)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setActiveColumns(MANDATORY_COLUMNS)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setColumnModalOpen(false)}
                    className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      await saveColumnPreferences(activeColumns);
                      setColumnModalOpen(false);
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* End Session Confirmation Modal */}
      {endSessionConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-zoom-in">
            {/* Header */}
            <div className="flex items-center gap-3 bg-slate-950 px-6 py-4 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-455 border border-rose-500/20">
                <AlertTriangle className="h-5 w-5 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-slate-100">End Audit Session?</h3>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                {records.length > 0 ? (
                  <>
                    This will permanently end the active session and <strong className="text-rose-400">CLEAR all {records.length} scanned records</strong> from local offline storage.
                    <br /><br />
                    Please ensure you have exported your Excel reports before proceeding.
                  </>
                ) : (
                  "Are you sure you want to end the active auditing session?"
                )}
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEndSessionConfirmOpen(false)}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await endSession();
                    setActiveProduct(null);
                    setActiveTab('scan');
                    setEndSessionConfirmOpen(false);
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-lg shadow-rose-950/20"
                >
                  Clear & End Session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-950 py-6 border-t border-slate-900 text-center text-xs text-slate-500 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Audit Avengers. All rights reserved. Client-side database engines synced offline via IndexedDB.</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AuditApp />
    </SessionProvider>
  );
}

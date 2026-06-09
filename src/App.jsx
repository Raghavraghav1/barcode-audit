import React, { useState, useEffect } from 'react';
import { SessionProvider, useSession } from './store/SessionContext';
import Dashboard from './components/Dashboard';
import ScanBox from './components/ScanBox';
import AuditForm from './components/AuditForm';
import SkuSelector from './components/SkuSelector';
import AuditGrid from './components/AuditGrid';
import { FileDown, RefreshCw, LogOut, CheckCircle, Barcode, ClipboardList, MapPin, User, Calendar } from 'lucide-react';

function AuditApp() {
  const {
    sessionActive,
    sessionMetadata,
    records,
    loading,
    startSession,
    endSession,
    addRecord,
    updateRecord,
    removeRecord,
    exportData
  } = useSession();

  // Active product being entered/edited in the form
  const [activeProduct, setActiveProduct] = useState(null);
  const [isEditing, setIsEditing] = useState(false); // flags if form is actively focused for typing

  // Sku Selector Modal States
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [skuModalBarcode, setSkuModalBarcode] = useState('');
  const [skuModalOptions, setSkuModalOptions] = useState([]);

  // Session Init Form State
  const [auditorName, setAuditorName] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionFormError, setSessionFormError] = useState('');

  // Handle global shortcuts (F3 for Export)
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
  }, [sessionActive, records, sessionMetadata]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100">
        <RefreshCw className="h-8 w-8 text-teal-400 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-400">Loading audit session state...</p>
      </div>
    );
  }

  // --- Session Initiation Handler ---
  const handleStartSessionSubmit = (e) => {
    e.preventDefault();
    if (!auditorName.trim() || !clientName.trim() || !location.trim() || !auditDate) {
      setSessionFormError('All metadata fields are mandatory to start an audit session.');
      return;
    }
    setSessionFormError('');
    startSession({
      auditor: auditorName.trim(),
      clientName: clientName.trim(),
      location: location.trim(),
      auditDate: auditDate
    });
  };

  // --- Scan Handlers ---
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

  // --- SKU Selector Resolve Handlers ---
  const handleSkuSelect = (selectedProduct) => {
    setActiveProduct({ ...selectedProduct, isEditing: false });
    setSkuModalOpen(false);
  };

  const handleSkuCancel = () => {
    setSkuModalOpen(false);
    setActiveProduct(null);
  };

  // --- Form Actions ---
  const handleSaveRecord = async (recordData) => {
    try {
      if (activeProduct && activeProduct.id) {
        // Editing existing record
        await updateRecord({
          ...recordData,
          id: activeProduct.id,
          scannedAt: activeProduct.scannedAt // preserve original scan time
        });
      } else {
        // Adding new record
        await addRecord(recordData);
      }
      // Reset active product state
      setActiveProduct(null);
    } catch (err) {
      alert('Failed to save record offline.');
    }
  };

  const handleCancelForm = () => {
    setActiveProduct(null);
  };

  // --- Grid Edit / Delete Handlers ---
  const handleEditGridRow = (rowRecord) => {
    setActiveProduct(rowRecord);
    // Scroll smoothly to form entry panel
    const entryEl = document.getElementById('audit-entry-panel');
    if (entryEl) {
      entryEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDeleteGridRow = async (id) => {
    try {
      await removeRecord(id);
      // If the row being deleted was active in the form, clear the form
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

  const handleEndAuditSession = () => {
    const confirmText = records.length > 0 
      ? `Ending the audit session will CLEAR all ${records.length} records. Make sure you have exported your report. Proceed?` 
      : 'End session and clear metadata?';
      
    if (window.confirm(confirmText)) {
      endSession();
      setActiveProduct(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      
      {/* 1. Header / Navigation */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-teal-600 flex items-center justify-center shadow-lg shadow-teal-900/30">
              <Barcode className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide text-slate-50">Barcode Audit</h1>
              <p className="text-[10px] text-slate-400 font-medium">Enterprise Warehouse Audit Kit</p>
            </div>
          </div>

          {sessionActive && (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={exportData}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-950/20 hover:shadow-lg transition"
              >
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline">Export Excel (F3)</span>
                <span className="inline sm:hidden">Export</span>
              </button>
              <button
                type="button"
                onClick={handleEndAuditSession}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-rose-400 border border-slate-700/50 transition"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">End Session</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {!sessionActive ? (
          
          /* --- SESSION CREATION VIEW --- */
          <div className="max-w-lg mx-auto my-12 animate-zoom-in">
            <div className="bg-slate-800 rounded-2xl border border-slate-750 shadow-2xl overflow-hidden">
              <div className="bg-slate-950 px-6 py-5 border-b border-slate-850 flex items-center gap-3">
                <ClipboardList className="h-6 w-6 text-teal-400" />
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Start Audit Session</h2>
                  <p className="text-xs text-slate-400">Initialize metadata to begin offline verification</p>
                </div>
              </div>

              <form onSubmit={handleStartSessionSubmit} className="p-6 space-y-4">
                
                {sessionFormError && (
                  <p className="p-3 text-xs bg-red-950/50 border border-red-900/50 text-red-400 rounded-lg font-medium">
                    {sessionFormError}
                  </p>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <User className="h-4 w-4 text-slate-400" />
                    Auditor Name
                  </label>
                  <input
                    type="text"
                    value={auditorName}
                    onChange={(e) => setAuditorName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-slate-400" />
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client or Warehouse Account"
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Warehouse Bay or City"
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    Audit Date
                  </label>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 bg-teal-600 hover:bg-teal-500 text-white py-3 rounded-xl font-semibold transition shadow-lg shadow-teal-950/20 hover:shadow-xl"
                >
                  Start Audit Session
                </button>
              </form>
            </div>
          </div>

        ) : (

          /* --- ACTIVE AUDIT WORKSPACE VIEW --- */
          <div className="space-y-6 animate-fade-in">
            
            {/* Active Session Info Strip */}
            <div className="bg-slate-850 rounded-xl border border-slate-750 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-md">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Client</span>
                  <strong className="text-slate-100">{sessionMetadata.clientName}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Location</span>
                  <strong className="text-slate-100">{sessionMetadata.location}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Auditor</span>
                  <strong className="text-slate-100">{sessionMetadata.auditor}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Date</span>
                  <strong className="text-slate-100">{sessionMetadata.auditDate}</strong>
                </div>
              </div>

              <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                <span>Start:</span>
                <span>{new Date(sessionMetadata.startTime).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Dashboard Statistics */}
            <Dashboard records={records} />

            {/* Scanning Panel */}
            <ScanBox
              onScanMatch={handleScanMatch}
              onScanNotFound={handleScanNotFound}
              onScanMultiple={handleScanMultiple}
              isEditing={isEditing}
            />

            {/* SKU Selector Modal (Handles duplicate barcodes) */}
            <SkuSelector
              isOpen={skuModalOpen}
              barcode={skuModalBarcode}
              options={skuModalOptions}
              onSelect={handleSkuSelect}
              onCancel={handleSkuCancel}
            />

            {/* Audit Details Entry Panel */}
            <div id="audit-entry-panel" className="scroll-mt-20">
              <AuditForm
                activeProduct={activeProduct}
                onSave={handleSaveRecord}
                onCancel={handleCancelForm}
                existingRecords={records}
                setIsEditing={setIsEditing}
              />
            </div>

            {/* Records Data Grid */}
            <AuditGrid
              records={records}
              onEdit={handleEditGridRow}
              onDelete={handleDeleteGridRow}
              onBulkDelete={handleBulkDeleteRows}
            />
          </div>
        )}
      </main>

      {/* 3. Footer */}
      <footer className="bg-slate-950 py-6 border-t border-slate-850 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Barcode Audit App. Runs entirely in your browser. Offline-safe. SheetJS & IndexedDB powered.</p>
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

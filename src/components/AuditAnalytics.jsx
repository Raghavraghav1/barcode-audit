import React, { useRef } from 'react';
import { useSession } from '../store/SessionContext';
import { 
  BarChart2, Clock, History, AlertTriangle, FileDown, FileUp, 
  Trash2, Award, Clipboard, Users, ShieldAlert, CheckCircle2,
  Calendar
} from 'lucide-react';
import { formatDateTime, formatDateStr } from '../utils/date';

export default function AuditAnalytics() {
  const { 
    records, 
    actionLog, 
    sessionHistory, 
    sessionMetadata,
    downloadSessionSnapshot, 
    importSessionSnapshot 
  } = useSession();

  const fileInputRef = useRef(null);

  // Statistics Calculation
  const totalScans = records.length;
  const totalQty = records.reduce((sum, r) => sum + (Number(r.netQty) || 0), 0);
  const manualScans = records.filter(r => r.isManualEntry || r.itemCode === 'UNREG').length;
  
  // Calculate scan rate
  let scansPerMinute = 0;
  let elapsedMinutes = 0;
  if (sessionMetadata?.startTime && records.length > 0) {
    const elapsedMs = new Date().getTime() - new Date(sessionMetadata.startTime).getTime();
    elapsedMinutes = Math.max(0.5, elapsedMs / 60000);
    scansPerMinute = (totalScans / elapsedMinutes).toFixed(1);
  }

  // Count exceptions
  let exceptionCount = 0;
  records.forEach((r) => {
    const qty = Number(r.netQty) || 0;
    const mrp = Number(r.mrp) || 0;
    const expDate = r.exp ? new Date(r.exp) : null;
    const mfdDate = r.mfd ? new Date(r.mfd) : null;
    if (qty <= 0 || mrp <= 0 || (expDate && mfdDate && expDate <= mfdDate)) {
      exceptionCount++;
    }
  });

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (window.confirm('Importing this snapshot will overwrite your current active session. Proceed?')) {
          await importSessionSnapshot(json);
          alert('Session snapshot successfully restored offline!');
        }
      } catch (err) {
        alert('Failed to parse snapshot file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header Grid Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Productivity Speed Card */}
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            Operator Scan Speed
          </span>
          <div className="text-2xl font-black text-amber-400 mt-2">{scansPerMinute} <span className="text-xs font-semibold text-slate-400">/ min</span></div>
          <p className="text-[10px] text-slate-500 mt-1">Average rate across active audit</p>
        </div>

        {/* Audit Duration Card */}
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-emerald-500" />
            Audit Productivity
          </span>
          <div className="text-2xl font-black text-slate-200 mt-2">{totalQty} <span className="text-xs font-semibold text-slate-400">Items</span></div>
          <p className="text-[10px] text-slate-500 mt-1">Total physical items counted</p>
        </div>

        {/* Manual Items Card */}
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clipboard className="h-3.5 w-3.5 text-orange-500" />
            Manual Catalog Entries
          </span>
          <div className="text-2xl font-black text-orange-400 mt-2">{manualScans} <span className="text-xs font-semibold text-slate-400">Scans</span></div>
          <p className="text-[10px] text-slate-500 mt-1">Unregistered manual overrides</p>
        </div>

        {/* Exceptions warning widget */}
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            Database Exceptions
          </span>
          <div className={`text-2xl font-black mt-2 ${exceptionCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {exceptionCount} <span className="text-xs font-semibold text-slate-550">Issues</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Entries failing validation rules</p>
        </div>

      </div>

      {/* 2. Main content splits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Backup & Restore Recovery Engine (2/3 cols on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Recovery Management Box */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <FileDown className="h-4.5 w-4.5 text-amber-500" />
                Session Snapshot Backups (Crash Recovery)
              </h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Ensure data integrity against severe OS failures, disk corruptions, or browser profile resets. 
              Download a complete snapshot backup of the current audit session, including all custom mappings, ERP stocks, and scanned items.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {/* Snapshot Backup Download Button */}
              <button
                type="button"
                onClick={downloadSessionSnapshot}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition cursor-pointer"
              >
                <FileDown className="h-4 w-4" />
                Download Snapshot (.JSON)
              </button>

              {/* Snapshot Backup Restore Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/50 transition cursor-pointer"
              >
                <FileUp className="h-4 w-4 text-emerald-500" />
                Restore Snapshot File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Supervisor Completed Audits Log */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <History className="h-4.5 w-4.5 text-amber-500" />
                Audit Logs & Session History
              </h3>
              <span className="text-[10px] px-2 py-0.5 bg-slate-950 rounded text-slate-500 border border-slate-850">
                {sessionHistory.length} Saved
              </span>
            </div>

            {sessionHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs font-medium">
                No historical audit records found on this device.
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {sessionHistory.slice().reverse().map((hist, index) => (
                  <div key={index} className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-extrabold text-slate-200">{hist.clientName}</strong>
                        <span className="text-[9px] bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800 text-slate-400 font-mono">
                          {hist.location}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Date: {formatDateStr(hist.auditDate)} • Auditor: {hist.auditor}
                      </p>
                    </div>

                    <div className="text-right shrink-0 flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 text-[10px] text-slate-400">
                      <div>Scans: <strong className="text-amber-500">{hist.totalScans}</strong></div>
                      <span className="hidden sm:inline text-slate-700">•</span>
                      <div>Qty: <strong className="text-emerald-450">{hist.totalQty}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Timeline/Activity Log (1/3 cols on desktop) */}
        <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col h-[520px]">
          
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <History className="h-4.5 w-4.5 text-amber-500" />
              Live Activity Timeline
            </h3>
            <span className="text-[10px] bg-slate-950 border border-slate-800 px-1.5 py-0.2 rounded text-amber-400 font-mono">
              {actionLog.length} actions
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            {actionLog.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-slate-500 font-medium py-12">
                No active scan timeline logs. Begin scanning to log operations.
              </div>
            ) : (
              actionLog.slice().reverse().map((act, i) => {
                let badgeColor = 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20';
                let actionText = 'Add Item';
                let label = act.record?.itemName || act.before?.itemName || 'Unregistered Product';

                if (act.type === 'DELETE') {
                  badgeColor = 'bg-rose-500/10 text-rose-455 border-rose-500/20';
                  actionText = 'Remove Item';
                } else if (act.type === 'EDIT') {
                  badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                  actionText = 'Edit Item';
                }

                return (
                  <div key={i} className="bg-slate-950/20 border border-slate-850 p-3 rounded-lg flex flex-col gap-2 relative">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${badgeColor}`}>
                        {actionText}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {act.record?.scannedAt ? formatDateTime(act.record.scannedAt).split(' ')[1] : 'Now'}
                      </span>
                    </div>

                    <div>
                      <p className="font-extrabold text-slate-350 truncate">{label}</p>
                      <p className="text-[10px] text-slate-550 font-mono mt-0.5">
                        BC: {act.record?.barcode || act.before?.barcode} 
                        {act.type === 'EDIT' && ` (Qty: ${act.before?.netQty} -> ${act.after?.netQty})`}
                        {act.type === 'ADD' && ` (Qty: ${act.record?.netQty})`}
                        {act.type === 'DELETE' && ` (Qty: ${act.record?.netQty})`}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

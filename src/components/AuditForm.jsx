import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Save, Trash2, HelpCircle, AlertTriangle } from 'lucide-react';

export default function AuditForm({ activeProduct, onSave, onCancel, existingRecords, setIsEditing }) {
  const [netQty, setNetQty] = useState('');
  const [mrp, setMrp] = useState('');
  const [mfd, setMfd] = useState('');
  const [exp, setExp] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  // Editable fields for completely new barcodes not found in master
  const [itemName, setItemName] = useState('');
  const [productGroup, setProductGroup] = useState('');
  const [skuType, setSkuType] = useState('RETAIL');
  const [packType, setPackType] = useState('BOX');
  const [hsn, setHsn] = useState('');

  const [errors, setErrors] = useState({});
  const [warnings, setWarnings] = useState([]);

  const qtyInputRef = useRef(null);

  // Set isEditing flag in parent to prevent scanner focus hijacking
  useEffect(() => {
    setIsEditing(true);
    return () => setIsEditing(false);
  }, [setIsEditing]);

  // Load product details when activeProduct changes
  useEffect(() => {
    if (activeProduct) {
      setItemName(activeProduct.itemName || '');
      setProductGroup(activeProduct.product || '');
      setSkuType(activeProduct.skuType || 'RETAIL');
      setPackType(activeProduct.packType || 'BOX');
      setHsn(activeProduct.hsn || '');

      // Reset entry values
      setNetQty('');
      setMrp('');
      setMfd('');
      setExp('');
      setBatchNumber('');
      setRemarks('');
      setErrors({});
      setWarnings([]);

      // Focus quantity field immediately
      setTimeout(() => {
        if (qtyInputRef.current) {
          qtyInputRef.current.focus();
        }
      }, 50);
    }
  }, [activeProduct]);

  // Run real-time warnings (like duplicate batches)
  useEffect(() => {
    if (!activeProduct || !batchNumber.trim()) {
      setWarnings([]);
      return;
    }

    const cleanBatch = batchNumber.trim().toUpperCase();
    const barcode = activeProduct.barcode;
    
    // Check if the same barcode with the same batch already exists in the session
    const isDuplicateBatch = existingRecords.some(
      (r) => r.barcode === barcode && r.batchNumber.trim().toUpperCase() === cleanBatch
    );

    if (isDuplicateBatch) {
      setWarnings([`Batch "${batchNumber}" has already been scanned for this product.`]);
    } else {
      setWarnings([]);
    }
  }, [batchNumber, activeProduct, existingRecords]);

  // Setup F2 shortcut to Save and Esc to Cancel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleSubmit(e);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [netQty, mrp, mfd, exp, batchNumber, remarks, itemName, productGroup, skuType, packType, hsn, errors]);

  if (!activeProduct) {
    return (
      <div className="bg-slate-800/40 rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
        <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-40 text-teal-500" />
        <p className="text-base font-medium">No active product selected</p>
        <p className="text-xs max-w-xs mx-auto mt-1 opacity-70">
          Scan a barcode or enter one manually above to start logging data.
        </p>
      </div>
    );
  }

  const isNewBarcode = activeProduct.isManualEntry;

  const validate = () => {
    const errs = {};
    
    // Validate quantity
    const qtyVal = Number(netQty);
    if (!netQty || isNaN(qtyVal) || qtyVal <= 0) {
      errs.netQty = 'Quantity is required and must be greater than 0';
    }

    // Validate MRP
    const mrpVal = Number(mrp);
    if (!mrp || isNaN(mrpVal) || mrpVal <= 0) {
      errs.mrp = 'MRP is required and must be greater than 0';
    }

    // Date validations
    if (mfd) {
      const mfdDate = new Date(mfd);
      const today = new Date();
      if (isNaN(mfdDate.getTime())) {
        errs.mfd = 'Invalid Manufacturing Date';
      } else if (mfdDate > today) {
        errs.mfd = 'MFD cannot be in the future';
      }
    }

    if (exp) {
      const expDate = new Date(exp);
      if (isNaN(expDate.getTime())) {
        errs.exp = 'Invalid Expiry Date';
      } else if (mfd) {
        const mfdDate = new Date(mfd);
        if (!isNaN(mfdDate.getTime()) && expDate <= mfdDate) {
          errs.exp = 'EXP date must be after MFD date';
        }
      }
    }

    // For new barcodes, item name is required
    if (isNewBarcode && !itemName.trim()) {
      errs.itemName = 'Item name is required for unregistered products';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    const record = {
      // Retain or compile master columns
      barcode: activeProduct.barcode,
      itemCode: activeProduct.itemCode || 'MANUAL',
      itemName: itemName.trim(),
      product: productGroup.trim() || 'MANUAL',
      subCategory: activeProduct.subCategory || 'MANUAL',
      skuType,
      packType,
      hsn: hsn.trim(),

      // Auditor inputs
      netQty: Number(netQty),
      mrp: Number(mrp),
      mfd: mfd || null,
      exp: exp || null,
      batchNumber: batchNumber.trim(),
      remarks: remarks.trim()
    };

    onSave(record);
  };

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl relative overflow-hidden">
      
      {/* Visual Accent glow */}
      <div className="absolute top-0 left-0 w-2 h-full bg-teal-500" />

      <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center justify-between">
        <span>Audit Details Entry</span>
        <span className="text-xs text-slate-400 font-mono">
          Barcode: <span className="text-teal-400 font-semibold">{activeProduct.barcode}</span>
        </span>
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Product Information Fields (Readonly or Editable if manual) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-900/40 border border-slate-750">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Item Name</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              disabled={!isNewBarcode}
              className={`w-full text-sm rounded bg-slate-900 border px-2.5 py-1.5 focus:outline-none focus:border-teal-500 font-medium ${
                isNewBarcode ? 'text-teal-300 border-teal-500/30' : 'text-slate-300 border-slate-800'
              }`}
            />
            {errors.itemName && <p className="text-red-400 text-xs mt-1">{errors.itemName}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Product Category</label>
            <input
              type="text"
              value={productGroup}
              onChange={(e) => setProductGroup(e.target.value)}
              disabled={!isNewBarcode}
              className={`w-full text-sm rounded bg-slate-900 border px-2.5 py-1.5 focus:outline-none focus:border-teal-500 font-medium ${
                isNewBarcode ? 'text-teal-300 border-teal-500/30' : 'text-slate-300 border-slate-800'
              }`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">SKU Type</label>
            {isNewBarcode ? (
              <select
                value={skuType}
                onChange={(e) => setSkuType(e.target.value)}
                className="w-full text-sm rounded bg-slate-900 border border-teal-500/30 text-teal-300 px-2.5 py-1.5 focus:outline-none"
              >
                <option value="RETAIL">RETAIL</option>
                <option value="INSTITUTIONAL">INSTITUTIONAL</option>
                <option value="IP">IP</option>
                <option value="BULK">BULK</option>
              </select>
            ) : (
              <input
                type="text"
                value={skuType}
                disabled
                className="w-full text-sm rounded bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-slate-300 font-medium"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Pack Type</label>
            {isNewBarcode ? (
              <select
                value={packType}
                onChange={(e) => setPackType(e.target.value)}
                className="w-full text-sm rounded bg-slate-900 border border-teal-500/30 text-teal-300 px-2.5 py-1.5 focus:outline-none"
              >
                <option value="BOX">BOX</option>
                <option value="POUCH">POUCH</option>
                <option value="CAN">CAN</option>
                <option value="TUBE">TUBE</option>
                <option value="JAR">JAR</option>
                <option value="OTHER">OTHER</option>
              </select>
            ) : (
              <input
                type="text"
                value={packType}
                disabled
                className="w-full text-sm rounded bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-slate-300 font-medium"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">HSN Code</label>
            <input
              type="text"
              value={hsn}
              onChange={(e) => setHsn(e.target.value)}
              disabled={!isNewBarcode}
              className={`w-full text-sm rounded bg-slate-900 border px-2.5 py-1.5 focus:outline-none focus:border-teal-500 font-mono ${
                isNewBarcode ? 'text-teal-300 border-teal-500/30' : 'text-slate-300 border-slate-800'
              }`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Item Code</label>
            <input
              type="text"
              value={activeProduct.itemCode || 'MANUAL'}
              disabled
              className="w-full text-sm rounded bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-slate-400 font-mono"
            />
          </div>
        </div>

        {/* Auditor Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Net Qty */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Net Quantity <span className="text-red-500">*</span>
            </label>
            <input
              ref={qtyInputRef}
              type="number"
              min="1"
              value={netQty}
              onChange={(e) => setNetQty(e.target.value)}
              placeholder="e.g. 10"
              className={`w-full bg-slate-900 border rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors ${
                errors.netQty ? 'border-red-500 focus:ring-1 focus:ring-red-500/20' : 'border-slate-750'
              }`}
            />
            {errors.netQty && <p className="text-red-400 text-xs mt-1">{errors.netQty}</p>}
          </div>

          {/* MRP */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              MRP (Selling Price) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              placeholder="0.00"
              className={`w-full bg-slate-900 border rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors ${
                errors.mrp ? 'border-red-500 focus:ring-1 focus:ring-red-500/20' : 'border-slate-750'
              }`}
            />
            {errors.mrp && <p className="text-red-400 text-xs mt-1">{errors.mrp}</p>}
          </div>

          {/* Batch Number */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Batch Number</label>
            <input
              type="text"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g. B2605"
              className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          {/* MFD */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-teal-400" />
              Mfg Date (MFD)
            </label>
            <input
              type="date"
              value={mfd}
              onChange={(e) => setMfd(e.target.value)}
              className={`w-full bg-slate-900 border rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors ${
                errors.mfd ? 'border-red-500' : 'border-slate-750'
              }`}
            />
            {errors.mfd && <p className="text-red-400 text-xs mt-1">{errors.mfd}</p>}
          </div>

          {/* EXP */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-teal-400" />
              Expiry Date (EXP)
            </label>
            <input
              type="date"
              value={exp}
              onChange={(e) => setExp(e.target.value)}
              className={`w-full bg-slate-900 border rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors ${
                errors.exp ? 'border-red-500' : 'border-slate-750'
              }`}
            />
            {errors.exp && <p className="text-red-400 text-xs mt-1">{errors.exp}</p>}
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Auditor comments..."
              className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
        </div>

        {/* Warnings Banner */}
        {warnings.length > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              {warnings.map((w, idx) => (
                <p key={idx} className="font-medium">{w}</p>
              ))}
              <p className="opacity-70 mt-0.5">Saving this item will create an additional entry for this batch.</p>
            </div>
          </div>
        )}

        {/* Form Action Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-750">
          <div className="text-xs text-slate-400 space-y-0.5">
            <p>Shortcuts: <kbd className="bg-slate-700 px-1 py-0.5 rounded text-[10px]">F2</kbd> Save Item • <kbd className="bg-slate-700 px-1 py-0.5 rounded text-[10px]">Esc</kbd> Cancel</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-700 hover:bg-slate-650 text-slate-200 transition"
            >
              <Trash2 className="h-4 w-4" />
              Cancel (Esc)
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-950/20 hover:shadow-xl transition"
            >
              <Save className="h-4 w-4" />
              Save Item (F2)
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

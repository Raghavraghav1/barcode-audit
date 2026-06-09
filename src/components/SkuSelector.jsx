import React, { useEffect } from 'react';
import { Layers } from 'lucide-react';

export default function SkuSelector({ isOpen, barcode, options, onSelect, onCancel }) {
  // Listen for keyboard shortcuts to make SKU selection lightning fast
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Escape key to cancel
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      // Numeric keys 1-9 to select options
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= options.length) {
        onSelect(options[num - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, options, onSelect, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl animate-zoom-in">
        
        {/* Header */}
        <div className="flex items-center gap-3 bg-slate-750 px-6 py-4 border-b border-slate-700">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Multiple Matches Found</h3>
            <p className="text-xs text-slate-400">Barcode: <span className="font-mono text-amber-400 font-medium">{barcode}</span></p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-slate-300 mb-4">
            This barcode is mapped to multiple items in the master database. Select the correct SKU type below (or press the corresponding number key on your keyboard):
          </p>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {options.map((option, index) => (
              <button
                key={option.itemCode || index}
                onClick={() => onSelect(option)}
                className="w-full flex items-center justify-between text-left p-4 rounded-xl border border-slate-700 bg-slate-900/50 hover:bg-slate-700/40 hover:border-teal-500/50 hover:shadow-md transition-all group"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-slate-800 text-xs font-semibold text-slate-400 border border-slate-700 group-hover:bg-teal-500/10 group-hover:text-teal-400 group-hover:border-teal-500/30">
                      {index + 1}
                    </span>
                    <span className="font-medium text-slate-200 group-hover:text-teal-300">{option.itemName}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>Code: <strong className="text-slate-300">{option.itemCode}</strong></span>
                    <span>•</span>
                    <span>Product: <strong className="text-slate-300">{option.product}</strong></span>
                    <span>•</span>
                    <span>Pack: <strong className="text-slate-300">{option.packType}</strong></span>
                  </div>
                </div>

                <div className="ml-4 shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  {option.skuType || 'RETAIL'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-900/40 border-t border-slate-700/60">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-650 hover:text-white transition"
          >
            Cancel (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

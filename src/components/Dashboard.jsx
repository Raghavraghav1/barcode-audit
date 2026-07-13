import React, { useState } from 'react';
import { Barcode, AlertTriangle, FileSpreadsheet, Package, ChevronDown, ChevronUp } from 'lucide-react';

export default function Dashboard({ records }) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const totalScans = records.length;
  const totalQty = records.reduce((sum, r) => sum + (Number(r.netQty) || 0), 0);
  const uniqueBarcodes = new Set(records.map((r) => r.barcode).filter(Boolean));
  const uniqueProductsCount = uniqueBarcodes.size;

  let exceptionCount = 0;
  records.forEach((r) => {
    const qty = Number(r.netQty) || 0;
    const mrp = Number(r.mrp) || 0;
    const hasMfdExpError = r.mfd && r.exp && new Date(r.exp) <= new Date(r.mfd);
    const hasFutureDate = r.mfd && new Date(r.mfd) > new Date();

    if (qty <= 0 || mrp <= 0 || hasMfdExpError || hasFutureDate) {
      exceptionCount++;
    }
  });

  const stats = [
    {
      title: 'Scans Logged',
      value: totalScans,
      description: 'Individual scan records',
      icon: FileSpreadsheet,
      color: 'from-orange-500/15 to-amber-600/15 border-orange-500/30 text-amber-400'
    },
    {
      title: 'Net Quantity',
      value: totalQty,
      description: 'Total verified items count',
      icon: Package,
      color: 'from-amber-500/15 to-orange-600/15 border-amber-500/30 text-amber-400'
    },
    {
      title: 'Unique Barcodes',
      value: uniqueProductsCount,
      description: 'Distinct catalog products',
      icon: Barcode,
      color: 'from-orange-600/15 to-amber-500/15 border-orange-500/30 text-amber-400'
    },
    {
      title: 'Exception Warnings',
      value: exceptionCount,
      description: 'Failed validation checks',
      icon: AlertTriangle,
      color: exceptionCount > 0 
        ? 'from-rose-500/20 to-red-600/20 border-rose-500/40 text-rose-400 animate-pulse'
        : 'from-slate-800/20 to-slate-900/20 border-slate-700/60 text-slate-500'
    }
  ];

  return (
    <div className="space-y-3">
      {/* Mobile-optimized Collapse Toggle Header */}
      <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800 px-4 py-2.5 rounded-xl md:hidden">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-350">
          <span>Scans: <strong className="text-amber-500">{totalScans}</strong></span>
          <span className="text-slate-700">•</span>
          <span>Qty: <strong className="text-amber-500">{totalQty}</strong></span>
          <span className="text-slate-700">•</span>
          <span>Exceptions: <strong className={exceptionCount > 0 ? "text-rose-400" : "text-slate-400"}>{exceptionCount}</strong></span>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-500 cursor-pointer"
        >
          <span>{isCollapsed ? 'Show Stats' : 'Hide Stats'}</span>
          {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Grid Display (collapsible on mobile, always visible on tablet/desktop) */}
      <div className={`${isCollapsed ? 'hidden md:grid' : 'grid'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in`}>
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className={`relative overflow-hidden rounded-xl border bg-gradient-to-br bg-slate-900/50 backdrop-blur-md ${stat.color} p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold opacity-90">{stat.title}</span>
                <Icon className="h-5 w-5 opacity-70" />
              </div>
              <div className="text-3xl font-extrabold tracking-tight mb-1">{stat.value}</div>
              <p className="text-xs opacity-60 leading-tight font-medium">{stat.description}</p>
              <div className="absolute right-0 bottom-0 h-16 w-16 bg-white/5 rounded-tl-full pointer-events-none" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

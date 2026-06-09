import React from 'react';
import { Barcode, AlertTriangle, Layers, FileSpreadsheet, Package } from 'lucide-react';

export default function Dashboard({ records }) {
  // Compute dashboard metrics
  const totalScans = records.length;
  
  const totalQty = records.reduce((sum, r) => sum + (Number(r.netQty) || 0), 0);

  const uniqueBarcodes = new Set(records.map((r) => r.barcode).filter(Boolean));
  const uniqueProductsCount = uniqueBarcodes.size;

  // Find duplicates (barcodes that appear more than once in the list)
  const barcodeCounts = {};
  records.forEach((r) => {
    if (r.barcode) {
      barcodeCounts[r.barcode] = (barcodeCounts[r.barcode] || 0) + 1;
    }
  });
  
  const duplicateScansCount = Object.values(barcodeCounts).filter(count => count > 1).length;

  // Compute exceptions
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
      title: 'Total Scanned Records',
      value: totalScans,
      description: 'Individual entries logged',
      icon: FileSpreadsheet,
      color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30 text-blue-400'
    },
    {
      title: 'Total Net Quantity',
      value: totalQty,
      description: 'Sum of all items verified',
      icon: Package,
      color: 'from-teal-500/20 to-emerald-500/20 border-teal-500/30 text-teal-400'
    },
    {
      title: 'Unique Barcodes',
      value: uniqueProductsCount,
      description: 'Distinct items audited',
      icon: Barcode,
      color: 'from-violet-500/20 to-fuchsia-500/20 border-violet-500/30 text-violet-400'
    },
    {
      title: 'Duplicate Scans',
      value: duplicateScansCount,
      description: 'Barcodes scanned multiple times',
      icon: Layers,
      color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400'
    },
    {
      title: 'Exception Warnings',
      value: exceptionCount,
      description: 'Failed validation checks',
      icon: AlertTriangle,
      color: exceptionCount > 0 
        ? 'from-red-500/25 to-rose-500/25 border-red-500/40 text-red-400 animate-pulse'
        : 'from-slate-500/10 to-slate-600/10 border-slate-700 text-slate-400'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${stat.color} p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium opacity-80">{stat.title}</span>
              <Icon className="h-5 w-5 opacity-70" />
            </div>
            <div className="text-3xl font-bold tracking-tight mb-1">{stat.value}</div>
            <p className="text-xs opacity-60 leading-tight">{stat.description}</p>
            {/* Glossy overlay effect */}
            <div className="absolute right-0 bottom-0 h-16 w-16 bg-white/5 rounded-tl-full pointer-events-none" />
          </div>
        );
      })}
    </div>
  );
}

import React from 'react';
import { Barcode, AlertTriangle, FileSpreadsheet, Package } from 'lucide-react';

export default function Dashboard({ records }) {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
  );
}

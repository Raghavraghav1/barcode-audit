import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, Trash2, Edit2, AlertCircle, Layers, CheckSquare, Square } from 'lucide-react';

export default function AuditGrid({ records, onEdit, onDelete, onBulkDelete }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSkuType, setFilterSkuType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [sortField, setSortField] = useState('scannedAt');
  const [sortDirection, setSortDirection] = useState('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [selectedIds, setSelectedIds] = useState(new Set());

  const categories = useMemo(() => {
    const set = new Set(records.map((r) => r.product).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [records]);

  const skuTypes = useMemo(() => {
    const set = new Set(records.map((r) => r.skuType).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [records]);

  const hasWarning = (r) => {
    const qty = Number(r.netQty) || 0;
    const mrp = Number(r.mrp) || 0;
    const hasMfdExpError = r.mfd && r.exp && new Date(r.exp) <= new Date(r.mfd);
    const hasFutureDate = r.mfd && new Date(r.mfd) > new Date();
    return qty <= 0 || mrp <= 0 || hasMfdExpError || hasFutureDate;
  };

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const searchLower = searchQuery.toLowerCase().trim();
      const matchesSearch = !searchLower || 
        (r.barcode && r.barcode.toLowerCase().includes(searchLower)) ||
        (r.itemName && r.itemName.toLowerCase().includes(searchLower)) ||
        (r.itemCode && r.itemCode.toLowerCase().includes(searchLower)) ||
        (r.batchNumber && r.batchNumber.toLowerCase().includes(searchLower)) ||
        (r.remarks && r.remarks.toLowerCase().includes(searchLower));

      const matchesCategory = filterCategory === 'all' || r.product === filterCategory;
      const matchesSku = filterSkuType === 'all' || r.skuType === filterSkuType;

      let matchesStatus = true;
      if (filterStatus === 'warnings') {
        matchesStatus = hasWarning(r);
      } else if (filterStatus === 'clean') {
        matchesStatus = !hasWarning(r);
      }

      return matchesSearch && matchesCategory && matchesSku && matchesStatus;
    });
  }, [records, searchQuery, filterCategory, filterSkuType, filterStatus]);

  const sortedRecords = useMemo(() => {
    const sorted = [...filteredRecords];
    sorted.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'netQty' || sortField === 'mrp') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = valA ? valA.toString().toLowerCase() : '';
        valB = valB ? valB.toString().toLowerCase() : '';
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredRecords, sortField, sortDirection]);

  const paginatedRecords = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    return sortedRecords.slice(startIdx, endIdx);
  }, [sortedRecords, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory, filterSkuType, filterStatus, pageSize]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const RenderSortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' 
      ? <ChevronUp className="h-4 w-4 text-amber-500 inline" /> 
      : <ChevronDown className="h-4 w-4 text-amber-500 inline" />;
  };

  const handleSelectRow = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAllOnPage = () => {
    const newSelected = new Set(selectedIds);
    const allPageIds = paginatedRecords.map((r) => r.id);
    const allSelected = allPageIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      allPageIds.forEach((id) => newSelected.delete(id));
    } else {
      allPageIds.forEach((id) => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDeleteSubmit = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.size} selected audit entries?`)) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-700/50 p-6 shadow-xl">
      <div className="flex flex-col gap-4 mb-6">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="h-5 w-5 text-amber-500" />
            Audit Records Grid
            <span className="text-xs bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-amber-400 font-mono">
              {filteredRecords.length} of {records.length} shown
            </span>
          </h2>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkDeleteSubmit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600/30 transition shadow-sm"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Selected ({selectedIds.size})
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-slate-400 font-medium">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-slate-950 border border-slate-750 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search barcode, SKU, batch..."
              className="w-full bg-slate-950 border border-slate-750 text-slate-200 text-sm rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-750 text-slate-350 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Product Groups</option>
              {categories.slice(1).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterSkuType}
              onChange={(e) => setFilterSkuType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-750 text-slate-350 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All SKU Types</option>
              {skuTypes.slice(1).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-750 text-slate-350 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Records</option>
              <option value="warnings">Warnings / Exceptions Only</option>
              <option value="clean">Valid Records Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto border border-slate-750 rounded-xl bg-slate-950/20">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-950/60 border-b border-slate-750 text-slate-300 font-semibold">
              <th className="px-4 py-3 text-center w-12">
                <button
                  type="button"
                  onClick={handleSelectAllOnPage}
                  className="text-slate-400 hover:text-amber-400 transition"
                  disabled={paginatedRecords.length === 0}
                >
                  {paginatedRecords.length > 0 && paginatedRecords.every((r) => selectedIds.has(r.id)) ? (
                    <CheckSquare className="h-4.5 w-4.5 text-amber-500 mx-auto" />
                  ) : (
                    <Square className="h-4.5 w-4.5 mx-auto" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 cursor-pointer select-none hover:text-amber-400" onClick={() => handleSort('itemName')}>
                Item Name <RenderSortIcon field="itemName" />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none hover:text-amber-400" onClick={() => handleSort('barcode')}>
                Barcode <RenderSortIcon field="barcode" />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none hover:text-amber-400 w-24 text-center" onClick={() => handleSort('netQty')}>
                Qty <RenderSortIcon field="netQty" />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none hover:text-amber-400 w-28 text-right" onClick={() => handleSort('mrp')}>
                MRP <RenderSortIcon field="mrp" />
              </th>
              <th className="px-4 py-3 w-32">Batch No</th>
              <th className="px-4 py-3 w-32">Dates</th>
              <th className="px-4 py-3 cursor-pointer select-none hover:text-amber-400 w-36 text-center" onClick={() => handleSort('scannedAt')}>
                Scanned At <RenderSortIcon field="scannedAt" />
              </th>
              <th className="px-4 py-3 text-center w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850 text-slate-350">
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-6 py-10 text-center text-slate-500 font-medium bg-slate-900/10">
                  No records match the current filters.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((row) => {
                const warn = hasWarning(row);
                const isSelected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-850/20 transition-colors ${
                      warn ? 'bg-red-500/5 hover:bg-red-500/10' : ''
                    } ${isSelected ? 'bg-amber-500/5 hover:bg-amber-500/10' : ''}`}
                  >
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleSelectRow(row.id)}
                        className="text-slate-500 hover:text-amber-400 transition"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-amber-500 mx-auto" />
                        ) : (
                          <Square className="h-4 w-4 mx-auto" />
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 max-w-xs md:max-w-md">
                        {warn && (
                          <AlertCircle
                            className="h-4 w-4 shrink-0 text-red-400"
                            title="This entry has validation warnings"
                          />
                        )}
                        <span className="font-semibold text-slate-200 truncate">{row.itemName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-550">
                        <span className="bg-slate-950 border border-slate-800 px-1 py-0.2 rounded text-[10px] uppercase font-bold text-slate-400">
                          {row.skuType}
                        </span>
                        <span>•</span>
                        <span>{row.product}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="text-amber-450 font-semibold">{row.barcode}</span>
                      <div className="text-slate-500 mt-0.5 text-[10px]">Code: {row.itemCode}</div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-slate-200 block">{row.netQty} Units</span>
                      {(row.boxQty > 0 || row.looseQty > 0) && (
                        <span className="text-[10px] text-slate-500 block font-semibold leading-tight">
                          {row.boxQty || 0} Box + {row.looseQty || 0} Loose
                        </span>
                      )}
                      {row.netQty <= 0 && <span className="text-red-400 text-xs block font-semibold mt-0.5">Invalid</span>}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-slate-300 font-medium">
                      ₹{Number(row.mrp).toFixed(2)}
                      {row.mrp <= 0 && <span className="text-red-400 text-xs block">Invalid</span>}
                    </td>

                    <td className="px-4 py-3 font-mono text-xs text-slate-350">
                      {row.batchNumber || <span className="text-slate-650 italic">None</span>}
                    </td>

                    <td className="px-4 py-3 text-xs leading-normal text-slate-400">
                      <div>MFD: {row.mfd || '-'}</div>
                      <div>EXP: {row.exp || '-'}</div>
                    </td>

                    <td className="px-4 py-3 text-center font-mono text-xs text-slate-400 leading-normal">
                      {row.scannedAt ? new Date(row.scannedAt).toLocaleTimeString() : ''}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {row.scannedAt ? new Date(row.scannedAt).toLocaleDateString() : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          title="Edit this record"
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition shadow-sm"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Delete this audit entry?')) {
                              onDelete(row.id);
                            }
                          }}
                          title="Delete this record"
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-rose-455 hover:border-rose-500/30 transition shadow-sm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-750">
          <div className="text-xs text-slate-455">
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

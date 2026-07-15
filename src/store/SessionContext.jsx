import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  getRecords, 
  saveRecord, 
  deleteRecord as dbDeleteRecord, 
  clearRecords, 
  getSessionMetadata, 
  saveSessionMetadata, 
  clearSessionMetadata,
  saveMasterItems,
  clearMasterItems,
  saveBookStock,
  clearBookStock,
  getBookStock,
  saveTemplate,
  getAllTemplates,
  saveSessionToHistory,
  getSessionHistory
} from '../services/db';
import { exportAuditToExcel } from '../services/excel';
import useUndoRedo from '../hooks/useUndoRedo';

const SessionContext = createContext();

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export const SessionProvider = ({ children }) => {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState(null);
  const [records, setRecords] = useState([]);
  const [bookStock, setBookStock] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Setup Wizard Step: 'metadata' | 'master_upload' | 'book_stock_upload' | 'active'
  const [setupStep, setSetupStep] = useState('metadata');

  const {
    canUndo,
    canRedo,
    recordAction,
    undo: triggerUndo,
    redo: triggerRedo,
    clearHistory,
    actionLog
  } = useUndoRedo();

  // Load active session, templates, and history on startup
  useEffect(() => {
    const initSession = async () => {
      try {
        const savedTemplates = await getAllTemplates();
        setTemplates(savedTemplates || []);

        const history = await getSessionHistory();
        setSessionHistory(history || []);

        const metadata = await getSessionMetadata();
        if (metadata) {
          setSessionMetadata(metadata);
          setSetupStep(metadata.setupStep || 'active');
          if (metadata.setupStep === 'active' || !metadata.setupStep) {
            setSessionActive(true);
            const savedRecords = await getRecords();
            setRecords(savedRecords || []);
            const savedBookStock = await getBookStock();
            setBookStock(savedBookStock || []);
          }
        }
      } catch (err) {
        console.error('Failed to restore offline session:', err);
      } finally {
        setLoading(false);
      }
    };
    initSession();
  }, []);

  const startSetup = async (metadata) => {
    setLoading(true);
    try {
      const initMetadata = {
        ...metadata,
        setupStep: 'master_upload',
        startTime: new Date().toISOString(),
        mapping: {},
        bookMapping: {},
        hasBookStock: false
      };
      
      await saveSessionMetadata(initMetadata);
      setSessionMetadata(initMetadata);
      setSetupStep('master_upload');
      setSessionActive(false);
      setRecords([]);
      setBookStock([]);
      clearHistory();
      
      await clearRecords();
      await clearMasterItems();
      await clearBookStock();
    } catch (err) {
      console.error('Failed to start setup:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveMasterCatalog = async (items, mapping) => {
    setLoading(true);
    try {
      await saveMasterItems(items);
      
      const updatedMetadata = {
        ...sessionMetadata,
        setupStep: 'book_stock_upload',
        mapping
      };
      await saveSessionMetadata(updatedMetadata);
      setSessionMetadata(updatedMetadata);
      setSetupStep('book_stock_upload');
    } catch (err) {
      console.error('Failed to save master catalog items:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const saveBookStockCatalog = async (items, bookMapping) => {
    setLoading(true);
    try {
      await saveBookStock(items);
      setBookStock(items);
      
      const updatedMetadata = {
        ...sessionMetadata,
        setupStep: 'column_select',
        bookMapping,
        hasBookStock: true
      };
      await saveSessionMetadata(updatedMetadata);
      setSessionMetadata(updatedMetadata);
      setSetupStep('column_select');
    } catch (err) {
      console.error('Failed to save book stock:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const skipBookStock = async () => {
    setLoading(true);
    try {
      const updatedMetadata = {
        ...sessionMetadata,
        setupStep: 'column_select',
        hasBookStock: false
      };
      await saveSessionMetadata(updatedMetadata);
      setSessionMetadata(updatedMetadata);
      setSetupStep('column_select');
    } catch (err) {
      console.error('Failed to skip book stock:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveColumnPreferences = async (selectedCols) => {
    setLoading(true);
    try {
      const updatedMetadata = {
        ...sessionMetadata,
        setupStep: 'active',
        selectedColumns: selectedCols
      };
      await saveSessionMetadata(updatedMetadata);
      setSessionMetadata(updatedMetadata);
      setSetupStep('active');
      setSessionActive(true);
      
      const savedRecords = await getRecords();
      setRecords(savedRecords || []);
      const savedBookStock = await getBookStock();
      setBookStock(savedBookStock || []);
    } catch (err) {
      console.error('Failed to save column preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const goToStep = async (step) => {
    setLoading(true);
    try {
      const updatedMetadata = {
        ...sessionMetadata,
        setupStep: step
      };
      await saveSessionMetadata(updatedMetadata);
      setSessionMetadata(updatedMetadata);
      setSetupStep(step);
    } catch (err) {
      console.error('Failed to change step:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSupervisorLock = async (locked) => {
    setLoading(true);
    try {
      const updatedMetadata = {
        ...sessionMetadata,
        locked: !!locked
      };
      await saveSessionMetadata(updatedMetadata);
      setSessionMetadata(updatedMetadata);
    } catch (err) {
      console.error('Failed to toggle supervisor lock:', err);
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    setLoading(true);
    try {
      if (sessionMetadata) {
        // Save current session to history log
        const historyData = {
          clientName: sessionMetadata.clientName,
          auditor: sessionMetadata.auditor,
          location: sessionMetadata.location,
          auditDate: sessionMetadata.auditDate,
          startTime: sessionMetadata.startTime,
          endTime: new Date().toISOString(),
          totalScans: records.length,
          totalQty: records.reduce((sum, r) => sum + (Number(r.netQty) || 0), 0)
        };
        await saveSessionToHistory(historyData);
        // Refresh session history list
        const history = await getSessionHistory();
        setSessionHistory(history || []);
      }

      await clearSessionMetadata();
      await clearRecords();
      await clearMasterItems();
      await clearBookStock();
      clearHistory();
      
      setSessionMetadata(null);
      setSessionActive(false);
      setSetupStep('metadata');
      setRecords([]);
      setBookStock([]);
    } catch (err) {
      console.error('Failed to end session:', err);
    } finally {
      setLoading(false);
    }
  };

  const addRecord = async (recordData, skipHistory = false) => {
    try {
      const saved = await saveRecord(recordData);
      setRecords((prev) => [saved, ...prev]);
      
      if (!skipHistory) {
        recordAction({ type: 'ADD', record: saved });
      }
      return saved;
    } catch (err) {
      console.error('Failed to save record:', err);
      throw err;
    }
  };

  const updateRecord = async (updatedData, skipHistory = false) => {
    try {
      const before = records.find(r => r.id === updatedData.id);
      const saved = await saveRecord(updatedData);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      
      if (!skipHistory && before) {
        recordAction({ type: 'EDIT', before, after: saved });
      }
      return saved;
    } catch (err) {
      console.error('Failed to update record:', err);
      throw err;
    }
  };

  const removeRecord = async (id, skipHistory = false) => {
    try {
      const before = records.find(r => r.id === id);
      await dbDeleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      
      if (!skipHistory && before) {
        recordAction({ type: 'DELETE', record: before });
      }
    } catch (err) {
      console.error('Failed to delete record:', err);
      throw err;
    }
  };

  const undo = useCallback(() => {
    triggerUndo(async (action) => {
      try {
        if (action.type === 'ADD') {
          await dbDeleteRecord(action.record.id);
          setRecords((prev) => prev.filter((r) => r.id !== action.record.id));
        } else if (action.type === 'DELETE') {
          const saved = await saveRecord(action.record);
          setRecords((prev) => [saved, ...prev]);
        } else if (action.type === 'EDIT') {
          const saved = await saveRecord(action.before);
          setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
        }
      } catch (err) {
        console.error('Failed to execute undo write:', err);
      }
    });
  }, [triggerUndo]);

  const redo = useCallback(() => {
    triggerRedo(async (action) => {
      try {
        if (action.type === 'ADD') {
          const saved = await saveRecord(action.record);
          setRecords((prev) => [saved, ...prev]);
        } else if (action.type === 'DELETE') {
          await dbDeleteRecord(action.record.id);
          setRecords((prev) => prev.filter((r) => r.id !== action.record.id));
        } else if (action.type === 'EDIT') {
          const saved = await saveRecord(action.after);
          setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
        }
      } catch (err) {
        console.error('Failed to execute redo write:', err);
      }
    });
  }, [triggerRedo]);

  const saveMappingTemplate = async (clientName, mapping, bookMapping = {}) => {
    try {
      const template = {
        clientName,
        mapping,
        bookMapping,
        savedAt: new Date().toISOString()
      };
      await saveTemplate(template);
      
      const savedTemplates = await getAllTemplates();
      setTemplates(savedTemplates || []);
    } catch (err) {
      console.error('Failed to save mapping template:', err);
    }
  };

  const exportData = () => {
    if (records.length === 0) {
      alert('No scanned records available to export.');
      return;
    }
    exportAuditToExcel(records, sessionMetadata, bookStock);
  };

  const downloadSessionSnapshot = () => {
    const snapshot = {
      app: 'BarcodeAudit',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      metadata: sessionMetadata,
      records: records,
      bookStock: bookStock
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AuditSnapshot_${sessionMetadata?.clientName || 'Backup'}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSessionSnapshot = async (snapshot) => {
    if (!snapshot || snapshot.app !== 'BarcodeAudit') {
      throw new Error('Invalid session snapshot file format.');
    }
    setLoading(true);
    try {
      await saveSessionMetadata(snapshot.metadata);
      setSessionMetadata(snapshot.metadata);
      setSetupStep(snapshot.metadata.setupStep || 'active');
      setSessionActive(true);

      // Save records in batch
      await clearRecords();
      for (let i = 0; i < (snapshot.records || []).length; i++) {
        await saveRecord(snapshot.records[i]);
      }
      setRecords(snapshot.records || []);

      // Save book stock in batch
      if (snapshot.bookStock) {
        await saveBookStock(snapshot.bookStock);
        setBookStock(snapshot.bookStock);
      } else {
        await clearBookStock();
        setBookStock([]);
      }
      clearHistory();
    } catch (err) {
      console.error('Failed to import snapshot:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <SessionContext.Provider
      value={{
        sessionActive,
        sessionMetadata,
        records,
        bookStock,
        templates,
        sessionHistory,
        setupStep,
        loading,
        canUndo,
        canRedo,
        actionLog,
        startSetup,
        saveMasterCatalog,
        saveBookStockCatalog,
        skipBookStock,
        saveColumnPreferences,
        goToStep,
        toggleSupervisorLock,
        endSession,
        addRecord,
        updateRecord,
        removeRecord,
        undo,
        redo,
        saveMappingTemplate,
        exportData,
        downloadSessionSnapshot,
        importSessionSnapshot
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

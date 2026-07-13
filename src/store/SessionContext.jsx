import React, { createContext, useContext, useState, useEffect } from 'react';
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
  getAllTemplates
} from '../services/db';
import { exportAuditToExcel } from '../services/excel';

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
  const [loading, setLoading] = useState(true);
  
  // Setup Wizard Step: 'metadata' | 'master_upload' | 'book_stock_upload' | 'active'
  const [setupStep, setSetupStep] = useState('metadata');

  // Load active session and templates on startup
  useEffect(() => {
    const initSession = async () => {
      try {
        const savedTemplates = await getAllTemplates();
        setTemplates(savedTemplates || []);

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
      // Add a generated id field for autoIncrement keys, and store mapped fields
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

  const endSession = async () => {
    setLoading(true);
    try {
      await clearSessionMetadata();
      await clearRecords();
      await clearMasterItems();
      await clearBookStock();
      
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

  const addRecord = async (recordData) => {
    try {
      const saved = await saveRecord(recordData);
      setRecords((prev) => [saved, ...prev]);
      return saved;
    } catch (err) {
      console.error('Failed to save record:', err);
      throw err;
    }
  };

  const updateRecord = async (updatedData) => {
    try {
      const saved = await saveRecord(updatedData);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      return saved;
    } catch (err) {
      console.error('Failed to update record:', err);
      throw err;
    }
  };

  const removeRecord = async (id) => {
    try {
      await dbDeleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete record:', err);
      throw err;
    }
  };

  const saveMappingTemplate = async (clientName, mapping, bookMapping = {}) => {
    try {
      const template = {
        clientName,
        mapping,
        bookMapping,
        savedAt: new Date().toISOString()
      };
      await saveTemplate(template);
      
      // Update local templates list
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

  return (
    <SessionContext.Provider
      value={{
        sessionActive,
        sessionMetadata,
        records,
        bookStock,
        templates,
        setupStep,
        loading,
        startSetup,
        saveMasterCatalog,
        saveBookStockCatalog,
        skipBookStock,
        saveColumnPreferences,
        endSession,
        addRecord,
        updateRecord,
        removeRecord,
        saveMappingTemplate,
        exportData
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

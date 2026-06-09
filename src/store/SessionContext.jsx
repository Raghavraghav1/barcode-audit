import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  getRecords, 
  saveRecord, 
  deleteRecord as dbDeleteRecord, 
  clearRecords, 
  getSessionMetadata, 
  saveSessionMetadata, 
  clearSessionMetadata 
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
  const [loading, setLoading] = useState(true);

  // Load active session from IndexedDB on startup (Crash recovery)
  useEffect(() => {
    const loadSessionData = async () => {
      try {
        const metadata = await getSessionMetadata();
        if (metadata) {
          setSessionMetadata(metadata);
          setSessionActive(true);
          const savedRecords = await getRecords();
          setRecords(savedRecords);
        }
      } catch (err) {
        console.error('Failed to restore offline session:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSessionData();
  }, []);

  const startSession = async (metadata) => {
    setLoading(true);
    try {
      const fullMetadata = {
        ...metadata,
        startTime: new Date().toISOString()
      };
      await saveSessionMetadata(fullMetadata);
      setSessionMetadata(fullMetadata);
      setSessionActive(true);
      setRecords([]);
      await clearRecords(); // clear any stale records
    } catch (err) {
      console.error('Failed to start session:', err);
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    setLoading(true);
    try {
      await clearSessionMetadata();
      await clearRecords();
      setSessionMetadata(null);
      setSessionActive(false);
      setRecords([]);
    } catch (err) {
      console.error('Failed to end/clear session:', err);
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

  const exportData = () => {
    if (records.length === 0) {
      alert('No scanned records available to export.');
      return;
    }
    exportAuditToExcel(records, sessionMetadata);
  };

  return (
    <SessionContext.Provider
      value={{
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
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

const DB_NAME = 'BarcodeAuditDB';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';
const STORE_SESSION = 'session';

let dbInstance = null;

export const initDB = () => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store for scanned audit items
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'id', autoIncrement: true });
      }
      
      // Store for metadata of the current active session
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
};

// --- Record Operations ---

export const getRecords = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RECORDS, 'readonly');
    const store = transaction.objectStore;
    const request = transaction.objectStore(STORE_RECORDS).getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const saveRecord = async (record) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RECORDS, 'readwrite');
    const store = transaction.objectStore(STORE_RECORDS);
    
    // If it is a new record, set scannedAt
    if (!record.scannedAt) {
      record.scannedAt = new Date().toISOString();
    }
    
    const request = store.put(record);

    request.onsuccess = (event) => {
      // Return the saved record with its auto-incremented ID
      const savedRecord = { ...record };
      if (!record.id) {
        savedRecord.id = event.target.result;
      }
      resolve(savedRecord);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const deleteRecord = async (id) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RECORDS, 'readwrite');
    const store = transaction.objectStore(STORE_RECORDS);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const clearRecords = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RECORDS, 'readwrite');
    const store = transaction.objectStore(STORE_RECORDS);
    const request = store.clear();

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// --- Session Operations ---

export const getSessionMetadata = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSION, 'readonly');
    const store = transaction.objectStore(STORE_SESSION);
    const request = store.get('current_session');

    request.onsuccess = () => {
      resolve(request.result ? request.result.value : null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const saveSessionMetadata = async (metadata) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSION, 'readwrite');
    const store = transaction.objectStore(STORE_SESSION);
    const request = store.put({ key: 'current_session', value: metadata });

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const clearSessionMetadata = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSION, 'readwrite');
    const store = transaction.objectStore(STORE_SESSION);
    const request = store.delete('current_session');

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

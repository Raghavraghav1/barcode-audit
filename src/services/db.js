const DB_NAME = 'BarcodeAuditDB';
const DB_VERSION = 2;
const STORE_RECORDS = 'records';
const STORE_SESSION = 'session';
const STORE_MASTER = 'master_items';
const STORE_BOOK_STOCK = 'book_stock';
const STORE_TEMPLATES = 'templates';

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

      // Store for Dynamic Master File items
      if (!db.objectStoreNames.contains(STORE_MASTER)) {
        const masterStore = db.createObjectStore(STORE_MASTER, { keyPath: 'id', autoIncrement: true });
        // Create index on barcode to support multiple items mapping to same barcode
        masterStore.createIndex('barcode', 'barcode', { unique: false });
      }

      // Store for Dynamic Book Stock quantities
      if (!db.objectStoreNames.contains(STORE_BOOK_STOCK)) {
        db.createObjectStore(STORE_BOOK_STOCK, { keyPath: 'barcode' });
      }

      // Store for Client Mapping templates
      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        db.createObjectStore(STORE_TEMPLATES, { keyPath: 'clientName' });
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

// --- Record Operations (Physical scans) ---

export const getRecords = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RECORDS, 'readonly');
    const store = transaction.objectStore(STORE_RECORDS);
    const request = store.getAll();

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
    
    if (!record.scannedAt) {
      record.scannedAt = new Date().toISOString();
    }
    
    const request = store.put(record);

    request.onsuccess = (event) => {
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

// --- Dynamic Master Catalog Operations ---

export const saveMasterItems = async (items) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MASTER, 'readwrite');
    const store = transaction.objectStore(STORE_MASTER);
    
    // Clear existing master items first
    store.clear();

    // Use fast sequential additions (or batch adds)
    let index = 0;
    
    function addNext() {
      if (index >= items.length) {
        resolve(true);
        return;
      }
      const req = store.add(items[index]);
      req.onsuccess = () => {
        index++;
        addNext();
      };
      req.onerror = (e) => {
        reject(e.target.error);
      };
    }
    
    addNext();
  });
};

export const clearMasterItems = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MASTER, 'readwrite');
    const store = transaction.objectStore(STORE_MASTER);
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

export const findMasterItemsByBarcode = async (barcode) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MASTER, 'readonly');
    const store = transaction.objectStore(STORE_MASTER);
    const index = store.index('barcode');
    const request = index.getAll(barcode);

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const getMasterItemsCount = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MASTER, 'readonly');
    const store = transaction.objectStore(STORE_MASTER);
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result || 0);
    };
    request.onerror = () => {
      resolve(0);
    };
  });
};

// --- Dynamic Book Stock Operations ---

export const saveBookStock = async (stockItems) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_BOOK_STOCK, 'readwrite');
    const store = transaction.objectStore(STORE_BOOK_STOCK);
    
    store.clear();

    let index = 0;
    
    function addNext() {
      if (index >= stockItems.length) {
        resolve(true);
        return;
      }
      const req = store.put(stockItems[index]);
      req.onsuccess = () => {
        index++;
        addNext();
      };
      req.onerror = (e) => {
        reject(e.target.error);
      };
    }
    
    addNext();
  });
};

export const getBookStock = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_BOOK_STOCK, 'readonly');
    const store = transaction.objectStore(STORE_BOOK_STOCK);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const clearBookStock = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_BOOK_STOCK, 'readwrite');
    const store = transaction.objectStore(STORE_BOOK_STOCK);
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

// --- Client Template Operations ---

export const saveTemplate = async (template) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_TEMPLATES, 'readwrite');
    const store = transaction.objectStore(STORE_TEMPLATES);
    const request = store.put(template);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

export const getTemplate = async (clientName) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_TEMPLATES, 'readonly');
    const store = transaction.objectStore(STORE_TEMPLATES);
    const request = store.get(clientName);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const getAllTemplates = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_TEMPLATES, 'readonly');
    const store = transaction.objectStore(STORE_TEMPLATES);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
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

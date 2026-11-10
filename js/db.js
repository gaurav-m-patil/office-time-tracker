/**
 * High-Performance Local-First Persistence Engine
 * Supports Instant Offline Boot (IndexedDB), Google Sheets Sync, and Native Firebase Firestore Migration
 */

window.OfficeDB = (function() {
  const DB_NAME = "OfficeTimeTrackerDB";
  const DB_VERSION = 1;
  const STORE_LOGS = "logs";
  const STORE_USERS = "users";
  const STORE_META = "meta";
  const STORE_QUEUE = "queue";

  let dbInstance = null;
  let inMemoryLogs = [];
  let inMemoryUsers = [];
  let isSyncing = false;
  let listeners = [];
  let firestoreDb = null;

  // Open / Upgrade IndexedDB
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_LOGS)) {
          const logStore = db.createObjectStore(STORE_LOGS, { keyPath: "logId" });
          logStore.createIndex("username", "username", { unique: false });
          logStore.createIndex("date", "date", { unique: false });
          logStore.createIndex("status", "status", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_USERS)) {
          db.createObjectStore(STORE_USERS, { keyPath: "username" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
        }
      };

      request.onsuccess = function(e) {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };

      request.onerror = function(e) {
        console.error("OfficeDB IndexedDB open error:", e);
        reject(e);
      };
    });
  }

  // Active Backend Resolver: 'firebase' or 'sheets'
  function getActiveBackend() {
    return localStorage.getItem(OfficeConfig.STORAGE_KEYS.ACTIVE_BACKEND) || 'firebase';
  }

  function setActiveBackend(backendType) {
    localStorage.setItem(OfficeConfig.STORAGE_KEYS.ACTIVE_BACKEND, backendType);
    notifyListeners({ type: "backend_changed", backend: backendType });
  }

  // Firebase Config & Initialization
  function getFirebaseConfig() {
    try {
      const cfg = localStorage.getItem(OfficeConfig.STORAGE_KEYS.FIREBASE_CONFIG);
      return cfg ? JSON.parse(cfg) : OfficeConfig.FIREBASE_CONFIG;
    } catch (e) {
      return OfficeConfig.FIREBASE_CONFIG;
    }
  }

  function initFirebase(config) {
    if (!config || !config.projectId || typeof firebase === 'undefined') {
      return false;
    }
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      firestoreDb = firebase.firestore();
      firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      return true;
    } catch (err) {
      console.warn("Firestore init notice:", err.message);
      try {
        firestoreDb = firebase.firestore();
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  // Bootstrap Engine: Guarantees zero data loss and instant boot
  async function init() {
    await openDatabase();

    // 1. Try to load existing records from IndexedDB
    let allLogs = await getAllLogsFromIDB();
    let allUsers = await getAllUsersFromIDB();

    // 2. Check legacy localStorage for existing logs to migrate if empty
    if (allLogs.length === 0) {
      const legacyLogsStr = localStorage.getItem("tt_logs");
      if (legacyLogsStr) {
        try {
          const parsed = JSON.parse(legacyLogsStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`Migrating ${parsed.length} records from legacy localStorage...`);
            await bulkInsertLogs(parsed);
            allLogs = parsed;
          }
        } catch (e) {}
      }
    }

    // 3. If still empty, load from seed-data.json (134 records)
    if (allLogs.length === 0 && OfficeConfig.SEED_DATA_URL) {
      try {
        console.log("Hydrating initial database from seed-data.json...");
        const res = await fetch(OfficeConfig.SEED_DATA_URL);
        if (res.ok) {
          const seedLogs = await res.json();
          if (Array.isArray(seedLogs) && seedLogs.length > 0) {
            await bulkInsertLogs(seedLogs);
            allLogs = seedLogs;
          }
        }
      } catch (err) {
        console.warn("Seed data hydration warning:", err);
      }
    }

    // 4. Ensure default users exist
    if (allUsers.length === 0) {
      const defaultUsers = [
        { username: "gaurav", firstName: "Gaurav", lastName: "Patil", role: "Admin" },
        { username: "Jebel", firstName: "Jebelste", lastName: "Sj", role: "User" }
      ];
      await bulkInsertUsers(defaultUsers);
      allUsers = defaultUsers;
    }

    inMemoryLogs = allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
    inMemoryUsers = allUsers;

    // Initialize Firebase in background if configured
    const fbConfig = getFirebaseConfig();
    if (fbConfig && fbConfig.projectId) {
      initFirebase(fbConfig);
    }

    notifyListeners({ type: "ready", count: inMemoryLogs.length });

    // Process any pending offline mutations
    processOfflineQueue();

    return inMemoryLogs;
  }

  // IndexedDB Primitive Helpers
  function getAllLogsFromIDB() {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve([]);
      const tx = dbInstance.transaction(STORE_LOGS, "readonly");
      const store = tx.objectStore(STORE_LOGS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  function getAllUsersFromIDB() {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve([]);
      const tx = dbInstance.transaction(STORE_USERS, "readonly");
      const store = tx.objectStore(STORE_USERS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  function bulkInsertLogs(logs) {
    return new Promise((resolve, reject) => {
      if (!dbInstance) return resolve();
      const tx = dbInstance.transaction(STORE_LOGS, "readwrite");
      const store = tx.objectStore(STORE_LOGS);
      logs.forEach(log => {
        if (!log.logId) log.logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        store.put(log);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function bulkInsertUsers(users) {
    return new Promise((resolve, reject) => {
      if (!dbInstance) return resolve();
      const tx = dbInstance.transaction(STORE_USERS, "readwrite");
      const store = tx.objectStore(STORE_USERS);
      users.forEach(u => store.put(u));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Public Getters
  function getLogs(username = null) {
    if (!username) return [...inMemoryLogs];
    return inMemoryLogs.filter(l => l.username.toLowerCase() === username.toLowerCase());
  }

  function getUsers() {
    return [...inMemoryUsers];
  }

  function getLogById(logId) {
    return inMemoryLogs.find(l => l.logId === logId) || null;
  }

  // Save / Update Attendance Log (Instant Local Optimistic UI)
  async function saveLog(logData, skipSync = false) {
    if (!logData.logId) {
      logData.logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // 1. Update in-memory state
    const existingIdx = inMemoryLogs.findIndex(l => l.logId === logData.logId);
    if (existingIdx >= 0) {
      inMemoryLogs[existingIdx] = { ...inMemoryLogs[existingIdx], ...logData };
    } else {
      inMemoryLogs.unshift(logData);
    }
    inMemoryLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 2. Commit to IndexedDB
    await new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_LOGS, "readwrite");
      tx.objectStore(STORE_LOGS).put(logData);
      tx.oncomplete = () => resolve();
    });

    notifyListeners({ type: "save", log: logData });

    // 3. Queue cloud sync
    if (!skipSync) {
      queueMutation({
        type: existingIdx >= 0 ? "updateLog" : "logTime",
        payload: logData
      });
    }

    return logData;
  }

  // Delete Log
  async function deleteLog(logId) {
    inMemoryLogs = inMemoryLogs.filter(l => l.logId !== logId);

    await new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_LOGS, "readwrite");
      tx.objectStore(STORE_LOGS).delete(logId);
      tx.oncomplete = () => resolve();
    });

    notifyListeners({ type: "delete", logId });

    queueMutation({
      type: "deleteLog",
      payload: { logId }
    });

    return true;
  }

  // Offline Mutation Queue Manager
  async function queueMutation(mutation) {
    if (!dbInstance) return;
    const tx = dbInstance.transaction(STORE_QUEUE, "readwrite");
    tx.objectStore(STORE_QUEUE).add({
      ...mutation,
      timestamp: Date.now()
    });
    tx.oncomplete = () => {
      processOfflineQueue();
    };
  }

  async function processOfflineQueue() {
    if (!navigator.onLine || isSyncing) return;
    if (!dbInstance) return;

    const queueItems = await new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_QUEUE, "readonly");
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (queueItems.length === 0) return;

    isSyncing = true;
    notifyListeners({ type: "sync_start", queueCount: queueItems.length });

    const backend = getActiveBackend();

    for (const item of queueItems) {
      try {
        if (backend === 'firebase' && firestoreDb) {
          await syncItemToFirestore(item);
        } else {
          await syncItemToAppsScript(item);
        }

        // Remove item from IndexedDB queue
        await new Promise((resolve) => {
          const tx = dbInstance.transaction(STORE_QUEUE, "readwrite");
          tx.objectStore(STORE_QUEUE).delete(item.id);
          tx.oncomplete = () => resolve();
        });
      } catch (err) {
        console.warn("Queue processing item paused:", err);
        break; // Stop and retry later if network failed
      }
    }

    isSyncing = false;
    notifyListeners({ type: "sync_complete" });
  }

  async function syncItemToAppsScript(item) {
    let action = item.type;
    let payload = { action, ...item.payload };

    const res = await fetch(OfficeConfig.WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  async function syncItemToFirestore(item) {
    if (!firestoreDb) return;
    const col = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS);
    if (item.type === 'deleteLog') {
      await col.doc(item.payload.logId).delete();
    } else {
      await col.doc(item.payload.logId).set(item.payload, { merge: true });
    }
  }

  // Force Cloud Sync (Pulls latest from Apps Script or Firestore)
  async function syncWithCloud() {
    if (!navigator.onLine) return;
    isSyncing = true;
    notifyListeners({ type: "sync_start" });

    try {
      const backend = getActiveBackend();
      if (backend === 'firebase' && firestoreDb) {
        const snap = await firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS).get();
        const firestoreLogs = [];
        snap.forEach(doc => firestoreLogs.push(doc.data()));
        if (firestoreLogs.length > 0) {
          await bulkInsertLogs(firestoreLogs);
          inMemoryLogs = firestoreLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
      } else {
        const res = await fetch(OfficeConfig.WEB_APP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getAllData" })
        });
        const data = await res.json();
        if (data && data.success && Array.isArray(data.logs) && data.logs.length > 0) {
          await bulkInsertLogs(data.logs);
          inMemoryLogs = data.logs.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
      }
    } catch (e) {
      console.warn("Cloud sync error:", e);
    } finally {
      isSyncing = false;
      notifyListeners({ type: "sync_complete", count: inMemoryLogs.length });
    }
  }

  // One-Click Firestore Migration Engine (Preserves 100% of data)
  async function migrateToFirestore(onProgress) {
    if (!firestoreDb) {
      const fbConfig = getFirebaseConfig();
      const ok = initFirebase(fbConfig);
      if (!ok) throw new Error("Firebase Firestore could not be initialized. Please check config.");
    }

    const total = inMemoryLogs.length;
    let completed = 0;
    const batchSize = 100;
    const col = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS);

    for (let i = 0; i < total; i += batchSize) {
      const chunk = inMemoryLogs.slice(i, i + batchSize);
      const batch = firestoreDb.batch();

      chunk.forEach(log => {
        const docRef = col.doc(log.logId);
        batch.set(docRef, {
          ...log,
          migratedAt: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();
      completed += chunk.length;
      if (onProgress) onProgress(completed, total);
    }

    // Switch active backend to firebase
    setActiveBackend('firebase');
    return { success: true, count: completed };
  }

  // Backup & Export Features
  function exportJSONBackup() {
    const backupObj = {
      version: OfficeConfig.APP_VERSION,
      exportedAt: new Date().toISOString(),
      users: inMemoryUsers,
      logs: inMemoryLogs
    };
    const jsonStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OfficeTimeTracker_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCSVBackup() {
    let csv = "logId,username,date,status,inTime,outTime,hours\n";
    inMemoryLogs.forEach(l => {
      const row = [
        `"${l.logId || ''}"`,
        `"${l.username || ''}"`,
        `"${l.date || ''}"`,
        `"${l.status || ''}"`,
        `"${l.inTime || ''}"`,
        `"${l.outTime || ''}"`,
        l.hours != null ? l.hours : 0
      ].join(",");
      csv += row + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OfficeTimeTracker_Records_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Event Listeners
  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter(l => l !== fn);
    };
  }

  function notifyListeners(event) {
    listeners.forEach(fn => {
      try { fn(event); } catch (e) {}
    });
  }

  return {
    init,
    getLogs,
    getUsers,
    getLogById,
    saveLog,
    deleteLog,
    syncWithCloud,
    processOfflineQueue,
    migrateToFirestore,
    exportJSONBackup,
    exportCSVBackup,
    getActiveBackend,
    setActiveBackend,
    getFirebaseConfig,
    initFirebase,
    subscribe
  };
})();

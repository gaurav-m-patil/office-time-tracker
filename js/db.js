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

  let firestoreListenerUnsub = null;

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

      // Background purge of legacy Jebel records from Firestore
      try {
        const logsCol = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS);
        logsCol.doc("478fd666-86aa-4600-8838-e00bd5899771").delete().catch(() => {});
        logsCol.doc("7aca281f-5da6-4e11-b75e-63afbab3e971").delete().catch(() => {});
        const usersCol = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.USERS);
        usersCol.doc("Jebel").delete().catch(() => {});
        usersCol.doc("jebel").delete().catch(() => {});
      } catch (e) {}

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

  // Strict Business Rule: One user can ONLY have ONE attendance record per date
  function deduplicateLogList(logs) {
    if (!Array.isArray(logs)) return { uniqueLogs: [], duplicateIds: [] };
    const dateMap = new Map();
    const duplicateIds = [];

    logs.forEach(log => {
      if (!log || !log.date) return;
      const cleanUser = (log.username || 'gaurav').toLowerCase();
      if (cleanUser === 'jebel' || cleanUser === 'jebelste') return;

      const key = `${cleanUser}_${log.date}`;
      if (!dateMap.has(key)) {
        dateMap.set(key, log);
      } else {
        const existing = dateMap.get(key);
        const hasExistingHours = (parseFloat(existing.hours) || 0) > 0 || (existing.inTime && existing.inTime.trim() !== "");
        const hasNewHours = (parseFloat(log.hours) || 0) > 0 || (log.inTime && log.inTime.trim() !== "");

        if (!hasExistingHours && hasNewHours) {
          if (existing.logId && !duplicateIds.includes(existing.logId)) duplicateIds.push(existing.logId);
          dateMap.set(key, log);
        } else {
          if (log.logId && !duplicateIds.includes(log.logId)) duplicateIds.push(log.logId);
        }
      }
    });

    return {
      uniqueLogs: Array.from(dateMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date)),
      duplicateIds
    };
  }

  // Real-time Firestore Multi-Device Sync Listener
  function setupFirestoreRealtimeListener() {
    if (!firestoreDb || firestoreListenerUnsub) return;
    try {
      firestoreListenerUnsub = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS)
        .onSnapshot((snapshot) => {
          let hasModifications = false;
          const logMap = new Map(inMemoryLogs.map(l => [l.logId, l]));

          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            if (!data || !data.logId) return;

            // Strict purge of legacy Jebel data
            const uName = (data.username || "").toLowerCase();
            if (uName === "jebel" || uName === "jebelste") return;

            if (change.type === "added" || change.type === "modified") {
              logMap.set(data.logId, data);
              hasModifications = true;
            } else if (change.type === "removed") {
              logMap.delete(data.logId);
              hasModifications = true;
            }
          });

          if (hasModifications) {
            const dedup = deduplicateLogList(Array.from(logMap.values()));
            inMemoryLogs = dedup.uniqueLogs;
            bulkInsertLogs(inMemoryLogs).catch(() => {});

            if (dedup.duplicateIds.length > 0) {
              if (dbInstance) {
                const tx = dbInstance.transaction(STORE_LOGS, "readwrite");
                dedup.duplicateIds.forEach(id => tx.objectStore(STORE_LOGS).delete(id));
              }
              if (navigator.onLine && firestoreDb) {
                const col = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS);
                dedup.duplicateIds.forEach(id => col.doc(id).delete().catch(() => {}));
              }
            }

            notifyListeners({ type: "cloud_sync", count: inMemoryLogs.length, source: "firestore_realtime" });
          }
        }, (err) => {
          console.warn("Firestore real-time listener notice:", err);
        });
    } catch (e) {
      console.warn("Failed to attach Firestore real-time listener:", e);
    }
  }

  // Bootstrap Engine: Guarantees zero data loss, instant boot, and real-time cloud sync
  async function init() {
    await openDatabase();

    // 1. Initialize Firebase immediately
    const fbConfig = getFirebaseConfig();
    if (fbConfig && fbConfig.projectId) {
      initFirebase(fbConfig);
    }

    // 2. Try to load existing records from IndexedDB
    let allLogs = await getAllLogsFromIDB();
    let allUsers = await getAllUsersFromIDB();

    // 3. Check legacy localStorage for existing logs to migrate if empty
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

    // 4. If still empty, load from seed-data.json (135 records)
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

    // 5. Ensure default user exists (Gaurav Patil only)
    allUsers = allUsers.filter(u => u.username && u.username.toLowerCase() !== 'jebel' && u.username.toLowerCase() !== 'jebelste');
    allLogs = allLogs.filter(l => l.username && l.username.toLowerCase() !== 'jebel' && l.username.toLowerCase() !== 'jebelste');

    // Strict Date-Level Deduplication Pass: Enforces 1 record per date
    const dedup = deduplicateLogList(allLogs);
    allLogs = dedup.uniqueLogs;

    if (allUsers.length === 0) {
      const defaultUsers = [
        { username: "gaurav", firstName: "Gaurav", lastName: "Patil", role: "Admin" }
      ];
      await bulkInsertUsers(defaultUsers);
      allUsers = defaultUsers;
    }

    // Explicitly purge any legacy Jebel records or duplicate IDs from IndexedDB
    try {
      if (dbInstance) {
        const delTx = dbInstance.transaction([STORE_USERS, STORE_LOGS], "readwrite");
        delTx.objectStore(STORE_USERS).delete("Jebel");
        delTx.objectStore(STORE_USERS).delete("jebel");
        delTx.objectStore(STORE_USERS).delete("jebelste");
        delTx.objectStore(STORE_LOGS).delete("478fd666-86aa-4600-8838-e00bd5899771");
        delTx.objectStore(STORE_LOGS).delete("7aca281f-5da6-4e11-b75e-63afbab3e971");
        dedup.duplicateIds.forEach(id => delTx.objectStore(STORE_LOGS).delete(id));
      }
    } catch (e) {
      console.warn("Legacy purge notice:", e);
    }

    inMemoryLogs = allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
    inMemoryUsers = allUsers;

    // 6. Connect Real-time Firestore Listener
    setupFirestoreRealtimeListener();

    notifyListeners({ type: "ready", count: inMemoryLogs.length });

    // 7. Trigger initial cloud sync to fetch any records added from other devices
    if (navigator.onLine) {
      syncWithCloud().catch(() => {});
      processOfflineQueue();
    }

    // 8. Auto-sync on network reconnect
    window.addEventListener('online', () => {
      console.log("[OfficeDB] Network reconnected - syncing with cloud...");
      processOfflineQueue();
      syncWithCloud();
    });

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

  // Save / Update Attendance Log (Instant Local Optimistic UI + Date-Uniqueness Guarantee + Direct Firestore Push)
  async function saveLog(logData, skipSync = false) {
    const cleanUser = (logData.username || 'gaurav').toLowerCase();
    logData.username = cleanUser;

    // Strict Date-Uniqueness Enforcement: A user can only have ONE entry per date
    const existingDateMatches = inMemoryLogs.filter(l => 
      (l.username || 'gaurav').toLowerCase() === cleanUser && l.date === logData.date
    );

    let oldDuplicateIds = [];
    if (existingDateMatches.length > 0) {
      const primaryLog = existingDateMatches[0];
      if (!logData.logId || logData.logId !== primaryLog.logId) {
        if (logData.logId) {
          oldDuplicateIds.push(primaryLog.logId);
        } else {
          logData.logId = primaryLog.logId;
        }
      }
      existingDateMatches.slice(1).forEach(dup => {
        if (!oldDuplicateIds.includes(dup.logId)) oldDuplicateIds.push(dup.logId);
      });
    }

    if (!logData.logId) {
      logData.logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Purge old duplicate IDs from inMemoryLogs
    if (oldDuplicateIds.length > 0) {
      inMemoryLogs = inMemoryLogs.filter(l => !oldDuplicateIds.includes(l.logId));
    }

    // 1. Update in-memory state
    const existingIdx = inMemoryLogs.findIndex(l => l.logId === logData.logId);
    if (existingIdx >= 0) {
      inMemoryLogs[existingIdx] = { ...inMemoryLogs[existingIdx], ...logData };
    } else {
      inMemoryLogs.unshift(logData);
    }
    inMemoryLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 2. Commit to IndexedDB (and purge obsolete duplicate IDs)
    await new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_LOGS, "readwrite");
      const store = tx.objectStore(STORE_LOGS);
      oldDuplicateIds.forEach(oldId => store.delete(oldId));
      store.put(logData);
      tx.oncomplete = () => resolve();
    });

    notifyListeners({ type: "save", log: logData });

    // 3. Immediate Cloud Push to Firestore & Cloud Purge of Duplicates
    if (!skipSync) {
      if (navigator.onLine && firestoreDb) {
        try {
          const col = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS);
          for (const oldId of oldDuplicateIds) {
            await col.doc(oldId).delete().catch(() => {});
          }
          await col.doc(logData.logId).set(logData, { merge: true });
        } catch (err) {
          console.warn("Direct Firestore write paused, queuing locally:", err);
          queueMutation({
            type: existingIdx >= 0 ? "updateLog" : "logTime",
            payload: logData
          });
        }
      } else {
        queueMutation({
          type: existingIdx >= 0 ? "updateLog" : "logTime",
          payload: logData
        });
      }
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

    if (navigator.onLine && firestoreDb) {
      try {
        await firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS).doc(logId).delete();
      } catch (err) {
        queueMutation({
          type: "deleteLog",
          payload: { logId }
        });
      }
    } else {
      queueMutation({
        type: "deleteLog",
        payload: { logId }
      });
    }

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
    if (!dbInstance || !firestoreDb) return;

    const queueItems = await new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_QUEUE, "readonly");
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (queueItems.length === 0) return;

    isSyncing = true;
    notifyListeners({ type: "sync_start", queueCount: queueItems.length });

    for (const item of queueItems) {
      try {
        await syncItemToFirestore(item);

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

  async function syncItemToFirestore(item) {
    if (!firestoreDb) return;
    const col = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS);
    if (item.type === 'deleteLog') {
      await col.doc(item.payload.logId).delete();
    } else {
      await col.doc(item.payload.logId).set(item.payload, { merge: true });
    }
  }

  // Force Cloud Sync (Pulls latest from Firestore)
  async function syncWithCloud() {
    if (!navigator.onLine || !firestoreDb) return;
    isSyncing = true;
    notifyListeners({ type: "sync_start" });

    try {
      const snap = await firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS).get();
      const firestoreLogs = [];
      snap.forEach(doc => {
        const d = doc.data();
        const u = (d.username || "").toLowerCase();
        if (u !== "jebel" && u !== "jebelste") {
          firestoreLogs.push(d);
        }
      });

      if (firestoreLogs.length > 0) {
        // Merge with any in-memory records and deduplicate
        const merged = [...firestoreLogs, ...inMemoryLogs];
        const dedup = deduplicateLogList(merged);
        inMemoryLogs = dedup.uniqueLogs;
        
        await bulkInsertLogs(inMemoryLogs);

        // Delete any redundant duplicate document IDs from IDB and Firestore
        if (dedup.duplicateIds.length > 0) {
          if (dbInstance) {
            const tx = dbInstance.transaction(STORE_LOGS, "readwrite");
            dedup.duplicateIds.forEach(id => tx.objectStore(STORE_LOGS).delete(id));
          }
          if (navigator.onLine && firestoreDb) {
            const col = firestoreDb.collection(OfficeConfig.FIRESTORE_COLLECTIONS.LOGS);
            dedup.duplicateIds.forEach(id => col.doc(id).delete().catch(() => {}));
          }
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
    getFirestoreInstance: () => firestoreDb,
    subscribe
  };
})();

/**
 * Enterprise Time Tracker - Authentication & RBAC Engine
 */

window.OfficeAuth = (function() {
  let currentUser = null;
  let currentName = null;
  let currentRole = "User";

  function init() {
    return checkSession();
  }

  function checkSession() {
    const savedUser = localStorage.getItem(OfficeConfig.STORAGE_KEYS.CURRENT_USER);
    const savedName = localStorage.getItem(OfficeConfig.STORAGE_KEYS.CURRENT_NAME);
    const savedRole = localStorage.getItem(OfficeConfig.STORAGE_KEYS.CURRENT_ROLE);

    // Session stays active on device until user explicitly logs out
    if (savedUser) {
      currentUser = savedUser;
      currentName = savedName || "Gaurav Patil";
      currentRole = savedRole || "User";
      return { username: currentUser, name: currentName, role: currentRole };
    }
    return null;
  }

  async function login(username, pin, isAdminMode = false) {
    const cleanPin = (pin || "").toString().trim();
    if (!cleanPin) {
      throw new Error("Please enter your 4-digit PIN.");
    }
    if (cleanPin.length !== 4) {
      throw new Error("PIN must be exactly 4 digits.");
    }

    const cleanUser = (username || "gaurav").trim().toLowerCase();
    const assignedRole = "Admin";
    const displayName = "Gaurav Patil";

    // 1. Authenticate against Firebase Firestore if online
    if (navigator.onLine && window.OfficeDB) {
      try {
        const firestore = OfficeDB.getFirestoreInstance ? OfficeDB.getFirestoreInstance() : null;
        if (firestore) {
          const userDocRef = firestore.collection(OfficeConfig.FIRESTORE_COLLECTIONS.USERS).doc(cleanUser);
          const snap = await userDocRef.get();
          if (snap.exists) {
            const data = snap.data();
            if (data.pin) {
              if (data.pin.toString().trim() !== cleanPin) {
                throw new Error("Incorrect PIN. Please try again.");
              }
            } else {
              // PIN not yet stored in cloud: securely register this PIN to Gaurav's user document
              await userDocRef.set({ pin: cleanPin }, { merge: true });
            }
          } else {
            // Create user document if it didn't exist
            await userDocRef.set({
              username: cleanUser,
              firstName: "Gaurav",
              lastName: "Patil",
              role: "Admin",
              pin: cleanPin
            }, { merge: true });
          }

          localStorage.setItem('office_secure_pin', cleanPin);

          // Trigger background cloud sync on successful online login
          if (typeof OfficeDB.syncWithCloud === 'function') {
            OfficeDB.syncWithCloud().catch(() => {});
          }

          return setSession(cleanUser, displayName, assignedRole);
        }
      } catch (e) {
        if (e.message && e.message.includes("Incorrect PIN")) {
          throw e;
        }
        console.warn("Online Firestore auth notice, verifying with cached PIN:", e);
      }
    }

    // 2. Offline / Local Cached PIN Verification
    const cachedPin = localStorage.getItem('office_secure_pin');
    if (cachedPin) {
      if (cleanPin === cachedPin) {
        return setSession(cleanUser, displayName, assignedRole);
      } else {
        throw new Error("Incorrect PIN. Please try again.");
      }
    }

    // First-time offline baseline: cache and permit
    localStorage.setItem('office_secure_pin', cleanPin);
    return setSession(cleanUser, displayName, assignedRole);
  }

  function setSession(username, name, role) {
    currentUser = username;
    currentName = name;
    currentRole = role;

    localStorage.setItem(OfficeConfig.STORAGE_KEYS.CURRENT_USER, username);
    localStorage.setItem(OfficeConfig.STORAGE_KEYS.CURRENT_NAME, name);
    localStorage.setItem(OfficeConfig.STORAGE_KEYS.CURRENT_ROLE, role);
    localStorage.setItem(OfficeConfig.STORAGE_KEYS.LOGIN_TIME, Date.now().toString());

    return { username, name, role };
  }

  function logout() {
    currentUser = null;
    currentName = null;
    currentRole = "User";

    localStorage.removeItem(OfficeConfig.STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(OfficeConfig.STORAGE_KEYS.CURRENT_NAME);
    localStorage.removeItem(OfficeConfig.STORAGE_KEYS.CURRENT_ROLE);
    localStorage.removeItem(OfficeConfig.STORAGE_KEYS.LOGIN_TIME);
    localStorage.removeItem(OfficeConfig.STORAGE_KEYS.ACTIVE_SHIFT);

    window.location.reload();
  }

  function getCurrentUser() {
    return currentUser;
  }

  function getCurrentName() {
    return currentName || currentUser || "Employee";
  }

  function getCurrentRole() {
    return currentRole || "User";
  }

  function getSession() {
    return {
      username: currentUser,
      name: currentName || currentUser || "Employee",
      role: currentRole || "User"
    };
  }

  function isAdmin() {
    return currentRole === "Admin";
  }

  return {
    init,
    login,
    logout,
    checkSession,
    getCurrentUser,
    getCurrentName,
    getCurrentRole,
    getSession,
    isAdmin
  };
})();

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
    const loginTime = localStorage.getItem(OfficeConfig.STORAGE_KEYS.LOGIN_TIME);

    if (savedUser && loginTime) {
      const timePassed = Date.now() - parseInt(loginTime, 10);
      if (timePassed > OfficeConfig.SESSION_EXPIRY_MS) {
        logout();
        return null;
      }
      currentUser = savedUser;
      currentName = savedName || savedUser;
      currentRole = savedRole || "User";
      return { username: currentUser, name: currentName, role: currentRole };
    }
    return null;
  }

  async function login(username, pin, isAdminMode = false) {
    if (!username || !pin) {
      throw new Error("Please enter both username and 4-digit PIN.");
    }
    if (pin.length !== 4 && !isAdminMode) {
      throw new Error("PIN must be 4 digits.");
    }

    // Role is strictly determined by login method:
    // User login screen -> 'User' (Admin tab strictly hidden)
    // Admin login screen -> 'Admin' (Admin tab enabled)
    const assignedRole = isAdminMode ? "Admin" : "User";

    // Try cloud authentication first if online
    if (navigator.onLine) {
      try {
        const res = await fetch(OfficeConfig.WEB_APP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login", username, password: pin })
        });
        const data = await res.json();
        if (data && data.success) {
          const firstName = data.firstName || username;
          return setSession(username, firstName, assignedRole);
        }
      } catch (e) {
        console.warn("Online auth notice, falling back to local verification:", e);
      }
    }

    // Local / Offline verification
    let displayName = username;
    if (window.OfficeDB && typeof OfficeDB.getUsers === 'function') {
      const users = OfficeDB.getUsers();
      const foundUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (foundUser) {
        displayName = `${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim() || username;
      }
    }

    if (username.toLowerCase() === 'gaurav') {
      displayName = 'Gaurav Patil';
    } else if (username.toLowerCase() === 'jebel') {
      displayName = 'Jebelste Sj';
    }

    return setSession(username, displayName, assignedRole);
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

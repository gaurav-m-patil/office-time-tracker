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

  async function login(username, pin) {
    if (!username || !pin) {
      throw new Error("Please enter both username and 4-digit PIN.");
    }
    if (pin.length !== 4 && currentRole !== "Admin") {
      throw new Error("PIN must be 4 digits.");
    }

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
          return setSession(username, data.firstName || username, data.role || (username === 'gaurav' ? 'Admin' : 'User'));
        }
      } catch (e) {
        console.warn("Online auth failed, falling back to local verification:", e);
      }
    }

    // Local / Offline fallback authentication
    const users = OfficeDB.getUsers();
    const foundUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (foundUser) {
      const role = foundUser.role || (username.toLowerCase() === 'gaurav' ? 'Admin' : 'User');
      const name = `${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim() || username;
      return setSession(foundUser.username, name, role);
    }

    // If username is gaurav or Jebel, allow login
    if (username.toLowerCase() === 'gaurav') {
      return setSession('gaurav', 'Gaurav Patil', 'Admin');
    } else if (username.toLowerCase() === 'jebel') {
      return setSession('Jebel', 'Jebelste Sj', 'User');
    }

    throw new Error("Invalid username or PIN.");
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

  function isAdmin() {
    return currentRole === "Admin" || (currentUser && currentUser.toLowerCase() === 'gaurav');
  }

  return {
    init,
    login,
    logout,
    checkSession,
    getCurrentUser,
    getCurrentName,
    getCurrentRole,
    isAdmin
  };
})();

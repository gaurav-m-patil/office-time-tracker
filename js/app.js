/**
 * Enterprise Time Tracker - Main Application Bootstrap
 */

window.OfficeApp = (function() {

  window.addEventListener('DOMContentLoaded', async () => {
    // 1. Register Service Worker for aggressive offline caching
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(() => {
        console.log('[TimeTracker] PWA Service Worker Registered');
      }).catch(err => {
        console.warn('[TimeTracker] SW Registration notice:', err);
      });
    }

    // 2. Initialize Persistence Engine (IndexedDB + 134 seed records)
    await OfficeDB.init();

    // 3. Initialize Shifts State Machine
    OfficeShifts.init();

    // 4. Check Authentication Session
    const session = OfficeAuth.init();
    if (session) {
      showDashboard(session);
    } else {
      showAuthScreen();
    }
  });

  function showDashboard(session) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('appBottomNav').classList.remove('hidden');

    const nameEl = document.getElementById('topbarUserName');
    if (nameEl) nameEl.innerText = session.name || session.username;

    const roleBadge = document.getElementById('topbarUserRole');
    if (roleBadge) roleBadge.innerText = session.role || 'User';

    const adminNav = document.getElementById('nav-admin');
    if (adminNav) {
      if (session.role === 'Admin') {
        adminNav.classList.remove('hidden');
      } else {
        adminNav.classList.add('hidden');
      }
    }

    // Initialize UI and render default tab
    OfficeUI.init();
    OfficeUI.switchTab('record');
  }

  function showAuthScreen() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('appBottomNav').classList.add('hidden');

    // Populate login users dropdown
    const select = document.getElementById('loginUserSelect');
    if (select) {
      const users = OfficeDB.getUsers();
      select.innerHTML = '<option value="">Select your name...</option>';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.username;
        opt.innerText = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username;
        select.appendChild(opt);
      });
    }
  }

  // Handle Login
  async function handleLogin() {
    const userSelect = document.getElementById('loginUserSelect');
    const adminUserInput = document.getElementById('loginAdminUsername');
    const pinInput = document.getElementById('loginPin');
    const msg = document.getElementById('authMsg');

    const isAdminMode = !document.getElementById('loginAdminGroup').classList.contains('hidden');
    const username = isAdminMode ? adminUserInput.value.trim() : userSelect.value;
    const pin = pinInput.value.trim();

    if (!username || !pin) {
      if (msg) {
        msg.innerText = "Please select user and enter 4-digit PIN.";
        msg.style.color = "var(--status-noshow)";
      }
      return;
    }

    try {
      const btn = document.getElementById('btnLogin');
      if (btn) { btn.innerText = "Verifying..."; btn.disabled = true; }

      const session = await OfficeAuth.login(username, pin);
      showDashboard(session);
      OfficeUI.showToast(`Welcome back, ${session.name}!`, 'success');
    } catch (err) {
      if (msg) {
        msg.innerText = err.message || "Invalid credentials.";
        msg.style.color = "var(--status-noshow)";
      }
      pinInput.value = "";
    } finally {
      const btn = document.getElementById('btnLogin');
      if (btn) { btn.innerText = "Sign In"; btn.disabled = false; }
    }
  }

  function checkAutoLogin(e) {
    const pinField = document.getElementById('loginPin');
    if (pinField && pinField.value.length === 4) {
      handleLogin();
    }
  }

  function toggleAdminMode() {
    const userGroup = document.getElementById('loginUserGroup');
    const adminGroup = document.getElementById('loginAdminGroup');
    const toggleBtn = document.getElementById('toggleAdminBtn');

    const isCurrentlyAdmin = !adminGroup.classList.contains('hidden');
    if (isCurrentlyAdmin) {
      adminGroup.classList.add('hidden');
      userGroup.classList.remove('hidden');
      toggleBtn.innerText = "Admin Login?";
    } else {
      adminGroup.classList.remove('hidden');
      userGroup.classList.add('hidden');
      toggleBtn.innerText = "Employee Login?";
    }
  }

  function hardRefresh() {
    if (confirm("Reset local cache and reload fresh version? Your attendance data is safely preserved.")) {
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
      window.location.reload(true);
    }
  }

  return {
    handleLogin,
    checkAutoLogin,
    toggleAdminMode,
    hardRefresh
  };
})();

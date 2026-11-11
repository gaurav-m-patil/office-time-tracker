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

    // 5. Smoothly reveal app and fade out splash screen
    OfficeUI.hideSplashScreen();
  });

  let currentPinStr = '';

  function showDashboard(session) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('appBottomNav').classList.remove('hidden');

    const nameEl = document.getElementById('topbarUserName');
    if (nameEl) nameEl.innerText = session.name || "Gaurav";

    const avatarLetter = document.getElementById('topbarAvatarLetter');
    if (avatarLetter) {
      avatarLetter.innerText = "G";
    }

    const roleBadge = document.getElementById('topbarUserRole');
    if (roleBadge) {
      roleBadge.classList.add('hidden');
    }

    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.classList.add('hidden');

    const historyNav = document.getElementById('nav-history');
    if (historyNav) historyNav.classList.remove('hidden');

    const insightsNav = document.getElementById('nav-insights');
    if (insightsNav) insightsNav.classList.remove('hidden');

    OfficeUI.init();
    OfficeUI.switchTab('record');
  }

  function updateAuthGreeting() {
    const title = document.getElementById('authGreetingTitle');
    if (!title) return;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning, Gaurav!' : (hour < 17 ? 'Good Afternoon, Gaurav!' : 'Good Evening, Gaurav!');
    title.innerText = greeting;
  }

  function resetPinDisplay() {
    currentPinStr = '';
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pinDot${i}`);
      if (dot) dot.classList.remove('filled');
    }
    const pinInput = document.getElementById('loginPin');
    if (pinInput) pinInput.value = '';
    const msg = document.getElementById('authMsg');
    if (msg) {
      msg.innerText = '';
      msg.style.color = '';
    }
  }

  function updateDotsUI() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pinDot${i}`);
      if (dot) {
        if (i < currentPinStr.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
      }
    }
  }

  function showAuthScreen() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('appBottomNav').classList.add('hidden');

    updateAuthGreeting();
    resetPinDisplay();
  }

  function focusPinInput() {
    const pinInput = document.getElementById('loginPin');
    if (pinInput) pinInput.focus();
  }

  async function handleKeypadPress(action) {
    if (window.OfficeShifts && typeof OfficeShifts.triggerHaptic === 'function') {
      OfficeShifts.triggerHaptic();
    }
    const msg = document.getElementById('authMsg');
    if (msg) msg.innerText = '';

    if (action === 'clear') {
      resetPinDisplay();
      return;
    }

    if (action === 'backspace') {
      if (currentPinStr.length > 0) {
        currentPinStr = currentPinStr.slice(0, -1);
        updateDotsUI();
      }
      return;
    }

    if (currentPinStr.length < 4 && /^[0-9]$/.test(action)) {
      currentPinStr += action;
      updateDotsUI();

      if (currentPinStr.length === 4) {
        await executePinLogin(currentPinStr);
      }
    }
  }

  async function handlePinInput(val) {
    const clean = (val || '').replace(/[^0-9]/g, '').substring(0, 4);
    currentPinStr = clean;
    updateDotsUI();

    if (currentPinStr.length === 4) {
      await executePinLogin(currentPinStr);
    }
  }

  async function executePinLogin(pin) {
    const msg = document.getElementById('authMsg');
    const card = document.getElementById('authLockCard');

    if (msg) {
      msg.innerText = 'Verifying security PIN...';
      msg.style.color = 'var(--primary)';
    }

    try {
      const session = await OfficeAuth.login('gaurav', pin);
      showDashboard(session);
      OfficeUI.showToast(`Welcome back, Gaurav!`, 'success');
    } catch (err) {
      if (card) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
      }
      if (msg) {
        msg.innerText = err.message || 'Incorrect PIN. Please try again.';
        msg.style.color = 'var(--status-noshow)';
      }
      resetPinDisplay();
    }
  }

  // Keyboard shortcut listener for desktop / laptop entry
  window.addEventListener('keydown', (e) => {
    const authSec = document.getElementById('authSection');
    if (!authSec || authSec.classList.contains('hidden')) return;

    if (e.key >= '0' && e.key <= '9') {
      handleKeypadPress(e.key);
    } else if (e.key === 'Backspace') {
      handleKeypadPress('backspace');
    } else if (e.key === 'Escape') {
      handleKeypadPress('clear');
    }
  });

  function hardRefresh() {
    if (confirm("Reload fresh version and clear local cache? Data is safely preserved.")) {
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
      window.location.reload(true);
    }
  }

  return {
    handleKeypadPress,
    handlePinInput,
    focusPinInput,
    executePinLogin,
    resetPinDisplay,
    hardRefresh
  };
})();

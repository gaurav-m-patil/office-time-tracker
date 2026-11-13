/**
 * Enterprise Time Tracker - UI Controller (Zero-Scroll Mobile Optimized with Smart Punch)
 */

window.OfficeUI = (function() {
  let activeTab = 'record';

  function init() {
    initTheme();
    setupNetworkStatusListeners();
    OfficeDB.subscribe(handleDatabaseEvent);
    resetRecordForm();
    updateSmartPunchUI();
    renderCompliantExitPredictor();
    setupSwipeNavigation();

    // Subscribe to shift ticker
    OfficeShifts.subscribe({
      onTick: (sec, hms) => {
        const timer = document.getElementById('shiftLiveTimer');
        if (timer) timer.innerText = hms;
        const smartBtnTimer = document.getElementById('smartPunchTimer');
        if (smartBtnTimer) smartBtnTimer.innerText = hms;
        const heroTimer = document.getElementById('heroTimerDisplay');
        if (heroTimer) heroTimer.innerText = hms;
        if (sec % 10 === 0 && activeTab === 'record') {
          renderCompliantExitPredictor();
        }
      }
    });
  }

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem(OfficeConfig.STORAGE_KEYS.THEME);
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark-mode');
      updateThemeMeta('#0b0f19');
    } else {
      document.body.classList.remove('dark-mode');
      updateThemeMeta('#4f46e5');
    }
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem(OfficeConfig.STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    updateThemeMeta(isDark ? '#0b0f19' : '#4f46e5');
    const icon = document.getElementById('themeToggleIcon');
    if (icon) icon.innerText = isDark ? 'light_mode' : 'dark_mode';
    const drawerIcon = document.getElementById('drawerThemeIcon');
    if (drawerIcon) drawerIcon.innerText = isDark ? 'light_mode' : 'dark_mode';
    const drawerDesc = document.getElementById('drawerThemeDesc');
    if (drawerDesc) drawerDesc.innerText = isDark ? 'Dark Mode (Active)' : 'Light Mode (Active)';
  }

  function updateThemeMeta(color) {
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', color);
  }

  // Network Status
  function setupNetworkStatusListeners() {
    const update = () => {
      const dot = document.getElementById('syncIndicator');
      if (!dot) return;
      if (!navigator.onLine) {
        dot.className = 'sync-status-dot offline';
        dot.title = 'Offline Mode';
      } else {
        dot.className = 'sync-status-dot';
        dot.title = 'Online & Cloud Synced';
      }
    };
    window.addEventListener('online', () => {
      update();
      showToast('Back online! Syncing records...', 'success');
      OfficeDB.processOfflineQueue();
    });
    window.addEventListener('offline', () => {
      update();
      showToast('Working offline. All changes saved locally.', 'warning');
    });
    update();
  }

  function handleDatabaseEvent(event) {
    const dot = document.getElementById('syncIndicator');
    if (event.type === 'sync_start' && dot) {
      dot.className = 'sync-status-dot syncing';
      dot.title = 'Syncing with Cloud...';
    } else if (event.type === 'sync_complete' && dot) {
      dot.className = 'sync-status-dot';
      dot.title = 'Cloud Synced';
      if (window.OfficeShifts && typeof OfficeShifts.recheckTodayLog === 'function') {
        OfficeShifts.recheckTodayLog();
      }
    }
    renderActiveView();
  }

  // Tab Navigation with Optional Smooth Swipe Animation
  function switchTab(tabId, direction = null) {
    if (activeTab === tabId && !direction) return;
    activeTab = tabId;

    document.querySelectorAll('.tab-pane').forEach(el => {
      el.classList.remove('active', 'anim-slide-left', 'anim-slide-right');
    });
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetPane = document.getElementById(`tab-${tabId}`);
    const targetNav = document.getElementById(`nav-${tabId}`);
    if (targetPane) {
      targetPane.classList.add('active');
      if (direction === 'left') {
        targetPane.classList.add('anim-slide-left');
      } else if (direction === 'right') {
        targetPane.classList.add('anim-slide-right');
      }
    }
    if (targetNav) targetNav.classList.add('active');

    if (tabId === 'record' && !document.getElementById('entryId').value) {
      resetRecordForm();
    }

    renderActiveView();
  }

  // WhatsApp / Instagram-Grade Touch Swipe Navigation
  function setupSwipeNavigation() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isHorizontalGesture = null;

    const container = document.getElementById('dashboardSection');
    if (!container) return;

    container.addEventListener('touchstart', (e) => {
      // Single finger touches only
      if (e.touches.length !== 1) return;

      // Reject swipe if any modal, drawer, or action sheet is active
      const hasOverlay = document.querySelector(
        '.drawer-backdrop.active, .modal-backdrop.active, .action-sheet-backdrop.active'
      );
      if (hasOverlay) {
        touchStartX = 0;
        return;
      }

      // Ignore if touch originates on form controls, buttons, or interactive action items
      const target = e.target;
      if (
        target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea') ||
        target.closest('button') ||
        target.closest('.action-btn') ||
        target.closest('.interactive-chip')
      ) {
        touchStartX = 0;
        return;
      }

      const touch = e.touches[0];
      // System Edge Swipe Rejection: ignore touches within 25px of screen boundaries
      if (touch.clientX < 25 || touch.clientX > window.innerWidth - 25) {
        touchStartX = 0;
        return;
      }

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
      isHorizontalGesture = null;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!touchStartX || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      // Classify gesture intention once displacement passes 10px
      if (isHorizontalGesture === null) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          // If vertical movement dominates, this is a page scroll: cancel tab swipe
          if (Math.abs(deltaY) >= Math.abs(deltaX)) {
            isHorizontalGesture = false;
            touchStartX = 0;
          } else {
            isHorizontalGesture = true;
          }
        }
      }
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (!touchStartX || isHorizontalGesture === false) {
        touchStartX = 0;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const duration = Date.now() - touchStartTime;

      touchStartX = 0;

      // Robust gesture verification:
      // 1. Must be a rapid swipe (< 550ms) unless distance is wide (> 90px)
      if (duration > 550 && Math.abs(deltaX) < 90) return;

      // 2. Strict angle filter: horizontal displacement must exceed vertical by 1.6x
      if (Math.abs(deltaX) < Math.abs(deltaY) * 1.6) return;

      // 3. Minimum distance threshold: 45px for normal swipe, 30px for quick flick (< 250ms)
      const minDistance = duration < 250 ? 30 : 45;
      if (Math.abs(deltaX) < minDistance) return;

      // Resolve currently visible navigation tabs dynamically
      const navItems = Array.from(document.querySelectorAll('#appBottomNav .nav-item:not(.hidden)'));
      const visibleTabs = navItems.map(btn => btn.id.replace('nav-', ''));
      if (!visibleTabs.length) return;

      const currentIndex = visibleTabs.indexOf(activeTab);
      if (currentIndex === -1) return;

      if (deltaX < 0) {
        // Swiped Left (finger moved ←) -> Next tab in sequence
        if (currentIndex < visibleTabs.length - 1) {
          const nextTab = visibleTabs[currentIndex + 1];
          switchTab(nextTab, 'left');
          OfficeShifts.triggerHaptic();
        }
      } else {
        // Swiped Right (finger moved →) -> Previous tab in sequence
        if (currentIndex > 0) {
          const prevTab = visibleTabs[currentIndex - 1];
          switchTab(prevTab, 'right');
          OfficeShifts.triggerHaptic();
        }
      }
    }, { passive: true });
  }

  function renderActiveView() {
    updateSmartPunchUI();
    renderCompliantExitPredictor();
    if (activeTab === 'record') {
      renderCompliantExitPredictor();
    } else if (activeTab === 'history') {
      renderHistoryTable();
    } else if (activeTab === 'insights') {
      renderInsightsView();
    } else if (activeTab === 'admin') {
      renderAdminTable();
    }
  }

  // Smart Punch Header Action (Clock In / Clock Out 1-Tap Toggle)
  async function handleSmartPunch() {
    const shift = OfficeShifts.getActiveShift();
    const inInput = document.getElementById('entryIn');
    const outInput = document.getElementById('entryOut');
    const statusSelect = document.getElementById('entryStatus');
    const fromInput = document.getElementById('entryFromDate');

    if (shift && shift.status === 'CLOCKED_IN') {
      // User is Clocked In -> CLOCK OUT NOW
      const nowStr = OfficeShifts.getCurrentTimeStr();
      if (outInput) outInput.value = nowStr;
      
      const res = await OfficeShifts.clockOut(nowStr);
      updateSmartPunchUI();
      renderCompliantExitPredictor();
      showToast(`🏁 Clocked Out! Duration: ${res.formattedDuration}`, 'success');
      
      // Auto-refresh tables
      renderActiveView();
    } else {
      // User is Clocked Out -> CLOCK IN NOW
      const nowStr = OfficeShifts.getCurrentTimeStr();
      const today = OfficeShifts.getLocalDateStr();
      
      if (fromInput) fromInput.value = today;
      if (statusSelect) statusSelect.value = 'Present';
      if (inInput) inInput.value = nowStr;
      if (outInput) outInput.value = '';
      handleStatusChange();

      await OfficeShifts.clockIn(today, nowStr);
      updateSmartPunchUI();
      renderCompliantExitPredictor();
      showToast(`⚡ Clocked In at ${OfficeShifts.formatTimeDisplay(nowStr)}!`, 'success');
    }
  }

  function updateSmartPunchUI() {
    const shift = OfficeShifts.getActiveShift();
    const smartBtn = document.getElementById('btnSmartPunch');
    const smartBtnText = document.getElementById('btnSmartPunchText');
    const timerSpan = document.getElementById('smartPunchTimer');
    const statusSub = document.getElementById('shiftLiveStatusSub');
    const shiftPill = document.getElementById('shiftLiveBadge');

    // Hero Cockpit DOM bindings
    const heroGreeting = document.getElementById('heroGreetingText');
    const heroDate = document.getElementById('heroTodayDateDisplay');
    const heroShiftBadge = document.getElementById('heroShiftBadge');
    const heroShiftBadgeText = document.getElementById('heroShiftBadgeText');
    const heroTimer = document.getElementById('heroTimerDisplay');
    const heroTimerSub = document.getElementById('heroTimerSub');
    const heroInTimeText = document.getElementById('heroShiftInTimeText');

    const currentUser = OfficeAuth.getCurrentUser() || 'gaurav';
    const hour = new Date().getHours();
    const greetingWord = hour < 12 ? 'Good Morning' : (hour < 17 ? 'Good Afternoon' : 'Good Evening');
    const capitalizedUser = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
    
    if (heroGreeting) heroGreeting.innerText = `${greetingWord}, ${capitalizedUser}`;
    
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateFormatted = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    if (heroDate) heroDate.innerText = dateFormatted;

    if (shift && shift.status === 'CLOCKED_IN') {
      const elapsedSec = OfficeShifts.getElapsedSeconds();
      const hms = OfficeShifts.formatSecondsToHMS(elapsedSec);

      if (smartBtn) {
        smartBtn.className = 'btn-smart-punch-hero punch-out';
      }
      if (smartBtnText) smartBtnText.innerText = 'Clock Out';
      if (timerSpan) {
        timerSpan.classList.remove('hidden');
        timerSpan.innerText = hms;
      }
      if (statusSub) statusSub.innerText = `Shift active since ${shift.inTime || ''}`;
      if (shiftPill) {
        shiftPill.className = 'shift-live-pill active';
        document.getElementById('shiftLiveText').innerText = 'Active';
      }

      if (heroShiftBadge) {
        heroShiftBadge.className = 'hero-shift-badge active';
      }
      if (heroShiftBadgeText) heroShiftBadgeText.innerText = 'Active Shift';
      if (heroTimer) heroTimer.innerText = hms;
      if (heroTimerSub) heroTimerSub.innerText = 'Elapsed Work Time';
      if (heroInTimeText) heroInTimeText.innerText = `Shift started at ${shift.inTime || ''}`;
    } else {
      if (smartBtn) {
        smartBtn.className = 'btn-smart-punch-hero punch-in';
      }
      if (smartBtnText) smartBtnText.innerText = 'Clock In';
      if (timerSpan) timerSpan.classList.add('hidden');
      
      const lastDur = shift.lastDuration != null ? OfficeShifts.formatDurationDisplay(shift.lastDuration) : null;
      if (statusSub) {
        statusSub.innerText = lastDur ? `Today completed: ${lastDur}` : 'Ready for shift';
      }
      if (shiftPill) {
        shiftPill.className = 'shift-live-pill';
        document.getElementById('shiftLiveText').innerText = lastDur ? 'Done' : 'Ready';
      }

      if (heroShiftBadge) {
        heroShiftBadge.className = 'hero-shift-badge';
      }
      if (heroShiftBadgeText) heroShiftBadgeText.innerText = lastDur ? 'Completed' : 'Shift Ready';
      if (heroTimer) heroTimer.innerText = lastDur ? lastDur : '00:00:00';
      if (heroTimerSub) heroTimerSub.innerText = lastDur ? "Today's Tracked Time" : 'Ready to Start Shift';
      if (heroInTimeText) heroInTimeText.innerText = lastDur ? `Today finalized: ${lastDur}` : 'Ready to start today\'s shift';
    }
  }

  // Option 1: Compliant Exit Time Predictor Card
  function renderCompliantExitPredictor() {
    const container = document.getElementById('compliantExitContainer') || document.getElementById('weekRadarContainer');
    if (!container) return;

    const shift = OfficeShifts.getActiveShift();
    const currentUser = OfficeAuth.getCurrentUser() || 'gaurav';
    const today = OfficeShifts.getLocalDateStr();
    const logs = OfficeDB.getLogs(currentUser);
    const todayLog = logs.find(l => l.date === today && l.username.toLowerCase() === currentUser.toLowerCase());

    if (shift && shift.status === 'CLOCKED_IN') {
      // User is currently clocked in: compute projected exit times based on in-time
      let inDate = null;
      if (shift.clockInTimestamp) {
        inDate = new Date(shift.clockInTimestamp);
      } else if (shift.inTime) {
        const time24 = OfficeShifts.convertTo24Hour(shift.inTime);
        const [hh, mm] = time24.split(':').map(Number);
        inDate = new Date();
        inDate.setHours(hh, mm, 0, 0);
      } else {
        inDate = new Date();
      }

      const breakMins = shift.breakMinutes || 0;
      const minExitDate = new Date(inDate.getTime() + (7 * 60 + breakMins) * 60 * 1000);
      const optExitDate = new Date(inDate.getTime() + (8 * 60 + breakMins) * 60 * 1000);

      const minExitStr = OfficeShifts.formatTimeDisplay(`${String(minExitDate.getHours()).padStart(2, '0')}:${String(minExitDate.getMinutes()).padStart(2, '0')}`);
      const optExitStr = OfficeShifts.formatTimeDisplay(`${String(optExitDate.getHours()).padStart(2, '0')}:${String(optExitDate.getMinutes()).padStart(2, '0')}`);

      const elapsedSec = OfficeShifts.getElapsedSeconds();
      const neededSec7h = Math.max(0, 7 * 3600 - elapsedSec);
      const neededSec8h = Math.max(0, 8 * 3600 - elapsedSec);

      let paceMsg = '';
      if (neededSec7h > 0) {
        const remH = Math.floor(neededSec7h / 3600);
        const remM = Math.floor((neededSec7h % 3600) / 60);
        const remStr = `${remH > 0 ? remH + 'h ' : ''}${remM}m`;
        paceMsg = `⏳ <strong>${remStr} remaining</strong> to reach 7.0h compliance (In: ${shift.inTime || 'Active'})`;
      } else if (neededSec8h > 0) {
        const remH = Math.floor(neededSec8h / 3600);
        const remM = Math.floor((neededSec8h % 3600) / 60);
        const remStr = `${remH > 0 ? remH + 'h ' : ''}${remM}m`;
        paceMsg = `🎉 <strong>7.0h Compliant achieved!</strong> • ${remStr} left to 8.0h target`;
      } else {
        paceMsg = `🏆 <strong>8.0h Optimal Target exceeded!</strong> Excellent work today!`;
      }

      container.innerHTML = `
        <div class="exit-card-header">
          <div class="exit-card-title">
            <i class="material-icons-round" style="font-size:14px; color:var(--primary);">timelapse</i>
            Compliant Exit Time Predictor
          </div>
          <span class="exit-status-pill active">
            <span class="dot" style="width:5px; height:5px; border-radius:50%; background:#10b981; display:inline-block;"></span>
            Shift Active
          </span>
        </div>
        <div class="exit-tiles-grid">
          <div class="exit-time-tile">
            <span class="tile-target-lbl">7.0h Minimum Exit</span>
            <span class="tile-time-val val-compliant">${minExitStr}</span>
            <span class="tile-sub-pill">Company Minimum</span>
          </div>
          <div class="exit-time-tile">
            <span class="tile-target-lbl">8.0h Optimal Target</span>
            <span class="tile-time-val val-optimal">${optExitStr}</span>
            <span class="tile-sub-pill">Full Day Goal</span>
          </div>
        </div>
        <div class="exit-footer-banner">
          ${paceMsg}
        </div>
      `;
    } else {
      // User is Clocked Out
      const lastDur = (shift && shift.lastDuration != null) 
        ? OfficeShifts.formatDurationDisplay(shift.lastDuration) 
        : (todayLog && todayLog.hours ? OfficeShifts.formatDurationDisplay(todayLog.hours) : null);

      if (lastDur) {
        // Shift completed today
        const inTimeStr = (todayLog && todayLog.inTime) ? todayLog.inTime : (shift.inTime || '--');
        const outTimeStr = (todayLog && todayLog.outTime) ? todayLog.outTime : '--';
        const hoursNum = todayLog && todayLog.hours ? parseFloat(todayLog.hours) : 0;
        const isCompliant = hoursNum >= 7.0;

        container.innerHTML = `
          <div class="exit-card-header">
            <div class="exit-card-title">
              <i class="material-icons-round" style="font-size:14px; color:#10b981;">task_alt</i>
              Today's Shift Completion
            </div>
            <span class="exit-status-pill done">Shift Finished</span>
          </div>
          <div class="exit-tiles-grid">
            <div class="exit-time-tile">
              <span class="tile-target-lbl">Total Time Logged</span>
              <span class="tile-time-val ${isCompliant ? 'val-compliant' : 'val-optimal'}">${lastDur}</span>
              <span class="tile-sub-pill">${isCompliant ? '✅ Compliant (≥ 7h)' : 'Logged Hours'}</span>
            </div>
            <div class="exit-time-tile">
              <span class="tile-target-lbl">Shift Window</span>
              <span class="tile-time-val" style="font-size:13px; color:var(--text-primary); margin-top:3px;">${inTimeStr} → ${outTimeStr}</span>
              <span class="tile-sub-pill">Recorded in System</span>
            </div>
          </div>
          <div class="exit-footer-banner">
            ✅ <strong>Shift Complete:</strong> Today's attendance is safely recorded in history.
          </div>
        `;
      } else {
        // Not yet clocked in today: show dynamic departure preview if clocked in right now
        const now = new Date();
        const nowStr = OfficeShifts.getCurrentTimeStr();
        const minDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const optDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const minExitStr = OfficeShifts.formatTimeDisplay(`${String(minDate.getHours()).padStart(2, '0')}:${String(minDate.getMinutes()).padStart(2, '0')}`);
        const optExitStr = OfficeShifts.formatTimeDisplay(`${String(optDate.getHours()).padStart(2, '0')}:${String(optDate.getMinutes()).padStart(2, '0')}`);

        container.innerHTML = `
          <div class="exit-card-header">
            <div class="exit-card-title">
              <i class="material-icons-round" style="font-size:14px; color:var(--primary);">schedule</i>
              Shift Departure Planner
            </div>
            <span class="exit-status-pill ready">Ready to Start</span>
          </div>
          <div class="exit-tiles-grid">
            <div class="exit-time-tile">
              <span class="tile-target-lbl">If In at ${nowStr} (7h)</span>
              <span class="tile-time-val val-compliant">${minExitStr}</span>
              <span class="tile-sub-pill">Minimum Departure</span>
            </div>
            <div class="exit-time-tile">
              <span class="tile-target-lbl">If In at ${nowStr} (8h)</span>
              <span class="tile-time-val val-optimal">${optExitStr}</span>
              <span class="tile-sub-pill">Target Departure</span>
            </div>
          </div>
          <div class="exit-footer-banner">
            💡 Tap <strong>Clock In</strong> when you enter office to start live compliance countdown.
          </div>
        `;
      }
    }
  }

  // Alias for backward compatibility
  function renderWeekRadar(logs, user) {
    renderCompliantExitPredictor();
  }

  function handleDayChipClick(dateStr) {
    const user = OfficeAuth.getCurrentUser();
    const logs = OfficeDB.getLogs(user);
    const log = logs.find(l => l.date === dateStr);
    const fromInput = document.getElementById('entryFromDate');
    const toInput = document.getElementById('entryToDate');

    if (log) {
      editRecord(log);
      showToast(`Editing entry for ${OfficeShifts.formatDateDDMonYY(dateStr)}`, 'info');
    } else {
      resetRecordForm();
      if (fromInput) fromInput.value = dateStr;
      if (toInput) toInput.value = '';
      showToast(`Selected date: ${OfficeShifts.formatDateDDMonYY(dateStr)}`, 'info');
    }
  }

  // Record Form Logic
  function resetRecordForm() {
    const today = OfficeShifts.getLocalDateStr();
    const fromInput = document.getElementById('entryFromDate');
    const toInput = document.getElementById('entryToDate');
    const inInput = document.getElementById('entryIn');
    const outInput = document.getElementById('entryOut');
    const statusSelect = document.getElementById('entryStatus');
    const idInput = document.getElementById('entryId');
    const title = document.getElementById('formTitle');
    const btnSubmit = document.getElementById('btnSubmitLog');
    const quickDate = document.getElementById('quickDateDisplay');

    if (fromInput) { fromInput.value = today; fromInput.max = today; }
    if (toInput) { toInput.value = ''; toInput.max = today; }
    if (inInput) inInput.value = '';
    if (outInput) outInput.value = '';
    if (idInput) idInput.value = '';
    if (statusSelect) statusSelect.value = 'Present';
    if (title) title.innerText = 'Record Attendance';
    if (btnSubmit) btnSubmit.innerText = 'Save Entry';
    if (quickDate) quickDate.innerText = OfficeShifts.formatDateDDMonYY(today);

    handleStatusChange();
    updateSmartPunchUI();
    renderCompliantExitPredictor();
    renderCompliantExitPredictor();
  }

  function handleStatusChange() {
    const statusSelect = document.getElementById('entryStatus');
    const inInput = document.getElementById('entryIn');
    const outInput = document.getElementById('entryOut');
    if (!statusSelect || !inInput || !outInput) return;

    if (statusSelect.value !== 'Present') {
      inInput.value = '';
      outInput.value = '';
      inInput.disabled = true;
      outInput.disabled = true;
    } else {
      inInput.disabled = false;
      outInput.disabled = false;
    }
  }

  function quickAction(type) {
    const statusSelect = document.getElementById('entryStatus');
    const inInput = document.getElementById('entryIn');
    const outInput = document.getElementById('entryOut');

    if (type === 'in') {
      if (statusSelect) statusSelect.value = 'Present';
      const nowStr = OfficeShifts.getCurrentTimeStr();
      if (inInput) inInput.value = nowStr;
      OfficeShifts.clockIn(OfficeShifts.getLocalDateStr(), nowStr);
      showToast('⚡ In-time registered', 'success');
    } else if (type === 'out') {
      if (statusSelect) statusSelect.value = 'Present';
      const nowStr = OfficeShifts.getCurrentTimeStr();
      if (outInput) outInput.value = nowStr;
      
      // Stop the active timer immediately!
      const inVal = inInput ? inInput.value : "";
      if (inVal) {
        const calc = OfficeShifts.calculateHours(inVal, nowStr);
        OfficeShifts.closeShift(calc.hoursDecimal);
      } else {
        OfficeShifts.closeShift();
      }
      showToast('🏁 Out-time registered', 'info');
    } else if (type === 'leave') {
      if (statusSelect) statusSelect.value = 'Leave';
      OfficeShifts.closeShift();
    } else if (type === 'exception') {
      if (statusSelect) statusSelect.value = 'Exception';
      OfficeShifts.closeShift();
    } else if (type === 'noshow') {
      if (statusSelect) statusSelect.value = 'No Show';
      OfficeShifts.closeShift();
    } else if (type === 'weekend') {
      if (statusSelect) statusSelect.value = 'Weekend';
      OfficeShifts.closeShift();
    } else if (type === 'holiday') {
      if (statusSelect) statusSelect.value = 'Holiday';
      OfficeShifts.closeShift();
    }

    handleStatusChange();
    updateSmartPunchUI();
    renderCompliantExitPredictor();
    renderCompliantExitPredictor();
  }

  async function submitLog() {
    const logId = document.getElementById('entryId').value;
    const fromDate = document.getElementById('entryFromDate').value;
    const toDate = document.getElementById('entryToDate').value;
    const status = document.getElementById('entryStatus').value;
    const inTime = document.getElementById('entryIn').value;
    const outTime = document.getElementById('entryOut').value;
    const msg = document.getElementById('logMsg');
    const user = OfficeAuth.getCurrentUser() || 'gaurav';

    if (!fromDate) {
      if (msg) { msg.innerText = 'From Date is required.'; msg.style.color = 'var(--status-noshow)'; }
      return;
    }

    if (toDate && new Date(toDate) < new Date(fromDate)) {
      if (msg) { msg.innerText = 'To Date cannot be before From Date.'; msg.style.color = 'var(--status-noshow)'; }
      return;
    }

    if (status === 'Present' && (!inTime || !outTime)) {
      if (msg) { msg.innerText = 'In and Out times required for Present.'; msg.style.color = 'var(--status-noshow)'; }
      return;
    }

    const cleanIn = inTime ? OfficeShifts.formatTimeDisplay(inTime) : '';
    const cleanOut = outTime ? OfficeShifts.formatTimeDisplay(outTime) : '';
    let calcHours = 0;

    if (status === 'Present' && inTime && outTime) {
      const calc = OfficeShifts.calculateHours(cleanIn, cleanOut);
      calcHours = calc.hoursDecimal;
    }

    const isRange = Boolean(toDate && toDate !== fromDate);
    const todayStr = OfficeShifts.getLocalDateStr();
    const isTodayAffected = (fromDate === todayStr) || (isRange && fromDate <= todayStr && toDate >= todayStr);

    // Only close active shift if saving/editing TODAY and an Out Time is completed
    if (isTodayAffected && cleanOut) {
      OfficeShifts.closeShift(calcHours);
    }

    if (isRange) {
      let curr = new Date(fromDate);
      let endD = new Date(toDate);
      while (curr <= endD) {
        let loopDate = OfficeShifts.getLocalDateStr(curr);
        const rangeTargetId = `gaurav_${loopDate}`;
        await OfficeDB.saveLog({
          logId: rangeTargetId,
          username: user,
          date: loopDate,
          status: status,
          inTime: cleanIn,
          outTime: cleanOut,
          hours: calcHours
        });
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      const targetId = `gaurav_${fromDate}`;
      await OfficeDB.saveLog({
        logId: targetId,
        username: user,
        date: fromDate,
        status: status,
        inTime: cleanIn,
        outTime: cleanOut,
        hours: calcHours
      });
    }

    if (msg) {
      msg.innerText = logId ? 'Updated successfully!' : 'Saved successfully!';
      msg.style.color = 'var(--status-present)';
    }

    updateSmartPunchUI();
    renderCompliantExitPredictor();

    setTimeout(() => {
      if (msg) msg.innerText = '';
      resetRecordForm();
      switchTab('history');
    }, 400);
  }

  let activeComplianceMonth = null;
  let activeActionLog = null;

  function setComplianceMonth(ym) {
    activeComplianceMonth = ym;
    renderInsightsView();
  }

  // Smart Record Action Sheet Controls
  function openRecordActionSheet(logId) {
    const user = OfficeAuth.getCurrentUser();
    const logs = OfficeDB.getLogs(user);
    const log = logs.find(l => l.logId === logId);
    if (!log) return;

    activeActionLog = log;
    const sheet = document.getElementById('recordActionSheetBackdrop');
    if (!sheet) return;

    const datePill = document.getElementById('actionSheetDatePill');
    const titleEl = document.getElementById('actionSheetTitle');
    const metaEl = document.getElementById('actionSheetMeta');

    if (datePill) datePill.innerText = OfficeShifts.formatDateDDMonYY(log.date);
    if (titleEl) titleEl.innerText = `${log.status} Entry`;

    let timeStr = 'No time logged';
    if (log.inTime && log.outTime) {
      timeStr = `${OfficeShifts.formatTimeDisplay(log.inTime)} → ${OfficeShifts.formatTimeDisplay(log.outTime)} (${OfficeShifts.formatDurationDisplay(log.hours)})`;
    } else if (log.inTime) {
      timeStr = `Clocked in at ${OfficeShifts.formatTimeDisplay(log.inTime)}`;
    } else {
      timeStr = `Status: ${log.status}`;
    }
    if (metaEl) metaEl.innerText = timeStr;

    sheet.classList.add('active');
  }

  function closeActionSheet() {
    const sheet = document.getElementById('recordActionSheetBackdrop');
    if (sheet) sheet.classList.remove('active');
    activeActionLog = null;
  }

  function handleSheetEdit() {
    if (!activeActionLog) return;
    const target = activeActionLog;
    closeActionSheet();
    editRecord(target);
  }

  function handleSheetCopyToday() {
    if (!activeActionLog) return;
    const target = activeActionLog;
    closeActionSheet();

    switchTab('record');
    resetRecordForm();

    const today = OfficeShifts.getLocalDateStr();
    document.getElementById('entryFromDate').value = today;
    document.getElementById('entryToDate').value = '';
    document.getElementById('entryStatus').value = target.status;
    document.getElementById('entryIn').value = target.inTime ? OfficeShifts.convertTo24Hour(target.inTime) : '';
    document.getElementById('entryOut').value = target.outTime ? OfficeShifts.convertTo24Hour(target.outTime) : '';
    document.getElementById('entryId').value = ''; // clean new entry for today

    handleStatusChange();
    showToast(`📋 Copied times to today's form!`, 'info');
  }

  function handleSheetDelete() {
    if (!activeActionLog) return;
    const logId = activeActionLog.logId;
    closeActionSheet();
    deleteRecord(logId);
  }

  function hideSplashScreen() {
    const splash = document.getElementById('appSplashScreen');
    if (!splash) return;
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 400);
  }

  // History View (Zero Horizontal Scroll - Responsive Attendance Cards Feed)
  function renderHistoryTable() {
    const user = OfficeAuth.getCurrentUser();
    const logs = OfficeDB.getLogs(user);
    const feed = document.getElementById('historyCardsFeed');
    const tbody = document.getElementById('historyTableBody');
    const countBadge = document.getElementById('historyCountBadge');

    if (countBadge) countBadge.innerText = `${logs.length} records`;

    if (logs.length === 0) {
      if (feed) {
        feed.innerHTML = `
          <div class="empty-state-card">
            <i class="material-icons-round empty-icon">event_busy</i>
            <div class="empty-title">No attendance records yet</div>
            <div class="empty-sub">Your attendance records and shift punches will appear here.</div>
          </div>
        `;
      }
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No records found.</td></tr>`;
      }
      return;
    }

    if (feed) {
      feed.innerHTML = logs.map(log => {
        const safeLog = JSON.stringify(log).replace(/'/g, "&#39;");
        const statusKey = (log.status || 'present').toLowerCase().replace(/\s+/g, '-');
        const parsedDate = new Date(log.date + 'T00:00:00');
        const dayNum = parsedDate.getDate();
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const monthStr = monthNames[parsedDate.getMonth()] || '';
        const weekdayStr = dayNames[parsedDate.getDay()] || '';

        const hoursNum = parseFloat(log.hours) || 0;
        const isOptimal = hoursNum >= 8.0;
        const isCompliant = hoursNum >= 7.0;

        let timeSpanText = '—';
        if (log.inTime && log.outTime) {
          timeSpanText = `${OfficeShifts.formatTimeDisplay(log.inTime)} → ${OfficeShifts.formatTimeDisplay(log.outTime)}`;
        } else if (log.inTime) {
          timeSpanText = `In: ${OfficeShifts.formatTimeDisplay(log.inTime)}`;
        } else {
          timeSpanText = log.status;
        }

        return `
          <div class="attendance-card" onclick="OfficeUI.openRecordActionSheet('${log.logId}')">
            <div class="card-date-badge">
              <span class="card-date-day">${dayNum}</span>
              <span class="card-date-month">${monthStr}</span>
              <span class="card-date-weekday">${weekdayStr}</span>
            </div>
            
            <div class="card-middle">
              <div class="card-middle-top">
                <span class="status-pill status-${statusKey}">${log.status}</span>
                ${log.status === 'Present' ? `
                  <span class="card-hours-tag ${isOptimal ? 'hours-optimal' : (isCompliant ? 'hours-compliant' : 'hours-sub')}">
                    <i class="material-icons-round" style="font-size:12px; margin-right:2px;">timer</i>
                    ${OfficeShifts.formatDurationDisplay(log.hours)}
                  </span>
                ` : `
                  <span class="card-hours-tag hours-neutral">—</span>
                `}
              </div>
              <div class="card-middle-bottom">
                <i class="material-icons-round time-clock-icon">schedule</i>
                <span class="time-range-text">${timeSpanText}</span>
              </div>
            </div>

            <div class="card-actions-col">
              <button class="card-touch-action-btn btn-quick-edit" onclick='event.stopPropagation(); OfficeUI.editRecord(${safeLog})' title="Edit entry">
                <i class="material-icons-round">edit</i>
              </button>
              <button class="card-touch-action-btn btn-quick-more" onclick="event.stopPropagation(); OfficeUI.openRecordActionSheet('${log.logId}')" title="More options">
                <i class="material-icons-round">more_vert</i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    if (tbody) {
      tbody.innerHTML = logs.map(log => {
        const safeLog = JSON.stringify(log).replace(/'/g, "&#39;");
        return `
          <tr>
            <td><strong>${OfficeShifts.formatDateDDMonYY(log.date)}</strong></td>
            <td><span class="status-pill">${log.status}</span></td>
            <td>${log.inTime ? OfficeShifts.formatTimeDisplay(log.inTime) : '-'}</td>
            <td>${log.outTime ? OfficeShifts.formatTimeDisplay(log.outTime) : '-'}</td>
            <td><strong>${OfficeShifts.formatDurationDisplay(log.hours)}</strong></td>
            <td>
              <div style="display:flex; gap:4px;">
                <button class="action-btn" onclick='OfficeUI.editRecord(${safeLog})' title="Edit">
                  <i class="material-icons-round" style="font-size:14px; vertical-align:middle;">edit</i>
                </button>
                <button class="action-btn btn-delete" onclick="OfficeUI.deleteRecord('${log.logId}')" title="Delete">
                  <i class="material-icons-round" style="font-size:14px; vertical-align:middle;">delete</i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  function editRecord(log) {
    switchTab('record');
    document.getElementById('formTitle').innerText = `Update: ${OfficeShifts.formatDateDDMonYY(log.date)}`;
    document.getElementById('entryId').value = log.logId;
    document.getElementById('entryUsername').value = log.username;
    document.getElementById('entryFromDate').value = log.date;
    document.getElementById('entryToDate').value = '';
    document.getElementById('entryStatus').value = log.status;
    document.getElementById('entryIn').value = log.inTime ? OfficeShifts.convertTo24Hour(log.inTime) : '';
    document.getElementById('entryOut').value = log.outTime ? OfficeShifts.convertTo24Hour(log.outTime) : '';
    document.getElementById('btnSubmitLog').innerText = 'Update Entry';
    handleStatusChange();
  }

  async function deleteRecord(logId) {
    if (!confirm("Are you sure you want to permanently delete this record?")) return;
    await OfficeDB.deleteLog(logId);
    showToast("Record deleted.", "info");
    renderActiveView();
  }

  let activeInsightsSubTab = 'cockpit'; // 'cockpit' | 'fiscal'

  function switchInsightsSubTab(subTabId) {
    activeInsightsSubTab = subTabId;
    const btnCockpit = document.getElementById('segBtnCockpit');
    const btnFiscal = document.getElementById('segBtnFiscal');
    const subCockpit = document.getElementById('subViewCockpit');
    const subFiscal = document.getElementById('subViewFiscal');

    if (subTabId === 'cockpit') {
      if (btnCockpit) btnCockpit.classList.add('active');
      if (btnFiscal) btnFiscal.classList.remove('active');
      if (subCockpit) subCockpit.style.display = 'block';
      if (subFiscal) subFiscal.style.display = 'none';
    } else {
      if (btnCockpit) btnCockpit.classList.remove('active');
      if (btnFiscal) btnFiscal.classList.add('active');
      if (subCockpit) subCockpit.style.display = 'none';
      if (subFiscal) subFiscal.style.display = 'block';
    }
  }

  // Insights View & Company 7-8h Compliance Engine
  function renderInsightsView() {
    const user = OfficeAuth.getCurrentUser();
    const logs = OfficeDB.getLogs(user);

    // 1. Render 7-8 Hour Compliance Engine & 86% Salary Attendance Predictor
    const compContainer = document.getElementById('complianceToolContainer');
    if (compContainer) {
      const comp = OfficeAnalytics.calculateComplianceData(logs, activeComplianceMonth);
      if (comp) {
        activeComplianceMonth = comp.yearMonth;

        const monthOptions = (comp.availableMonths || []).map(ym => {
          const [y, m] = ym.split('-');
          const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const label = `${mNames[parseInt(m, 10) - 1]} ${y}`;
          return `<option value="${ym}" ${ym === comp.yearMonth ? 'selected' : ''}>${label}</option>`;
        }).join('');

        const hoursPillClass = comp.isHoursOptimal ? 'pill-optimal' : (comp.isHoursCompliant ? 'pill-safe' : 'pill-deficit');
        const hoursPillText = comp.isHoursOptimal ? 'Optimal' : (comp.isHoursCompliant ? 'Compliant' : 'Deficit');

        const salaryPillClass = comp.is86Safe ? 'pill-safe' : 'pill-risk';
        const salaryPillText = comp.is86Safe ? 'Safe' : 'At Risk';

        const salarySafeClass = comp.is86Safe ? 'badge-salary-safe' : 'badge-salary-risk';
        const salarySafeIcon = comp.is86Safe ? 'verified_user' : 'warning';

        const meterAttnPct = Math.min(100, Math.max(0, comp.attendancePct));
        const hoursDecimal = parseFloat(comp.avgHoursDecimal) || 0;
        const hoursMeterPct = Math.min(100, Math.round((hoursDecimal / 8.0) * 100));

        const totalDistCount = comp.presentDays + comp.leaveDays + comp.exceptionDays + comp.noshowDays + comp.offDays;
        const pPresent = totalDistCount > 0 ? (comp.presentDays / totalDistCount * 100).toFixed(1) : 0;
        const pLeave = totalDistCount > 0 ? (comp.leaveDays / totalDistCount * 100).toFixed(1) : 0;
        const pExc = totalDistCount > 0 ? (comp.exceptionDays / totalDistCount * 100).toFixed(1) : 0;
        const pNoShow = totalDistCount > 0 ? (comp.noshowDays / totalDistCount * 100).toFixed(1) : 0;
        const pOff = totalDistCount > 0 ? (comp.offDays / totalDistCount * 100).toFixed(1) : 0;

        let salaryActionHTML = '';
        let hoursActionHTML = '';

        if (comp.futureWorkingDays > 0) {
          if (comp.daysNeededFor86 === 0) {
            salaryActionHTML = `Salary quota reached! You can take up to <strong>${comp.maxAllowableNoShows} safe days off</strong> with zero salary impact.`;
          } else if (comp.daysNeededFor86 <= comp.futureWorkingDays) {
            salaryActionHTML = `Attend at least <strong>${comp.daysNeededFor86} of your ${comp.futureWorkingDays} remaining workdays</strong> to protect your salary (≥ 86%).`;
          } else {
            salaryActionHTML = `Attendance will finish below 86% due to past unexcused absences. Max achievable is <strong>${Math.round(((comp.attendedDaysLogged + comp.futureWorkingDays) / comp.totalExpectedWorkDays) * 100)}%</strong>.`;
          }

          if (comp.isHoursCompliant) {
            hoursActionHTML = comp.surplusHours > 0
              ? `Average is <strong>${comp.avgFormatted}</strong> with <strong>+${comp.surplusHours}h surplus</strong>. Maintain ~<strong>${comp.reqDailyFormatted7h}/day</strong> across ${comp.futureWorkingDays} days.`
              : `Average meets company standard at <strong>${comp.avgFormatted}</strong>. Continue logging ~<strong>${comp.reqDailyFormatted7h}/day</strong>.`;
          } else {
            hoursActionHTML = `Current average is <strong>${comp.avgFormatted}</strong>. Log ~<strong>${comp.reqDailyFormatted7h} / day</strong> across ${comp.futureWorkingDays} remaining workdays to raise average to 7.0h.`;
          }
        } else {
          salaryActionHTML = comp.is86Safe
            ? `Finalized at <strong>${comp.attendancePct}%</strong> attendance (exceeds the 86% salary protection threshold).`
            : `Finalized at <strong>${comp.attendancePct}%</strong> attendance (fell below the 86% salary threshold).`;

          hoursActionHTML = comp.isHoursOptimal
            ? `Finalized at <strong>${comp.avgFormatted}/day</strong> (exceeds 8.0h optimal company target).`
            : (comp.isHoursCompliant
              ? `Finalized at <strong>${comp.avgFormatted}/day</strong> (meets 7–8h company requirement).`
              : `Finalized at <strong>${comp.avgFormatted}/day</strong> (below 7.0h company minimum).`);
        }

        compContainer.innerHTML = `
          <div class="compliance-cockpit-compact">

            <!-- 1. Unified Master Top Bar -->
            <div class="cockpit-top-bar">
              <div class="cockpit-month-dropdown-wrap">
                <i class="material-icons-round" style="font-size:15px; color:var(--primary);">calendar_month</i>
                <select class="comp-month-select-compact" onchange="OfficeUI.setComplianceMonth(this.value)">
                  ${monthOptions}
                </select>
              </div>
              <div class="cockpit-badge-wrap">
                <span class="comp-salary-badge-compact ${salarySafeClass}">
                  <i class="material-icons-round" style="font-size:12px; margin-right:2px;">${salarySafeIcon}</i>
                  ${comp.is86Safe ? '86% Salary Safe' : 'Salary Risk (<86%)'}
                </span>
              </div>
            </div>

            <!-- 2. Harmonized Dual Bento Duo: Left = Salary Attendance (86% Min), Right = Monthly Average (7-8h) -->
            <div class="cockpit-bento-duo">
              <!-- Left Deck: 86% Salary Attendance -->
              <div class="bento-duo-card">
                <div class="bento-card-top">
                  <span class="bento-card-title">
                    <i class="material-icons-round" style="font-size:12px; color:#10b981;">verified_user</i>
                    Salary Quota
                  </span>
                  <span class="pillar-status-pill ${salaryPillClass}">
                    ${salaryPillText}
                  </span>
                </div>
                <div class="bento-card-metric-row">
                  <span class="bento-hero-metric" style="color:${comp.is86Safe ? '#10b981' : '#f59e0b'};">${comp.attendancePct}%</span>
                  <span class="bento-metric-target">/ 86% Min</span>
                </div>
                <!-- Embedded Micro Meter with 86% Marker -->
                <div class="bento-micro-meter">
                  <div class="meter-bar-track">
                    <div class="meter-bar-fill ${comp.is86Safe ? 'fill-safe' : 'fill-risk'}" style="width: ${meterAttnPct}%;"></div>
                    <div class="meter-tick-marker" style="left: 86%;">
                      <span class="tick-line"></span>
                      <span class="tick-lbl">86% Min</span>
                    </div>
                  </div>
                </div>
                <div class="bento-sub-tags">
                  <span class="bento-tag tag-muted">${comp.attendedDaysLogged} of ${comp.totalExpectedWorkDays} Days</span>
                  <span class="bento-tag ${comp.maxAllowableNoShows > 0 ? 'tag-safe' : 'tag-neutral'}">
                    ${comp.maxAllowableNoShows > 0 ? comp.maxAllowableNoShows + ' Safe Off Left' : '0 Safe Off Left'}
                  </span>
                </div>
              </div>

              <!-- Right Deck: Monthly Average Hours (100% Matches Fiscal Performance) -->
              <div class="bento-duo-card">
                <div class="bento-card-top">
                  <span class="bento-card-title">
                    <i class="material-icons-round" style="font-size:12px; color:var(--primary);">schedule</i>
                    Monthly Avg
                  </span>
                  <span class="pillar-status-pill ${hoursPillClass}">${hoursPillText}</span>
                </div>
                <div class="bento-card-metric-row">
                  <span class="bento-hero-metric" style="color:var(--primary);">${comp.avgFormatted}</span>
                  <span class="bento-metric-target">/ 7–8h Policy</span>
                </div>
                <!-- Embedded Micro Meter with 7h Marker (87.5%) -->
                <div class="bento-micro-meter">
                  <div class="meter-bar-track">
                    <div class="meter-bar-fill fill-primary" style="width: ${hoursMeterPct}%;"></div>
                    <div class="meter-tick-marker" style="left: 87.5%;">
                      <span class="tick-line tick-primary"></span>
                      <span class="tick-lbl lbl-primary">7h Min</span>
                    </div>
                  </div>
                </div>
                <div class="bento-sub-tags">
                  <span class="bento-tag tag-muted">${comp.totalHours}h / ${comp.hoursDivisor} Logged</span>
                  <span class="bento-tag ${comp.isHoursCompliant ? 'tag-safe' : 'tag-risk'}">
                    ${comp.futureWorkingDays > 0 ? (comp.surplusHours > 0 ? '+' + comp.surplusHours + 'h Surplus' : '~' + comp.reqDailyFormatted7h + '/d Pace') : (comp.isHoursCompliant ? 'Standard Met' : 'Below 7.0h')}
                  </span>
                </div>
              </div>
            </div>

            <!-- 3. Proportional Distribution Strip (Zero Line-Wrap Rigid Grid) -->
            <div class="proportional-distribution-card">
              <div class="proportional-bar">
                <div class="bar-seg seg-present" style="width: ${pPresent}%;" title="Present: ${comp.presentDays}d"></div>
                <div class="bar-seg seg-leave" style="width: ${pLeave}%;" title="Leave: ${comp.leaveDays}d"></div>
                <div class="bar-seg seg-exception" style="width: ${pExc}%;" title="Exception: ${comp.exceptionDays}d"></div>
                <div class="bar-seg seg-noshow" style="width: ${pNoShow}%;" title="No-Show: ${comp.noshowDays}d"></div>
                <div class="bar-seg seg-off" style="width: ${pOff}%;" title="Weekend/Off: ${comp.offDays}d"></div>
              </div>
              <div class="proportional-grid-5col">
                <div class="col-item">
                  <span class="col-dot dot-present"></span>
                  <span class="col-title">Pres</span>
                  <span class="col-count">${comp.presentDays}d</span>
                </div>
                <div class="col-item">
                  <span class="col-dot dot-leave"></span>
                  <span class="col-title">Leave</span>
                  <span class="col-count">${comp.leaveDays}d</span>
                </div>
                <div class="col-item">
                  <span class="col-dot dot-exception"></span>
                  <span class="col-title">Exc</span>
                  <span class="col-count">${comp.exceptionDays}d</span>
                </div>
                <div class="col-item">
                  <span class="col-dot dot-noshow"></span>
                  <span class="col-title">No-Show</span>
                  <span class="col-count">${comp.noshowDays}d</span>
                </div>
                <div class="col-item">
                  <span class="col-dot dot-off"></span>
                  <span class="col-title">Off</span>
                  <span class="col-count">${comp.offDays}d</span>
                </div>
              </div>
            </div>

            <!-- 4. Upgraded AI Strategic Action Plan (Executive 2-Card Layout) -->
            <div class="ai-strategic-plan-card">
              <div class="strategic-header">
                <div class="strategic-title-wrap">
                  <span class="strategic-robot-badge">🤖</span>
                  <span class="strategic-heading">AI Strategic Action Plan</span>
                </div>
                <span class="strategic-time-pill">${comp.futureWorkingDays > 0 ? comp.futureWorkingDays + ' Workdays Left' : 'Period Finalized'}</span>
              </div>
              <div class="strategic-actions-grid">
                <!-- Action 1: Salary Protection -->
                <div class="strategic-action-tile action-salary ${comp.is86Safe ? 'safe-border' : 'risk-border'}">
                  <div class="action-tile-top">
                    <span class="action-badge-pill">💼 Salary Protection (86% Min)</span>
                    <span class="action-kpi-pill ${comp.is86Safe ? 'badge-salary-safe' : 'badge-salary-risk'}">
                      ${comp.is86Safe ? '🛡️ Safe (+14% Buffer)' : '⚠️ Action Needed'}
                    </span>
                  </div>
                  <div class="action-body-text">
                    ${salaryActionHTML}
                  </div>
                </div>

                <!-- Action 2: Daily Hours Standard -->
                <div class="strategic-action-tile action-hours ${comp.isHoursCompliant ? 'safe-border' : 'pace-border'}">
                  <div class="action-tile-top">
                    <span class="action-badge-pill">⏱️ Daily Hours Policy (7–8h)</span>
                    <span class="action-kpi-pill ${comp.isHoursOptimal ? 'badge-optimal' : (comp.isHoursCompliant ? 'badge-compliant' : 'badge-deficit')}">
                      ${comp.isHoursOptimal ? '🏆 Optimal' : (comp.isHoursCompliant ? '✅ Standard Met' : '⚠️ Deficit Action')}
                    </span>
                  </div>
                  <div class="action-body-text">
                    ${hoursActionHTML}
                  </div>
                </div>
              </div>
            </div>

          </div>
        `;
      }
    }

    // 2. Render Fiscal Year Analytics
    const quarters = OfficeAnalytics.calculateFiscalYearData(logs);
    const container = document.getElementById('insightsContainer');
    if (!container) return;

    if (quarters.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted);">No insights recorded.</div>`;
      return;
    }

    container.innerHTML = quarters.map(q => `
      <div class="quarter-block">
        <div class="quarter-header">
          <span class="quarter-title">${q.title}</span>
          <span class="quarter-stats">${q.pct}% | Avg: ${q.avgDuration}</span>
        </div>
        <div class="months-grid">
          ${q.months.map(m => `
            <div class="month-circle-card" 
                 onmouseenter="this.classList.add('show-tip')"
                 onmouseleave="this.classList.remove('show-tip')"
                 ontouchstart="this.classList.toggle('show-tip')">
              <div class="month-name">${m.name}</div>
              <div class="circle-progress" style="--pct: ${m.hasData ? m.pct : 0};">
                <div class="circle-value">${m.hasData ? m.pct + '%' : 'N/A'}</div>
              </div>
              <div class="month-avg-hours">${m.hasData ? m.avgHrs : '-'}</div>

              ${m.hasData ? `
              <div class="month-tooltip">
                <div class="tooltip-row"><span style="color:var(--status-present);">● Present</span><span>${m.present}</span></div>
                <div class="tooltip-row"><span style="color:var(--status-leave);">● Leave</span><span>${m.leave}</span></div>
                <div class="tooltip-row"><span style="color:var(--status-exception);">● Exception</span><span>${m.exception}</span></div>
                <div class="tooltip-row"><span style="color:var(--status-noshow);">● No Show</span><span>${m.noshow}</span></div>
                <div class="tooltip-row"><span style="color:var(--status-weekend);">● Off Days</span><span>${m.off}</span></div>
              </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // Admin View
  function renderAdminTable() {
    const logs = OfficeDB.getLogs();
    const tbody = document.getElementById('adminTableBody');
    const userFilter = document.getElementById('adminUserFilter');

    if (userFilter && userFilter.options.length <= 1) {
      const users = OfficeDB.getUsers();
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.username;
        opt.innerText = `${u.firstName || u.username} (${u.role || 'User'})`;
        userFilter.appendChild(opt);
      });
    }

    let filtered = logs;
    const selected = userFilter ? userFilter.value : 'all';
    if (selected && selected !== 'all') {
      filtered = filtered.filter(l => l.username.toLowerCase() === selected.toLowerCase());
    }

    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">No records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(log => {
      const safeLog = JSON.stringify(log).replace(/'/g, "&#39;");
      return `
        <tr>
          <td style="font-weight:700; color:var(--primary);">${log.username}</td>
          <td><strong>${OfficeShifts.formatDateDDMonYY(log.date)}</strong></td>
          <td><span class="status-pill">${log.status}</span></td>
          <td>${log.inTime ? OfficeShifts.formatTimeDisplay(log.inTime) : '-'}</td>
          <td>${log.outTime ? OfficeShifts.formatTimeDisplay(log.outTime) : '-'}</td>
          <td><strong>${OfficeShifts.formatDurationDisplay(log.hours)}</strong></td>
          <td>
            <button class="action-btn" onclick='OfficeUI.editRecord(${safeLog})' title="Edit">
              <i class="material-icons-round" style="font-size:14px; vertical-align:middle;">edit</i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Settings Modal
  function openSettingsModal() {
    const modal = document.getElementById('settingsModalBackdrop');
    if (!modal) return;
    const configArea = document.getElementById('settingsFirebaseConfigInput');
    const backendLabel = document.getElementById('settingsActiveBackendLabel');
    if (configArea) {
      configArea.value = JSON.stringify(OfficeDB.getFirebaseConfig(), null, 2);
    }
    if (backendLabel) {
      backendLabel.innerText = OfficeDB.getActiveBackend().toUpperCase();
    }
    modal.classList.add('active');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('settingsModalBackdrop');
    if (modal) modal.classList.remove('active');
  }

  function handleSaveFirebaseConfig() {
    const area = document.getElementById('settingsFirebaseConfigInput');
    try {
      const parsed = JSON.parse(area.value);
      localStorage.setItem(OfficeConfig.STORAGE_KEYS.FIREBASE_CONFIG, JSON.stringify(parsed));
      OfficeDB.initFirebase(parsed);
      showToast('Firebase configuration saved!', 'success');
    } catch (e) {
      showToast('Invalid JSON configuration.', 'error');
    }
  }

  function handleSwitchBackend(type) {
    OfficeDB.setActiveBackend(type);
    const backendLabel = document.getElementById('settingsActiveBackendLabel');
    if (backendLabel) backendLabel.innerText = type.toUpperCase();
    showToast(`Active backend switched to: ${type.toUpperCase()}`, 'info');
  }

  async function handleStartFirebaseMigration() {
    const btn = document.getElementById('btnStartMigration');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Migrating...';
    try {
      showToast('Migrating 134 records to Firestore...', 'info');
      const res = await OfficeDB.migrateToFirestore((done, total) => {
        btn.innerText = `Migrated ${done} / ${total}...`;
      });
      showToast(`🔥 Success! All ${res.count} records verified in Firestore!`, 'success');
      handleSwitchBackend('firebase');
    } catch (err) {
      showToast('Migration error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerText = originalText;
    }
  }

  // Control Center Slide-Up Sheet
  function openControlDrawer() {
    const session = OfficeAuth.getSession ? OfficeAuth.getSession() : { username: OfficeAuth.getCurrentUser(), name: OfficeAuth.getCurrentName(), role: OfficeAuth.getCurrentRole() };
    const drawer = document.getElementById('controlCenterDrawerBackdrop');
    if (!drawer) return;

    const avatar = document.getElementById('drawerAvatarBadge');
    const nameEl = document.getElementById('drawerUserName');
    const subEl = document.getElementById('drawerUserSub');
    const themeDesc = document.getElementById('drawerThemeDesc');
    const themeIcon = document.getElementById('drawerThemeIcon');

    const firstLetter = (session.name || session.username || 'G')[0].toUpperCase();
    if (avatar) avatar.innerText = firstLetter;
    if (nameEl) nameEl.innerText = session.name || "Gaurav Patil";
    if (subEl) subEl.innerText = `Personal Workspace • Cloud Protected`;

    const isDark = document.body.classList.contains('dark-mode');
    if (themeDesc) themeDesc.innerText = isDark ? 'Dark Mode (Active)' : 'Light Mode (Active)';
    if (themeIcon) themeIcon.innerText = isDark ? 'light_mode' : 'dark_mode';

    drawer.classList.add('active');
  }

  function closeControlDrawer() {
    const drawer = document.getElementById('controlCenterDrawerBackdrop');
    if (drawer) drawer.classList.remove('active');
  }

  // Toast
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 2800);
  }

  return {
    init,
    toggleTheme,
    hideSplashScreen,
    openControlDrawer,
    closeControlDrawer,
    openRecordActionSheet,
    closeActionSheet,
    handleSheetEdit,
    handleSheetCopyToday,
    handleSheetDelete,
    setComplianceMonth,
    switchInsightsSubTab,
    switchTab,
    renderActiveView,
    renderCompliantExitPredictor,
    renderWeekRadar,
    handleDayChipClick,
    handleSmartPunch,
    quickAction,
    submitLog,
    editRecord,
    deleteRecord,
    handleStatusChange,
    openSettingsModal,
    closeSettingsModal,
    handleSaveFirebaseConfig,
    handleSwitchBackend,
    handleStartFirebaseMigration,
    showToast
  };
})();

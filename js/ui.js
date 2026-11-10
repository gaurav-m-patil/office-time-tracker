/**
 * Enterprise Time Tracker - UI Controller & Interactions
 */

window.OfficeUI = (function() {
  let activeTab = 'record';
  let historySearchQuery = '';
  let historyStatusFilter = 'all';

  function init() {
    initTheme();
    setupNetworkStatusListeners();
    OfficeShifts.subscribe({
      onTick: updateElapsedDisplay
    });
    OfficeDB.subscribe(handleDatabaseEvent);
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
    showToast(isDark ? 'Dark theme enabled' : 'Light theme enabled', 'info');
  }

  function updateThemeMeta(color) {
    let meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', color);
  }

  // Network Status Indicator
  function setupNetworkStatusListeners() {
    const update = () => {
      const pill = document.getElementById('syncIndicator');
      if (!pill) return;
      if (!navigator.onLine) {
        pill.className = 'sync-pill offline';
        pill.innerHTML = '<span class="dot"></span> Offline';
      } else {
        pill.className = 'sync-pill';
        pill.innerHTML = '<span class="dot"></span> Online';
      }
    };
    window.addEventListener('online', () => {
      update();
      showToast('Back online! Syncing records...', 'success');
      OfficeDB.processOfflineQueue();
    });
    window.addEventListener('offline', () => {
      update();
      showToast('Offline mode active. All actions saved locally.', 'warning');
    });
    update();
  }

  function handleDatabaseEvent(event) {
    const pill = document.getElementById('syncIndicator');
    if (event.type === 'sync_start' && pill) {
      pill.className = 'sync-pill syncing';
      pill.innerHTML = '<span class="dot"></span> Syncing...';
    } else if (event.type === 'sync_complete' && pill) {
      pill.className = 'sync-pill';
      pill.innerHTML = '<span class="dot"></span> Cloud Synced';
      setTimeout(() => {
        if (pill && navigator.onLine) pill.innerHTML = '<span class="dot"></span> Online';
      }, 2500);
    }
    renderActiveView();
  }

  // Tab Navigation
  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab-btn').forEach(el => el.classList.remove('active'));

    const targetPane = document.getElementById(`tab-${tabId}`);
    const targetNav = document.getElementById(`nav-${tabId}`);
    if (targetPane) targetPane.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    renderActiveView();
  }

  function renderActiveView() {
    if (activeTab === 'record') {
      renderHeroCockpit();
      renderWeeklySummary();
    } else if (activeTab === 'history') {
      renderHistoryTable();
    } else if (activeTab === 'insights') {
      renderInsightsView();
    } else if (activeTab === 'admin') {
      renderAdminTable();
    }
  }

  // Hero Cockpit UI
  function renderHeroCockpit() {
    const shift = OfficeShifts.getActiveShift();
    const badge = document.getElementById('heroLiveBadge');
    const punchBtn = document.getElementById('heroPunchBtn');
    const punchIcon = document.getElementById('heroPunchIcon');
    const punchText = document.getElementById('heroPunchText');
    const punchSubtext = document.getElementById('heroPunchSubtext');
    const breakBtn = document.getElementById('heroBreakBtn');
    const pulseRing = document.getElementById('heroPulseRing');

    if (!badge || !punchBtn) return;

    if (shift.status === 'CLOCKED_IN') {
      badge.className = 'live-badge clocked-in';
      badge.innerHTML = '<span class="dot" style="background:#10b981; width:6px; height:6px; border-radius:50%;"></span> Shift Active';
      
      punchBtn.className = 'punch-btn btn-punch-out';
      if (punchIcon) punchIcon.innerText = 'logout';
      if (punchText) punchText.innerText = 'Clock Out';
      if (punchSubtext) punchSubtext.innerText = `In at ${shift.inTime || ''}`;
      if (pulseRing) pulseRing.style.display = 'block';

      if (breakBtn) {
        breakBtn.style.display = 'inline-flex';
        breakBtn.innerHTML = '<i class="material-icons-round" style="font-size:16px;">coffee</i> Take Break';
      }
    } else if (shift.status === 'ON_BREAK') {
      badge.className = 'live-badge on-break';
      badge.innerHTML = '<span class="dot" style="background:#f59e0b; width:6px; height:6px; border-radius:50%;"></span> On Break';

      punchBtn.className = 'punch-btn btn-punch-out';
      if (punchIcon) punchIcon.innerText = 'logout';
      if (punchText) punchText.innerText = 'Clock Out';
      if (punchSubtext) punchSubtext.innerText = 'Break Running';
      if (pulseRing) pulseRing.style.display = 'none';

      if (breakBtn) {
        breakBtn.style.display = 'inline-flex';
        breakBtn.innerHTML = '<i class="material-icons-round" style="font-size:16px;">play_arrow</i> Resume Work';
      }
    } else {
      badge.className = 'live-badge clocked-out';
      badge.innerHTML = 'Clocked Out';

      punchBtn.className = 'punch-btn btn-punch-in';
      if (punchIcon) punchIcon.innerText = 'login';
      if (punchText) punchText.innerText = 'Clock In';
      if (punchSubtext) punchSubtext.innerText = 'Ready for Shift';
      if (pulseRing) pulseRing.style.display = 'none';

      if (breakBtn) breakBtn.style.display = 'none';
      updateElapsedDisplay(0, "00:00:00");
    }
  }

  function updateElapsedDisplay(seconds, hmsStr) {
    const elapsedEl = document.getElementById('heroElapsedTime');
    if (elapsedEl) {
      elapsedEl.innerText = hmsStr;
    }
  }

  async function handleHeroPunch() {
    const shift = OfficeShifts.getActiveShift();
    if (shift.status === 'CLOCKED_OUT') {
      await OfficeShifts.clockIn();
      showToast('⚡ Shift started! Clocked in successfully.', 'success');
    } else {
      const res = await OfficeShifts.clockOut();
      showToast(`🏁 Clocked out! Duration: ${res.formattedDuration}`, 'success');
    }
    renderHeroCockpit();
    renderWeeklySummary();
  }

  function handleHeroBreak() {
    const updated = OfficeShifts.toggleBreak();
    if (updated.status === 'ON_BREAK') {
      showToast('☕ Break started. Work timer paused.', 'warning');
    } else {
      showToast('▶️ Resumed work. Welcome back!', 'success');
    }
    renderHeroCockpit();
  }

  // Weekly Progress Bar
  function renderWeeklySummary() {
    const user = OfficeAuth.getCurrentUser();
    const logs = OfficeDB.getLogs(user);
    const summary = OfficeAnalytics.calculateWeeklySummary(logs);

    const fill = document.getElementById('weekProgressFill');
    const statsText = document.getElementById('weekStatsText');
    const strip = document.getElementById('weekDaysStrip');

    if (fill) fill.style.width = `${summary.progressPct}%`;
    if (statsText) statsText.innerText = `${summary.totalHours}h / ${summary.targetHours}h (${summary.progressPct}%)`;

    if (strip) {
      strip.innerHTML = summary.days.map(d => `
        <div class="day-chip ${d.isToday ? 'active-today' : ''}">
          <div class="day-chip-label">${d.label}</div>
          <div class="day-chip-status ${d.status}"></div>
        </div>
      `).join('');
    }
  }

  // Manual Quick Entry Handler
  async function submitManualLog(e) {
    if (e) e.preventDefault();
    const fromDate = document.getElementById('manualFromDate').value;
    const toDate = document.getElementById('manualToDate').value;
    const status = document.getElementById('manualStatus').value;
    const inTime = document.getElementById('manualInTime').value;
    const outTime = document.getElementById('manualOutTime').value;
    const user = OfficeAuth.getCurrentUser();

    if (!fromDate) {
      return showToast('From Date is required.', 'error');
    }

    if (status === 'Present' && (!inTime || !outTime)) {
      return showToast('In and Out times are required for Present.', 'error');
    }

    const isRange = toDate && toDate !== fromDate;
    const cleanIn = inTime ? OfficeShifts.formatTimeDisplay(inTime) : "";
    const cleanOut = outTime ? OfficeShifts.formatTimeDisplay(outTime) : "";
    let calcHours = 0;

    if (status === 'Present' && inTime && outTime) {
      const calc = OfficeShifts.calculateHours(cleanIn, cleanOut);
      calcHours = calc.hoursDecimal;
    }

    if (isRange) {
      let curr = new Date(fromDate);
      let endD = new Date(toDate);
      while (curr <= endD) {
        let loopDate = OfficeShifts.getLocalDateStr(curr);
        await OfficeDB.saveLog({
          logId: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          username: user,
          date: loopDate,
          status: status,
          inTime: cleanIn,
          outTime: cleanOut,
          hours: calcHours
        });
        curr.setDate(curr.getDate() + 1);
      }
      showToast(`Range saved for ${fromDate} to ${toDate}!`, 'success');
    } else {
      // Check existing log for this date
      const existing = OfficeDB.getLogs(user).find(l => l.date === fromDate);
      const logId = existing ? existing.logId : ('log_' + Date.now());
      await OfficeDB.saveLog({
        logId: logId,
        username: user,
        date: fromDate,
        status: status,
        inTime: cleanIn,
        outTime: cleanOut,
        hours: calcHours
      });
      showToast('Attendance record saved!', 'success');
    }

    resetManualForm();
    renderActiveView();
  }

  function resetManualForm() {
    const today = OfficeShifts.getLocalDateStr();
    const fromInput = document.getElementById('manualFromDate');
    const toInput = document.getElementById('manualToDate');
    const inInput = document.getElementById('manualInTime');
    const outInput = document.getElementById('manualOutTime');
    const statusSelect = document.getElementById('manualStatus');

    if (fromInput) { fromInput.value = today; fromInput.max = today; }
    if (toInput) { toInput.value = ''; toInput.max = today; }
    if (inInput) inInput.value = '';
    if (outInput) outInput.value = '';
    if (statusSelect) statusSelect.value = 'Present';
    handleManualStatusChange();
  }

  function handleManualStatusChange() {
    const statusSelect = document.getElementById('manualStatus');
    const inInput = document.getElementById('manualInTime');
    const outInput = document.getElementById('manualOutTime');
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

  function applyQuickShortcut(statusType) {
    const statusSelect = document.getElementById('manualStatus');
    const inInput = document.getElementById('manualInTime');
    const outInput = document.getElementById('manualOutTime');

    if (statusType === 'in') {
      if (statusSelect) statusSelect.value = 'Present';
      if (inInput) inInput.value = OfficeShifts.getCurrentTimeStr();
    } else if (statusType === 'out') {
      if (statusSelect) statusSelect.value = 'Present';
      if (outInput) outInput.value = OfficeShifts.getCurrentTimeStr();
    } else {
      if (statusSelect) statusSelect.value = statusType;
    }
    handleManualStatusChange();
  }

  // History View
  function renderHistoryTable() {
    const user = OfficeAuth.getCurrentUser();
    let logs = OfficeDB.getLogs(user);

    if (historySearchQuery) {
      logs = logs.filter(l => l.date.includes(historySearchQuery) || (l.status && l.status.toLowerCase().includes(historySearchQuery.toLowerCase())));
    }
    if (historyStatusFilter !== 'all') {
      logs = logs.filter(l => l.status === historyStatusFilter);
    }

    const tbody = document.getElementById('historyTableBody');
    const countBadge = document.getElementById('historyCountBadge');
    if (countBadge) countBadge.innerText = `${logs.length} records`;

    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">No attendance records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const formattedDate = OfficeShifts.formatDateDDMonYY(log.date);
      const formattedIn = log.inTime ? OfficeShifts.formatTimeDisplay(log.inTime) : '-';
      const formattedOut = log.outTime ? OfficeShifts.formatTimeDisplay(log.outTime) : '-';
      const formattedDuration = OfficeShifts.formatDurationDisplay(log.hours);
      const safeLogJson = JSON.stringify(log).replace(/'/g, "&#39;");

      return `
        <tr>
          <td><strong>${formattedDate}</strong></td>
          <td><span class="status-badge ${log.status.replace(/\s+/g, '-')}">${log.status}</span></td>
          <td>${formattedIn}</td>
          <td>${formattedOut}</td>
          <td><strong>${formattedDuration}</strong></td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="action-row-btn" onclick='OfficeUI.openQuickEditModal(${safeLogJson})' title="Edit">
                <i class="material-icons-round" style="font-size:14px; vertical-align:middle;">edit</i>
              </button>
              <button class="action-row-btn btn-delete" onclick="OfficeUI.handleDeleteRecord('${log.logId}')" title="Delete">
                <i class="material-icons-round" style="font-size:14px; vertical-align:middle;">delete</i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function handleDeleteRecord(logId) {
    if (!confirm("Are you sure you want to permanently delete this attendance record?")) return;
    await OfficeDB.deleteLog(logId);
    showToast("Record deleted.", "info");
    renderActiveView();
  }

  // Quick Edit Drawer
  function openQuickEditModal(log) {
    const drawer = document.getElementById('quickEditDrawerBackdrop');
    if (!drawer) return;

    document.getElementById('editLogId').value = log.logId;
    document.getElementById('editUsername').value = log.username;
    document.getElementById('editDate').value = log.date;
    document.getElementById('editStatus').value = log.status;
    document.getElementById('editInTime').value = log.inTime ? OfficeShifts.convertTo24Hour(log.inTime) : '';
    document.getElementById('editOutTime').value = log.outTime ? OfficeShifts.convertTo24Hour(log.outTime) : '';

    drawer.classList.add('active');
  }

  function closeQuickEditModal() {
    const drawer = document.getElementById('quickEditDrawerBackdrop');
    if (drawer) drawer.classList.remove('active');
  }

  async function saveQuickEdit() {
    const logId = document.getElementById('editLogId').value;
    const username = document.getElementById('editUsername').value;
    const date = document.getElementById('editDate').value;
    const status = document.getElementById('editStatus').value;
    const inTime = document.getElementById('editInTime').value;
    const outTime = document.getElementById('editOutTime').value;

    const cleanIn = inTime ? OfficeShifts.formatTimeDisplay(inTime) : '';
    const cleanOut = outTime ? OfficeShifts.formatTimeDisplay(outTime) : '';
    let hours = 0;

    if (status === 'Present' && inTime && outTime) {
      const calc = OfficeShifts.calculateHours(cleanIn, cleanOut);
      hours = calc.hoursDecimal;
    }

    await OfficeDB.saveLog({
      logId,
      username,
      date,
      status,
      inTime: cleanIn,
      outTime: cleanOut,
      hours
    });

    closeQuickEditModal();
    showToast('Record updated successfully!', 'success');
    renderActiveView();
  }

  // Insights View (Financial Year Quarters)
  function renderInsightsView() {
    const user = OfficeAuth.getCurrentUser();
    const logs = OfficeDB.getLogs(user);
    const quarters = OfficeAnalytics.calculateFiscalYearData(logs);
    const container = document.getElementById('insightsContainer');
    if (!container) return;

    if (quarters.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No insights available for this period.</div>`;
      return;
    }

    container.innerHTML = quarters.map(q => `
      <div class="quarter-card">
        <div class="quarter-header">
          <span class="quarter-name">${q.title}</span>
          <span class="quarter-stats-text">Attendance: <strong>${q.pct}%</strong> | Avg: <strong>${q.avgDuration}</strong></span>
        </div>
        <div class="months-3-grid">
          ${q.months.map(m => `
            <div class="month-stat-box" 
                 onmouseenter="this.classList.add('active-touch')"
                 onmouseleave="this.classList.remove('active-touch')"
                 ontouchstart="this.classList.toggle('active-touch')">
              <div class="month-title">${m.name}</div>
              <div class="conic-ring" style="--pct: ${m.hasData ? m.pct : 0};">
                <div class="conic-text">${m.hasData ? m.pct + '%' : 'N/A'}</div>
              </div>
              <div class="month-avg-label">${m.hasData ? m.avgHrs : '-'}</div>

              ${m.hasData ? `
              <div class="month-popover">
                <div class="popover-row"><span style="color:var(--status-present);">● Present</span><span class="val">${m.present}</span></div>
                <div class="popover-row"><span style="color:var(--status-leave);">● Leave</span><span class="val">${m.leave}</span></div>
                <div class="popover-row"><span style="color:var(--status-exception);">● Exception</span><span class="val">${m.exception}</span></div>
                <div class="popover-row"><span style="color:var(--status-noshow);">● No Show</span><span class="val">${m.noshow}</span></div>
                <div class="popover-row"><span style="color:var(--status-weekend);">● Off Days</span><span class="val">${m.off}</span></div>
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
    const logs = OfficeDB.getLogs(); // All users
    const tbody = document.getElementById('adminTableBody');
    const userFilter = document.getElementById('adminUserFilter');

    // Populate user filter dropdown
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
    const selectedUser = userFilter ? userFilter.value : 'all';
    if (selectedUser && selectedUser !== 'all') {
      filtered = filtered.filter(l => l.username.toLowerCase() === selectedUser.toLowerCase());
    }

    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(log => `
      <tr>
        <td style="font-weight:700; color:var(--primary);">${log.username}</td>
        <td><strong>${OfficeShifts.formatDateDDMonYY(log.date)}</strong></td>
        <td><span class="status-badge ${log.status.replace(/\s+/g, '-')}">${log.status}</span></td>
        <td>${log.inTime ? OfficeShifts.formatTimeDisplay(log.inTime) : '-'}</td>
        <td>${log.outTime ? OfficeShifts.formatTimeDisplay(log.outTime) : '-'}</td>
        <td><strong>${OfficeShifts.formatDurationDisplay(log.hours)}</strong></td>
        <td>
          <button class="action-row-btn" onclick='OfficeUI.openQuickEditModal(${JSON.stringify(log).replace(/'/g, "&#39;")})' title="Edit">
            <i class="material-icons-round" style="font-size:14px; vertical-align:middle;">edit</i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Settings & Cloud Database Modal
  function openSettingsModal() {
    const modal = document.getElementById('settingsModalBackdrop');
    if (!modal) return;

    const configArea = document.getElementById('settingsFirebaseConfigInput');
    const backendLabel = document.getElementById('settingsActiveBackendLabel');
    if (configArea) {
      const currentConfig = OfficeDB.getFirebaseConfig();
      configArea.value = JSON.stringify(currentConfig, null, 2);
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

  function handleSwitchBackend(backendType) {
    OfficeDB.setActiveBackend(backendType);
    const backendLabel = document.getElementById('settingsActiveBackendLabel');
    if (backendLabel) backendLabel.innerText = backendType.toUpperCase();
    showToast(`Active backend switched to: ${backendType.toUpperCase()}`, 'info');
  }

  async function handleStartFirebaseMigration() {
    const btn = document.getElementById('btnStartMigration');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Migrating Records...';

    try {
      showToast('Starting Firestore migration of 134 records...', 'info');
      const res = await OfficeDB.migrateToFirestore((done, total) => {
        btn.innerText = `Migrated ${done} / ${total}...`;
      });
      showToast(`🔥 Success! All ${res.count} records safely written to Firestore!`, 'success');
      handleSwitchBackend('firebase');
    } catch (err) {
      showToast('Migration error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerText = originalText;
    }
  }

  // Toast System
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'warning') icon = 'warning';
    if (type === 'error') icon = 'error';

    toast.innerHTML = `<i class="material-icons-round" style="font-size:18px; color:var(--primary);">${icon}</i> <span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  return {
    init,
    toggleTheme,
    switchTab,
    renderActiveView,
    renderHeroCockpit,
    handleHeroPunch,
    handleHeroBreak,
    submitManualLog,
    applyQuickShortcut,
    handleManualStatusChange,
    openQuickEditModal,
    closeQuickEditModal,
    saveQuickEdit,
    handleDeleteRecord,
    openSettingsModal,
    closeSettingsModal,
    handleSaveFirebaseConfig,
    handleSwitchBackend,
    handleStartFirebaseMigration,
    showToast
  };
})();

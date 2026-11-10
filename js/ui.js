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

    // Subscribe to shift ticker
    OfficeShifts.subscribe({
      onTick: (sec, hms) => {
        const timer = document.getElementById('shiftLiveTimer');
        if (timer) timer.innerText = hms;
        const smartBtnTimer = document.getElementById('smartPunchTimer');
        if (smartBtnTimer) smartBtnTimer.innerText = hms;
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

  // Tab Navigation
  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetPane = document.getElementById(`tab-${tabId}`);
    const targetNav = document.getElementById(`nav-${tabId}`);
    if (targetPane) targetPane.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (tabId === 'record' && !document.getElementById('entryId').value) {
      resetRecordForm();
    }

    renderActiveView();
  }

  function renderActiveView() {
    updateSmartPunchUI();
    if (activeTab === 'history') {
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

    if (!smartBtn) return;

    if (shift && shift.status === 'CLOCKED_IN') {
      smartBtn.className = 'btn-smart-punch punch-out';
      if (smartBtnText) smartBtnText.innerText = 'Clock Out';
      if (timerSpan) {
        timerSpan.classList.remove('hidden');
        timerSpan.innerText = OfficeShifts.formatSecondsToHMS(OfficeShifts.getElapsedSeconds());
      }
      if (statusSub) statusSub.innerText = `Shift active since ${shift.inTime || ''}`;
      if (shiftPill) {
        shiftPill.className = 'shift-live-pill active';
        document.getElementById('shiftLiveText').innerText = 'Active';
      }
    } else {
      smartBtn.className = 'btn-smart-punch punch-in';
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

    // CRITICAL: Close the active shift timer so it stops ticking!
    OfficeShifts.closeShift(calcHours);

    const isRange = toDate && toDate !== fromDate;

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
    } else {
      const existing = OfficeDB.getLogs(user).find(l => (logId && l.logId === logId) || (!logId && l.date === fromDate));
      const targetId = logId || (existing ? existing.logId : ('log_' + Date.now()));
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

        const statusClass = comp.isHoursOptimal ? 'badge-optimal' : (comp.isHoursCompliant ? 'badge-compliant' : 'badge-deficit');
        const statusText = comp.isHoursOptimal ? 'Optimal (≥8.0h)' : (comp.isHoursCompliant ? 'Compliant (≥7.0h)' : 'Below 7.0h Min');

        const salarySafeClass = comp.is86Safe ? 'badge-salary-safe' : 'badge-salary-risk';
        const salarySafeText = comp.is86Safe ? '86% Salary Safe' : 'Salary Risk (<86%)';
        const salarySafeIcon = comp.is86Safe ? 'verified_user' : 'warning';

        compContainer.innerHTML = `
          <div class="compliance-cockpit-card">
            <!-- Cockpit Header: Month Selector + 86% Salary Badge -->
            <div class="comp-header">
              <div class="comp-title-group" style="display:flex; align-items:center; gap:8px;">
                <select class="comp-month-select" onchange="OfficeUI.setComplianceMonth(this.value)">
                  ${monthOptions}
                </select>
                <span class="tile-pill ${statusClass}">${statusText}</span>
              </div>
              <div>
                <span class="comp-salary-badge ${salarySafeClass}">
                  <i class="material-icons-round" style="font-size:12px; margin-right:3px;">${salarySafeIcon}</i>
                  ${salarySafeText}
                </span>
              </div>
            </div>

            <!-- Bento 4-Quad Grid -->
            <div class="comp-bento-quad">
              <!-- Tile 1: Monthly Average Hours (100% Matching Fiscal Box) -->
              <div class="comp-bento-tile">
                <div class="bento-tile-lbl">Monthly Average</div>
                <div class="bento-tile-main" style="color:var(--primary);">${comp.avgFormatted}</div>
                <div class="bento-tile-sub">
                  <span>${comp.totalHours}h / ${comp.hoursDivisor} working days</span>
                </div>
              </div>

              <!-- Tile 2: Attendance Rate & 86% Threshold -->
              <div class="comp-bento-tile">
                <div class="bento-tile-lbl">Attendance (86% Min)</div>
                <div class="bento-tile-main" style="color:${comp.is86Safe ? '#10b981' : '#f59e0b'};">${comp.attendancePct}%</div>
                <div class="bento-tile-sub">
                  <span>${comp.attendedDaysLogged} of ${comp.totalExpectedWorkDays} total workdays</span>
                </div>
              </div>

              <!-- Tile 3: Remaining Workdays & Needed Days -->
              <div class="comp-bento-tile">
                <div class="bento-tile-lbl">Remaining Workdays</div>
                <div class="bento-tile-main">${comp.futureWorkingDays > 0 ? comp.futureWorkingDays + ' Days Left' : 'Completed'}</div>
                <div class="bento-tile-sub">
                  <span>${comp.futureWorkingDays > 0 ? (comp.daysNeededFor86 > 0 ? `Need <strong>${comp.daysNeededFor86}d</strong> for 86%` : `<strong>${comp.maxAllowableNoShows}d</strong> safe leaves left`) : 'Month Finalized'}</span>
                </div>
              </div>

              <!-- Tile 4: Daily Target / Pace -->
              <div class="comp-bento-tile">
                <div class="bento-tile-lbl">Daily Target / Pace</div>
                <div class="bento-tile-main" style="color:${comp.futureWorkingDays > 0 && comp.surplusHours > 0 ? '#10b981' : 'var(--text-primary)'};">
                  ${comp.futureWorkingDays > 0 ? (comp.surplusHours > 0 ? '+' + comp.surplusHours + 'h Surplus' : comp.reqDailyFormatted7h) : comp.totalHours + 'h Total'}
                </div>
                <div class="bento-tile-sub">
                  <span>${comp.futureWorkingDays > 0 ? (comp.surplusHours > 0 ? 'Ahead of 7h pace' : 'Needed/day for 7.0h') : (comp.isHoursCompliant ? '7–8h Standard Met' : 'Below 7.0h Standard')}</span>
                </div>
              </div>
            </div>

            <!-- Micro Month Breakdown Strip -->
            <div class="comp-breakdown-strip">
              <span class="breakdown-tag tag-present"><span class="dot"></span> Present: <strong>${comp.presentDays}</strong></span>
              <span class="breakdown-tag tag-leave"><span class="dot"></span> Leave: <strong>${comp.leaveDays}</strong></span>
              <span class="breakdown-tag tag-exception"><span class="dot"></span> Exc: <strong>${comp.exceptionDays}</strong></span>
              <span class="breakdown-tag tag-noshow"><span class="dot"></span> No-Show: <strong>${comp.noshowDays}</strong></span>
              <span class="breakdown-tag tag-off"><span class="dot"></span> Off: <strong>${comp.offDays}</strong></span>
            </div>

            <!-- Smart AI Predictor Guidance Box -->
            <div class="comp-predictor-box">
              <div class="predictor-icon-circle">🤖</div>
              <div class="predictor-text">
                <div class="predictor-headline">AI Attendance & Salary Projection</div>
                <div class="predictor-item">${comp.salaryAdvice}</div>
                <div class="predictor-item">${comp.hoursAdvice}</div>
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

    const firstLetter = (session.name || session.username || 'U')[0].toUpperCase();
    if (avatar) avatar.innerText = firstLetter;
    if (nameEl) nameEl.innerText = session.name || session.username;
    if (subEl) subEl.innerText = `${session.role === 'Admin' ? 'Administrator' : 'Employee'} • Cloud Connected`;

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

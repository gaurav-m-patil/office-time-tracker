/**
 * Enterprise Time Tracker - Shift Management & State Engine
 * Handles Active Shift Lifecycle, Live Ticker, Breaks, and Overnight Math
 */

window.OfficeShifts = (function() {
  let activeShift = null;
  let tickerTimer = null;
  let listeners = [];

  function init() {
    loadActiveShift();
    startTicker();
  }

  function loadActiveShift() {
    try {
      const saved = localStorage.getItem(OfficeConfig.STORAGE_KEYS.ACTIVE_SHIFT);
      if (saved) {
        activeShift = JSON.parse(saved);
        
        // Auto-close check: if shift has been running for > MAX_SHIFT_HOURS_BEFORE_WARN
        if (activeShift && activeShift.status === "CLOCKED_IN" && activeShift.clockInTimestamp) {
          const hoursPassed = (Date.now() - activeShift.clockInTimestamp) / (1000 * 60 * 60);
          if (hoursPassed > OfficeConfig.SHIFT_PRESETS.MAX_SHIFT_HOURS_BEFORE_WARN) {
            console.warn("Unclosed shift detected from previous session:", activeShift);
            activeShift.isStale = true;
          }
        }
      } else {
        activeShift = {
          status: "CLOCKED_OUT",
          clockInTimestamp: null,
          todayDate: getLocalDateStr(),
          breakMinutes: 0,
          currentBreakStart: null
        };
      }
    } catch (e) {
      activeShift = { status: "CLOCKED_OUT", clockInTimestamp: null, todayDate: getLocalDateStr(), breakMinutes: 0 };
    }
    notify();
  }

  function saveActiveShift() {
    if (activeShift) {
      localStorage.setItem(OfficeConfig.STORAGE_KEYS.ACTIVE_SHIFT, JSON.stringify(activeShift));
    } else {
      localStorage.removeItem(OfficeConfig.STORAGE_KEYS.ACTIVE_SHIFT);
    }
    notify();
  }

  function getActiveShift() {
    return activeShift || { status: "CLOCKED_OUT" };
  }

  // Ticker: Emits elapsed seconds every 1000ms
  function startTicker() {
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(() => {
      if (activeShift && activeShift.status === "CLOCKED_IN" && activeShift.clockInTimestamp) {
        notifyTicker();
      }
    }, 1000);
  }

  function getElapsedSeconds() {
    if (!activeShift || !activeShift.clockInTimestamp || activeShift.status === "CLOCKED_OUT") return 0;
    const now = Date.now();
    let totalSec = Math.floor((now - activeShift.clockInTimestamp) / 1000);
    let breakSec = (activeShift.breakMinutes || 0) * 60;
    
    if (activeShift.status === "ON_BREAK" && activeShift.currentBreakStart) {
      breakSec += Math.floor((now - activeShift.currentBreakStart) / 1000);
    }
    
    return Math.max(0, totalSec - breakSec);
  }

  // Clock In Action
  async function clockIn(customDate = null, customTime = null) {
    const today = customDate || getLocalDateStr();
    const timeStr = customTime || getCurrentTimeStr();
    const formattedIn = formatTimeDisplay(timeStr);
    const currentUser = localStorage.getItem(OfficeConfig.STORAGE_KEYS.CURRENT_USER) || "gaurav";

    activeShift = {
      status: "CLOCKED_IN",
      clockInTimestamp: Date.now(),
      inTime: formattedIn,
      todayDate: today,
      username: currentUser,
      breakMinutes: 0,
      currentBreakStart: null
    };
    saveActiveShift();

    // Check if an entry for today already exists in OfficeDB
    const existingLogs = OfficeDB.getLogs(currentUser);
    let todayLog = existingLogs.find(l => l.date === today && l.username === currentUser);

    if (todayLog) {
      todayLog.status = "Present";
      todayLog.inTime = formattedIn;
      await OfficeDB.saveLog(todayLog);
    } else {
      const newLog = {
        logId: 'log_' + Date.now(),
        username: currentUser,
        date: today,
        status: "Present",
        inTime: formattedIn,
        outTime: "",
        hours: 0
      };
      await OfficeDB.saveLog(newLog);
    }

    triggerHaptic();
    return activeShift;
  }

  // Clock Out Action
  async function clockOut(customTime = null) {
    if (!activeShift) return;

    const timeStr = customTime || getCurrentTimeStr();
    const formattedOut = formatTimeDisplay(timeStr);
    const inTime = activeShift.inTime || "09:00 AM";
    const date = activeShift.todayDate || getLocalDateStr();
    const currentUser = activeShift.username || localStorage.getItem(OfficeConfig.STORAGE_KEYS.CURRENT_USER) || "gaurav";

    // End active break if still running
    if (activeShift.status === "ON_BREAK" && activeShift.currentBreakStart) {
      const breakMins = Math.round((Date.now() - activeShift.currentBreakStart) / (1000 * 60));
      activeShift.breakMinutes = (activeShift.breakMinutes || 0) + breakMins;
    }

    // Calculate hours with break deduction & overnight support
    const calc = calculateHours(inTime, formattedOut, activeShift.breakMinutes || 0);

    const existingLogs = OfficeDB.getLogs(currentUser);
    let todayLog = existingLogs.find(l => l.date === date && l.username === currentUser);

    if (todayLog) {
      todayLog.status = "Present";
      todayLog.inTime = inTime;
      todayLog.outTime = formattedOut;
      todayLog.hours = calc.hoursDecimal;
      await OfficeDB.saveLog(todayLog);
    } else {
      const newLog = {
        logId: 'log_' + Date.now(),
        username: currentUser,
        date: date,
        status: "Present",
        inTime: inTime,
        outTime: formattedOut,
        hours: calc.hoursDecimal
      };
      await OfficeDB.saveLog(newLog);
    }

    activeShift = {
      status: "CLOCKED_OUT",
      clockInTimestamp: null,
      todayDate: date,
      breakMinutes: 0
    };
    saveActiveShift();

    triggerHaptic();
    return { success: true, hours: calc.hoursDecimal, formattedDuration: calc.formattedDuration };
  }

  // Toggle Break
  function toggleBreak() {
    if (!activeShift || activeShift.status === "CLOCKED_OUT") return;

    if (activeShift.status === "CLOCKED_IN") {
      activeShift.status = "ON_BREAK";
      activeShift.currentBreakStart = Date.now();
    } else if (activeShift.status === "ON_BREAK") {
      if (activeShift.currentBreakStart) {
        const addedMins = Math.round((Date.now() - activeShift.currentBreakStart) / (1000 * 60));
        activeShift.breakMinutes = (activeShift.breakMinutes || 0) + addedMins;
      }
      activeShift.status = "CLOCKED_IN";
      activeShift.currentBreakStart = null;
    }
    saveActiveShift();
    triggerHaptic();
    return activeShift;
  }

  // Precise Time & Duration Calculators
  function calculateHours(inTimeStr, outTimeStr, breakMins = 0) {
    if (!inTimeStr || !outTimeStr) return { hoursDecimal: 0, formattedDuration: "0m" };

    const in24 = convertTo24Hour(inTimeStr);
    const out24 = convertTo24Hour(outTimeStr);

    const [inH, inM] = in24.split(':').map(Number);
    const [outH, outM] = out24.split(':').map(Number);

    let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
    // Overnight Shift Calculation (e.g. 10:00 PM to 06:00 AM)
    if (diffMins < 0) {
      diffMins += 24 * 60;
    }

    diffMins = Math.max(0, diffMins - breakMins);
    const hoursDecimal = parseFloat((diffMins / 60).toFixed(2));
    const formattedDuration = formatDurationDisplay(hoursDecimal);

    return { hoursDecimal, formattedDuration, totalMinutes: diffMins };
  }

  function formatDurationDisplay(hoursVal) {
    if (hoursVal === '-' || hoursVal === null || hoursVal === undefined || hoursVal === '') return '-';
    let num = parseFloat(hoursVal);
    if (isNaN(num) || num === 0) return '0m';

    let totalMins = Math.round(num * 60);
    let hrs = Math.floor(totalMins / 60);
    let mins = totalMins % 60;

    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  }

  function formatSecondsToHMS(totalSec) {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getLocalDateStr(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateDDMonYY(dateString) {
    if (!dateString) return '';
    const cleaned = dateString.toString().substring(0, 10);
    const parts = cleaned.split('-');
    if (parts.length !== 3) return cleaned;

    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parts[2];

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mon = monthNames[monthIdx] || 'Jan';
    const yy = year.substring(2);

    return `${day}-${mon}-${yy}`;
  }

  function getCurrentTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function formatTimeDisplay(timeStr) {
    if (!timeStr) return '';
    let clean = timeStr.toString().trim();
    if (clean.toUpperCase().includes('AM') || clean.toUpperCase().includes('PM')) return clean;

    let parts = clean.split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      let m = parts[1].substring(0, 2);
      if (!isNaN(h)) {
        let ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
      }
    }
    return clean;
  }

  function convertTo24Hour(timeStr) {
    if (!timeStr) return "00:00";
    let clean = timeStr.toString().trim();
    if (!clean.toUpperCase().includes('AM') && !clean.toUpperCase().includes('PM')) return clean;

    let parts = clean.split(' ');
    let timeParts = parts[0].split(':');
    let h = parseInt(timeParts[0], 10);
    let m = timeParts[1] || "00";
    let ampm = (parts[1] || "").toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  function triggerHaptic() {
    if (navigator.vibrate) {
      try { navigator.vibrate([35, 45, 35]); } catch (e) {}
    }
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
  }

  function notify() {
    listeners.forEach(fn => { try { fn(activeShift); } catch (e) {} });
  }

  function notifyTicker() {
    const sec = getElapsedSeconds();
    listeners.forEach(fn => {
      try { if (fn.onTick) fn.onTick(sec, formatSecondsToHMS(sec)); } catch (e) {}
    });
  }

  return {
    init,
    getActiveShift,
    clockIn,
    clockOut,
    toggleBreak,
    getElapsedSeconds,
    formatSecondsToHMS,
    calculateHours,
    formatDurationDisplay,
    getLocalDateStr,
    formatDateDDMonYY,
    getCurrentTimeStr,
    formatTimeDisplay,
    convertTo24Hour,
    triggerHaptic,
    subscribe
  };
})();

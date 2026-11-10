/**
 * Enterprise Time Tracker - Analytics & Financial Year Engine
 * Fast Memoized Calculations for Fiscal Quarters, Attendance %, and Weekly Targets
 */

window.OfficeAnalytics = (function() {

  function calculateFiscalYearData(logs, targetYear = null) {
    const now = new Date();
    const currentYear = targetYear || now.getFullYear();
    const currentMonth = now.getMonth();
    // Fiscal Year starts in April (month index 3)
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

    let monthlyMap = {};
    logs.forEach(log => {
      if (!log.date) return;
      const ym = log.date.substring(0, 7);
      if (!monthlyMap[ym]) monthlyMap[ym] = [];
      monthlyMap[ym].push(log);
    });

    const quarters = [
      { name: "Q1: Apr – Jun", months: [3, 4, 5], yearOffset: 0 },
      { name: "Q2: Jul – Sep", months: [6, 7, 8], yearOffset: 0 },
      { name: "Q3: Oct – Dec", months: [9, 10, 11], yearOffset: 0 },
      { name: "Q4: Jan – Mar", months: [0, 1, 2], yearOffset: 1 }
    ];

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const results = [];

    quarters.forEach(q => {
      let qMonthsData = [];
      let qAttended = 0, qValidDays = 0, qTotalHours = 0, qHoursDivisor = 0;
      let hasDataInQuarter = false;

      q.months.forEach(mIdx => {
        let mYear = (mIdx < 3 && q.name.includes("Q4")) ? fyStartYear + 1 : fyStartYear;
        let ymKey = `${mYear}-${String(mIdx + 1).padStart(2, '0')}`;

        let logsInMonth = monthlyMap[ymKey] || [];
        let validWorkDays = 0;
        let attendedDays = 0;
        let monthHours = 0;
        let monthHoursDivisor = 0;

        let countPresent = 0, countLeave = 0, countException = 0, countNoShow = 0, countOff = 0;

        logsInMonth.forEach(l => {
          if (l.status === "Present") countPresent++;
          else if (l.status === "Leave") countLeave++;
          else if (l.status === "Exception") countException++;
          else if (l.status === "No Show") countNoShow++;
          else if (l.status === "Weekend" || l.status === "Holiday") countOff++;

          if (l.status !== "Weekend" && l.status !== "Holiday") {
            validWorkDays++;
            if (l.status !== "No Show") {
              attendedDays++;
            }
            if (l.status === "Present") {
              monthHours += parseFloat(l.hours) || 0;
              monthHoursDivisor++;
            } else if (l.status === "No Show") {
              monthHoursDivisor++;
            }
          }
        });

        let pct = validWorkDays > 0 ? Math.round((attendedDays / validWorkDays) * 100) : 0;
        let monthAvgDecimal = monthHoursDivisor > 0 ? (monthHours / monthHoursDivisor) : 0;
        let monthAvgFormatted = OfficeShifts.formatDurationDisplay(monthAvgDecimal);

        if (logsInMonth.length > 0) hasDataInQuarter = true;

        qAttended += attendedDays;
        qValidDays += validWorkDays;
        qTotalHours += monthHours;
        qHoursDivisor += monthHoursDivisor;

        qMonthsData.push({
          name: monthNames[mIdx],
          pct: pct,
          avgHrs: monthAvgFormatted,
          hasData: logsInMonth.length > 0,
          present: countPresent,
          leave: countLeave,
          exception: countException,
          noshow: countNoShow,
          off: countOff
        });
      });

      if (hasDataInQuarter || qMonthsData.some(m => m.hasData)) {
        let quarterPct = qValidDays > 0 ? Math.round((qAttended / qValidDays) * 100) : 0;
        let quarterAvgDecimal = qHoursDivisor > 0 ? (qTotalHours / qHoursDivisor) : 0;
        let quarterAvgFormatted = OfficeShifts.formatDurationDisplay(quarterAvgDecimal);

        results.push({
          title: `${q.name} (${fyStartYear}-${String(fyStartYear + 1).substring(2)})`,
          pct: quarterPct,
          avgDuration: quarterAvgFormatted,
          totalHours: qTotalHours.toFixed(1),
          months: qMonthsData
        });
      }
    });

    return results;
  }

  function calculateWeeklySummary(logs) {
    const now = new Date();
    // Find Monday of current week
    const day = now.getDay();
    const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diffToMon));
    monday.setHours(0, 0, 0, 0);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(OfficeShifts.getLocalDateStr(d));
    }

    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let totalWeekHours = 0;
    const daysData = [];

    weekDates.forEach((dateStr, idx) => {
      const log = logs.find(l => l.date === dateStr);
      let status = "none";
      let hours = 0;

      if (log) {
        status = log.status.toLowerCase().replace(/\s+/g, '-');
        hours = parseFloat(log.hours) || 0;
        totalWeekHours += hours;
      }

      daysData.push({
        label: dayLabels[idx],
        date: dateStr,
        status: status,
        hours: hours,
        isToday: dateStr === OfficeShifts.getLocalDateStr()
      });
    });

    const target = OfficeConfig.SHIFT_PRESETS.WEEKLY_TARGET_HOURS || 40.0;
    const progressPct = Math.min(100, Math.round((totalWeekHours / target) * 100));

    return {
      totalHours: totalWeekHours.toFixed(1),
      targetHours: target,
      progressPct: progressPct,
      days: daysData
    };
  }

  return {
    calculateFiscalYearData,
    calculateWeeklySummary
  };
})();

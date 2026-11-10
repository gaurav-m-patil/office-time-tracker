/**
 * Enterprise Time Tracker - Analytics & Compliance Engine
 * Fast Memoized Calculations for Fiscal Quarters, 7-8h Company Compliance & Predictive Attendance
 */

window.OfficeAnalytics = (function() {

  // 7-8 Hour Company Compliance Calculator & Smart Predictor
  function calculateComplianceData(logs, customYearMonth = null) {
    // Determine active focus month
    let ymKey = customYearMonth;
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    if (!ymKey) {
      const hasCurrent = logs.some(l => l.date && l.date.startsWith(currentYM));
      if (hasCurrent) {
        ymKey = currentYM;
      } else if (logs.length > 0) {
        const sorted = [...logs].filter(l => l.date).sort((a, b) => b.date.localeCompare(a.date));
        ymKey = sorted[0].date.substring(0, 7);
      } else {
        ymKey = currentYM;
      }
    }

    const [yStr, mStr] = ymKey.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1; // 0-indexed
    
    const todayStr = OfficeShifts.getLocalDateStr(now);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 1. Calculate working days in month (Mon-Fri)
    let totalWorkingDays = 0;
    let elapsedWorkingDays = 0;
    let remainingWorkingDays = 0;
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dayOfWeek = dateObj.getDay(); // 0 Sun, 6 Sat
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      if (!isWeekend) {
        totalWorkingDays++;
        const checkDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (ymKey < currentYM) {
          // Past month: all days elapsed
          elapsedWorkingDays++;
        } else if (ymKey > currentYM) {
          // Future month: all remaining
          remainingWorkingDays++;
        } else {
          // Current month
          if (checkDateStr <= todayStr) {
            elapsedWorkingDays++;
          } else {
            remainingWorkingDays++;
          }
        }
      }
    }

    // 2. Filter logs for this month
    const monthLogs = logs.filter(l => l.date && l.date.startsWith(ymKey));
    
    let attendedDays = 0;
    let presentDays = 0;
    let totalHours = 0;
    let leaveDays = 0;
    let exceptionDays = 0;
    let noshowDays = 0;

    monthLogs.forEach(l => {
      if (l.status === 'Present') {
        presentDays++;
        attendedDays++;
        totalHours += parseFloat(l.hours) || 0;
      } else if (l.status === 'Leave') {
        leaveDays++;
        attendedDays++;
      } else if (l.status === 'Exception') {
        exceptionDays++;
        attendedDays++;
      } else if (l.status === 'No Show') {
        noshowDays++;
      }
    });

    const avgHoursPerPresentDay = presentDays > 0 ? (totalHours / presentDays) : 0;
    const avgFormatted = OfficeShifts.formatDurationDisplay(avgHoursPerPresentDay);
    
    // Company Standards: 7.0 hours minimum, 8.0 hours target
    const MIN_HOURS = 7.0;
    const TARGET_HOURS = 8.0;
    
    const isCompliant = avgHoursPerPresentDay >= MIN_HOURS;
    const isOptimal = avgHoursPerPresentDay >= TARGET_HOURS;
    
    // Target calculations
    const minTargetTotalHours = totalWorkingDays * MIN_HOURS;
    const optTargetTotalHours = totalWorkingDays * TARGET_HOURS;
    const deficitForMin = Math.max(0, minTargetTotalHours - totalHours);
    const deficitForOpt = Math.max(0, optTargetTotalHours - totalHours);
    
    let predictorAdvice = "";
    let reqDailyForMin = 0;
    let reqDailyForOpt = 0;
    
    if (remainingWorkingDays > 0) {
      reqDailyForMin = parseFloat((deficitForMin / remainingWorkingDays).toFixed(1));
      reqDailyForOpt = parseFloat((deficitForOpt / remainingWorkingDays).toFixed(1));
      
      if (avgHoursPerPresentDay >= TARGET_HOURS) {
        predictorAdvice = `🌟 Optimal: You're averaging ${avgHoursPerPresentDay.toFixed(1)}h. Maintain ≥ 7.0h on your ${remainingWorkingDays} remaining days to stay compliant.`;
      } else if (avgHoursPerPresentDay >= MIN_HOURS) {
        predictorAdvice = `✅ Compliant: Current avg is ${avgHoursPerPresentDay.toFixed(1)}h (≥ 7.0h min). Aim for ~${reqDailyForOpt}h/day across ${remainingWorkingDays} remaining days to reach the 8.0h target.`;
      } else {
        predictorAdvice = `⚠️ Action Needed: Average is ${avgHoursPerPresentDay.toFixed(1)}h. You need ~${reqDailyForMin}h/day across ${remainingWorkingDays} remaining days to hit the 7.0h minimum.`;
      }
    } else {
      if (presentDays === 0) {
        predictorAdvice = "No present attendance recorded for this month.";
      } else if (isOptimal) {
        predictorAdvice = `🏆 Excellent: Month completed with ${avgHoursPerPresentDay.toFixed(1)}h/day average (exceeds 8.0h company target).`;
      } else if (isCompliant) {
        predictorAdvice = `✅ Compliant: Month completed with ${avgHoursPerPresentDay.toFixed(1)}h/day average (meets 7-8h requirement).`;
      } else {
        predictorAdvice = `⚠️ Below Standard: Month finalized at ${avgHoursPerPresentDay.toFixed(1)}h/day (below 7.0h company minimum).`;
      }
    }

    // Monthly compliance percentage (7h = 100%, 8h = 114%)
    const compliancePct = Math.min(100, Math.round((avgHoursPerPresentDay / MIN_HOURS) * 100));

    // Get list of all available months in logs for the selector
    const availableMonths = Array.from(new Set(logs.filter(l => l.date).map(l => l.date.substring(0, 7)))).sort().reverse();
    if (!availableMonths.includes(currentYM)) {
      availableMonths.unshift(currentYM);
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabel = `${monthNames[month]} ${year}`;

    return {
      yearMonth: ymKey,
      monthLabel,
      availableMonths,
      totalWorkingDays,
      elapsedWorkingDays,
      remainingWorkingDays,
      attendedDays,
      presentDays,
      leaveDays,
      exceptionDays,
      noshowDays,
      totalHours: totalHours.toFixed(1),
      avgHours: avgHoursPerPresentDay.toFixed(2),
      avgFormatted,
      isCompliant,
      isOptimal,
      compliancePct,
      minTargetTotalHours: minTargetTotalHours.toFixed(1),
      optTargetTotalHours: optTargetTotalHours.toFixed(1),
      deficitForMin: deficitForMin.toFixed(1),
      reqDailyForMin: reqDailyForMin > 0 ? reqDailyForMin : MIN_HOURS,
      reqDailyForOpt: reqDailyForOpt > 0 ? reqDailyForOpt : TARGET_HOURS,
      predictorAdvice
    };
  }

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

  return {
    calculateComplianceData,
    calculateFiscalYearData
  };
})();

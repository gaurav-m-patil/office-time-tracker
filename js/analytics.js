/**
 * Enterprise Time Tracker - Analytics & Compliance Engine
 * Fast Memoized Calculations for Fiscal Quarters, 7-8h Company Compliance & Predictive Attendance
 */

window.OfficeAnalytics = (function() {

  // 7-8 Hour Company Compliance Calculator & Smart Salary Attendance Predictor
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
    
    // 1. Filter logs for this month & calculate exact fiscal aggregates
    const monthLogs = logs.filter(l => l.date && l.date.startsWith(ymKey));
    
    let countPresent = 0;
    let countLeave = 0;
    let countException = 0;
    let countNoShow = 0;
    let countOff = 0;
    let validWorkDaysLogged = 0;
    let attendedDaysLogged = 0;
    let totalHours = 0;
    let hoursDivisor = 0;

    const loggedDates = {};

    monthLogs.forEach(l => {
      loggedDates[l.date] = l.status;
      if (l.status === 'Present') countPresent++;
      else if (l.status === 'Leave') countLeave++;
      else if (l.status === 'Exception') countException++;
      else if (l.status === 'No Show') countNoShow++;
      else if (l.status === 'Weekend' || l.status === 'Holiday') countOff++;

      if (l.status !== 'Weekend' && l.status !== 'Holiday') {
        validWorkDaysLogged++;
        if (l.status !== 'No Show') {
          attendedDaysLogged++;
        }
        if (l.status === 'Present') {
          totalHours += parseFloat(l.hours) || 0;
          hoursDivisor++;
        } else if (l.status === 'No Show') {
          hoursDivisor++; // Exact Fiscal Rule: No-shows dilute working hours average
        }
      }
    });

    // 2. Calculate remaining future workdays (excluding weekends & already logged off days)
    let futureWorkingDays = 0;
    if (ymKey >= currentYM) {
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (dStr > todayStr && !loggedDates[dStr]) {
          const dateObj = new Date(year, month, d);
          const dow = dateObj.getDay();
          if (dow !== 0 && dow !== 6) { // Mon - Fri
            futureWorkingDays++;
          }
        }
      }
    }

    const totalExpectedWorkDays = validWorkDaysLogged + futureWorkingDays;

    // 3. Exact Fiscal Performance Formulas (Identical across both boxes)
    const currentAttendancePct = validWorkDaysLogged > 0 
      ? Math.round((attendedDaysLogged / validWorkDaysLogged) * 100) 
      : 0;
      
    const currentAvgDecimal = hoursDivisor > 0 
      ? (totalHours / hoursDivisor) 
      : 0;

    const avgFormatted = OfficeShifts.formatDurationDisplay(currentAvgDecimal);

    // 4. Benchmark A: 86% Salary Protection Policy
    const TARGET_SALARY_PCT = 86;
    const is86Safe = currentAttendancePct >= TARGET_SALARY_PCT;
    const requiredAttendedDaysFor86 = Math.ceil(totalExpectedWorkDays * (TARGET_SALARY_PCT / 100));
    const daysNeededFor86 = Math.max(0, requiredAttendedDaysFor86 - attendedDaysLogged);
    const maxAllowableNoShows = Math.max(0, (totalExpectedWorkDays - requiredAttendedDaysFor86) - countNoShow);

    // 5. Benchmark B: Company 7.0h Minimum & 8.0h Target Hours Policy
    const MIN_HOURS = 7.0;
    const TARGET_HOURS = 8.0;
    const isHoursCompliant = currentAvgDecimal >= MIN_HOURS;
    const isHoursOptimal = currentAvgDecimal >= TARGET_HOURS;

    let reqDailyHours7h = 0;
    let reqDailyHours8h = 0;
    let reqDailyFormatted7h = "0h 00m";
    let reqDailyFormatted8h = "0h 00m";
    let surplusHours = 0;

    if (futureWorkingDays > 0) {
      const projectedDivisor = hoursDivisor + futureWorkingDays;
      const targetTotal7h = projectedDivisor * MIN_HOURS;
      const targetTotal8h = projectedDivisor * TARGET_HOURS;

      const deficit7h = targetTotal7h - totalHours;
      const deficit8h = targetTotal8h - totalHours;

      if (deficit7h > 0) {
        reqDailyHours7h = parseFloat((deficit7h / futureWorkingDays).toFixed(2));
      } else {
        surplusHours = parseFloat((totalHours - (hoursDivisor * MIN_HOURS)).toFixed(1));
      }

      if (deficit8h > 0) {
        reqDailyHours8h = parseFloat((deficit8h / futureWorkingDays).toFixed(2));
      }

      reqDailyFormatted7h = OfficeShifts.formatDurationDisplay(reqDailyHours7h > 0 ? reqDailyHours7h : MIN_HOURS);
      reqDailyFormatted8h = OfficeShifts.formatDurationDisplay(reqDailyHours8h > 0 ? reqDailyHours8h : TARGET_HOURS);
    } else {
      surplusHours = parseFloat(Math.max(0, totalHours - (hoursDivisor * MIN_HOURS)).toFixed(1));
    }

    // 6. Dynamic AI Guidance Messages
    let salaryAdvice = "";
    let hoursAdvice = "";

    if (futureWorkingDays > 0) {
      // Active / Current Month Predictions
      if (daysNeededFor86 === 0) {
        salaryAdvice = `🎉 <strong>Salary Safe (${currentAttendancePct}% ≥ 86%)</strong>: Quota reached! You can take up to <strong>${maxAllowableNoShows} days off</strong> without any salary deduction.`;
      } else if (daysNeededFor86 <= futureWorkingDays) {
        salaryAdvice = `⚠️ <strong>Salary Protection</strong>: You must attend at least <strong>${daysNeededFor86} of your ${futureWorkingDays} remaining workdays</strong> to secure ≥ 86% attendance and protect your salary.`;
      } else {
        salaryAdvice = `🚨 <strong>Salary Risk</strong>: Attendance will finish below 86% due to past unexcused absences. Max achievable is ${Math.round(((attendedDaysLogged + futureWorkingDays) / totalExpectedWorkDays) * 100)}%.`;
      }

      if (isHoursCompliant) {
        hoursAdvice = surplusHours > 0
          ? `🌟 <strong>Hours Target (Surplus: +${surplusHours}h)</strong>: Average is ${avgFormatted}. You only need ~<strong>${reqDailyFormatted7h}/day</strong> across ${futureWorkingDays} days to stay compliant.`
          : `✅ <strong>Hours Target (${avgFormatted})</strong>: Average meets company 7-8h standard. Keep logging ~<strong>${reqDailyFormatted7h}/day</strong>.`;
      } else {
        hoursAdvice = `⚠️ <strong>Hours Deficit (${avgFormatted})</strong>: You need to log ~<strong>${reqDailyFormatted7h} / day</strong> across your ${futureWorkingDays} remaining workdays to raise average to 7.0h (or ~${reqDailyFormatted8h}/day for 8.0h optimal).`;
      }
    } else {
      // Completed / Past Month Assessment
      salaryAdvice = is86Safe 
        ? `✅ <strong>Salary Safe</strong>: Finalized at ${currentAttendancePct}% attendance (exceeds 86% threshold).`
        : `⚠️ <strong>Salary Impacted</strong>: Finalized at ${currentAttendancePct}% attendance (fell below 86% threshold).`;

      hoursAdvice = isHoursOptimal
        ? `🏆 <strong>Optimal Performance</strong>: Finalized at ${avgFormatted} / day (exceeds 8.0h company target).`
        : (isHoursCompliant
          ? `✅ <strong>Compliant Standard</strong>: Finalized at ${avgFormatted} / day (meets 7–8h requirement).`
          : `⚠️ <strong>Below Minimum</strong>: Finalized at ${avgFormatted} / day (below 7.0h company minimum).`);
    }

    // Available months list for dropdown
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
      totalExpectedWorkDays,
      validWorkDaysLogged,
      futureWorkingDays,
      attendedDaysLogged,
      presentDays: countPresent,
      leaveDays: countLeave,
      exceptionDays: countException,
      noshowDays: countNoShow,
      offDays: countOff,
      totalHours: totalHours.toFixed(1),
      hoursDivisor,
      avgHoursDecimal: currentAvgDecimal.toFixed(2),
      avgFormatted,
      attendancePct: currentAttendancePct,
      is86Safe,
      daysNeededFor86,
      maxAllowableNoShows,
      isHoursCompliant,
      isHoursOptimal,
      reqDailyHours7h,
      reqDailyHours8h,
      reqDailyFormatted7h,
      reqDailyFormatted8h,
      surplusHours,
      salaryAdvice,
      hoursAdvice
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

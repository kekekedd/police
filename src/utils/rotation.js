/**
 * 지구대/파출소 근무표 로직 유틸리티
 */

// 시간 겹침 검사 함수 (경계값 포함하지 않음: 06:00 종료와 06:00 시작은 겹치지 않음)
export const isTimeOverlapping = (start1, end1, start2, end2) => {
  if (!start1 || !end1 || !start2 || !end2) return false;
  const toMinutes = (time) => {
    const parts = time.split(':').map(Number);
    const h = parts[0];
    const m = parts.length > 1 ? parts[1] : 0;
    return h * 60 + m;
  };
  let s1 = toMinutes(start1);
  let e1 = toMinutes(end1);
  let s2 = toMinutes(start2);
  let e2 = toMinutes(end2);
  
  // 익일 처리
  if (e1 <= s1) e1 += 24 * 60;
  if (e2 <= s2) e2 += 24 * 60;
  
  const overlap = (as, ae, bs, be) => {
    // 두 구간 [as, ae]와 [bs, be]가 겹치려면:
    // 시작점 중 큰 값이 종료점 중 작은 값보다 작아야 함 (등호 제외)
    return Math.max(as, bs) < Math.min(ae, be);
  };

  if (overlap(s1, e1, s2, e2)) return true;
  // 24시간 순환 고려
  if (overlap(s1 + 24 * 60, e1 + 24 * 60, s2, e2)) return true;
  if (overlap(s1, e1, s2 + 24 * 60, e2 + 24 * 60)) return true;
  
  return false;
};

// 특정 직원의 배치 가능 여부 계산
export const checkAvailability = (employee, slotStart, slotEnd, specialNotes, dutyName) => {
  if (!employee) return { available: false, reason: '정보없음' };

  // 대기근무 전역 제한 (07:00 ~ 08:00 배정 금지)
  if (dutyName === '대기근무') {
    if (isTimeOverlapping(slotStart, slotEnd, "07:00", "08:00")) {
      return { available: false, reason: '배정금지' };
    }
  }

  // 야간 근무 제외자 확인
  if (employee.isNightShiftExcluded) {
    // 야간 시간 정의: 19:00 ~ 익일 08:30
    if (isTimeOverlapping(slotStart, slotEnd, "19:00", "08:30")) {
      return { available: false, reason: '야간제외' };
    }
  }

  // 휴가 등 특이사항 확인
  const notes = specialNotes.filter(n => n.employeeId === employee.id);
  for (const n of notes) {
    if (n.type === '지원근무') continue;
    // 종일 특이사항
    if (['휴가', '병가', '기타'].includes(n.type) || n.isAllDay) {
      return { available: false, reason: n.type };
    }
    // 시간제 특이사항 (육아시간 등)
    if (isTimeOverlapping(slotStart, slotEnd, n.startTime, n.endTime)) {
      return { available: false, reason: n.type };
    }
  }
  
  return { available: true };
};

// 대기근무 A, B, C 그룹 정의 (모든 가능한 슬롯 목록)
// 07:00-08:00는 전역적으로 대기근무 배제 (사용자 요청)
const allStandbySlots = [
  "22:00-01:00", "01:00-02:00", "02:00-04:00", "04:00-06:00", "06:00-07:00"
];

const standbyGroups = {
  A: ["22:00-01:00"],
  B: ["01:00-02:00", "02:00-04:00"],
  C: ["04:00-06:00", "06:00-07:00"],
};

// 4일 전 근무 기록을 바탕으로 야간 대기근무를 순환시키는 새로운 핵심 함수
export const rotateNightStandby = (prev4DaysRoster, allEmployees, specialNotesForToday, teamName) => {
  const newAssignments = {};
  const warnings = [];
  const processedEmployeeIds = new Set();
  const todayRotationGroups = {}; 

  const eligibleEmployees = allEmployees.filter(e => 
    e.team === teamName && e.isStandbyRotationEligible && !e.isFixedNightStandby
  );

  // 1. 고정 대기자 우선 배치
  allEmployees.filter(e => e.team === teamName && e.isFixedNightStandby).forEach(emp => {
    if (emp.fixedNightStandbySlot) {
      const [fixedStart, fixedEnd] = emp.fixedNightStandbySlot.split('-');
      let assignedCount = 0;
      allStandbySlots.forEach(slot => {
        const [slotStart, slotEnd] = slot.split('-');
        if (isTimeOverlapping(fixedStart, fixedEnd, slotStart, slotEnd)) {
          const availability = checkAvailability(emp, slotStart, slotEnd, specialNotesForToday, '대기근무');
          if (availability.available) {
            const slotKey = `${slot}_대기근무`;
            if (!newAssignments[slotKey]) newAssignments[slotKey] = [];
            newAssignments[slotKey].push(emp.id);
            assignedCount++;
          }
        }
      });
      if (assignedCount > 0) processedEmployeeIds.add(emp.id);
    }
  });

  // 2. 순환 대상자 그룹 결정
  const prevGroups = prev4DaysRoster?.standbyRotationGroups || {};
  const prevAssignments = prev4DaysRoster?.assignments || {};

  eligibleEmployees.forEach((emp, idx) => {
    let prevG = prevGroups[emp.id];

    // 이전 기록에서 그룹 찾기 (직접 배정표 뒤지기)
    if (!prevG) {
      for (const gName in standbyGroups) {
        if (standbyGroups[gName].some(slot => (prevAssignments[`${slot}_대기근무`] || []).includes(emp.id))) {
          prevG = gName;
          break;
        }
      }
    }

    // 오늘 그룹 결정 (순환: A->B, B->C, C->A)
    let todayG;
    if (prevG === 'A') todayG = 'B';
    else if (prevG === 'B') todayG = 'C';
    else if (prevG === 'C') todayG = 'A';
    else {
      // 아예 기록이 없는 신규 인원만 인원수 맞춰 분배
      todayG = ['A', 'B', 'C'][idx % 3];
    }
    todayRotationGroups[emp.id] = todayG;
  });

  // 3. 실제 배정
  eligibleEmployees.forEach(employee => {
    const groupName = todayRotationGroups[employee.id];
    const slotsToFill = standbyGroups[groupName];
    let assignedAny = false;
    let lastBlockedReason = "";

    slotsToFill.forEach(slot => {
      const [start, end] = slot.split('-');
      const { available, reason } = checkAvailability(employee, start, end, specialNotesForToday, '대기근무');
      if (available) {
        const key = `${slot}_대기근무`;
        if (!newAssignments[key]) newAssignments[key] = [];
        newAssignments[key].push(employee.id);
        assignedAny = true;
      } else {
        lastBlockedReason = reason;
      }
    });

    if (!assignedAny) {
      warnings.push(`${employee.name}님(${groupName}조) 제외 사유: ${lastBlockedReason}`);
    }
  });
  
  return { assignments: newAssignments, warnings, standbyRotationGroups: todayRotationGroups };
};

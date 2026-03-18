/**
 * 지구대/파출소 근무표 로직 유틸리티
 */

// 시간 겹침 검사 함수
export const isTimeOverlapping = (start1, end1, start2, end2) => {
  if (!start1 || !end1 || !start2 || !end2) return false;
  const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  let s1 = toMinutes(start1);
  let e1 = toMinutes(end1);
  let s2 = toMinutes(start2);
  let e2 = toMinutes(end2);
  if (e1 <= s1) e1 += 24 * 60;
  if (e2 <= s2) e2 += 24 * 60;
  const overlap = (a_s, a_e, b_s, b_e) => Math.max(a_s, b_s) < Math.min(a_e, b_e);
  if (overlap(s1, e1, s2, e2)) return true;
  if (overlap(s1, e1, s2 + 24 * 60, e2 + 24 * 60)) return true;
  if (overlap(s1 + 24 * 60, e1 + 24 * 60, s2, e2)) return true;
  return false;
};

// 특정 직원의 배치 가능 여부 계산
export const checkAvailability = (employee, slotStart, slotEnd, specialNotes) => {
  if (!employee) return { available: false, reason: '정보없음' };

  // 야간 근무 제외자 확인
  if (employee.isNightShiftExcluded) {
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = toMin(slotStart);
    let e = toMin(slotEnd);
    if (e <= s) e += 24 * 60;
    const nightStart = 19 * 60; // 19:00
    const nightEnd = (8 * 60 + 30) + 24 * 60; // 익일 08:30
    const overlapsWithNight = (startTime, endTime) => Math.max(startTime, nightStart) < Math.min(endTime, nightEnd);
    
    if (overlapsWithNight(s, e) || overlapsWithNight(s + 24*60, e + 24*60)) {
        return { available: false, reason: '야간제외' };
    }
  }

  // 휴가 등 특이사항 확인
  const notes = specialNotes.filter(n => n.employeeId === employee.id);
  for (const n of notes) {
    if (n.type === '지원근무') continue;
    if (['휴가', '병가', '기타'].includes(n.type) || n.isAllDay) return { available: false, reason: n.type };
    if (isTimeOverlapping(slotStart, slotEnd, n.startTime, n.endTime)) return { available: false, reason: n.type };
  }
  
  return { available: true };
};

// 대기근무 A, B, C 그룹 정의
const standbyGroups = {
  A: ["22:00-01:00"],
  B: ["01:00-02:00", "02:00-04:00"],
  C: ["04:00-06:00", "06:00-07:00"],
};

// 4일 전 근무 기록을 바탕으로 야간 대기근무를 순환시키는 새로운 핵심 함수
export const rotateNightStandby = (prev4DaysRoster, allEmployees, specialNotesForToday, teamName) => {
  const newAssignments = {};
  const warnings = [];

  const teamEmployees = allEmployees.filter(e => e.team === teamName);
  const processedEmployeeIds = new Set();

  // 1. 고정 대기자 우선 배치
  teamEmployees.forEach(emp => {
    if (emp.isFixedNightStandby && emp.fixedNightStandbySlot) {
      const [slotStart, slotEnd] = emp.fixedNightStandbySlot.split('-');
      
      const availability = checkAvailability(emp, slotStart, slotEnd, specialNotesForToday);
      if (availability.available) {
        const slotKey = `${emp.fixedNightStandbySlot}_대기근무`;
        if (!newAssignments[slotKey]) newAssignments[slotKey] = [];
        newAssignments[slotKey].push(emp.id);
        processedEmployeeIds.add(emp.id);
      } else {
        warnings.push(`${emp.name}님은 고정대기이지만, ${availability.reason}으로 배치 불가.`);
      }
    }
  });

  // 4일 전 근무표가 없으면 순환 불가
  if (!prev4DaysRoster || !prev4DaysRoster.assignments) {
    warnings.push("4일 전 야간 근무기록이 없어 순환할 수 없습니다.");
    return { assignments: newAssignments, warnings };
  }
  
  const prevAssignments = prev4DaysRoster.assignments;

  // 2. 4일 전 A, B, C 그룹에 누가 있었는지 파악
  const getPrevGroupMembers = (groupSlots) => {
    const memberIds = new Set();
    groupSlots.forEach(slot => {
      const key = `${slot}_대기근무`;
      if (prevAssignments[key]) {
        prevAssignments[key].forEach(id => memberIds.add(id));
      }
    });
    // 순서 유지를 위해 Set을 Array로 변환
    return Array.from(memberIds);
  };
  
  const prevGroup = {
    A: getPrevGroupMembers(standbyGroups.A),
    B: getPrevGroupMembers(standbyGroups.B),
    C: getPrevGroupMembers(standbyGroups.C),
  };

  // 3. 오늘 A, B, C 그룹 결정 (C -> A, A -> B, B -> C)
  const todayGroup = {
    A: prevGroup.C,
    B: prevGroup.A,
    C: prevGroup.B,
  };

  // 4. 결정된 그룹에 따라 오늘 근무표에 배치
  for (const groupName in todayGroup) {
    const employeeIdsToAssign = todayGroup[groupName];
    const slotsToFill = standbyGroups[groupName];

    employeeIdsToAssign.forEach(empId => {
      if (processedEmployeeIds.has(empId)) return;

      const employee = allEmployees.find(e => e.id === empId);
      if (!employee) {
        warnings.push(`ID '${empId}' 직원을 찾을 수 없습니다.`);
        return;
      }

      const isAvailable = slotsToFill.every(slot => {
        const [start, end] = slot.split('-');
        return checkAvailability(employee, start, end, specialNotesForToday).available;
      });

      if (isAvailable) {
        slotsToFill.forEach(slot => {
          const key = `${slot}_대기근무`;
          if (!newAssignments[key]) newAssignments[key] = [];
          if (!newAssignments[key].includes(empId)) {
            newAssignments[key].push(empId);
          }
        });
        processedEmployeeIds.add(empId);
      } else {
        const { reason } = checkAvailability(employee, slotsToFill[0].split('-')[0], slotsToFill[slotsToFill.length-1].split('-')[1], specialNotesForToday);
        warnings.push(`${employee.name}님은 ${groupName}그룹 순서지만, ${reason}으로 배치 불가.`);
      }
    });
  }
  
  return { assignments: newAssignments, warnings };
};

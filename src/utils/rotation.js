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

// 대기근무 A, B, C 그룹 정의 (모든 가능한 슬롯 목록)
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

  // 1. 고정 대기자 우선 배치 (유연한 시간대 매칭)
  allEmployees.filter(e => e.team === teamName && e.isFixedNightStandby).forEach(emp => {
    if (emp.fixedNightStandbySlot) {
      const [fixedStart, fixedEnd] = emp.fixedNightStandbySlot.split('-');
      
      // 고정 시간대가 근무표 상의 어떤 슬롯과 겹치는지 확인하여 모두 배치
      let assignedCount = 0;
      allStandbySlots.forEach(slot => {
        const [slotStart, slotEnd] = slot.split('-');
        if (isTimeOverlapping(fixedStart, fixedEnd, slotStart, slotEnd)) {
          const availability = checkAvailability(emp, slotStart, slotEnd, specialNotesForToday);
          if (availability.available) {
            const slotKey = `${slot}_대기근무`;
            if (!newAssignments[slotKey]) newAssignments[slotKey] = [];
            newAssignments[slotKey].push(emp.id);
            assignedCount++;
          }
        }
      });

      if (assignedCount > 0) {
        processedEmployeeIds.add(emp.id);
      } else {
        warnings.push(`${emp.name}님은 고정대기(${emp.fixedNightStandbySlot}) 배정 실패 (사유: 특이사항 중복 또는 시간대 불일치)`);
      }
    }
  });

  // 4일 전 근무표가 없으면 순환 불가
  if (!prev4DaysRoster || !prev4DaysRoster.assignments) {
    warnings.push("4일 전 야간 근무기록이 없어 순환할 수 없습니다.");
    return { assignments: newAssignments, warnings };
  }
  
  const prevAssignments = prev4DaysRoster.assignments;

  // 2. 4일 전 A, B, C 그룹 멤버 파악 (고정 대기자 제외)
  const getPrevGroupMembers = (groupSlots) => {
    const memberIds = new Set();
    groupSlots.forEach(slot => {
      const key = `${slot}_대기근무`;
      if (prevAssignments[key]) {
        prevAssignments[key].forEach(id => {
          const emp = allEmployees.find(e => e.id === id);
          // 순수한 팀원 중 고정 대기가 아닌 인원만 순환 대상으로 인정
          if (emp && emp.team === teamName && !emp.isFixedNightStandby) {
            memberIds.add(id);
          }
        });
      }
    });
    return Array.from(memberIds);
  };
  
  const prevGroup = {
    A: getPrevGroupMembers(standbyGroups.A),
    B: getPrevGroupMembers(standbyGroups.B),
    C: getPrevGroupMembers(standbyGroups.C),
  };

  // 3. 오늘 A, B, C 그룹 결정 (C -> A, A -> B, B -> C)
  const todayGroupMap = {
    A: prevGroup.C,
    B: prevGroup.A,
    C: prevGroup.B,
  };

  // 4. 결정된 그룹에 따라 오늘 근무표에 배치
  for (const groupName in todayGroupMap) {
    const employeeIdsToAssign = todayGroupMap[groupName];
    const slotsToFill = standbyGroups[groupName];

    employeeIdsToAssign.forEach(empId => {
      if (processedEmployeeIds.has(empId)) return;

      const employee = allEmployees.find(e => e.id === empId);
      if (!employee) return;

      // [개선] 모든 슬롯이 아닌, 가능한 슬롯에만 개별적으로 배치
      let assignedAny = false;
      let lastBlockedReason = "";

      slotsToFill.forEach(slot => {
        const [start, end] = slot.split('-');
        const { available, reason } = checkAvailability(employee, start, end, specialNotesForToday);
        
        if (available) {
          const key = `${slot}_대기근무`;
          if (!newAssignments[key]) newAssignments[key] = [];
          if (!newAssignments[key].includes(empId)) {
            newAssignments[key].push(empId);
          }
          assignedAny = true;
        } else {
          lastBlockedReason = reason;
        }
      });

      if (assignedAny) {
        processedEmployeeIds.add(empId);
      } else {
        // 그룹 내의 단 하나의 시간대도 배정이 불가능한 경우에만 경고
        warnings.push(`${employee.name}님은 ${groupName}그룹 순서지만, ${lastBlockedReason}으로 모든 시간대 배치 불가.`);
      }
    });
  }
  
  return { assignments: newAssignments, warnings };
};

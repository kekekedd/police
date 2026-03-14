/**
 * 지구대/파출소 근무표 로직 유틸리티
 */

// 시간 겹침 검사 함수 (자정 넘는 시간대 처리)
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

  // 종료 시간이 시작 시간보다 빠르면 자정을 넘은 것으로 간주 (24시간 더함)
  if (e1 <= s1) e1 += 24 * 60;
  if (e2 <= s2) e2 += 24 * 60;

  // 두 기간이 겹치는지 확인하기 위해 두 가지 경우를 모두 체크 (기본 + 다음날)
  const overlap = (a_s, a_e, b_s, b_e) => Math.max(a_s, b_s) < Math.min(a_e, b_e);

  if (overlap(s1, e1, s2, e2)) return true;
  if (overlap(s1, e1, s2 + 24 * 60, e2 + 24 * 60)) return true;
  if (overlap(s1 + 24 * 60, e1 + 24 * 60, s2, e2)) return true;

  return false;
};

// 특정 직원의 시간대별 배치 가능 여부 계산
export const checkAvailability = (employee, slotStart, slotEnd, specialNotes) => {
  if (!employee) return { available: false, reason: '직원 정보 없음' };
  const notes = specialNotes.filter(n => n.employeeId === employee.id);
  
  for (const note of notes) {
    if (note.isAllDay) return { available: false, reason: note.type };
    if (isTimeOverlapping(slotStart, slotEnd, note.startTime, note.endTime)) {
      return { available: false, reason: `${note.type} (${note.startTime}~${note.endTime})` };
    }
  }
  return { available: true };
};

// 야간 대기조 순환 로직
export const rotateStandbyGroups = (prevRoster, employees, specialNotes) => {
  const slots = [
    "22:00-01:00", 
    "01:00-02:00", "02:00-04:00",
    "04:00-06:00", "06:00-07:00"
  ];

  const fixedEmployees = employees.filter(e => e.isFixedNightStandby);
  const rotationPool = employees.filter(e => e.isStandbyRotationEligible && !e.isFixedNightStandby);
  
  // 이전 야간 순서 파악 (assignments 구조가 배열로 변경됨을 고려)
  const prevAssignments = prevRoster?.assignments || {};
  const prevOrderedIds = [];
  slots.forEach(slot => {
    const ids = prevAssignments[`${slot}_대기근무`] || [];
    ids.forEach(id => {
      if (!fixedEmployees.find(e => e.id === id)) {
        prevOrderedIds.push(id);
      }
    });
  });

  const lastId = prevOrderedIds[prevOrderedIds.length - 1];
  let startIndex = rotationPool.findIndex(e => e.id === lastId);
  if (startIndex === -1) startIndex = 0;
  else startIndex = (startIndex + 1) % rotationPool.length;

  const finalAssignments = [];
  const warnings = [];
  const usedIds = new Set();

  slots.forEach(slot => {
    const [ss, se] = slot.split('-');
    
    // 1. 고정 대기자 확인
    const fixed = fixedEmployees.find(e => {
      if (!e.fixedNightStandbySlot) return false;
      const [fs, fe] = e.fixedNightStandbySlot.split('-');
      return isTimeOverlapping(fs, fe, ss, se);
    });

    if (fixed) {
      const { available, reason } = checkAvailability(fixed, ss, se, specialNotes);
      if (available) {
        finalAssignments.push({ slot, employeeId: fixed.id });
        usedIds.add(fixed.id);
        return;
      } else {
        warnings.push(`${fixed.rank} ${fixed.name}님은 고정 대기자이나 ${reason} 사유로 배치가 불가능합니다. 대체 인원을 추천합니다.`);
      }
    }

    // 2. 순환 풀에서 배치 (고정 대기자 부재 시 포함)
    let assigned = false;
    for (let j = 0; j < rotationPool.length; j++) {
      const candidateIndex = (startIndex + j) % rotationPool.length;
      const candidate = rotationPool[candidateIndex];
      
      if (usedIds.has(candidate.id)) continue;

      const { available } = checkAvailability(candidate, ss, se, specialNotes);
      
      if (available) {
        finalAssignments.push({ slot, employeeId: candidate.id });
        usedIds.add(candidate.id);
        startIndex = (candidateIndex + 1) % rotationPool.length;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      warnings.push(`${slot} 시간대에 배치 가능한 인원이 없습니다.`);
    }
  });

  return { assignments: finalAssignments, warnings };
};

/**
 * 지구대/파출소 근무표 로직 유틸리티
 */

// 시간 겹침 검사 함수
export const isTimeOverlapping = (start1, end1, start2, end2) => {
  if (!start1 || !end1 || !start2 || !end2) return false;
  
  const s1 = parseInt(start1.replace(':', ''));
  const e1 = parseInt(end1.replace(':', ''));
  const s2 = parseInt(start2.replace(':', ''));
  const e2 = parseInt(end2.replace(':', ''));

  return s1 < e2 && s2 < e1;
};

// 특정 직원의 시간대별 배치 가능 여부 계산
export const checkAvailability = (employee, slotStart, slotEnd, specialNotes) => {
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
  const slots = ["22:00-01:00", "01:00-04:00", "04:00-07:00"];
  const result = slots.map(slot => ({ slot, employeeId: null }));

  // 1. 고정 대기자 우선 배치
  const fixedEmployees = employees.filter(e => e.isFixedNightStandby);
  fixedEmployees.forEach(e => {
    const slotIndex = slots.indexOf(e.fixedNightStandbySlot);
    if (slotIndex !== -1) {
      const { available } = checkAvailability(e, ...e.fixedNightStandbySlot.split('-'), specialNotes);
      if (available) {
        result[slotIndex].employeeId = e.id;
      }
    }
  });

  // 2. 순환 대상자 추출 (고정 대기자 제외, 순환 가능자만)
  const rotationPool = employees.filter(e => e.isStandbyRotationEligible && !e.isFixedNightStandby);
  
  // 3. 이전 야간 순서 파악
  const prevStandby = prevRoster?.nightStandbyGroups || [];
  const prevOrderedIds = prevStandby
    .filter(g => !employees.find(e => e.id === g.employeeId)?.isFixedNightStandby)
    .map(g => g.employeeId);

  // 4. 순환 알고리즘: 이전 마지막 사람 다음부터 순차적으로 배치 가능한 사람 찾기
  // 실제 구현에서는 rotationPool을 정렬된 상태로 유지하고 index를 관리하는 것이 좋음
  // 여기서는 단순화를 위해 rotationPool 내에서의 순서를 기준으로 한 칸씩 미는 방식 제안
  
  const lastId = prevOrderedIds[prevOrderedIds.length - 1];
  let startIndex = rotationPool.findIndex(e => e.id === lastId);
  if (startIndex === -1) startIndex = 0;
  else startIndex = (startIndex + 1) % rotationPool.length;

  for (let i = 0; i < slots.length; i++) {
    if (result[i].employeeId) continue; // 이미 고정 대기자 배치됨

    let found = false;
    for (let j = 0; j < rotationPool.length; j++) {
      const candidateIndex = (startIndex + j) % rotationPool.length;
      const candidate = rotationPool[candidateIndex];
      
      // 이미 다른 슬롯에 배치되었는지 확인
      if (result.some(r => r.employeeId === candidate.id)) continue;

      const [s, e] = slots[i].split('-');
      const { available } = checkAvailability(candidate, s, e, specialNotes);
      
      if (available) {
        result[i].employeeId = candidate.id;
        startIndex = (candidateIndex + 1) % rotationPool.length; // 다음 슬롯은 이 사람 다음부터 찾음
        found = true;
        break;
      }
    }
  }

  return result;
};

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

  // 두 기간이 겹치는지 확인 (조금이라도 겹치면 true)
  const overlap = (a_s, a_e, b_s, b_e) => Math.max(a_s, b_s) < Math.min(a_e, b_e);

  if (overlap(s1, e1, s2, e2)) return true;
  if (overlap(s1, e1, s2 + 24 * 60, e2 + 24 * 60)) return true;
  if (overlap(s1 + 24 * 60, e1 + 24 * 60, s2, e2)) return true;

  return false;
};

// 특정 직원의 시간대별 배치 가능 여부 계산
export const checkAvailability = (employee, slotStart, slotEnd, specialNotes, dutyName = '', currentSlot = '') => {
  if (!employee) return { available: false, reason: '직원 정보 없음' };
  
  // 고정 대기 직원 체크: '대기근무' row 이외의 다른 곳에 배치 시도 시 차단
  // 또는 '대기근무' 이더라도 본인의 고정 시간대가 아닌 경우 차단
  if (employee.isFixedNightStandby && employee.fixedNightStandbySlot) {
    const isStandbyDuty = dutyName === '대기근무';
    const [fixedStart, fixedEnd] = employee.fixedNightStandbySlot.split('-');
    
    // 고정 대기 시간과 현재 슬롯이 겹치는지 확인 (완전 포함되거나 겹치는지)
    const matchesFixedSlot = isTimeOverlapping(slotStart, slotEnd, fixedStart, fixedEnd);

    if (!isStandbyDuty || !matchesFixedSlot) {
      return { available: false, reason: `고정 대기(${employee.fixedNightStandbySlot})` };
    }
  }

  // 야간 근무 제외 대상 체크
  if (employee.isNightShiftExcluded) {
    const toMinutes = (time) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    
    const start = toMinutes(slotStart);
    let end = toMinutes(slotEnd);
    if (end <= start) end += 24 * 60; // 자정 넘김 처리

    // 야간 시간대 정의 (19:30 ~ 08:00) - 넉넉하게 19:00부터 08:30까지로 설정
    const nightStart = 19 * 60;
    const nightEnd = 8 * 60 + 30 + 24 * 60;

    const isOverlapWithNight = (s, e) => Math.max(s, nightStart) < Math.min(e, nightEnd) || 
                                       Math.max(s + 24 * 60, nightStart) < Math.min(e + 24 * 60, nightEnd);

    if (isOverlapWithNight(start, end)) {
      return { available: false, reason: '야간 제외' };
    }
  }

  const notes = specialNotes.filter(n => n.employeeId === employee.id);
  
  for (const note of notes) {
    // 병가, 휴가 등 '사고자' 개념의 유형은 해당 근무 전체에서 제외 (전부 배치 불가)
    if (['휴가', '병가', '기타'].includes(note.type) || note.isAllDay) {
      return { available: false, reason: note.type };
    }
    // 일반 특이사항 (육아시간, 지원근무 등)은 시간 겹침 여부 판단
    if (isTimeOverlapping(slotStart, slotEnd, note.startTime, note.endTime)) {
      return { available: false, reason: `${note.type}` };
    }
  }
  return { available: true };
};

// 야간 대기조 순환 로직 (3개조: 22-01, 01-04, 04-07)
export const rotateStandbyGroups = (prevRoster, employees, specialNotes) => {
  const standbyBlocks = [
    { label: "22:00-01:00", slots: ["22:00-01:00"] },
    { label: "01:00-04:00", slots: ["01:00-02:00", "02:00-04:00"] },
    { label: "04:00-07:00", slots: ["04:00-06:00", "06:00-07:00"] }
  ];

  // 순환 대상자 풀 (고정 대기 제외)
  const rotationPool = employees.filter(e => e.isStandbyRotationEligible && !e.isFixedNightStandby);
  
  // 이전 야간의 대기조 구성 파악
  const prevAssignments = prevRoster?.assignments || {};
  const prevStandbyOrder = [];
  
  standbyBlocks.forEach(block => {
    // 각 블록의 첫 번째 슬롯을 기준으로 이전 근무자 파악
    const ids = prevAssignments[`${block.slots[0]}_대기근무`] || [];
    ids.forEach(id => {
      if (!prevStandbyOrder.includes(id)) prevStandbyOrder.push(id);
    });
  });

  // 순번 계산을 위한 기준점 (이전 대기조의 마지막 사람 다음부터)
  const lastId = prevStandbyOrder[prevStandbyOrder.length - 1];
  let startIndex = rotationPool.findIndex(e => e.id === lastId);
  if (startIndex === -1) startIndex = 0;
  else startIndex = (startIndex + 1) % rotationPool.length;

  const finalAssignments = [];
  const warnings = [];
  const usedIds = new Set();

  // 블록당 인원수 배분 (전체 인원 / 3개조)
  const countPerGroup = Math.floor(rotationPool.length / 3);
  const remainder = rotationPool.length % 3;

  standbyBlocks.forEach((block, groupIdx) => {
    let targetCount = countPerGroup + (groupIdx < remainder ? 1 : 0);
    let assignedInGroup = 0;

    for (let i = 0; i < rotationPool.length && assignedInGroup < targetCount; i++) {
      const candidateIndex = (startIndex + i) % rotationPool.length;
      const candidate = rotationPool[candidateIndex];

      if (usedIds.has(candidate.id)) continue;

      // 해당 블록의 모든 슬롯에 대해 가용성 체크
      const isAvailable = block.slots.every(slot => {
        const [s, e] = slot.split('-');
        return checkAvailability(candidate, s, e, specialNotes, '대기근무', slot).available;
      });

      if (isAvailable) {
        block.slots.forEach(slot => {
          finalAssignments.push({ slot, employeeId: candidate.id });
        });
        usedIds.add(candidate.id);
        assignedInGroup++;
        // 다음 그룹을 위해 시작 인덱스 업데이트
        if (assignedInGroup === targetCount) {
          startIndex = (candidateIndex + 1) % rotationPool.length;
        }
      }
    }

    if (assignedInGroup < targetCount) {
      warnings.push(`${block.label} 대기조 인원이 부족합니다. (${assignedInGroup}/${targetCount})`);
    }
  });

  return { assignments: finalAssignments, warnings };
};

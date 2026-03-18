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
  
  // 고정 대기 직원 체크
  if (employee.isFixedNightStandby && employee.fixedNightStandbySlot) {
    const isStandbyDuty = dutyName === '대기근무';
    const [fixedStart, fixedEnd] = employee.fixedNightStandbySlot.split('-');
    
    // 현재 슬롯이 본인의 고정 대기 시간과 겹치는지 확인
    const isDuringFixedSlot = isTimeOverlapping(slotStart, slotEnd, fixedStart, fixedEnd);

    if (isDuringFixedSlot) {
      // 1. 고정 대기 시간대인 경우: '대기근무'만 가능
      if (!isStandbyDuty) {
        return { available: false, reason: `고정 대기 시간(${employee.fixedNightStandbySlot})` };
      }
    } else {
      // 2. 고정 대기 시간대가 아닌 경우: '대기근무'는 불가능 (고정 시간 외 대기 방지)
      if (isStandbyDuty) {
        return { available: false, reason: `고정 시간 외 대기 불가` };
      }
      // 3. 그 외 일반 근무(순찰 등)는 허용됨 (return 없이 통과)
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
    // 지원근무는 결격 사유가 아니라 오히려 근무를 하러 온 것이므로 제외 체크에서 건너뜀
    if (note.type === '지원근무') continue;

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
    { label: "22:00-01:00", slots: ["22:00-01:00"], key: "22:00-01:00_대기근무" },
    { label: "01:00-04:00", slots: ["01:00-02:00", "02:00-04:00"], key: "01:00-04:00_대기근무" }, // 대표키
    { label: "04:00-07:00", slots: ["04:00-06:00", "06:00-07:00"], key: "04:00-07:00_대기근무" }
  ];

  const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];
  const getRankWeight = (rank) => {
    const index = RANKS.indexOf(rank);
    return index === -1 ? 99 : index;
  };

  // 1. 순환 대상자 풀 (고정 대기 제외, 계급/성명순 고정 정렬)
  const rotationPool = employees
    .filter(e => e.isStandbyRotationEligible && !e.isFixedNightStandby)
    .sort((a, b) => {
      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) return weightA - weightB;
      return a.name.localeCompare(b.name);
    });

  if (rotationPool.length === 0) return { assignments: [], warnings: ["순환 대상 직원이 없습니다."] };

  // 2. 시작점 찾기: 이전 근무의 2조(01-04) 첫 번째 사람이 오늘의 1조(22-01) 시작점
  let startIndex = 0;
  if (prevRoster && prevRoster.assignments) {
    const prevAssignments = prevRoster.assignments;
    // 01:00-02:00 또는 01:00-04:00 키에서 이전 2조 명단 확인
    const prevSecondGroupIds = prevAssignments["01:00-02:00_대기근무"] || prevAssignments["01:00-04:00_대기근무"] || [];
    const lastStartId = prevSecondGroupIds[0];
    
    if (lastStartId) {
      const foundIdx = rotationPool.findIndex(e => e.id === lastStartId);
      if (foundIdx !== -1) startIndex = foundIdx;
    }
  }

  const finalAssignments = [];
  const warnings = [];
  const usedIds = new Set();

  // 조당 목표 인원 계산
  const countPerGroup = Math.floor(rotationPool.length / 3);
  const remainder = rotationPool.length % 3;

  let currentPoolIndex = startIndex;

  // 3. 각 블록(조)별 배치 실행
  standbyBlocks.forEach((block, groupIdx) => {
    const targetCount = countPerGroup + (groupIdx < remainder ? 1 : 0);
    let assignedInGroup = 0;
    let checkedCount = 0; // 무한 루프 방지

    while (assignedInGroup < targetCount && checkedCount < rotationPool.length) {
      const candidate = rotationPool[currentPoolIndex];
      
      if (!usedIds.has(candidate.id)) {
        // 모든 슬롯에 대해 가용성 체크
        const isAvailable = block.slots.every(slot => {
          const [s, e] = slot.split('-');
          // 대기근무 row 체크
          return checkAvailability(candidate, s, e, specialNotes, '대기근무', slot).available;
        });

        if (isAvailable) {
          block.slots.forEach(slot => {
            finalAssignments.push({ slot, employeeId: candidate.id });
          });
          usedIds.add(candidate.id);
          assignedInGroup++;
        }
      }
      
      currentPoolIndex = (currentPoolIndex + 1) % rotationPool.length;
      checkedCount++;
    }

    if (assignedInGroup < targetCount) {
      warnings.push(`${block.label} 인원 부족 (${assignedInGroup}/${targetCount})`);
    }
  });

  return { assignments: finalAssignments, warnings };
};

// 전체 근무 자동 생성 로직
export const autoAssignRoster = (currentRoster, prevRoster, employees, specialNotes, dutyTypes, timeSlots) => {
  const assignments = {};
  const focusAreas = {};
  const warnings = [];

  // 1. 대기 근무 자동 순환 (야간인 경우)
  if (currentRoster.shiftType === '야간') {
    const { assignments: standbyAsgns, warnings: standbyWarnings } = rotateStandbyGroups(prevRoster, employees, specialNotes);
    standbyAsgns.forEach(asgn => {
      const key = `${asgn.slot}_대기근무`;
      if (!assignments[key]) assignments[key] = [];
      assignments[key].push(asgn.employeeId);
    });
    warnings.push(...standbyWarnings);
  }

  // 2. 가용 인원 파악 (특이사항 제외)
  const isAvailable = (emp, slot) => {
    const [s, e] = slot.split('-');
    return checkAvailability(emp, s, e, specialNotes).available;
  };

  // 3. 기타 근무 자동 배치 (기본 프레임워크)
  // 상황근무, 순찰차 등 일반 근무에 대해 남은 인원을 순차적으로 배치하는 로직의 기초입니다.
  // (추후 상세 규칙에 따라 고도화 예정)
  const otherDuties = dutyTypes.filter(d => d.name !== '대기근무' && !d.name.includes('중점'));
  
  // 간단한 순차 배치 예시
  const teamMembers = employees
    .filter(e => e.team === currentRoster.metadata.teamName && !e.isAdminStaff)
    .sort((a, b) => a.name.localeCompare(b.name));

  // TODO: 여기에 상세 업무 분장 규칙을 추가할 수 있습니다.

  return { assignments, focusAreas, warnings };
};

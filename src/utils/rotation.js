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
export const rotateStandbyGroups = (prevRoster, employees, specialNotes, teamName) => {
  const standbyBlocks = [
    { label: "22:00-01:00", slots: ["22:00-01:00"] },
    { label: "01:00-04:00", slots: ["01:00-02:00", "02:00-04:00"] },
    { label: "04:00-07:00", slots: ["04:00-06:00", "06:00-07:00"] }
  ];

  const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];
  const getRankWeight = (rank) => {
    const index = RANKS.indexOf(rank);
    return index === -1 ? 99 : index;
  };

  const finalAssignments = [];
  const usedIds = new Set();
  const warnings = [];

  // 1. 고정 대기 인원 우선 배치 (기존 유지)
  const teamEmps = employees.filter(e => e.team === teamName);
  teamEmps.forEach(emp => {
    if (emp.isFixedNightStandby && emp.fixedNightStandbySlot) {
      const [fs, fe] = emp.fixedNightStandbySlot.split('-');
      const avail = checkAvailability(emp, fs, fe, specialNotes, '대기근무', emp.fixedNightStandbySlot);
      if (avail.available) {
        standbyBlocks.forEach(block => {
          const [bs, be] = block.label.split('-');
          if (isTimeOverlapping(fs, fe, bs, be)) {
            block.slots.forEach(s => {
              finalAssignments.push({ slot: s, employeeId: emp.id });
            });
            usedIds.add(emp.id);
          }
        });
      }
    }
  });

  // 2. 순환 대상자 풀 (계급/성명순 고정 정렬)
  const rotationPool = teamEmps
    .filter(e => e.isStandbyRotationEligible && !e.isFixedNightStandby)
    .sort((a, b) => {
      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) return weightA - weightB;
      return a.name.localeCompare(b.name);
    });

  if (rotationPool.length === 0 && usedIds.size === 0) {
    return { assignments: [], warnings: [`${teamName}에 순환 대상 직원이 없습니다.`] };
  }

  // 3. 시작점(Anchor) 찾기: 이전 3조(04-07) -> 오늘 1조(22-01)
  let startIndex = 0;
  if (prevRoster && prevRoster.assignments) {
    const prev = prevRoster.assignments;
    // 이전 3조에 배치되었던 모든 ID 추출
    const prevG3Ids = Object.keys(prev)
      .filter(key => key.includes("04:00") || key.includes("06:00"))
      .flatMap(key => prev[key] || []);
    
    // 이전 3조였던 사람 중 현재 풀에 있는 첫 번째 사람 찾기
    const anchorId = rotationPool.find(e => prevG3Ids.includes(e.id))?.id;
    if (anchorId) {
      startIndex = rotationPool.findIndex(e => e.id === anchorId);
    } else {
      // 3조 인원을 못 찾으면 2조의 마지막 사람 다음 순번으로 흐름 유지
      const prevG2Ids = Object.keys(prev)
        .filter(key => key.includes("01:00") || key.includes("02:00"))
        .flatMap(key => prev[key] || []);
      const lastG2Id = prevG2Ids[prevG2Ids.length - 1];
      const lastG2Idx = rotationPool.findIndex(e => e.id === lastG2Id);
      if (lastG2Idx !== -1) startIndex = (lastG2Idx + 1) % rotationPool.length;
    }
  }

  // 4. 순차적 배치 (누락 방지 로직)
  const totalAvailable = rotationPool.length;
  const countPerGroup = Math.floor(totalAvailable / 3);
  const remainder = totalAvailable % 3;

  let currentIdx = startIndex;

  standbyBlocks.forEach((block, groupIdx) => {
    const targetCount = countPerGroup + (groupIdx < remainder ? 1 : 0);
    const assignedFixedCount = new Set(finalAssignments.filter(a => block.slots.includes(a.slot)).map(a => a.employeeId)).size;
    let assignedInGroup = assignedFixedCount;

    // 이 조에 필요한 인원이 채워질 때까지 풀을 최대 한 바퀴 돕니다.
    for (let i = 0; i < rotationPool.length && assignedInGroup < targetCount; i++) {
      const candidate = rotationPool[currentIdx];
      
      if (!usedIds.has(candidate.id)) {
        const isAvailable = block.slots.every(s => {
          const [start, end] = s.split('-');
          return checkAvailability(candidate, start, end, specialNotes, '대기근무', s).available;
        });

        if (isAvailable) {
          block.slots.forEach(s => finalAssignments.push({ slot: s, employeeId: candidate.id }));
          usedIds.add(candidate.id);
          assignedInGroup++;
        }
      }
      currentIdx = (currentIdx + 1) % rotationPool.length;
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
  const teamName = currentRoster.metadata.teamName;

  // 1. 대기 근무 자동 순환 (야간인 경우)
  if (currentRoster.shiftType === '야간') {
    const { assignments: standbyAsgns, warnings: standbyWarnings } = rotateStandbyGroups(prevRoster, employees, specialNotes, teamName);
    standbyAsgns.forEach(asgn => {
      const key = `${asgn.slot}_대기근무`;
      if (!assignments[key]) assignments[key] = [];
      assignments[key].push(asgn.employeeId);
    });
    warnings.push(...standbyWarnings);
  }

  // 2. 가용 인원 (대기 근무에 배치되지 않은 팀원들)
  const usedInStandby = new Set(Object.values(assignments).flat());
  const availableTeamEmps = employees
    .filter(e => e.team === teamName && !e.isAdminStaff && !usedInStandby.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // 3. 일반 근무(순찰, 상황 등) 자동 배치 (기초 로직)
  // 현재는 남은 인원을 위에서부터 순차적으로 채워넣습니다.
  const dutyList = dutyTypes.filter(d => d.name !== '대기근무' && !d.name.includes('중점'));
  let empIdx = 0;

  timeSlots.forEach(slot => {
    dutyList.forEach(duty => {
      if (empIdx < availableTeamEmps.length) {
        const candidate = availableTeamEmps[empIdx];
        const [s, e] = slot.split('-');
        if (checkAvailability(candidate, s, e, specialNotes, duty.name, slot).available) {
          const key = `${slot}_${duty.name}`;
          if (!assignments[key]) assignments[key] = [];
          assignments[key].push(candidate.id);
          // 실제로는 한 명의 직원이 여러 슬롯을 할 수 있으므로 idx 증가 로직은 규칙에 따라 조절 필요
          // 여기서는 단순 데모용으로 순차 배치
        }
      }
      empIdx = (empIdx + 1) % (availableTeamEmps.length || 1);
    });
  });

  return { assignments, focusAreas, warnings };
};

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
export const checkAvailability = (employee, slotStart, slotEnd, specialNotes, dutyName = '', currentSlot = '') => {
  if (!employee) return { available: false, reason: '정보없음' };
  
  if (employee.isFixedNightStandby && employee.fixedNightStandbySlot) {
    const isStandbyDuty = dutyName === '대기근무';
    const [fs, fe] = employee.fixedNightStandbySlot.split('-');
    const isDuringFixed = isTimeOverlapping(slotStart, slotEnd, fs, fe);
    if (isDuringFixed) {
      if (!isStandbyDuty) return { available: false, reason: `고정대기` };
    } else if (isStandbyDuty) {
      return { available: false, reason: `고정외대기불가` };
    }
  }

  if (employee.isNightShiftExcluded) {
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = toMin(slotStart);
    let e = toMin(slotEnd);
    if (e <= s) e += 24 * 60;
    const nS = 19 * 60;
    const nE = 8 * 60 + 30 + 24 * 60;
    const ov = (a, b, c, d) => Math.max(a, c) < Math.min(b, d);
    if (ov(s, e, nS, nE) || ov(s + 24 * 60, e + 24 * 60, nS, nE)) return { available: false, reason: '야간제외' };
  }

  const notes = specialNotes.filter(n => n.employeeId === employee.id);
  for (const n of notes) {
    if (n.type === '지원근무') continue;
    if (['휴가', '병가', '기타'].includes(n.type) || n.isAllDay) return { available: false, reason: n.type };
    if (isTimeOverlapping(slotStart, slotEnd, n.startTime, n.endTime)) return { available: false, reason: n.type };
  }
  return { available: true };
};

// 야간 대기조 순환 로직
export const rotateStandbyGroups = (prevRoster, employees, specialNotes, teamName) => {
  const standbyBlocks = [
    { label: "22:00-01:00", slots: ["22:00-01:00"] },
    { label: "01:00-04:00", slots: ["01:00-02:00", "02:00-04:00"] },
    { label: "04:00-07:00", slots: ["04:00-06:00", "06:00-07:00"] }
  ];

  const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];
  const getRankWeight = (r) => { const i = RANKS.indexOf(r); return i === -1 ? 99 : i; };

  const finalAssignments = [];
  const usedIds = new Set();
  const warnings = [];

  const teamEmps = employees.filter(e => e.team === teamName);

  // 1. 고정 대기자 우선 배치
  teamEmps.forEach(emp => {
    if (emp.isFixedNightStandby && emp.fixedNightStandbySlot) {
      const [fs, fe] = emp.fixedNightStandbySlot.split('-');
      if (checkAvailability(emp, fs, fe, specialNotes, '대기근무', emp.fixedNightStandbySlot).available) {
        standbyBlocks.forEach(b => {
          const [bs, be] = b.label.split('-');
          if (isTimeOverlapping(fs, fe, bs, be)) {
            b.slots.forEach(s => finalAssignments.push({ slot: s, employeeId: emp.id }));
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
      const wA = getRankWeight(a.rank);
      const wB = getRankWeight(b.rank);
      if (wA !== wB) return wA - wB;
      return a.name.localeCompare(b.name);
    });

  if (rotationPool.length === 0) return { assignments: finalAssignments, warnings: [] };

  // 3. 시작점 찾기 (이전 3조 시작자 -> 오늘 1조 시작자)
  let startIndex = 0;
  if (prevRoster && prevRoster.assignments) {
    const prev = prevRoster.assignments;
    // 이전 3조(04-07)의 대표 슬롯에서 첫 번째 사람 확인
    const prevG3Ids = prev["04:00-06:00_대기근무"] || [];
    const anchorId = prevG3Ids[0]; 
    const foundIdx = rotationPool.findIndex(e => e.id === anchorId);
    
    if (foundIdx !== -1) {
      startIndex = foundIdx; // 이전 3조였던 사람이 오늘의 1조 시작점이 됨
    } else {
      // 만약 이전 3조 인원이 사라졌다면, 이전 2조의 마지막 사람 다음 순번으로 흐름 유지
      const prevG2Ids = prev["01:00-02:00_대기근무"] || [];
      const lastG2Id = prevG2Ids[prevG2Ids.length - 1];
      const lastG2Idx = rotationPool.findIndex(e => e.id === lastG2Id);
      if (lastG2Idx !== -1) startIndex = (lastG2Idx + 1) % rotationPool.length;
    }
  }

  // 4. 순차 배치 (Wheel 로직)
  const totalAvailable = rotationPool.length;
  const countPerGroup = Math.floor(totalAvailable / 3);
  const remainder = totalAvailable % 3;
  let currentWheelIdx = startIndex;

  standbyBlocks.forEach((block, groupIdx) => {
    const alreadyFixedIds = new Set(finalAssignments.filter(a => block.slots.includes(a.slot)).map(a => a.employeeId));
    const groupTarget = countPerGroup + (groupIdx < remainder ? 1 : 0);
    
    let assignedInGroup = alreadyFixedIds.size;
    let checkedCount = 0;

    while (assignedInGroup < groupTarget && checkedCount < totalAvailable) {
      const candidate = rotationPool[currentWheelIdx];
      if (!usedIds.has(candidate.id)) {
        const isAvail = block.slots.every(s => {
          const [st, en] = s.split('-');
          return checkAvailability(candidate, st, en, specialNotes, '대기근무', s).available;
        });
        if (isAvail) {
          block.slots.forEach(s => finalAssignments.push({ slot: s, employeeId: candidate.id }));
          usedIds.add(candidate.id);
          assignedInGroup++;
        }
      }
      currentWheelIdx = (currentWheelIdx + 1) % totalAvailable;
      checkedCount++;
    }
  });

  return { assignments: finalAssignments, warnings };
};

// 전체 근무 자동 생성 로직
export const autoAssignRoster = (currentRoster, prevRoster, employees, specialNotes, dutyTypes, timeSlots) => {
  const assignments = {};
  const teamName = currentRoster.metadata.teamName;

  // 1. 대기 근무만 순환 배치 (다른 근무는 사용자 요청 전까지 자동 배치 안 함)
  if (currentRoster.shiftType === '야간') {
    const { assignments: standby } = rotateStandbyGroups(prevRoster, employees, specialNotes, teamName);
    standby.forEach(as => {
      const k = `${as.slot}_대기근무`;
      if (!assignments[k]) assignments[k] = [];
      assignments[k].push(as.employeeId);
    });
  }

  // 순찰, 상황근무 등은 빈 칸으로 유지하여 도배 현상 제거
  return { assignments, focusAreas: {}, warnings: [] };
};

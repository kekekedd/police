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
    { label: "22:00-01:00", slots: ["22:00-01:00"] }, // A조
    { label: "01:00-04:00", slots: ["01:00-02:00", "02:00-04:00"] }, // B조
    { label: "04:00-07:00", slots: ["04:00-06:00", "06:00-07:00"] }  // C조
  ];

  const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];
  const getRankWeight = (r) => { const i = RANKS.indexOf(r); return i === -1 ? 99 : i; };

  const finalAssignments = [];
  const usedIds = new Set();
  const warnings = [];

  const teamEmps = employees.filter(e => e.team === teamName);

  // 1. 고정 대기자 우선 배치 (순환 풀에서 제외)
  teamEmps.forEach(emp => {
    if (emp.isFixedNightStandby && emp.fixedNightStandbySlot) {
      const [fs, fe] = emp.fixedNightStandbySlot.split('-');
      if (checkAvailability(emp, fs, fe, specialNotes, '대기근무', emp.fixedNightStandbySlot).available) {
        standbyBlocks.forEach(b => {
          const [bs, be] = b.label.split('-');
          if (isTimeOverlapping(fs, fe, bs, be)) {
            b.slots.forEach(s => {
              finalAssignments.push({ slot: s, employeeId: emp.id });
              usedIds.add(emp.id);
            });
          }
        });
      }
    }
  });

  // 2. 순환 대상자 풀 구성 (고정대기 제외, 계급/성명순 고정 줄 세우기)
  const rotationPool = teamEmps
    .filter(e => e.isStandbyRotationEligible && !e.isFixedNightStandby)
    .sort((a, b) => {
      const wA = getRankWeight(a.rank);
      const wB = getRankWeight(b.rank);
      if (wA !== wB) return wA - wB;
      return a.name.localeCompare(b.name);
    });

  if (rotationPool.length === 0) return { assignments: finalAssignments, warnings: [] };

  // 3. 강력한 시작점(Anchor) 찾기 로직
  let startIndex = 0;
  if (prevRoster && prevRoster.assignments) {
    const prev = prevRoster.assignments;
    
    // (1) 이전 C조(04-07) 멤버들 전체 리스트업
    const prevGroupCIds = [
      ...(prev["04:00-06:00_대기근무"] || []),
      ...(prev["06:00-07:00_대기근무"] || [])
    ];

    // (2) 이전 C조 멤버 중 오늘 순환 풀에 있는 첫 번째 사람을 찾음
    let foundAnchor = false;
    for (const id of prevGroupCIds) {
      const idxInPool = rotationPool.findIndex(e => e.id === id);
      if (idxInPool !== -1) {
        startIndex = idxInPool; // 이 사람이 오늘 A조의 시작점이 됨
        foundAnchor = true;
        break;
      }
    }

    // (3) 만약 이전 C조 멤버가 아무도 없다면 (전원 휴가 등), 이전 B조의 마지막 사람 다음 순번을 찾음
    if (!foundAnchor) {
      const prevGroupBIds = [
        ...(prev["01:00-02:00_대기근무"] || []),
        ...(prev["02:00-04:00_대기근무"] || [])
      ];
      for (let i = prevGroupBIds.length - 1; i >= 0; i--) {
        const idxInPool = rotationPool.findIndex(e => e.id === prevGroupBIds[i]);
        if (idxInPool !== -1) {
          startIndex = (idxInPool + 1) % rotationPool.length;
          foundAnchor = true;
          break;
        }
      }
    }
  }

  // 4. 순환 휠(Wheel)을 돌리며 빈틈없이 배치
  const totalPoolSize = rotationPool.length;
  const targetPerGroup = Math.floor(totalPoolSize / 3);
  const remainder = totalPoolSize % 3;
  let currentWheelIdx = startIndex;

  standbyBlocks.forEach((block, groupIdx) => {
    // 이미 고정 대기자로 채워진 인원 수 확인
    const assignedFixedCount = new Set(finalAssignments.filter(a => block.slots.includes(a.slot)).map(a => a.employeeId)).size;
    const groupTarget = targetPerGroup + (groupIdx < remainder ? 1 : 0);
    
    let assignedCount = assignedFixedCount;
    let checkedInPool = 0;

    // 조별 목표 인원이 찰 때까지 휠을 돌림
    while (assignedCount < groupTarget && checkedInPool < totalPoolSize) {
      const candidate = rotationPool[currentWheelIdx];
      
      if (!usedIds.has(candidate.id)) {
        // 이 직원이 이 조의 모든 시간대에 근무 가능한지 체크
        const isAvail = block.slots.every(s => {
          const [st, en] = s.split('-');
          return checkAvailability(candidate, st, en, specialNotes, '대기근무', s).available;
        });

        if (isAvail) {
          block.slots.forEach(s => finalAssignments.push({ slot: s, employeeId: candidate.id }));
          usedIds.add(candidate.id);
          assignedCount++;
        }
      }
      
      // 다음 사람으로 휠 이동
      currentWheelIdx = (currentWheelIdx + 1) % totalPoolSize;
      checkedInPool++;
    }
  });

  return { assignments: finalAssignments, warnings };
};

// 전체 근무 자동 생성 로직
export const autoAssignRoster = (currentRoster, prevRoster, employees, specialNotes, dutyTypes, timeSlots) => {
  const assignments = {};
  const teamName = currentRoster.metadata.teamName;

  // 1. 대기 근무만 순환 배치 (3조 -> 1조 흐름 고정)
  if (currentRoster.shiftType === '야간') {
    const { assignments: standby } = rotateStandbyGroups(prevRoster, employees, specialNotes, teamName);
    standby.forEach(as => {
      const k = `${as.slot}_대기근무`;
      if (!assignments[k]) assignments[k] = [];
      if (!assignments[k].includes(as.employeeId)) assignments[k].push(as.employeeId);
    });
  }

  // 순찰, 상황근무 등은 빈 칸으로 유지
  return { assignments, focusAreas: {}, warnings: [] };
};

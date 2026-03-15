import { useState, useEffect } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X, Settings, Edit2, GripVertical } from 'lucide-react';
import { isTimeOverlapping, checkAvailability, rotateStandbyGroups } from './utils/rotation';
import './App.css';

const INITIAL_EMPLOYEES = [
  { id: '1', name: '황광철', rank: '경감', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '2', name: '김성일', rank: '경감', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '3', name: '송병훈', rank: '경감', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '4', name: '이현식', rank: '경위', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '5', name: '김영혁', rank: '경위', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '6', name: '김민태', rank: '경위', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '7', name: '이진섭', rank: '경사', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '8', name: '박상민', rank: '경사', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '9', name: '양승헌', rank: '경사', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '10', name: '김대원', rank: '경장', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '11', name: '오나리', rank: '순경', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '12', name: '모정은', rank: '경위', team: '2팀', isStandbyRotationEligible: false, isFixedNightStandby: false },
  { id: '13', name: '안정민', rank: '경장', team: '2팀', isStandbyRotationEligible: false, isFixedNightStandby: false },
  { id: '14', name: '손병목', rank: '경감', team: '2팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
];

const DAY_TIME_SLOTS = [
  "07:30-08:00", "08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00",
  "13:00-14:00", "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-20:00"
];

const NIGHT_TIME_SLOTS = [
  "19:30-20:00", "20:00-22:00", "22:00-01:00", "01:00-02:00",
  "02:00-04:00", "04:00-06:00", "06:00-07:00", "07:00-08:00"
];

const DEFAULT_DUTY_TYPES = [
  { name: "상황근무", shift: "공통" },
  { name: "서부 순21호", shift: "공통" },
  { name: "순21호 중점", shift: "공통" },
  { name: "서부 순23호", shift: "공통" },
  { name: "순23호 중점", shift: "공통" },
  { name: "서부 순24호", shift: "공통" },
  { name: "순24호 중점", shift: "공통" },
  { name: "서부 순25호", shift: "공통" },
  { name: "순25호 중점", shift: "공통" },
  { name: "도보", shift: "공통" },
  { name: "대기근무", shift: "공통" },
  { name: "관리반", shift: "주간" }
];

const NOTE_TYPES = ["육아시간", "지원근무", "휴가", "병가", "교육", "외근", "기타"];
const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];
const WEATHER_TYPES = ["맑음", "흐림", "비", "눈", "안개", "황사"];

const formatDateWithDay = (dateStr) => {
  if (!dateStr) return "";
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const date = new Date(dateStr);
  return `${dateStr} ${days[date.getDay()]}`;
};

const getRankWeight = (rank) => {
  const index = RANKS.indexOf(rank);
  return index === -1 ? 99 : index;
};

function StaffSelectionModal({ isOpen, onClose, slot, duty, employees, specialNotes, selectedIds, currentAssignments, dutyTypes, onSelect }) {
  if (!isOpen) return null;

  const sortedEmployees = [...employees].sort((a, b) => {
    const idxA = employees.indexOf(a);
    const idxB = employees.indexOf(b);
    return idxA - idxB;
  });

  return (
    <div className="modal-overlay no-print">
      <div className="modal-content selection-modal">
        <div className="modal-header">
          <h3>직원 선택 ({duty} / {slot})</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="staff-grid scrollable">
          {sortedEmployees.map(emp => {
            const [s, e] = slot.split('-');
            const availability = checkAvailability(emp, s, e, specialNotes);
            const isSelected = selectedIds.includes(emp.id);
            
            // 동일 시간대 다른 근무 배치 확인
            let otherDutyName = null;
            if (currentAssignments) {
              const otherDuty = dutyTypes.find(d => {
                if (d.name === duty) return false;
                const key = `${slot}_${d.name}`;
                return (currentAssignments[key] || []).includes(emp.id);
              });
              if (otherDuty) otherDutyName = otherDuty.name;
            }

            const isBlocked = !availability.available || (otherDutyName && !isSelected);
            const blockReason = !availability.available ? availability.reason : (otherDutyName ? `${otherDutyName} 배치됨` : '');
            
            const note = specialNotes.find(n => n.employeeId === emp.id && (n.isAllDay || isTimeOverlapping(s, e, n.startTime, n.endTime)));
            
            return (
              <div 
                key={emp.id} 
                className={`staff-card-v2 ${isSelected ? 'selected' : ''} ${isBlocked && !isSelected ? 'disabled' : ''}`}
                onClick={() => (!isBlocked || isSelected) && onSelect(emp.id)}
              >
                <div className="staff-rank">{emp.rank}</div>
                <div className="staff-name">{emp.name}</div>
                {/* 특이사항 표시 (휴가, 육아시간 등) */}
                {note && (
                  <div className={`staff-note-label ${note.type}`}>
                    {note.type}
                  </div>
                )}
                {/* 중복 근무 정보 표시 (다른 근무 배치 시) */}
                {otherDutyName && !note && (
                  <div className="staff-note-label warning">
                    {otherDutyName}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeAddModal({ isOpen, settings, onSave, onClose }) {
  const [newEmp, setNewEmp] = useState({ 
    rank: '경위', 
    name: '', 
    team: settings.teams?.[0] || '1팀',
    isStandbyRotationEligible: true,
    isFixedNightStandby: false,
    isNightShiftExcluded: false
  });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newEmp.name) return alert('성명을 입력하세요.');
    const finalData = { ...newEmp, id: Date.now().toString() };
    if (newEmp.isFixedNightStandby && startTime && endTime) {
      finalData.fixedNightStandbySlot = `${startTime}-${endTime}`;
    }
    onSave(finalData);
    // Reset state for next time
    setNewEmp({ 
      rank: '경위', 
      name: '', 
      team: settings.teams?.[0] || '1팀',
      isStandbyRotationEligible: true,
      isFixedNightStandby: false,
      isNightShiftExcluded: false
    });
    setStartTime("");
    setEndTime("");
  };

  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header">
          <h3>신규 직원 등록</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="modal-body edit-form">
          <div className="input-group">
            <label>계급</label>
            <select value={newEmp.rank} onChange={e => setNewEmp({ ...newEmp, rank: e.target.value })}>
              {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>성명</label>
            <input type="text" placeholder="성명 입력" value={newEmp.name} onChange={e => setNewEmp({ ...newEmp, name: e.target.value })} />
          </div>
          <div className="input-group">
            <label>팀</label>
            <select value={newEmp.team} onChange={e => setNewEmp({ ...newEmp, team: e.target.value })}>
              {settings.teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="checkbox-list">
            <label className="checkbox-item">
              <input type="checkbox" checked={newEmp.isStandbyRotationEligible} onChange={e => setNewEmp({ ...newEmp, isStandbyRotationEligible: e.target.checked })} />
              순환대상 여부
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={newEmp.isFixedNightStandby} onChange={e => setNewEmp({ ...newEmp, isFixedNightStandby: e.target.checked })} />
              고정 대기 여부
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={newEmp.isNightShiftExcluded} onChange={e => setNewEmp({ ...newEmp, isNightShiftExcluded: e.target.checked })} />
              야간 근무 제외
            </label>
          </div>

          <div className="input-group">
            <label>고정 대기 시간대 설정</label>
            <div className="time-input-row">
              <input 
                type="time" 
                value={startTime} 
                onChange={e => setStartTime(e.target.value)}
                disabled={!newEmp.isFixedNightStandby}
                className={!newEmp.isFixedNightStandby ? 'disabled-input' : ''}
              />
              <span>~</span>
              <input 
                type="time" 
                value={endTime} 
                onChange={e => setEndTime(e.target.value)}
                disabled={!newEmp.isFixedNightStandby}
                className={!newEmp.isFixedNightStandby ? 'disabled-input' : ''}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={handleAdd}><Plus size={16} /> 등록</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeEditModal({ isOpen, employee, settings, onSave, onDelete, onClose }) {
  const [edited, setEdited] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (employee) {
      setEdited({ ...employee });
      if (employee.fixedNightStandbySlot) {
        const [s, e] = employee.fixedNightStandbySlot.split('-');
        setStartTime(s || "");
        setEndTime(e || "");
      } else {
        setStartTime("");
        setEndTime("");
      }
    }
  }, [employee]);

  if (!isOpen || !edited) return null;

  const handleSave = () => {
    const finalData = { ...edited };
    if (edited.isFixedNightStandby && startTime && endTime) {
      finalData.fixedNightStandbySlot = `${startTime}-${endTime}`;
    } else if (!edited.isFixedNightStandby) {
      finalData.fixedNightStandbySlot = "";
    }
    onSave(finalData);
  };

  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header">
          <h3>직원 정보 수정</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="modal-body edit-form">
          <div className="input-group">
            <label>계급</label>
            <select value={edited.rank} onChange={e => setEdited({ ...edited, rank: e.target.value })}>
              {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>성명</label>
            <input type="text" value={edited.name} onChange={e => setEdited({ ...edited, name: e.target.value })} />
          </div>
          <div className="input-group">
            <label>팀</label>
            <select value={edited.team} onChange={e => setEdited({ ...edited, team: e.target.value })}>
              {settings.teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="checkbox-list">
            <label className="checkbox-item">
              <input type="checkbox" checked={edited.isStandbyRotationEligible} onChange={e => setEdited({ ...edited, isStandbyRotationEligible: e.target.checked })} />
              순환대상 여부
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={edited.isFixedNightStandby} onChange={e => setEdited({ ...edited, isFixedNightStandby: e.target.checked })} />
              고정 대기 여부
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={edited.isNightShiftExcluded} onChange={e => setEdited({ ...edited, isNightShiftExcluded: e.target.checked })} />
              야간 근무 제외
            </label>
            </div>

          <div className="input-group">
            <label>고정 대기 시간대 설정</label>
            <div className="time-input-row">
              <input 
                type="time" 
                value={startTime} 
                onChange={e => setStartTime(e.target.value)}
                disabled={!edited.isFixedNightStandby}
                className={!edited.isFixedNightStandby ? 'disabled-input' : ''}
              />
              <span>~</span>
              <input 
                type="time" 
                value={endTime} 
                onChange={e => setEndTime(e.target.value)}
                disabled={!edited.isFixedNightStandby}
                className={!edited.isFixedNightStandby ? 'disabled-input' : ''}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer split">
          <button className="btn-danger" onClick={() => onDelete(edited.id)}><Trash size={16} /> 삭제</button>
          <div className="action-btns">
            <button className="btn-outline" onClick={onClose}>취소</button>
            <button className="btn-primary" onClick={handleSave}><Save size={16} /> 저장</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FocusPlaceSelectionModal({ isOpen, onClose, slot, duty, focusPlaces, selectedValue, onSelect }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay no-print">
      <div className="modal-content selection-modal">
        <div className="modal-header">
          <h3>중점 구역 선택 ({slot})</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="staff-grid scrollable">
          <div 
            className={`staff-card-v2 ${!selectedValue ? 'selected' : ''}`}
            onClick={() => { onSelect(''); onClose(); }}
          >
            <div className="staff-name">선택 안함</div>
          </div>
          {focusPlaces.map(place => (
            <div 
              key={place} 
              className={`staff-card-v2 ${selectedValue === place ? 'selected' : ''}`}
              onClick={() => { onSelect(place); onClose(); }}
            >
              <div className="staff-name">{place}</div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [employees, setEmployees] = useState(() => {
    const saved = localStorage.getItem('employees');
    return saved ? JSON.parse(saved) : INITIAL_EMPLOYEES;
  });

  const [specialNotes, setSpecialNotes] = useState(() => {
    const saved = localStorage.getItem('specialNotes');
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('appSettings');
    const defaults = {
      stationName: '신사지구대',
      chiefName: '이이식',
      dutyTypes: DEFAULT_DUTY_TYPES,
      teams: ['1팀', '2팀', '3팀', '4팀'],
      focusPlaces: ['신사역', '논현역', '학동역', '압구정역', '가로수길', '도산공원', '신사상가', '잠원한강공원', '을지병원사거리']
    };
    if (!saved) return defaults;
    const parsed = JSON.parse(saved);
    
    // Migrating dutyTypes from strings to objects if needed
    if (parsed.dutyTypes && typeof parsed.dutyTypes[0] === 'string') {
      parsed.dutyTypes = parsed.dutyTypes.map(name => ({
        name,
        shift: name === "관리반" ? "주간" : "공통"
      }));
    }
    
    return { ...defaults, ...parsed };
  });

  const [currentRoster, setCurrentRoster] = useState({
    date: new Date().toISOString().split('T')[0],
    shiftType: '야간',
    weather: '맑음',
    metadata: { 
      chief: settings.chiefName, 
      teamLeader: '황광철', 
      teamName: '2팀',
      totalCount: 58,
      teamCounts: { '1팀': 11, '2팀': 11, '3팀': 13, '4팀': 13 },
      adminCount: 2,
      longTermAbsent: 7
    },
    assignments: {},
    focusAreas: {},
    volunteerIds: []
  });

  const [activeTab, setActiveTab] = useState('roster');
  const [employeeTabTeam, setEmployeeTabTeam] = useState(() => {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.teams && parsed.teams.length > 0) return parsed.teams[0];
    }
    return '1팀';
  });
  const [isStaffOrderEditMode, setIsStaffOrderEditMode] = useState(false);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [newNote, setNewNote] = useState({ employeeId: '', type: '육아시간', startTime: '07:30', endTime: '09:30', isAllDay: false });
  const [newDutyType, setNewDutyType] = useState('');
  const [newDutyShift, setNewDutyShift] = useState('공통');
  const [newTeamName, setNewTeamName] = useState('');
  const [newFocusPlace, setNewFocusPlace] = useState('');
  const [editingDutyIdx, setEditingDutyIdx] = useState(null);
  const [editingDutyValue, setEditingDutyValue] = useState('');
  const [editingDutyShift, setEditingDutyShift] = useState('공통');
  const [isEditingStation, setIsEditingStation] = useState(false);
  const [tempStationSettings, setTempStationSettings] = useState({ stationName: settings.stationName, chiefName: settings.chiefName });
  const [editingTeamIdx, setEditingTeamIdx] = useState(null);
  const [editingTeamValue, setEditingTeamValue] = useState('');
  const [editingFocusIdx, setEditingFocusIdx] = useState(null);
  const [editingFocusValue, setEditingFocusValue] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [focusModalState, setFocusModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);

  useEffect(() => {
    localStorage.setItem('employees', JSON.stringify(employees));
    localStorage.setItem('specialNotes', JSON.stringify(specialNotes));
    localStorage.setItem('appSettings', JSON.stringify(settings));
  }, [employees, specialNotes, settings]);

  // 날짜/교대 변경 시 저장된 데이터 불러오기
  useEffect(() => {
    const rosters = JSON.parse(localStorage.getItem('rosters') || '[]');
    const saved = rosters.find(r => r.date === currentRoster.date && r.shiftType === currentRoster.shiftType);
    
    if (saved) {
      setCurrentRoster({
        ...saved,
        volunteerIds: saved.volunteerIds || []
      });
    } else {
      const initialAssignments = {};
      // 야간 근무인 경우 고정 대기자 자동 배치
      if (currentRoster.shiftType === '야간') {
        employees.forEach(emp => {
          if (emp.team === currentRoster.metadata.teamName && emp.isFixedNightStandby && emp.fixedNightStandbySlot) {
            const [s, e] = emp.fixedNightStandbySlot.split('-');
            if (checkAvailability(emp, s, e, specialNotes).available) {
              const key = `${emp.fixedNightStandbySlot}_대기근무`;
              initialAssignments[key] = [...(initialAssignments[key] || []), emp.id];
            }
          }
        });
      }

      setCurrentRoster(prev => ({
        ...prev,
        weather: '맑음',
        assignments: initialAssignments,
        focusAreas: {},
        volunteerIds: []
      }));
    }
  }, [currentRoster.date, currentRoster.shiftType]);

  const currentTimeSlots = currentRoster.shiftType === '주간' ? DAY_TIME_SLOTS : NIGHT_TIME_SLOTS;

  const handleToggleStaff = (id) => {
    const key = `${modalState.slot}_${modalState.duty}`;
    const employee = employees.find(e => e.id === id);
    
    setCurrentRoster(prev => {
      const currentIdsInThisCell = prev.assignments[key] || [];
      const isAlreadySelectedInThisCell = currentIdsInThisCell.includes(id);

      // 선택 해제 시
      if (isAlreadySelectedInThisCell) {
        return { ...prev, assignments: { ...prev.assignments, [key]: currentIdsInThisCell.filter(i => i !== id) } };
      }

      // 순찰차 인원 제한 체크 (순21호, 순23호 등 '순2' 포함 시 2명 제한)
      if (modalState.duty.includes('순2') && currentIdsInThisCell.length >= 2) {
        alert('순찰차 근무는 최대 2명까지 배치 가능합니다.');
        return prev;
      }

      // 새로 선택 시 중복 근무 체크
      const duplicateDuty = settings.dutyTypes.find(d => {
        if (d.name === modalState.duty) return false;
        const otherKey = `${modalState.slot}_${d.name}`;
        return (prev.assignments[otherKey] || []).includes(id);
      });

      if (duplicateDuty) {
        alert(`${employee.rank} ${employee.name}님은 현재 동일한 시간대에 [${duplicateDuty.name}] 근무에 이미 배치되어 있습니다.`);
        return prev;
      }

      const newIds = [...currentIdsInThisCell, id];
      
      // 순찰차 2명 채워지면 팝업 닫기 처리
      if (modalState.duty.includes('순2') && newIds.length === 2) {
        setTimeout(() => setModalState(prev => ({ ...prev, isOpen: false })), 200);
      }

      return { ...prev, assignments: { ...prev.assignments, [key]: newIds } };
    });
  };

  const handleFocusChange = (slot, duty, value) => {
    if (!value) {
      const key = `${slot}_${duty}`;
      setCurrentRoster(prev => ({ ...prev, focusAreas: { ...prev.focusAreas, [key]: '' } }));
      return;
    }

    // 동일 시간대 다른 중점 구역 중복 체크
    const isDuplicate = settings.dutyTypes.some(d => {
      if (d.name === duty) return false;
      const otherKey = `${slot}_${d.name}`;
      return currentRoster.focusAreas[otherKey] === value;
    });

    if (isDuplicate) {
      alert(`'${value}' 구역은 이미 해당 시간대의 다른 근무지에 배치되어 있습니다.`);
      return;
    }

    const key = `${slot}_${duty}`;
    setCurrentRoster(prev => ({ ...prev, focusAreas: { ...prev.focusAreas, [key]: value } }));
  };

  const handleNextNightGenerate = () => {
    const rosters = JSON.parse(localStorage.getItem('rosters') || '[]');
    const lastNight = rosters.filter(r => r.shiftType === '야간').sort((a,b) => b.date.localeCompare(a.date))[0];
    const { assignments, warnings } = rotateStandbyGroups(lastNight, employees, specialNotes);
    if (warnings.length > 0) alert("순번 생성 경고:\n" + warnings.join('\n'));
    
    setCurrentRoster(prev => {
      const newAssignments = { ...prev.assignments };
      // 기존 대기근무 초기화
      Object.keys(newAssignments).forEach(key => {
        if (key.includes('_대기근무')) delete newAssignments[key];
      });

      // 1. 고정 대기자 먼저 배치
      employees.forEach(emp => {
        if (emp.team === prev.metadata.teamName && emp.isFixedNightStandby && emp.fixedNightStandbySlot) {
          const [s, e] = emp.fixedNightStandbySlot.split('-');
          if (checkAvailability(emp, s, e, specialNotes).available) {
            const key = `${emp.fixedNightStandbySlot}_대기근무`;
            newAssignments[key] = [...(newAssignments[key] || []), emp.id];
          }
        }
      });

      // 2. 새 순환 순번 반영
      assignments.forEach(g => { 
        const key = `${g.slot}_대기근무`;
        newAssignments[key] = [...(newAssignments[key] || []), g.employeeId]; 
      });
      return { ...prev, assignments: newAssignments };
    });
    alert('이전 야간 기반 자동 순번이 반영되었습니다. (고정 대기자 자동 포함)');
  };

  const handleSave = () => {
    const rosters = JSON.parse(localStorage.getItem('rosters') || '[]');
    const existingIdx = rosters.findIndex(r => r.date === currentRoster.date && r.shiftType === currentRoster.shiftType);
    if (existingIdx >= 0) rosters[existingIdx] = currentRoster; else rosters.push(currentRoster);
    localStorage.setItem('rosters', JSON.stringify(rosters));
    alert('저장되었습니다.');
  };

  const addNote = () => {
    if (!newNote.employeeId) return alert('직원을 선택하세요.');
    setSpecialNotes([...specialNotes, { ...newNote, id: Date.now().toString() }]);
    setNewNote({ employeeId: '', type: '육아시간', startTime: '07:30', endTime: '09:30', isAllDay: false });
  };

  const deleteNote = (id) => setSpecialNotes(specialNotes.filter(n => n.id !== id));

  const addEmployee = (newStaffData) => {
    const updatedEmployees = [...employees, newStaffData].sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));
    setEmployees(updatedEmployees);
    setIsAddingEmployee(false);
  };

  const addTeam = () => {
    if (!newTeamName) return;
    setSettings({ ...settings, teams: [...(settings.teams || []), newTeamName] });
    setNewTeamName('');
  };

  const addFocusPlace = () => {
    if (!newFocusPlace) return;
    setSettings({ ...settings, focusPlaces: [...(settings.focusPlaces || []), newFocusPlace] });
    setNewFocusPlace('');
  };

  const addDutyType = () => {
    if (!newDutyType) return;
    setSettings({ ...settings, dutyTypes: [...settings.dutyTypes, { name: newDutyType, shift: newDutyShift }] });
    setNewDutyType('');
    setNewDutyShift('공통');
  };

  const handleRowClick = (emp) => {
    if (window.confirm(`${emp.rank} ${emp.name}님 정보를 수정하시겠습니까?`)) {
      setEditingEmployee(emp);
    }
  };

  const updateEmployee = (updated) => {
    setEmployees(employees.map(e => e.id === updated.id ? updated : e));
    setEditingEmployee(null);
  };

  const deleteEmployee = (id) => {
    if (window.confirm('정말 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) {
      setEmployees(employees.filter(e => e.id !== id));
      setSpecialNotes(specialNotes.filter(n => n.employeeId !== id));
      setEditingEmployee(null);
    }
  };

  const [draggedIdx, setDraggedIdx] = useState(null);

  const handleDragStart = (idx) => setDraggedIdx(idx);
  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (targetIdx, list, setList) => {
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    const newList = [...list];
    const draggedItem = newList.splice(draggedIdx, 1)[0];
    newList.splice(targetIdx, 0, draggedItem);
    setList(newList);
    setDraggedIdx(null);
  };

  const handleSettingsDrop = (targetIdx, key) => {
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    const newList = [...settings[key]];
    const draggedItem = newList.splice(draggedIdx, 1)[0];
    newList.splice(targetIdx, 0, draggedItem);
    setSettings({ ...settings, [key]: newList });
    setDraggedIdx(null);
  };

  // 사고자 명단 필터링 및 정렬 (전체 직원 순서 기준)
  const casualties = specialNotes
    .filter(n => ['병가', '휴가'].includes(n.type) || n.isAllDay)
    .sort((a, b) => {
      const idxA = employees.findIndex(e => e.id === a.employeeId);
      const idxB = employees.findIndex(e => e.id === b.employeeId);
      return idxA - idxB;
    });
  const casualtyEmployeeIds = new Set(casualties.map(n => n.employeeId));

  const currentTeamEmployees = employees
    .filter(e => e.team === currentRoster.metadata.teamName && !casualtyEmployeeIds.has(e.id));

  const sortedAllEmployees = [...employees];


  return (
    <div className="app-container">
      <header className="no-print">
        <h1><Shield size={24} /> 경찰 근무표 관리 시스템</h1>
        <nav>
          <button onClick={() => setActiveTab('roster')} className={activeTab === 'roster' ? 'active' : ''}>근무표 작성</button>
          <button onClick={() => setActiveTab('employees')} className={activeTab === 'employees' ? 'active' : ''}>직원 관리</button>
          <button onClick={() => setActiveTab('notes')} className={activeTab === 'notes' ? 'active' : ''}>특이사항</button>
          <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active' : ''}><Settings size={16} /> 환경 설정</button>
        </nav>
      </header>

      <main>
        {activeTab === 'roster' && (
          <div className="roster-view">
            <div className="roster-header-inputs no-print">
              <div className="input-group"><label><Calendar size={16} /> 날짜</label><input type="date" value={currentRoster.date} onChange={e => setCurrentRoster({...currentRoster, date: e.target.value})} /></div>
              <div className="input-group">
                <label>구분</label>
                <div className="toggle-buttons">
                  <button 
                    className={currentRoster.shiftType === '주간' ? 'active' : ''} 
                    onClick={() => setCurrentRoster({...currentRoster, shiftType: '주간'})}
                  >주간</button>
                  <button 
                    className={currentRoster.shiftType === '야간' ? 'active' : ''} 
                    onClick={() => setCurrentRoster({...currentRoster, shiftType: '야간'})}
                  >야간</button>
                </div>
              </div>
              <div className="input-group"><label>팀명</label><input type="text" className="team-name-input" value={currentRoster.metadata.teamName} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamName: e.target.value}})} /></div>
              <div className="input-group"><label>지구대장</label><input type="text" className="chief-name-input" value={currentRoster.metadata.chief} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, chief: e.target.value}})} /></div>
              <div className="input-group"><label>순찰팀장</label><input type="text" className="leader-name-input" value={currentRoster.metadata.teamLeader} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamLeader: e.target.value}})} /></div>
              <button className="btn-secondary" onClick={handleNextNightGenerate} disabled={currentRoster.shiftType !== '야간'} title="이전 야간 기반으로 대기조 3개조를 자동 생성합니다."><RefreshCw size={16} /> 자동 순번</button>
              <button className="btn-outline" onClick={() => setVolunteerModalOpen(true)}><Plus size={16} /> 자원근무</button>
              <button className="btn-primary" onClick={handleSave}><Save size={16} /> 저장</button>
              <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
            </div>

            <div className="print-area real-style">
              <div className="doc-title">{settings.stationName} 근무일지 ({currentRoster.shiftType === '야간' ? '야' : '주'})</div>
              <table className="summary-table real">
                <tbody>
                  <tr>
                    <td className="label">날 짜</td><td colSpan="3" className="val">{formatDateWithDay(currentRoster.date)}</td>
                    <td className="label">날 씨</td><td colSpan="3" className="val">
                      <select 
                        className="print-select no-print" 
                        value={currentRoster.weather} 
                        onChange={e => setCurrentRoster({...currentRoster, weather: e.target.value})}
                      >
                        {WEATHER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                      <span className="print-only">{currentRoster.weather}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="label">지구대장</td><td colSpan="3" className="val">{currentRoster.metadata.chief}</td>
                    <td className="label">순찰팀장</td><td className="val">{currentRoster.metadata.teamName}</td><td colSpan="2" className="val">{currentRoster.metadata.teamLeader}</td>
                  </tr>
                  <tr className="summary-counts">
                    <td className="label">총원</td><td className="label">소장</td><td className="label" colSpan="3">순찰요원 (팀장 포함)</td><td className="label">관리요원</td><td className="label">사고자</td><td className="label">전종자</td>
                  </tr>
                  <tr className="summary-values">
                    <td>{currentRoster.metadata.totalCount}</td><td>1</td>
                    <td colSpan="3" style={{ fontSize: '0.7rem' }}>{Object.entries(currentRoster.metadata.teamCounts).map(([t, c]) => <span key={t}>{t}({c}) </span>)}</td>
                    <td>{currentRoster.metadata.adminCount}</td><td>{casualties.length}</td><td>0</td>
                  </tr>
                </tbody>
              </table>

              <div className="worker-section real">
                <table className="worker-table real">
                  <thead>
                    <tr><th colSpan="2">근 무 자</th><th colSpan="2">사 고 자</th><th colSpan="2">자원근무자</th></tr>
                    <tr className="sub-header"><th>계급</th><th>성명</th><th>성명</th><th>사유</th><th>계급</th><th>성명</th></tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const volEmps = (currentRoster.volunteerIds || []).map(id => employees.find(e => e.id === id))
                        .filter(Boolean)
                        .sort((a, b) => employees.indexOf(a) - employees.indexOf(b));
                      const maxLen = Math.max(1, currentTeamEmployees.length, casualties.length, volEmps.length);
                      return Array.from({ length: maxLen }).map((_, i) => {
                        const emp = currentTeamEmployees[i];
                        const casualty = casualties[i];
                        const cEmp = casualty ? employees.find(e => e.id === casualty.employeeId) : null;
                        const vEmp = volEmps[i];
                        return (
                          <tr key={i}>
                            <td>{emp?.rank || ''}</td><td>{emp?.name || ''}</td>
                            <td>{cEmp?.name || ''}</td><td>{casualty?.type || ''}</td>
                            <td>{vEmp?.rank || ''}</td><td>{vEmp?.name || ''}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              <table className="roster-table real">
                <thead><tr><th width="80">구분</th>{currentTimeSlots.map(s => <th key={s} className="time-header">{s}</th>)}</tr></thead>
                <tbody>
                  {settings.dutyTypes
                    .filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)
                    .map(dutyObj => {
                      const duty = dutyObj.name;
                      const isFocus = duty.includes('중점');
                      return (
                        <tr key={duty} className={isFocus ? 'focus-row' : ''}>
                          <td className="duty-label">{duty}</td>
                          {currentTimeSlots.map(slot => {
                            const key = `${slot}_${duty}`;
                            if (isFocus) return (
                              <td 
                                key={slot} 
                                className="focus-cell assignment-cell" 
                                onClick={() => setFocusModalState({ isOpen: true, slot, duty })}
                              >
                                <div className="staff-name-v">{currentRoster.focusAreas[key] || ''}</div>
                              </td>
                            );
                            const ids = currentRoster.assignments[key] || [];
                            const staff = ids.map(id => employees.find(e => e.id === id))
                              .filter(Boolean)
                              .sort((a, b) => employees.indexOf(a) - employees.indexOf(b));
                            return (
                              <td key={slot} className="assignment-cell" onClick={() => setModalState({ isOpen: true, slot, duty })}>
                                <div className="staff-names-v">{staff.map(e => <div key={e.id} className="staff-name-v">{e.name}</div>)}</div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  <tr className="shift-change-row">
                    <td className="duty-label">근무교대</td>
                    {currentTimeSlots.map((s, i) => <td key={s} className="center">{(i === 0 || i === currentTimeSlots.length - 1) && <div className="shift-mark"></div>}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <StaffSelectionModal 
              isOpen={modalState.isOpen} 
              onClose={() => setModalState({ ...modalState, isOpen: false })} 
              slot={modalState.slot} 
              duty={modalState.duty} 
              employees={employees} 
              specialNotes={specialNotes} 
              selectedIds={currentRoster.assignments[`${modalState.slot}_${modalState.duty}`] || []} 
              currentAssignments={currentRoster.assignments}
              dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)}
              onSelect={handleToggleStaff} 
            />
            <FocusPlaceSelectionModal 
              isOpen={focusModalState.isOpen} 
              onClose={() => setFocusModalState({ ...focusModalState, isOpen: false })} 
              slot={focusModalState.slot} 
              duty={focusModalState.duty} 
              focusPlaces={settings.focusPlaces || []} 
              selectedValue={currentRoster.focusAreas[`${focusModalState.slot}_${focusModalState.duty}`] || ''} 
              onSelect={(val) => handleFocusChange(focusModalState.slot, focusModalState.duty, val)} 
            />
            <StaffSelectionModal 
              isOpen={volunteerModalOpen} 
              onClose={() => setVolunteerModalOpen(false)} 
              slot="자원" 
              duty="근무" 
              employees={employees} 
              specialNotes={specialNotes} 
              selectedIds={currentRoster.volunteerIds || []} 
              currentAssignments={currentRoster.assignments}
              dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)}
              onSelect={(id) => {
                setCurrentRoster(prev => {
                  const currentVolunteers = prev.volunteerIds || [];
                  const isSelected = currentVolunteers.includes(id);
                  if (isSelected) {
                    return { ...prev, volunteerIds: currentVolunteers.filter(i => i !== id) };
                  } else {
                    return { ...prev, volunteerIds: [...currentVolunteers, id] };
                  }
                });
              }} 
            />
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <div className="section-header-with-action">
              <h2>직원 명단 관리</h2>
              <div className="action-btns">
                <button 
                  className={`btn-edit-mode ${isAddingEmployee ? 'active' : ''}`}
                  onClick={() => setIsAddingEmployee(!isAddingEmployee)}
                >
                  {isAddingEmployee ? <><X size={16} /> 추가 취소</> : <><Plus size={16} /> 직원 추가</>}
                </button>
                <button 
                  className={`btn-edit-mode ${isStaffOrderEditMode ? 'active' : ''}`}
                  onClick={() => setIsStaffOrderEditMode(!isStaffOrderEditMode)}
                >
                  {isStaffOrderEditMode ? <><Save size={16} /> 수정 완료</> : <><Edit2 size={16} /> 순서/삭제 수정</>}
                </button>
              </div>
            </div>
            
            <div className="team-filter-tabs no-print">
              {settings.teams.map(team => (
                <button 
                  key={team} 
                  className={`team-tab-btn ${employeeTabTeam === team ? 'active' : ''}`} 
                  onClick={() => {
                    setEmployeeTabTeam(team);
                    // 팀 변경 시 해당 팀원들 계급순으로 기본 정렬되어 보임 (isStaffOrderEditMode가 아닐 때)
                  }}
                >
                  {team}
                </button>
              ))}
            </div>

            {(() => {
              // 현재 선택된 팀의 직원들
              const teamEmployees = employees.filter(e => e.team === employeeTabTeam);
              
              // 수정 모드가 아닐 때는 계급순으로 정렬해서 보여줌
              const displayEmployees = isStaffOrderEditMode 
                ? teamEmployees 
                : [...teamEmployees].sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));
                
              return (
                <>
                  <div className="stats-summary no-print">
                    <div className="stat-item total">
                      <span className="stat-label">{employeeTabTeam} 인원</span>
                      <span className="stat-value">{teamEmployees.length}명</span>
                    </div>
                    <div className="stat-divider"></div>
                    {RANKS.map(rank => {
                      const count = teamEmployees.filter(e => e.rank === rank).length;
                      if (count === 0) return null;
                      return (
                        <div key={rank} className="stat-item">
                          <span className="stat-label">{rank}</span>
                          <span className="stat-value">{count}명</span>
                        </div>
                      );
                    })}
                  </div>

                  <table className="admin-table interactive">
                    <thead>
                      <tr>
                        {isStaffOrderEditMode && <th width="40"></th>}
                        <th>계급</th><th>성명</th><th>팀</th><th>고정대기</th><th>야간제외</th>
                        {isStaffOrderEditMode && <th width="60">작업</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {displayEmployees.map((emp) => {
                        const globalIdx = employees.findIndex(e => e.id === emp.id);
                        return (
                          <tr 
                            key={emp.id} 
                            draggable={isStaffOrderEditMode}
                            onDragStart={() => handleDragStart(globalIdx)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(globalIdx, employees, setEmployees)}
                            className={draggedIdx === globalIdx ? 'dragging' : ''}
                          >
                            {isStaffOrderEditMode && <td className="drag-handle"><GripVertical size={16} /></td>}
                            <td onClick={() => !isStaffOrderEditMode && handleRowClick(emp)}>{emp.rank}</td>
                            <td onClick={() => !isStaffOrderEditMode && handleRowClick(emp)} className="emp-name-cell">{emp.name}</td>
                            <td onClick={() => !isStaffOrderEditMode && handleRowClick(emp)}>{emp.team}</td>
                            <td onClick={() => !isStaffOrderEditMode && handleRowClick(emp)}>{emp.isFixedNightStandby ? (emp.fixedNightStandbySlot || 'O') : 'X'}</td>
                            <td onClick={() => !isStaffOrderEditMode && handleRowClick(emp)}>{emp.isNightShiftExcluded ? 'O' : 'X'}</td>
                            {isStaffOrderEditMode && (
                              <td>
                                <button className="delete-btn-table" onClick={() => deleteEmployee(emp.id)}><Trash size={14} /></button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              );
            })()}
            
            <EmployeeAddModal 
              isOpen={isAddingEmployee} 
              settings={settings}
              onSave={addEmployee} 
              onClose={() => setIsAddingEmployee(false)} 
            />
            <EmployeeEditModal 
              isOpen={!!editingEmployee} 
              employee={editingEmployee} 
              settings={settings}
              onSave={updateEmployee} 
              onDelete={deleteEmployee} 
              onClose={() => setEditingEmployee(null)} 
            />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="admin-section">
            <h2>특이사항 관리</h2>
            <div className="note-form no-print">
              <select value={newNote.employeeId} onChange={e => setNewNote({...newNote, employeeId: e.target.value})}><option value="">직원 선택</option>{sortedAllEmployees.map(e => <option key={e.id} value={e.id}>{e.rank} {e.name}</option>)}</select>
              <select value={newNote.type} onChange={e => {
                const type = e.target.value;
                const isAllDay = ['휴가', '병가'].includes(type);
                setNewNote({...newNote, type, isAllDay});
              }}>{NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <label className="checkbox-item">
                <input type="checkbox" checked={newNote.isAllDay} onChange={e => setNewNote({...newNote, isAllDay: e.target.checked})} />
                종일
              </label>
              <input type="time" value={newNote.startTime} onChange={e => setNewNote({...newNote, startTime: e.target.value})} disabled={newNote.isAllDay} className={newNote.isAllDay ? 'disabled-input' : ''} />
              <input type="time" value={newNote.endTime} onChange={e => setNewNote({...newNote, endTime: e.target.value})} disabled={newNote.isAllDay} className={newNote.isAllDay ? 'disabled-input' : ''} />
              <button className="btn-primary" onClick={addNote}>추가</button>
            </div>
            <table className="admin-table">
              <thead><tr><th>직원</th><th>유형</th><th>시간</th><th>작업</th></tr></thead>
              <tbody>
                {specialNotes.map(n => {
                  const emp = employees.find(e => e.id === n.employeeId);
                  return (
                    <tr key={n.id}>
                      <td>{emp?.rank} {emp?.name}</td>
                      <td><span className={`note-tag ${n.type}`}>{n.type}</span></td>
                      <td>{n.isAllDay ? '종일' : `${n.startTime} ~ ${n.endTime}`}</td>
                      <td><button onClick={() => deleteNote(n.id)}>삭제</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="admin-section">
            <h2>기본 환경 설정</h2>
            <div className="settings-grid">
              <div className="settings-column">
                <div className="settings-card">
                  <div className="card-header-with-action">
                    <h3>지구대 정보</h3>
                    {!isEditingStation ? (
                      <button className="edit-btn-small" onClick={() => {
                        setTempStationSettings({ stationName: settings.stationName, chiefName: settings.chiefName });
                        setIsEditingStation(true);
                      }}><Edit2 size={14} /> 수정</button>
                    ) : (
                      <div className="action-btns">
                        <button className="btn-save-small" onClick={() => {
                          setSettings({ ...settings, ...tempStationSettings });
                          setCurrentRoster(prev => ({ ...prev, metadata: { ...prev.metadata, chief: tempStationSettings.chiefName } }));
                          setIsEditingStation(false);
                        }}><Save size={14} /> 저장</button>
                        <button className="btn-cancel-small" onClick={() => setIsEditingStation(false)}><X size={14} /> 취소</button>
                      </div>
                    )}
                  </div>
                  <div className="info-display">
                    <div className="info-item">
                      <label>지구대 명칭</label>
                      {isEditingStation ? (
                        <input 
                          type="text" 
                          value={tempStationSettings.stationName} 
                          onChange={e => setTempStationSettings({ ...tempStationSettings, stationName: e.target.value })} 
                        />
                      ) : (
                        <div className="value-text">{settings.stationName}</div>
                      )}
                    </div>
                    <div className="info-item" style={{ marginTop: '1rem' }}>
                      <label>지구대장 성명</label>
                      {isEditingStation ? (
                        <input 
                          type="text" 
                          value={tempStationSettings.chiefName} 
                          onChange={e => setTempStationSettings({ ...tempStationSettings, chiefName: e.target.value })} 
                        />
                      ) : (
                        <div className="value-text">{settings.chiefName}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="settings-card">
                  <h3>팀(조) 관리</h3>
                  <p className="hint-text">직원 관리에서 사용할 수 있는 팀 목록입니다.</p>
                  <div className="note-form no-print">
                    <input 
                      type="text" 
                      placeholder="새 팀 명칭 (예: 5팀)" 
                      value={newTeamName} 
                      onChange={e => setNewTeamName(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && addTeam()}
                    />
                    <button className="btn-primary" onClick={addTeam}>추가</button>
                  </div>
                  <div className="duty-type-list">
                    {(settings.teams || []).map((team, idx) => (
                      <div key={idx} className="duty-type-item">
                        {editingTeamIdx === idx ? (
                          <div className="edit-inline-form">
                            <input 
                              type="text" 
                              value={editingTeamValue} 
                              onChange={e => setEditingTeamValue(e.target.value)}
                              autoFocus
                            />
                            <div className="action-btns">
                              <button className="btn-save" onClick={() => {
                                if (!editingTeamValue) return;
                                const newTeams = [...settings.teams];
                                newTeams[idx] = editingTeamValue;
                                setSettings({ ...settings, teams: newTeams });
                                setEditingTeamIdx(null);
                              }}><Save size={14} /></button>
                              <button className="btn-cancel" onClick={() => setEditingTeamIdx(null)}><X size={14} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span>{team}</span>
                            <div className="action-btns">
                              <button className="edit-btn" onClick={() => {
                                setEditingTeamIdx(idx);
                                setEditingTeamValue(team);
                              }}><Edit2 size={14} /></button>
                              <button className="delete-btn" onClick={() => {
                                if (window.confirm(`'${team}' 항목을 삭제하시겠습니까?`)) {
                                  setSettings({ ...settings, teams: settings.teams.filter((_, i) => i !== idx) });
                                }
                              }}><Trash size={14} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="settings-card">
                  <h3>중점 구역(장소) 관리</h3>
                  <p className="hint-text">근무표의 '중점' 행에서 선택할 수 있는 장소 목록입니다.</p>
                  <div className="note-form no-print">
                    <input 
                      type="text" 
                      placeholder="새 장소 명칭 (예: 신사역)" 
                      value={newFocusPlace} 
                      onChange={e => setNewFocusPlace(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && addFocusPlace()}
                    />
                    <button className="btn-primary" onClick={addFocusPlace}>추가</button>
                  </div>
                  <div className="duty-type-list">
                    {(settings.focusPlaces || []).map((place, idx) => (
                      <div key={idx} className="duty-type-item">
                        {editingFocusIdx === idx ? (
                          <div className="edit-inline-form">
                            <input 
                              type="text" 
                              value={editingFocusValue} 
                              onChange={e => setEditingFocusValue(e.target.value)}
                              autoFocus
                            />
                            <div className="action-btns">
                              <button className="btn-save" onClick={() => {
                                if (!editingFocusValue) return;
                                const newPlaces = [...settings.focusPlaces];
                                newPlaces[idx] = editingFocusValue;
                                setSettings({ ...settings, focusPlaces: newPlaces });
                                setEditingFocusIdx(null);
                              }}><Save size={14} /></button>
                              <button className="btn-cancel" onClick={() => setEditingFocusIdx(null)}><X size={14} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span>{place}</span>
                            <div className="action-btns">
                              <button className="edit-btn" onClick={() => {
                                setEditingFocusIdx(idx);
                                setEditingFocusValue(place);
                              }}><Edit2 size={14} /></button>
                              <button className="delete-btn" onClick={() => {
                                if (window.confirm(`'${place}' 항목을 삭제하시겠습니까?`)) {
                                  setSettings({ ...settings, focusPlaces: settings.focusPlaces.filter((_, i) => i !== idx) });
                                }
                              }}><Trash size={14} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-column">
                <div className="settings-card">
                  <h3>근무 유형(구분) 관리</h3>
                  <p className="hint-text">근무표의 '구분' 열에 표시될 항목들입니다. ('중점' 포함 시 입력창이 생성됩니다)</p>
                  <div className="note-form no-print">
                    <input 
                      type="text" 
                      placeholder="새 근무 유형 입력" 
                      value={newDutyType} 
                      onChange={e => setNewDutyType(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && addDutyType()}
                    />
                    <select value={newDutyShift} onChange={e => setNewDutyShift(e.target.value)}>
                      <option value="공통">공통</option>
                      <option value="주간">주간 전용</option>
                      <option value="야간">야간 전용</option>
                    </select>
                    <button className="btn-primary" onClick={addDutyType}>추가</button>
                  </div>
                  <div className="duty-type-list">
                    {settings.dutyTypes.map((dutyObj, idx) => (
                      <div 
                        key={idx} 
                        className={`duty-type-item ${draggedIdx === idx ? 'dragging' : ''}`}
                        draggable={editingDutyIdx === null}
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleSettingsDrop(idx, 'dutyTypes')}
                      >
                        {editingDutyIdx === idx ? (
                          <div className="edit-inline-form">
                            <input 
                              type="text" 
                              value={editingDutyValue} 
                              onChange={e => setEditingDutyValue(e.target.value)}
                              autoFocus
                            />
                            <select value={editingDutyShift} onChange={e => setEditingDutyShift(e.target.value)}>
                              <option value="공통">공통</option>
                              <option value="주간">주간 전용</option>
                              <option value="야간">야간 전용</option>
                            </select>
                            <div className="action-btns">
                              <button className="btn-save" onClick={() => {
                                if (!editingDutyValue) return;
                                const newTypes = [...settings.dutyTypes];
                                newTypes[idx] = { name: editingDutyValue, shift: editingDutyShift };
                                setSettings({...settings, dutyTypes: newTypes});
                                setEditingDutyIdx(null);
                              }}><Save size={14} /></button>
                              <button className="btn-cancel" onClick={() => setEditingDutyIdx(null)}><X size={14} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="item-content">
                              <div className="drag-handle"><GripVertical size={14} /></div>
                              <span className="duty-name">{dutyObj.name}</span>
                              <span className={`duty-shift-tag ${dutyObj.shift}`}>{dutyObj.shift}</span>
                            </div>
                            <div className="action-btns">
                              <button className="edit-btn" onClick={() => {
                                setEditingDutyIdx(idx);
                                setEditingDutyValue(dutyObj.name);
                                setEditingDutyShift(dutyObj.shift || '공통');
                              }}><Edit2 size={14} /></button>
                              <button className="delete-btn" onClick={() => {
                                if (window.confirm(`'${dutyObj.name}' 항목을 삭제하시겠습니까?`)) {
                                  setSettings({...settings, dutyTypes: settings.dutyTypes.filter((_, i) => i !== idx)});
                                }
                              }}><Trash size={14} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X, Settings, Edit2 } from 'lucide-react';
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
  "상황근무", "서부 순21호", "순21호 중점", "서부 순23호", "순23호 중점",
  "서부 순24호", "순24호 중점", "서부 순25호", "순25호 중점", "도보", "대기근무"
];

const NOTE_TYPES = ["육아시간", "지원근무", "휴가", "병가", "교육", "외근", "기타"];
const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];

const getRankWeight = (rank) => {
  const index = RANKS.indexOf(rank);
  return index === -1 ? 99 : index;
};

function StaffSelectionModal({ isOpen, onClose, slot, duty, employees, specialNotes, selectedIds, onSelect }) {
  if (!isOpen) return null;

  const sortedEmployees = [...employees].sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));

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
            const note = specialNotes.find(n => n.employeeId === emp.id && (n.isAllDay || isTimeOverlapping(s, e, n.startTime, n.endTime)));
            
            return (
              <div 
                key={emp.id} 
                className={`staff-card-v2 ${isSelected ? 'selected' : ''} ${!availability.available ? 'disabled' : ''}`}
                onClick={() => availability.available && onSelect(emp.id)}
              >
                <div className="staff-rank">{emp.rank}</div>
                <div className="staff-name">{emp.name}</div>
                {note && (
                  <div className={`staff-note-label ${note.type}`}>
                    {note.type}
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
              고정대기 여부
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
    focusAreas: {} 
  });

  const [activeTab, setActiveTab] = useState('roster');
  const [employeeTabTeam, setEmployeeTabTeam] = useState('전체');
  const [newNote, setNewNote] = useState({ employeeId: '', type: '육아시간', startTime: '07:30', endTime: '09:30', isAllDay: false });
  const [newEmployee, setNewEmployee] = useState({ rank: '경위', name: '', team: settings.teams?.[0] || '1팀' });
  const [newDutyType, setNewDutyType] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newFocusPlace, setNewFocusPlace] = useState('');
  const [editingDutyIdx, setEditingDutyIdx] = useState(null);
  const [editingDutyValue, setEditingDutyValue] = useState('');
  const [isEditingStation, setIsEditingStation] = useState(false);
  const [tempStationSettings, setTempStationSettings] = useState({ stationName: settings.stationName, chiefName: settings.chiefName });
  const [editingTeamIdx, setEditingTeamIdx] = useState(null);
  const [editingTeamValue, setEditingTeamValue] = useState('');
  const [editingFocusIdx, setEditingFocusIdx] = useState(null);
  const [editingFocusValue, setEditingFocusValue] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [focusModalState, setFocusModalState] = useState({ isOpen: false, slot: '', duty: '' });
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
      setCurrentRoster(saved);
    } else {
      setCurrentRoster(prev => ({
        ...prev,
        weather: '맑음',
        assignments: {},
        focusAreas: {}
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

      // 새로 선택 시 중복 근무 체크
      const duplicateDuty = settings.dutyTypes.find(d => {
        if (d === modalState.duty) return false;
        const otherKey = `${modalState.slot}_${d}`;
        return (prev.assignments[otherKey] || []).includes(id);
      });

      if (duplicateDuty) {
        alert(`${employee.rank} ${employee.name}님은 현재 동일한 시간대에 [${duplicateDuty}] 근무에 이미 배치되어 있습니다.`);
        return prev;
      }

      return { ...prev, assignments: { ...prev.assignments, [key]: [...currentIdsInThisCell, id] } };
    });
  };

  const handleFocusChange = (slot, duty, value) => {
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
      // 새 순번 반영
      assignments.forEach(g => { 
        const key = `${g.slot}_대기근무`;
        newAssignments[key] = [...(newAssignments[key] || []), g.employeeId]; 
      });
      return { ...prev, assignments: newAssignments };
    });
    alert('이전 야간 기반 자동 순번이 반영되었습니다.');
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

  const addEmployee = () => {
    if (!newEmployee.name) return alert('성명을 입력하세요.');
    setEmployees([...employees, { id: Date.now().toString(), ...newEmployee, isStandbyRotationEligible: true, isFixedNightStandby: false }]);
    setNewEmployee({ ...newEmployee, name: '' });
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
    setSettings({ ...settings, dutyTypes: [...settings.dutyTypes, newDutyType] });
    setNewDutyType('');
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

  // 사고자 명단 필터링 (병가, 휴가, 기타 또는 종일 등록된 직원)
  const casualties = specialNotes.filter(n => ['병가', '휴가'].includes(n.type) || n.isAllDay);
  const casualtyEmployeeIds = new Set(casualties.map(n => n.employeeId));

  const currentTeamEmployees = employees
    .filter(e => e.team === currentRoster.metadata.teamName && !casualtyEmployeeIds.has(e.id))
    .sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));

  const sortedAllEmployees = [...employees].sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));

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
              <div className="input-group"><label><Calendar size={16} /> 일자</label><input type="date" value={currentRoster.date} onChange={e => setCurrentRoster({...currentRoster, date: e.target.value})} /></div>
              <div className="input-group"><label>구분</label><select value={currentRoster.shiftType} onChange={e => setCurrentRoster({...currentRoster, shiftType: e.target.value})}><option value="주간">주간</option><option value="야간">야간</option></select></div>
              <div className="input-group"><label>팀명</label><input type="text" style={{ width: '80px' }} value={currentRoster.metadata.teamName} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamName: e.target.value}})} /></div>
              <div className="input-group"><label>지구대장</label><input type="text" style={{ width: '100px' }} value={currentRoster.metadata.chief} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, chief: e.target.value}})} /></div>
              <div className="input-group"><label>순찰팀장</label><input type="text" style={{ width: '100px' }} value={currentRoster.metadata.teamLeader} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamLeader: e.target.value}})} /></div>
              <button className="btn-secondary" onClick={handleNextNightGenerate} disabled={currentRoster.shiftType !== '야간'} title="이전 야간 기반으로 대기조 3개조를 자동 생성합니다."><RefreshCw size={16} /> 자동 순번</button>
              <button className="btn-primary" onClick={handleSave}><Save size={16} /> 저장</button>
              <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
            </div>

            <div className="print-area real-style">
              <div className="doc-title">{settings.stationName} 근무일지 ({currentRoster.shiftType === '야간' ? '야' : '주'})</div>
              <table className="summary-table real">
                <tbody>
                  <tr>
                    <td className="label">금일 일자</td><td colSpan="3" className="val">{currentRoster.date}</td>
                    <td className="label">날 씨</td><td colSpan="3" className="val"><input type="text" className="print-input" value={currentRoster.weather} onChange={e => setCurrentRoster({...currentRoster, weather: e.target.value})} /></td>
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
                    <td colSpan="3">{Object.entries(currentRoster.metadata.teamCounts).map(([t, c]) => <span key={t}>{t}({c}) </span>)}</td>
                    <td>{currentRoster.metadata.adminCount}</td><td>{casualties.length}</td><td>0</td>
                  </tr>
                </tbody>
              </table>

              <div className="worker-section real">
                <table className="worker-table real">
                  <thead>
                    <tr><th colSpan="3">근 무 자</th><th colSpan="3">사 고 자</th></tr>
                    <tr className="sub-header"><th>조별</th><th>계급</th><th>성명</th><th>계급</th><th>성명</th><th>사유</th></tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Math.max(14, currentTeamEmployees.length, casualties.length) }).map((_, i) => {
                      const emp = currentTeamEmployees[i];
                      const casualty = casualties[i];
                      const cEmp = casualty ? employees.find(e => e.id === casualty.employeeId) : null;
                      return (
                        <tr key={i}>
                          <td className="center">{i + 1}</td><td className="center">{emp?.rank || ''}</td><td className="center">{emp?.name || ''}</td>
                          <td className="center">{cEmp?.rank || ''}</td><td className="center">{cEmp?.name || ''}</td><td className="center">{casualty?.type || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <table className="roster-table real">
                <thead><tr><th width="80">구분</th>{currentTimeSlots.map(s => <th key={s} className="time-header">{s}</th>)}</tr></thead>
                <tbody>
                  {settings.dutyTypes.map(duty => {
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
                            .sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));
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
                    {currentTimeSlots.map((s, i) => <td key={s} className="center">{(i === 0 || i === currentTimeSlots.length - 1) && <div className="shift-mark">O</div>}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <StaffSelectionModal isOpen={modalState.isOpen} onClose={() => setModalState({ ...modalState, isOpen: false })} slot={modalState.slot} duty={modalState.duty} employees={employees} specialNotes={specialNotes} selectedIds={currentRoster.assignments[`${modalState.slot}_${modalState.duty}`] || []} onSelect={handleToggleStaff} />
            <FocusPlaceSelectionModal 
              isOpen={focusModalState.isOpen} 
              onClose={() => setFocusModalState({ ...focusModalState, isOpen: false })} 
              slot={focusModalState.slot} 
              duty={focusModalState.duty} 
              focusPlaces={settings.focusPlaces || []} 
              selectedValue={currentRoster.focusAreas[`${focusModalState.slot}_${focusModalState.duty}`] || ''} 
              onSelect={(val) => handleFocusChange(focusModalState.slot, focusModalState.duty, val)} 
            />
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <h2>직원 명단 관리 (이름을 눌러 수정)</h2>
            
            <div className="team-filter-tabs no-print">
              {['전체', ...settings.teams].map(team => (
                <button 
                  key={team} 
                  className={`team-tab-btn ${employeeTabTeam === team ? 'active' : ''}`} 
                  onClick={() => setEmployeeTabTeam(team)}
                >
                  {team}
                </button>
              ))}
            </div>

            {(() => {
              const filteredEmployees = employeeTabTeam === '전체' 
                ? sortedAllEmployees 
                : sortedAllEmployees.filter(e => e.team === employeeTabTeam);
                
              return (
                <>
                  <div className="stats-summary no-print">
                    <div className="stat-item total">
                      <span className="stat-label">{employeeTabTeam === '전체' ? '전체' : employeeTabTeam} 인원</span>
                      <span className="stat-value">{filteredEmployees.length}명</span>
                    </div>
                    <div className="stat-divider"></div>
                    {RANKS.map(rank => {
                      const count = filteredEmployees.filter(e => e.rank === rank).length;
                      if (count === 0) return null;
                      return (
                        <div key={rank} className="stat-item">
                          <span className="stat-label">{rank}</span>
                          <span className="stat-value">{count}명</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="note-form no-print">
                    <div className="input-group"><label>계급</label><select value={newEmployee.rank} onChange={e => setNewEmployee({...newEmployee, rank: e.target.value})}>{RANKS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div className="input-group"><label>성명</label><input type="text" placeholder="새 직원 성명" value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} onKeyDown={e => e.key === 'Enter' && addEmployee()} /></div>
                    <div className="input-group"><label>팀</label><select value={newEmployee.team} onChange={e => setNewEmployee({...newEmployee, team: e.target.value})}>
                      {settings.teams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select></div>
                    <button className="btn-primary" onClick={addEmployee}><Plus size={16} /> 추가</button>
                  </div>
                  <table className="admin-table interactive">
                    <thead><tr><th>계급</th><th>성명</th><th>팀</th><th>순환대상</th><th>고정대기</th><th>고정시간</th></tr></thead>
                    <tbody>
                      {filteredEmployees.map(emp => (
                        <tr key={emp.id} onClick={() => handleRowClick(emp)}>
                          <td>{emp.rank}</td>
                          <td className="emp-name-cell">{emp.name}</td>
                          <td>{emp.team}</td>
                          <td>{emp.isStandbyRotationEligible ? 'O' : 'X'}</td>
                          <td>{emp.isFixedNightStandby ? 'O' : 'X'}</td>
                          <td>{emp.fixedNightStandbySlot || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}
            
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
                    <button className="btn-primary" onClick={addDutyType}>추가</button>
                  </div>
                  <div className="duty-type-list">
                    {settings.dutyTypes.map((type, idx) => (
                      <div key={idx} className="duty-type-item">
                        {editingDutyIdx === idx ? (
                          <div className="edit-inline-form">
                            <input 
                              type="text" 
                              value={editingDutyValue} 
                              onChange={e => setEditingDutyValue(e.target.value)}
                              autoFocus
                            />
                            <div className="action-btns">
                              <button className="btn-save" onClick={() => {
                                if (!editingDutyValue) return;
                                const newTypes = [...settings.dutyTypes];
                                newTypes[idx] = editingDutyValue;
                                setSettings({ ...settings, dutyTypes: newTypes });
                                setEditingDutyIdx(null);
                              }}><Save size={14} /></button>
                              <button className="btn-cancel" onClick={() => setEditingDutyIdx(null)}><X size={14} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span>{type}</span>
                            <div className="action-btns">
                              <button className="edit-btn" onClick={() => {
                                setEditingDutyIdx(idx);
                                setEditingDutyValue(type);
                              }}><Edit2 size={14} /></button>
                              <button className="delete-btn" onClick={() => {
                                if (window.confirm(`'${type}' 항목을 삭제하시겠습니까?`)) {
                                  setSettings({ ...settings, dutyTypes: settings.dutyTypes.filter((_, i) => i !== idx) });
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

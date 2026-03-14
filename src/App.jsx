import { useState, useEffect } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X } from 'lucide-react';
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

const DUTY_TYPES = [
  "상황근무", "서부 순21호", "순21호 중점", "서부 순23호", "순23호 중점",
  "서부 순24호", "순24호 중점", "서부 순25호", "순25호 중점", "도보", "대기근무"
];

const NOTE_TYPES = ["육아시간", "지원근무", "휴가", "병가", "교육", "외근", "기타"];
const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];

function StaffSelectionModal({ isOpen, onClose, slot, duty, employees, specialNotes, selectedIds, onSelect }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content">
        <div className="modal-header">
          <h3>직원 선택 ({duty} / {slot})</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="staff-grid">
          {employees.map(emp => {
            const [s, e] = slot.split('-');
            const availability = checkAvailability(emp, s, e, specialNotes);
            const isSelected = selectedIds.includes(emp.id);
            const note = specialNotes.find(n => n.employeeId === emp.id && (n.isAllDay || isTimeOverlapping(s, e, n.startTime, n.endTime)));
            return (
              <div 
                key={emp.id} 
                className={`staff-card ${isSelected ? 'selected' : ''} ${!availability.available ? 'unavailable' : ''}`}
                onClick={() => availability.available && onSelect(emp.id)}
              >
                <div className="staff-info">
                  <span className="rank">{emp.rank}</span>
                  <span className="name">{emp.name}</span>
                </div>
                {note && <div className={`note-tag mini ${note.type}`}>{note.type}</div>}
                {!availability.available && <span className="reason-text">{availability.reason}</span>}
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

function App() {
  const [employees, setEmployees] = useState(() => {
    const saved = localStorage.getItem('employees');
    return saved ? JSON.parse(saved) : INITIAL_EMPLOYEES;
  });

  const [specialNotes, setSpecialNotes] = useState(() => {
    const saved = localStorage.getItem('specialNotes');
    return saved ? JSON.parse(saved) : [];
  });

  const [currentRoster, setCurrentRoster] = useState({
    date: new Date().toISOString().split('T')[0],
    shiftType: '야간',
    weather: '맑음',
    metadata: { 
      chief: '이이식', 
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
  const [newNote, setNewNote] = useState({ employeeId: '', type: '육아시간', startTime: '07:30', endTime: '09:30', isAllDay: false });
  const [newEmployee, setNewEmployee] = useState({ rank: '경위', name: '' });
  const [modalState, setModalState] = useState({ isOpen: false, slot: '', duty: '' });

  useEffect(() => {
    localStorage.setItem('employees', JSON.stringify(employees));
    localStorage.setItem('specialNotes', JSON.stringify(specialNotes));
  }, [employees, specialNotes]);

  const currentTimeSlots = currentRoster.shiftType === '주간' ? DAY_TIME_SLOTS : NIGHT_TIME_SLOTS;

  const handleToggleStaff = (id) => {
    const key = `${modalState.slot}_${modalState.duty}`;
    setCurrentRoster(prev => {
      const currentIds = prev.assignments[key] || [];
      const newIds = currentIds.includes(id) ? currentIds.filter(i => i !== id) : [...currentIds, id];
      return { ...prev, assignments: { ...prev.assignments, [key]: newIds } };
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
    if (warnings.length > 0) alert("경고:\n" + warnings.join('\n'));
    setCurrentRoster(prev => {
      const newAssignments = { ...prev.assignments };
      assignments.forEach(g => { newAssignments[`${g.slot}_대기근무`] = [g.employeeId]; });
      return { ...prev, assignments: newAssignments };
    });
    alert('자동 순번이 반영되었습니다.');
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
    setEmployees([...employees, { id: Date.now().toString(), ...newEmployee, team: currentRoster.metadata.teamName, isStandbyRotationEligible: true, isFixedNightStandby: false }]);
    setNewEmployee({ rank: '경위', name: '' });
  };

  const currentTeamEmployees = employees.filter(e => e.team === currentRoster.metadata.teamName);

  return (
    <div className="app-container">
      <header className="no-print">
        <h1><Shield size={24} /> 경찰 근무표 관리 시스템</h1>
        <nav>
          <button onClick={() => setActiveTab('roster')} className={activeTab === 'roster' ? 'active' : ''}>근무표 작성</button>
          <button onClick={() => setActiveTab('employees')} className={activeTab === 'employees' ? 'active' : ''}>직원 관리</button>
          <button onClick={() => setActiveTab('notes')} className={activeTab === 'notes' ? 'active' : ''}>특이사항</button>
        </nav>
      </header>

      <main>
        {activeTab === 'roster' && (
          <div className="roster-view">
            <div className="roster-header-inputs no-print">
              <div className="input-group"><label><Calendar size={16} /> 일자</label><input type="date" value={currentRoster.date} onChange={e => setCurrentRoster({...currentRoster, date: e.target.value})} /></div>
              <div className="input-group"><label>구분</label><select value={currentRoster.shiftType} onChange={e => setCurrentRoster({...currentRoster, shiftType: e.target.value})}><option value="주간">주간</option><option value="야간">야간</option></select></div>
              <div className="input-group"><label>팀명</label><input type="text" value={currentRoster.metadata.teamName} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamName: e.target.value}})} /></div>
              <button className="btn-secondary" onClick={handleNextNightGenerate} disabled={currentRoster.shiftType !== '야간'}><RefreshCw size={16} /> 자동 순번</button>
              <button className="btn-primary" onClick={handleSave}><Save size={16} /> 저장</button>
              <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
            </div>

            <div className="print-area real-style">
              <div className="doc-title">신사지구대 근무일지 ({currentRoster.shiftType === '야간' ? '야' : '주'})</div>
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
                    <td>{currentRoster.metadata.adminCount}</td><td>{currentRoster.metadata.longTermAbsent}</td><td>0</td>
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
                    {Array.from({ length: 14 }).map((_, i) => {
                      const emp = currentTeamEmployees[i];
                      const note = specialNotes[i];
                      const absent = note ? employees.find(e => e.id === note.employeeId) : null;
                      return (
                        <tr key={i}>
                          <td className="center">{i + 1}</td><td className="center">{emp?.rank || ''}</td><td className="center">{emp?.name || ''}</td>
                          <td className="center">{absent?.rank || ''}</td><td className="center">{absent?.name || ''}</td><td className="center">{note?.type || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <table className="roster-table real">
                <thead><tr><th width="80">구분</th>{currentTimeSlots.map(s => <th key={s} className="time-header">{s}</th>)}</tr></thead>
                <tbody>
                  {DUTY_TYPES.map(duty => {
                    const isFocus = duty.includes('중점');
                    return (
                      <tr key={duty} className={isFocus ? 'focus-row' : ''}>
                        <td className="duty-label">{duty}</td>
                        {currentTimeSlots.map(slot => {
                          const key = `${slot}_${duty}`;
                          if (isFocus) return <td key={slot} className="focus-cell"><input type="text" className="focus-input" value={currentRoster.focusAreas[key] || ''} onChange={e => handleFocusChange(slot, duty, e.target.value)} /></td>;
                          const ids = currentRoster.assignments[key] || [];
                          const staff = ids.map(id => employees.find(e => e.id === id)).filter(Boolean);
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
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <h2>직원 명단 관리</h2>
            <div className="note-form no-print">
              <div className="input-group"><label>계급</label><select value={newEmployee.rank} onChange={e => setNewEmployee({...newEmployee, rank: e.target.value})}>{RANKS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div className="input-group"><label>성명</label><input type="text" value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} /></div>
              <button className="btn-primary" onClick={addEmployee}><Plus size={16} /> 추가</button>
            </div>
            <table className="admin-table">
              <thead><tr><th>계급</th><th>성명</th><th>순환대상</th><th>고정대기</th><th>작업</th></tr></thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}>
                    <td><select value={emp.rank} onChange={e => setEmployees(employees.map(ex => ex.id === emp.id ? {...ex, rank: e.target.value} : ex))}>{RANKS.map(r => <option key={r} value={r}>{r}</option>)}</select></td>
                    <td><input type="text" value={emp.name} onChange={e => setEmployees(employees.map(ex => ex.id === emp.id ? {...ex, name: e.target.value} : ex))} /></td>
                    <td><input type="checkbox" checked={emp.isStandbyRotationEligible} onChange={e => setEmployees(employees.map(ex => ex.id === emp.id ? {...ex, isStandbyRotationEligible: e.target.checked} : ex))} /></td>
                    <td><input type="checkbox" checked={emp.isFixedNightStandby} onChange={e => setEmployees(employees.map(ex => ex.id === emp.id ? {...ex, isFixedNightStandby: e.target.checked} : ex))} /></td>
                    <td><button onClick={() => setEmployees(employees.filter(e => e.id !== emp.id))}><Trash size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="admin-section">
            <h2>특이사항 관리</h2>
            <div className="note-form no-print">
              <select value={newNote.employeeId} onChange={e => setNewNote({...newNote, employeeId: e.target.value})}><option value="">직원 선택</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
              <select value={newNote.type} onChange={e => setNewNote({...newNote, type: e.target.value})}>{NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <input type="time" value={newNote.startTime} onChange={e => setNewNote({...newNote, startTime: e.target.value})} />
              <input type="time" value={newNote.endTime} onChange={e => setNewNote({...newNote, endTime: e.target.value})} />
              <button className="btn-primary" onClick={addNote}>추가</button>
            </div>
            <table className="admin-table">
              <thead><tr><th>직원</th><th>유형</th><th>시간</th><th>작업</th></tr></thead>
              <tbody>
                {specialNotes.map(n => (
                  <tr key={n.id}>
                    <td>{employees.find(e => e.id === n.employeeId)?.name}</td><td className={`note-tag ${n.type}`}>{n.type}</td><td>{n.startTime} ~ {n.endTime}</td><td><button onClick={() => deleteNote(n.id)}>삭제</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

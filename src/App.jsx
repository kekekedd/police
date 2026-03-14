import React, { useState, useEffect } from 'react';
import { Calendar, User, Clock, Shield, Plus, Trash, Save, Printer, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { isTimeOverlapping, checkAvailability, rotateStandbyGroups } from './utils/rotation';
import './App.css';

// 샘플 데이터
const INITIAL_EMPLOYEES = [
  { id: '1', name: '황광철', rank: '경감', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '2', name: '손병목', rank: '경감', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '3', name: '송형돈', rank: '경장', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '4', name: '김성일', rank: '경감', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '5', name: '이현식', rank: '경위', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '6', name: '김영혁', rank: '경위', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '7', name: '김민태', rank: '경위', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '8', name: '이진섭', rank: '경사', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '9', name: '박상민', rank: '경사', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '10', name: '양승헌', rank: '경사', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '11', name: '김대원', rank: '경장', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
  { id: '12', name: '오나리', rank: '순경', team: '1팀', isStandbyRotationEligible: true, isFixedNightStandby: false },
];

const TIME_SLOTS = [
  "19:30-20:00", "20:00-22:00", "22:00-01:00", "01:00-02:00",
  "02:00-04:00", "04:00-06:00", "06:00-07:00", "07:00-08:00"
];

const DUTY_TYPES = [
  "상황근무", "서부 순21호", "순21호 중점", "서부 순23호", "순23호 중점",
  "서부 순24호", "순24호 중점", "서부 순25호", "순25호 중점", "도보", "대기근무"
];

const NOTE_TYPES = ["육아시간", "지원근무", "휴가", "병가", "교육", "외근", "기타"];

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
    metadata: { chief: '홍길동', teamLeader: '박문수', teamName: '1팀' },
    assignments: {},
    nightStandbyGroups: []
  });

  const [activeTab, setActiveTab] = useState('roster');
  const [newNote, setNewNote] = useState({ employeeId: '', type: '육아시간', startTime: '07:30', endTime: '09:30', isAllDay: false });

  useEffect(() => {
    localStorage.setItem('employees', JSON.stringify(employees));
    localStorage.setItem('specialNotes', JSON.stringify(specialNotes));
  }, [employees, specialNotes]);

  const handleAssignmentChange = (slot, duty, employeeId) => {
    const key = `${slot}_${duty}`;
    if (employeeId !== "") {
      const employee = employees.find(e => e.id === employeeId);
      const [s, e] = slot.split('-');
      const { available, reason } = checkAvailability(employee, s, e, specialNotes);
      if (!available) {
        alert(`${employee.name}님은 ${reason}으로 인해 배치가 불가능합니다.`);
        return;
      }
    }
    setCurrentRoster(prev => ({ ...prev, assignments: { ...prev.assignments, [key]: employeeId } }));
  };

  const handleNextNightGenerate = () => {
    const rosters = JSON.parse(localStorage.getItem('rosters') || '[]');
    const lastNight = rosters.filter(r => r.shiftType === '야간').sort((a,b) => b.date.localeCompare(a.date))[0];
    const nextRotation = rotateStandbyGroups(lastNight, employees, specialNotes);
    
    setCurrentRoster(prev => {
      const newAssignments = { ...prev.assignments };
      nextRotation.forEach(g => { newAssignments[`${g.slot}_대기근무`] = g.employeeId; });
      return { ...prev, nightStandbyGroups: nextRotation, assignments: newAssignments };
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
              <div className="input-group"><label>날씨</label><input type="text" value={currentRoster.weather} onChange={e => setCurrentRoster({...currentRoster, weather: e.target.value})} /></div>
              <div className="input-group"><label>팀명</label><input type="text" value={currentRoster.metadata.teamName} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamName: e.target.value}})} /></div>
              <button className="btn-secondary" onClick={handleNextNightGenerate}><RefreshCw size={16} /> 다음 야간 생성</button>
              <button className="btn-primary" onClick={handleSave}><Save size={16} /> 저장</button>
              <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
            </div>

            <div className="print-area">
              <div className="doc-header">
                <h2>근 무 일 지 ({currentRoster.shiftType})</h2>
                <div className="doc-meta">
                  <span>일시: {currentRoster.date}</span>
                  <span>날씨: {currentRoster.weather}</span>
                  <span>소속: {currentRoster.metadata.teamName}</span>
                </div>
              </div>
              <table className="roster-table">
                <thead><tr><th>구분</th>{TIME_SLOTS.map(slot => <th key={slot}>{slot}</th>)}</tr></thead>
                <tbody>
                  {DUTY_TYPES.map(duty => (
                    <tr key={duty}>
                      <td className="duty-label">{duty}</td>
                      {TIME_SLOTS.map(slot => (
                        <td key={slot}>
                          <select value={currentRoster.assignments[`${slot}_${duty}`] || ""} onChange={(e) => handleAssignmentChange(slot, duty, e.target.value)}>
                            <option value="">-</option>
                            {employees.map(emp => {
                              const note = specialNotes.find(n => n.employeeId === emp.id && (n.isAllDay || isTimeOverlapping(slot.split('-')[0], slot.split('-')[1], n.startTime, n.endTime)));
                              return <option key={emp.id} value={emp.id} style={{color: note ? 'red' : 'inherit'}}>{emp.rank} {emp.name}{note ? `(${note.type})` : ''}</option>;
                            })}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <h2>직원 명단 관리</h2>
            <table className="admin-table">
              <thead><tr><th>계급</th><th>성명</th><th>순환대상</th><th>고정대기</th><th>고정시간</th></tr></thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}>
                    <td>{emp.rank}</td>
                    <td>{emp.name}</td>
                    <td><input type="checkbox" checked={emp.isStandbyRotationEligible} onChange={e => setEmployees(employees.map(ex => ex.id === emp.id ? {...ex, isStandbyRotationEligible: e.target.checked} : ex))} /></td>
                    <td><input type="checkbox" checked={emp.isFixedNightStandby} onChange={e => setEmployees(employees.map(ex => ex.id === emp.id ? {...ex, isFixedNightStandby: e.target.checked} : ex))} /></td>
                    <td><select value={emp.fixedNightStandbySlot || ""} onChange={e => setEmployees(employees.map(ex => ex.id === emp.id ? {...ex, fixedNightStandbySlot: e.target.value} : ex))}><option value="">없음</option><option value="22:00-01:00">22:00-01:00</option><option value="01:00-04:00">01:00-04:00</option><option value="04:00-07:00">04:00-07:00</option></select></td>
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
              <input type="time" value={newNote.startTime} onChange={e => setNewNote({...newNote, startTime: e.target.value})} disabled={newNote.isAllDay} />
              <input type="time" value={newNote.endTime} onChange={e => setNewNote({...newNote, endTime: e.target.value})} disabled={newNote.isAllDay} />
              <label><input type="checkbox" checked={newNote.isAllDay} onChange={e => setNewNote({...newNote, isAllDay: e.target.checked})} /> 종일</label>
              <button className="btn-primary" onClick={addNote}><Plus size={16} /> 추가</button>
            </div>
            <table className="admin-table">
              <thead><tr><th>직원</th><th>유형</th><th>시간</th><th>작업</th></tr></thead>
              <tbody>
                {specialNotes.map(n => (
                  <tr key={n.id}>
                    <td>{employees.find(e => e.id === n.employeeId)?.name}</td>
                    <td className={`note-tag ${n.type}`}>{n.type}</td>
                    <td>{n.isAllDay ? '종일' : `${n.startTime} ~ ${n.endTime}`}</td>
                    <td><button className="btn-danger" onClick={() => deleteNote(n.id)}><Trash size={14} /></button></td>
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

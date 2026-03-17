import { useState, useEffect, useRef } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X, Settings, Edit2, ChevronDown, ChevronUp, Check, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import { isTimeOverlapping, checkAvailability } from './utils/rotation';
import { auth, db, saveDocument, removeDocument } from './firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import './App.css';

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

const NOTE_TYPES = ["육아시간", "지원근무", "휴가", "병가", "교육", "외근", "장기사고자", "기타"];
const RANKS = ["경정", "경감", "경위", "경사", "경장", "순경"];
const WEATHER_TYPES = ["맑음", "흐림", "비", "눈", "안개", "황사"];

const DEFAULT_SETTINGS = {
  stationName: '○○ 지구대',
  chiefName: '',
  dutyTypes: DEFAULT_DUTY_TYPES,
  teams: [
    { name: '1팀', isVisible: true },
    { name: '2팀', isVisible: true },
    { name: '3팀', isVisible: true },
    { name: '4팀', isVisible: true }
  ],
  focusPlaces: ['신사역', '논현역', '학동역', '압구정역', '가로수길', '도산공원', '신사상가', '잠원한강공원', '을지병원사거리'],
  dayTimeSlots: DAY_TIME_SLOTS,
  nightTimeSlots: NIGHT_TIME_SLOTS
};

const formatDateWithDay = (dateStr) => {
  if (!dateStr) return "";
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(dateStr);
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, '0')}월 ${String(date.getDate()).padStart(2, '0')}일 (${days[date.getDay()]})`;
};

const getRankWeight = (rank) => {
  const index = RANKS.indexOf(rank);
  return index === -1 ? 99 : index;
};

// --- Sub Components ---

function StaffSelectionModal({ isOpen, onClose, slot, duty, employees, specialNotes, selectedIds, currentAssignments, dutyTypes, settings, onSelect, onDeleteVolunteer }) {
  const [activeTeamTab, setActiveTeamTab] = useState('');
  useEffect(() => {
    if (isOpen && settings?.teams?.length > 0 && !activeTeamTab) {
      setActiveTeamTab(settings.teams[0].name);
    }
  }, [isOpen, settings, activeTeamTab]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const sortedEmployees = [...employees].sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));
  const filteredEmployees = activeTeamTab === '자원' 
    ? sortedEmployees.filter(e => e.isVolunteer)
    : sortedEmployees.filter(e => e.team === activeTeamTab && !e.isVolunteer);

  return (
    <div className="modal-overlay no-print">
      <div className="modal-content selection-modal large">
        <div className="modal-header">
          <h3>직원 선택 ({duty} / {slot})</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="team-filter-tabs-mini modal-tabs">
          {settings?.teams?.map(t => (
            <button key={t.name} className={`team-tab-btn-mini ${activeTeamTab === t.name ? 'active' : ''}`} onClick={() => setActiveTeamTab(t.name)}>{t.name}</button>
          ))}
          <button className={`team-tab-btn-mini ${activeTeamTab === '자원' ? 'active' : ''}`} onClick={() => setActiveTeamTab('자원')}>자원근무자</button>
        </div>
        <div className="staff-grid scrollable modal-staff-grid">
          {filteredEmployees.map(emp => {
            const [s, e] = slot.split('-');
            const availability = checkAvailability(emp, s, e, specialNotes);
            const isSelected = selectedIds.includes(emp.id);
            let otherDutyName = null;
            if (currentAssignments) {
              const otherDuty = dutyTypes.find(d => (d.name !== duty && (currentAssignments[`${slot}_${d.name}`] || []).includes(emp.id)));
              if (otherDuty) otherDutyName = otherDuty.name;
            }
            const isBlocked = !availability.available || (otherDutyName && !isSelected);
            const note = specialNotes.find(n => n.employeeId === emp.id && (n.isAllDay || isTimeOverlapping(s, e, n.startTime, n.endTime)));
            return (
              <div key={emp.id} className={`staff-card-v2 ${isSelected ? 'selected' : ''} ${isBlocked && !isSelected ? 'disabled' : ''}`} onClick={() => (!isBlocked || isSelected) && onSelect(emp.id)} style={{ position: 'relative' }}>
                <div className="staff-rank">{emp.rank}</div>
                <div className="staff-name">{emp.name}</div>
                {emp.isVolunteer && (
                  <button className="delete-btn-tiny" onClick={(e) => { e.stopPropagation(); if(window.confirm('삭제?')) onDeleteVolunteer(emp.id); }} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(255,0,0,0.1)', border: 'none', borderRadius: '4px', color: '#ff4444' }}><Trash size={12} /></button>
                )}
                {emp.isAdminStaff && <div className="staff-note-label admin">관리반</div>}
                {note && <div className={`staff-note-label ${note.type}`}>{note.type}</div>}
                {otherDutyName && !note && <div className="staff-note-label warning">{otherDutyName}</div>}
              </div>
            );
          })}
        </div>
        <div className="modal-footer"><button className="btn-primary" onClick={onClose}>확인</button></div>
      </div>
    </div>
  );
}

function EmployeeAddModal({ isOpen, settings, onSave, onClose }) {
  const [newEmp, setNewEmp] = useState({ rank: '경위', name: '', team: '', isStandbyRotationEligible: true, isFixedNightStandby: false, isNightShiftExcluded: false, isAdminStaff: false });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  useEffect(() => { if(isOpen && settings.teams.length > 0) setNewEmp(prev => ({...prev, team: settings.teams[0].name})); }, [isOpen, settings]);
  if (!isOpen) return null;
  const handleAdd = () => {
    if (!newEmp.name) return alert('성명을 입력하세요.');
    const finalData = { ...newEmp, id: Date.now().toString() };
    if (newEmp.isFixedNightStandby && startTime && endTime) finalData.fixedNightStandbySlot = `${startTime}-${endTime}`;
    onSave(finalData);
    setNewEmp({ ...newEmp, name: '' });
  };
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header"><h3>신규 직원 등록</h3><button onClick={onClose} className="close-btn"><X size={20} /></button></div>
        <div className="modal-body edit-form">
          <div className="input-group"><label>계급</label><div className="btn-group">{RANKS.map(r => <button key={r} className={`selection-btn ${newEmp.rank === r ? 'active' : ''}`} onClick={() => setNewEmp({ ...newEmp, rank: r })}>{r}</button>)}</div></div>
          <div className="input-group"><label>성명</label><input type="text" value={newEmp.name} onChange={e => setNewEmp({ ...newEmp, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus /></div>
          <div className="input-group"><label>팀</label><div className="btn-group">{settings.teams.map(t => <button key={t.name} className={`selection-btn ${newEmp.team === t.name ? 'active' : ''}`} onClick={() => setNewEmp({ ...newEmp, team: t.name })}>{t.name}</button>)}</div></div>
          <div className="checkbox-list">
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isStandbyRotationEligible} onChange={e => setNewEmp({ ...newEmp, isStandbyRotationEligible: e.target.checked })} />순환대상</label>
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isFixedNightStandby} onChange={e => setNewEmp({ ...newEmp, isFixedNightStandby: e.target.checked })} />고정대기</label>
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isAdminStaff} onChange={e => setNewEmp({ ...newEmp, isAdminStaff: e.target.checked })} />관리반</label>
          </div>
        </div>
        <div className="modal-footer"><button className="btn-primary" onClick={handleAdd}>등록</button></div>
      </div>
    </div>
  );
}

// --- Main App ---

function App({ user }) {
  const [employees, setEmployees] = useState([]);
  const [specialNotes, setSpecialNotes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataInitialized, setIsDataInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ data: 'loading' });
  
  const [activeTab, setActiveTab] = useState('roster');
  const [employeeTabTeam, setEmployeeTabTeam] = useState('');
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [noteTeamFilter, setNoteTeamFilter] = useState('');
  const [newNote, setNewNote] = useState({ startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], employeeId: '', type: '육아시간', startTime: '07:30', endTime: '09:30', isAllDay: false });

  const [currentRoster, setCurrentRoster] = useState({
    date: new Date().toISOString().split('T')[0],
    shiftType: '야간',
    weather: '맑음',
    metadata: { chief: '', chiefStatus: '일근', teamLeader: '', teamName: '', dedicatedCount: 0, dayShiftOnlyCount: 0 },
    assignments: {}, focusAreas: {}, volunteerStaff: []
  });

  useEffect(() => {
    if (!user) return;
    
    const unsubSettings = onSnapshot(doc(db, 'settings', user.uid), (docSnap) => {
      setSyncStatus(prev => ({ ...prev, data: docSnap.metadata.fromCache ? 'cache' : 'server' }));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({...DEFAULT_SETTINGS, ...data});
        if (!currentRoster.metadata.teamName && data.teams?.length > 0) {
          setCurrentRoster(prev => ({ ...prev, metadata: { ...prev.metadata, teamName: data.teams[0].name } }));
        }
      }
      setIsDataInitialized(true);
    });

    const unsubEmployees = onSnapshot(query(collection(db, 'employees'), where('userId', '==', user.uid)), (snapshot) => {
      setSyncStatus(prev => ({ ...prev, data: snapshot.metadata.fromCache ? 'cache' : 'server' }));
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    });

    const unsubNotes = onSnapshot(query(collection(db, 'specialNotes'), where('userId', '==', user.uid)), (snapshot) => {
      setSpecialNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubSettings(); unsubEmployees(); unsubNotes(); };
  }, [user]);

  const safeSave = async (coll, id, data) => {
    try {
      setIsSyncing(true);
      await saveDocument(coll, id, { ...data, userId: user.uid });
    } catch (err) {
      alert(`[저장 오류] 서버와 연결이 끊겼습니다. 사유: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!user || !isDataInitialized || isLoading) return;
    const timer = setTimeout(() => safeSave('settings', user.uid, settings), 2000);
    return () => clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    if (!user || !isDataInitialized || isLoading || !currentRoster.metadata.teamName) return;
    const rosterId = `${user.uid}_${currentRoster.date}_${currentRoster.shiftType}_${currentRoster.metadata.teamName}`;
    const timer = setTimeout(() => safeSave('rosters', rosterId, { ...currentRoster, updatedAt: new Date().toISOString() }), 1500);
    return () => clearTimeout(timer);
  }, [currentRoster]);

  const handleToggleStaff = (id) => {
    const key = `${modalState.slot}_${modalState.duty}`;
    setCurrentRoster(prev => {
      const currentIds = prev.assignments[key] || [];
      const newIds = currentIds.includes(id) ? currentIds.filter(i => i !== id) : [...currentIds, id];
      return { ...prev, assignments: { ...prev.assignments, [key]: newIds } };
    });
  };

  const addNote = async () => {
    if (!newNote.employeeId) return alert('직원을 선택하세요.');
    const uniqueId = `${user.uid}_${Date.now()}`;
    await safeSave('specialNotes', uniqueId, { ...newNote, date: newNote.startDate, id: uniqueId });
    alert('특이사항 등록 완료');
  };

  const deleteNote = (id) => { if(window.confirm('삭제?')) removeDocument('specialNotes', id); };

  if (isLoading || !isDataInitialized) return (<div className="loading-screen">데이터 로드 중...</div>);

  const currentTimeSlots = currentRoster.shiftType === '주간' ? settings.dayTimeSlots : settings.nightTimeSlots;
  const todaysNotes = specialNotes.filter(n => n.date === currentRoster.date);
  const currentTeamEmployees = employees.filter(e => e.team === currentRoster.metadata.teamName).sort((a,b) => getRankWeight(a.rank) - getRankWeight(b.rank));

  return (
    <div className="app-container">
      {isSyncing && <div className="sync-indicator"><RefreshCw size={14} className="spin" /> 동기화 중...</div>}
      
      <div style={{ padding: '8px 15px', fontSize: '11px', background: '#2c3e50', color: '#fff', display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div><strong>ID:</strong> {user.uid}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {syncStatus.data === 'server' ? <Wifi size={14} color="#2ecc71" /> : <WifiOff size={14} color="#e67e22" />}
          <span style={{ color: syncStatus.data === 'server' ? '#2ecc71' : '#e67e22' }}>
            {syncStatus.data === 'server' ? '실시간 서버연결됨' : '오프라인(내 컴퓨터에만 저장됨)'}
          </span>
        </div>
        <div style={{ marginLeft: 'auto' }}>직원: {employees.length}명 / 특이사항: {specialNotes.length}건</div>
      </div>

      <header className="no-print">
        <h1><Shield size={24} /> 경찰 근무표 관리 시스템</h1>
        <nav>
          <button onClick={() => setActiveTab('roster')} className={activeTab === 'roster' ? 'active' : ''}>근무표</button>
          <button onClick={() => setActiveTab('employees')} className={activeTab === 'employees' ? 'active' : ''}>직원관리</button>
          <button onClick={() => setActiveTab('notes')} className={activeTab === 'notes' ? 'active' : ''}>특이사항</button>
          <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active' : ''}>설정</button>
          <button onClick={() => auth.signOut()} className="logout-btn">로그아웃</button>
        </nav>
      </header>

      <main>
        {activeTab === 'roster' && (
          <div className="roster-view">
            <div className="roster-header-inputs no-print">
              <div className="header-card"><label>날짜</label><input type="date" value={currentRoster.date} onChange={e => setCurrentRoster({...currentRoster, date: e.target.value})} /></div>
              <div className="header-card"><label>팀 선택</label>
                <div className="btn-group">{settings.teams.map(t => <button key={t.name} className={currentRoster.metadata.teamName === t.name ? 'active' : ''} onClick={() => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamName: t.name}})}>{t.name}</button>)}</div>
              </div>
              <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
            </div>

            <div className="print-area real-style">
              <div className="doc-title">{settings.stationName} 근무일지 ({formatDateWithDay(currentRoster.date)})</div>
              <table className="roster-table real">
                <thead><tr><th>구분</th>{currentTimeSlots.map(s => <th key={s}>{s}</th>)}</tr></thead>
                <tbody>
                  {settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType).map(dutyObj => (
                    <tr key={dutyObj.name}>
                      <td className="duty-label">{dutyObj.name}</td>
                      {currentTimeSlots.map(slot => {
                        const key = `${slot}_${dutyObj.name}`;
                        const staff = (currentRoster.assignments[key] || []).map(id => employees.find(e => e.id === id)).filter(Boolean);
                        return <td key={slot} className="assignment-cell" onClick={() => setModalState({ isOpen: true, slot, duty: dutyObj.name })}>
                          {staff.map(e => <div key={e.id}>{e.name}</div>)}
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <div className="section-header-with-action"><h2>직원 명단 관리</h2><button className="btn-primary" onClick={() => setIsAddingEmployee(true)}><Plus size={16} /> 직원 추가</button></div>
            <table className="admin-table">
              <thead><tr><th>계급</th><th>성명</th><th>팀</th><th>관리반</th><th>작업</th></tr></thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}><td>{emp.rank}</td><td>{emp.name}</td><td>{emp.team}</td><td>{emp.isAdminStaff ? 'O' : 'X'}</td><td><button onClick={() => removeDocument('employees', emp.id)}><Trash size={14} /></button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="admin-section">
            <h2>특이사항 관리</h2>
            <div className="note-form-v2">
              <select onChange={e => setNoteTeamFilter(e.target.value)}><option value="">팀 선택</option>{settings.teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select>
              <div className="staff-grid-mini">
                {employees.filter(e => e.team === noteTeamFilter).map(e => <div key={e.id} className={newNote.employeeId === e.id ? 'selected' : ''} onClick={() => setNewNote({...newNote, employeeId: e.id})}>{e.name}</div>)}
              </div>
              <button className="btn-primary" onClick={addNote}>특이사항 등록</button>
            </div>
            <div className="notes-list">
              {specialNotes.map(n => {
                const emp = employees.find(e => e.id === n.employeeId);
                return <div key={n.id} className="note-item">{emp?.name} - {n.type} ({n.date}) <button onClick={() => deleteNote(n.id)}><X size={14} /></button></div>;
              })}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="admin-section">
            <h2>환경 설정</h2>
            <div className="settings-card">
              <label>지구대 명칭</label>
              <input type="text" value={settings.stationName} onChange={e => setSettings({...settings, stationName: e.target.value})} />
            </div>
          </div>
        )}
      </main>

      <StaffSelectionModal isOpen={modalState.isOpen} onClose={() => setModalState({...modalState, isOpen: false})} slot={modalState.slot} duty={modalState.duty} employees={employees} specialNotes={todaysNotes} selectedIds={currentRoster.assignments[`${modalState.slot}_${modalState.duty}`] || []} currentAssignments={currentRoster.assignments} dutyTypes={settings.dutyTypes} settings={settings} onSelect={handleToggleStaff} />
      <EmployeeAddModal isOpen={isAddingEmployee} settings={settings} onSave={(data) => { safeSave('employees', `${user.uid}_${Date.now()}`, data); setIsAddingEmployee(false); }} onClose={() => setIsAddingEmployee(false)} />
    </div>
  );
}

export default App;

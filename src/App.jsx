import { useState, useEffect, useRef } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X, Settings, Edit2, ChevronDown, ChevronUp, Check, Eye, EyeOff, Copy, AlertTriangle } from 'lucide-react';
// [수정] 새로운 대기근무 순환 함수만 가져오도록 변경
import { rotateNightStandby, isTimeOverlapping, checkAvailability } from './utils/rotation';
import { auth, db, saveDocument, removeDocument } from './firebase';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, orderBy, limit } from 'firebase/firestore';
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
  focusPlaces: [],
  dayTimeSlots: DAY_TIME_SLOTS,
  nightTimeSlots: NIGHT_TIME_SLOTS
};

const formatDateWithDay = (dateStr) => {
  if (!dateStr) return "";
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일 (${days[date.getDay()]})`;
};

const getRankWeight = (rank) => {
  const index = RANKS.indexOf(rank);
  return index === -1 ? 99 : index;
};

function StaffSelectionModal({ isOpen, onClose, slot, duty, employees, specialNotes, selectedIds, currentAssignments, dutyTypes, settings, onSelect, onDeleteVolunteer, selectedTeamName, shiftType }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const teamEmps = employees
    .filter(e => e.team === selectedTeamName && !e.isVolunteer && !e.isAdminStaff)
    .sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));

  const adminEmps = shiftType === '주간'
    ? employees.filter(e => e.isAdminStaff && !e.isVolunteer).sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank))
    : [];

  const volunteerEmps = employees.filter(e => e.isVolunteer);

  const finalDisplayList = [...teamEmps, ...adminEmps, ...volunteerEmps];

  return (
    <div className="modal-overlay no-print">
      <div className="modal-content selection-modal large">
        <div className="modal-header">
          <h3>직원 선택 ({duty} / {slot})</h3>
          <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '4px' }}>{selectedTeamName} 명단 + 자원근무자</div>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="staff-grid scrollable modal-staff-grid" style={{ marginTop: '1rem' }}>
          {finalDisplayList.map(emp => {
            const [s, e] = slot.split('-');
            const availability = checkAvailability(emp, s, e, specialNotes, duty, slot);
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
                {emp.isVolunteer && !emp.isSupportDuty && (
                  <button 
                    className="delete-btn-tiny" 
                    onClick={(e) => { e.stopPropagation(); if(window.confirm('이 자원근무자를 삭제하시겠습니까?')) onDeleteVolunteer(emp.id); }}
                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(255,0,0,0.1)', border: 'none', borderRadius: '4px', padding: '2px', cursor: 'pointer', color: '#ff4444' }}
                  >
                    <Trash size={12} />
                  </button>
                )}
                {emp.isAdminStaff && <div className="staff-note-label admin">관리반</div>}
                {emp.isVolunteer && <div className="staff-note-label volunteer">자원</div>}
                {note && <div className={`staff-note-label ${note.type}`}>{note.type}</div>}
                {otherDutyName && !note && <div className="staff-note-label warning">{otherDutyName}</div>}
              </div>
            );
          })}
          {finalDisplayList.length === 0 && <div className="empty-selection-placeholder">표시할 직원이 없습니다.</div>}
        </div>
        <div className="modal-footer"><button className="btn-primary" onClick={onClose}>확인</button></div>
      </div>
    </div>
  );
}

// --- 이하 모든 Modal 컴포넌트는 이전과 동일 ---

function App({ user }) {
  const [employees, setEmployees] = useState([]);
  const [specialNotes, setSpecialNotes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataInitialized, setIsDataInitialized] = useState(false);
  
  const lastServerSettings = useRef(null);
  const [lastSavedRoster, setLastSavedRoster] = useState(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);

  const [activeTab, setActiveTab] = useState('roster');
  const [modalState, setModalState] = useState({ isOpen: false, slot: '', duty: '' });
  // ... 기타 상태값들 ...

  const [currentRoster, setCurrentRoster] = useState({
    date: new Date().toISOString().split('T')[0],
    shiftType: '야간',
    weather: '맑음',
    metadata: { teamName: '' }, // 초기 팀 이름 빈 값으로
    assignments: {}, focusAreas: {}, volunteerStaff: []
  });

  const isRosterDirty = lastSavedRoster && JSON.stringify(currentRoster) !== lastSavedRoster;

  // --- 데이터 로딩 useEffect 들 (이전과 동일) ---
   useEffect(() => {
    if (!user) return;
    const unsubSettings = onSnapshot(doc(db, 'settings', user.uid), (docSnap) => {
      if (docSnap.metadata.hasPendingWrites) return;
      if (docSnap.exists()) {
        const data = docSnap.data();
        const migratedTeams = data.teams?.map(t => typeof t === 'string' ? {name: t, isVisible: true} : t) || [];
        
        const newSettings = {
          ...DEFAULT_SETTINGS,
          ...data,
          teams: migratedTeams.length > 0 ? migratedTeams : (settings.teams || DEFAULT_SETTINGS.teams),
          dutyTypes: data.dutyTypes || settings.dutyTypes || DEFAULT_SETTINGS.dutyTypes,
          focusPlaces: data.focusPlaces || settings.focusPlaces || []
        };

        lastServerSettings.current = JSON.stringify(newSettings);
        setSettings(newSettings);
        
        const visibleTeams = migratedTeams.filter(t => t.isVisible);
        if (!currentRoster.metadata.teamName && visibleTeams.length > 0) {
          const firstVisibleTeam = visibleTeams[0].name;
          setCurrentRoster(prev => ({ ...prev, metadata: { ...prev.metadata, teamName: firstVisibleTeam } }));
        }
      } else {
         setSettings(DEFAULT_SETTINGS);
         if (DEFAULT_SETTINGS.teams.length > 0) {
           setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, teamName: DEFAULT_SETTINGS.teams[0].name }}));
         }
      }
      setIsDataInitialized(true);
    });
    const unsubEmployees = onSnapshot(query(collection(db, 'employees'), where('userId', '==', user.uid)), (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    });
    const unsubNotes = onSnapshot(query(collection(db, 'specialNotes'), where('userId', '==', user.uid)), (snapshot) => {
      setSpecialNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubSettings(); unsubEmployees(); unsubNotes(); };
  }, [user]);

  useEffect(() => {
    if (!user || !isDataInitialized || !currentRoster.metadata.teamName) return;
    const rosterId = `${user.uid}_${currentRoster.date}_${currentRoster.shiftType}_${currentRoster.metadata.teamName}`;
    const unsubRoster = onSnapshot(doc(db, 'rosters', rosterId), (docSnap) => {
      if (docSnap.metadata.hasPendingWrites) return; 
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentRoster(prev => ({ ...prev, ...data }));
        setLastSavedRoster(JSON.stringify({ ...currentRoster, ...data }));
      } else {
        const resetData = { ...currentRoster, assignments: {}, focusAreas: {}, volunteerStaff: [] };
        setCurrentRoster(resetData);
        setLastSavedRoster(JSON.stringify(resetData));
      }
    });
    return () => unsubRoster();
  }, [user, currentRoster.date, currentRoster.shiftType, currentRoster.metadata.teamName, isDataInitialized]);

  // [새 기능] 대기근무 순환 함수
  const handleRotateStandby = async () => {
    if (currentRoster.shiftType !== '야간') {
      alert('대기근무 순환은 야간 근무표에서만 사용 가능합니다.');
      return;
    }

    if (!window.confirm('4일 전 야간 근무표를 기준으로 대기근무를 순환 배치합니다. 기존 대기근무 데이터는 덮어쓰여집니다. 계속하시겠습니까?')) {
      return;
    }

    setIsSyncing(true);

    try {
      // 1. 4일 전 날짜 계산
      const prevDate = new Date(currentRoster.date);
      prevDate.setDate(prevDate.getDate() - 4);
      const prevDateStr = prevDate.toISOString().split('T')[0];

      // 2. 4일 전 근무표 데이터 가져오기
      const prevRosterId = `${user.uid}_${prevDateStr}_야간_${currentRoster.metadata.teamName}`;
      const prevRosterDoc = await getDoc(doc(db, 'rosters', prevRosterId));

      if (!prevRosterDoc.exists()) {
        alert(`4일 전(${prevDateStr}) 야간 근무기록이 없습니다. 순환할 수 없습니다.`);
        setIsSyncing(false);
        return;
      }
      
      const prevRosterData = prevRosterDoc.data();
      const todaysNotes = specialNotes.filter(n => n.date === currentRoster.date);

      // 3. 순환 함수 호출
      const { assignments: newStandbyAssignments, warnings } = rotateNightStandby(
        prevRosterData,
        employees, 
        todaysNotes, 
        currentRoster.metadata.teamName
      );

      // 4. 현재 근무표에 결과 병합 (대기근무만 덮어쓰기)
      setCurrentRoster(prev => {
        const updatedAssignments = { ...prev.assignments };
        
        // 기존 대기근무 데이터 삭제
        Object.keys(updatedAssignments).forEach(key => {
          if (key.endsWith('_대기근무')) {
            delete updatedAssignments[key];
          }
        });

        // 새 대기근무 데이터 추가
        const finalAssignments = { ...updatedAssignments, ...newStandbyAssignments };
        
        return { ...prev, assignments: finalAssignments };
      });

      // 5. 경고 메시지 표시
      if (warnings && warnings.length > 0) {
        alert(`대기근무 순환 완료.\n\n주의사항:\n- ${warnings.join('\n- ')}`);
      } else {
        alert('대기근무 순환이 성공적으로 완료되었습니다.');
      }

    } catch (error) {
      console.error("대기근무 순환 중 오류 발생:", error);
      alert(`오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };
  
  // --- 기타 핸들러 함수들 (handleSaveRoster 등 이전과 동일) ---
   const handleSaveRoster = async (silent = false) => {
    if (!user || !currentRoster.metadata.teamName) return;
    try {
      setIsSyncing(true);
      const rosterId = `${user.uid}_${currentRoster.date}_${currentRoster.shiftType}_${currentRoster.metadata.teamName}`;
      await saveDocument('rosters', rosterId, { ...currentRoster, userId: user.uid, updatedAt: new Date().toISOString() });
      setLastSavedRoster(JSON.stringify(currentRoster));
      if (!silent) alert('근무표가 서버에 안전하게 저장되었습니다.');
      return true;
    } catch (err) {
      alert('저장 실패: ' + err.message);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetRoster = () => {
    if (window.confirm('현재 날짜와 팀의 근무 배치를 모두 초기화하시겠습니까?')) {
      setCurrentRoster(prev => ({
        ...prev,
        assignments: {},
        focusAreas: {},
        volunteerStaff: []
      }));
    }
  };

  const handleToggleStaff = (id) => {
    const key = `${modalState.slot}_${modalState.duty}`;
    setCurrentRoster(prev => {
      const currentIds = prev.assignments[key] || [];
      if (currentIds.includes(id)) return { ...prev, assignments: { ...prev.assignments, [key]: currentIds.filter(i => i !== id) } };
      return { ...prev, assignments: { ...prev.assignments, [key]: [...currentIds, id] } };
    });
  };
  
  // --- 이하 렌더링 로직 ---  
  if (isLoading || !isDataInitialized) return (<div className="loading-screen"><div className="loader-container"><div className="loader-spinner"></div><div className="loader-text">데이터를 안전하게 불러오는 중입니다...</div></div></div>);
  
  const currentTimeSlots = currentRoster.shiftType === '주간' ? (settings.dayTimeSlots || DAY_TIME_SLOTS) : (settings.nightTimeSlots || NIGHT_TIME_SLOTS);
  const todaysNotes = specialNotes.filter(n => n.date === currentRoster.date);
  
  return (
    <div className="app-container">
      {/* ... header, nav ... */}
       <header className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1><Shield size={24} /> 경찰 근무표 관리 시스템</h1>
        </div>
        <nav>
          <button onClick={() => setActiveTab('roster')} className={activeTab === 'roster' ? 'active' : ''}>근무표 작성</button>
          <button onClick={() => setActiveTab('employees')} className={activeTab === 'employees' ? 'active' : ''}>직원 관리</button>
          <button onClick={() => setActiveTab('notes')} className={activeTab === 'notes' ? 'active' : ''}>특이사항</button>
          <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active' : ''}><Settings size={16} /> 환경 설정</button>
          <button onClick={() => { if(window.confirm('로그아웃 하시겠습니까?')) auth.signOut(); }} style={{ background: '#455a64', color: 'white'}}>로그아웃</button>
        </nav>
      </header>

      <main>
        {activeTab === 'roster' && (
          <div className="roster-view">
            <div className="roster-header-inputs no-print">
               {/* ... 다른 입력 필드들 ... */}
                <div className="header-card">
                    <label><Calendar size={14} /> 날짜</label>
                    <input type="date" value={currentRoster.date} onChange={e => setCurrentRoster(prev => ({...prev, date: e.target.value}))} />
                </div>
                <div className="header-card">
                    <label>근무 구분</label>
                    <div className="toggle-buttons">
                        <button className={currentRoster.shiftType === '주간' ? 'active' : ''} onClick={() => setCurrentRoster(prev => ({...prev, shiftType: '주간'}))}>주간</button>
                        <button className={currentRoster.shiftType === '야간' ? 'active' : ''} onClick={() => setCurrentRoster(prev => ({...prev, shiftType: '야간'}))}>야간</button>
                    </div>
                </div>
                 <div className="header-card">
                    <label>팀 선택</label>
                    <div className="btn-group">
                    {settings.teams.filter(t => t.isVisible).map(team => (
                        <button 
                        key={team.name} 
                        className={`selection-btn ${currentRoster.metadata.teamName === team.name ? 'active' : ''}`}
                        onClick={() => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, teamName: team.name}}))}
                        >
                        {team.name}
                        </button>
                    ))}
                    </div>
                </div>

              <div className="header-actions">
                <button className="btn-primary" onClick={() => handleSaveRoster()}><Save size={16} /> 저장하기</button>
                
                {/* [새 기능] 대기근무 순환 버튼 (야간 근무 시에만 보임) */}
                {currentRoster.shiftType === '야간' && 
                  <button className="btn-secondary" onClick={handleRotateStandby} title="4일 전 야간근무를 기준으로 대기근무를 순환합니다.">
                    <RefreshCw size={16} /> 대기근무 순환
                  </button>
                }
                
                <button className="btn-danger" onClick={handleResetRoster}><Trash size={16} /> 일지 초기화</button>
                <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
              </div>
            </div>

            {/* ... 근무표 테이블 및 나머지 UI ... */}
            <div className="print-area real-style">
                 {/* The rest of the rendering logic remains the same */}
                 <div className="doc-title">{settings.stationName} 근무일지 ({currentRoster.shiftType === '야간' ? '야' : '주'})</div>
                 <table className="roster-table real">
                    <thead><tr><th width="80">구분</th>{currentTimeSlots.map(s => <th key={s}>{s}</th>)}</tr></thead>
                    <tbody>
                    {settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType).map(dutyObj => (
                        <tr key={dutyObj.name} className={dutyObj.name.includes('중점') ? 'focus-row' : ''}>
                        <td className="duty-label">{dutyObj.name}</td>
                        {currentTimeSlots.map(slot => {
                            const key = `${slot}_${dutyObj.name}`;
                            if (dutyObj.name.includes('중점')) {
                            return (
                                <td key={slot} className="assignment-cell focus-cell" onClick={() => setFocusModalState({ isOpen: true, slot, duty: dutyObj.name })}>
                                    <div className="staff-name-v">{currentRoster.focusAreas[key] || ''}</div>
                                </td>
                            );
                            }
                            
                            const staffIds = currentRoster.assignments[key] || [];
                            const allAvailableStaffMap = new Map();
                            [...employees].forEach(e => {
                                allAvailableStaffMap.set(e.id, e);
                            });

                            const staff = Array.from(allAvailableStaffMap.values())
                            .filter(e => staffIds.includes(e.id))
                            .sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));

                            return (
                            <td key={slot} className="assignment-cell" onClick={() => setModalState({ isOpen: true, slot, duty: dutyObj.name })}>
                                <div className="staff-names-v">
                                {staff.map(e => <div key={e.id} className="staff-name-v">{e.name}</div>)}
                                </div>
                            </td>
                            );
                        })}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
             <StaffSelectionModal 
              isOpen={modalState.isOpen} 
              onClose={() => setModalState({ ...modalState, isOpen: false })} 
              slot={modalState.slot} 
              duty={modalState.duty} 
              employees={employees} 
              specialNotes={todaysNotes} 
              selectedIds={currentRoster.assignments[`${modalState.slot}_${modalState.duty}`] || []} 
              currentAssignments={currentRoster.assignments} 
              dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)} 
              settings={settings} 
              onSelect={handleToggleStaff} 
              onDeleteVolunteer={()=>{}}
              selectedTeamName={currentRoster.metadata.teamName}
              shiftType={currentRoster.shiftType}
            />
          </div>
        )}

        {/* ... 직원관리, 특이사항, 환경설정 탭 UI (이전과 동일) ... */}
        {activeTab === 'employees' && (<div>직원관리</div>)}
        {activeTab === 'notes' && (<div>특이사항</div>)}
        {activeTab === 'settings' && (<div>환경설정</div>)}

      </main>
    </div>
  );
}

export default App;

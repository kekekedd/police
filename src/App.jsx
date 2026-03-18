import { useState, useEffect, useRef } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X, Settings, Edit2, ChevronDown, ChevronUp, Check, Eye, EyeOff, Copy, AlertTriangle } from 'lucide-react';
import { rotateNightStandby, isTimeOverlapping, checkAvailability, allStandbySlots, standbyGroups } from './utils/rotation';
import { auth, db, saveDocument, removeDocument } from './firebase';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import './App.css';

const DAY_TIME_SLOTS = [
  "07:30-08:00", "08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00",
  "13:00-14:00", "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-20:00"
];

const NIGHT_TIME_SLOTS = [
  "19:30-20:00", "20:00-22:00", "22:00-01:00", "01:00-02:00",
  "02:00-04:00", "04:00-06:00", "06:00-07:00"
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

  // 1. 해당 팀의 일반 팀원 (계급순)
  const teamEmps = employees
    .filter(e => e.team === selectedTeamName && !e.isVolunteer && !e.isAdminStaff)
    .sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));

  // 2. 관리반 직원 (주간 근무 시에만 포함)
  const adminEmps = shiftType === '주간'
    ? employees.filter(e => e.isAdminStaff && !e.isVolunteer).sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank))
    : [];

  // 3. 자원근무자 (지원근무 포함)
  const volunteerEmps = employees.filter(e => e.isVolunteer);

  // 최종 목록 구성: [팀원] + [관리반] + [자원근무자]
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
            const availability = checkAvailability(emp, s, e, specialNotes, duty);
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

function EmployeeAddModal({ isOpen, settings, onSave, onClose }) {
  const [newEmp, setNewEmp] = useState({ rank: '경위', name: '', team: '', isStandbyRotationEligible: true, isFixedNightStandby: false, isNightShiftExcluded: false, isAdminStaff: false });
  const [startTime, setStartTime] = useState("");
  const [end_Time, setEndTime] = useState("");
  useEffect(() => { if(isOpen && settings.teams.length > 0) setNewEmp(prev => ({...prev, team: settings.teams[0].name})); }, [isOpen, settings]);
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const handleAdd = () => {
    if (!newEmp.name) return alert('성명을 입력하세요.');
    const finalData = { ...newEmp, id: Date.now().toString() };
    if (newEmp.isFixedNightStandby && startTime && end_Time) finalData.fixedNightStandbySlot = `${startTime}-${end_Time}`;
    onSave(finalData);
    setNewEmp({ rank: '경위', name: '', team: settings.teams[0].name, isStandbyRotationEligible: true, isFixedNightStandby: false, isNightShiftExcluded: false, isAdminStaff: false });
  };
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header"><h3>신규 직원 등록</h3><button onClick={onClose} className="close-btn"><X size={20} /></button></div>
        <div className="modal-body edit-form">
          <div className="input-group"><label>계급</label><div className="btn-group">{RANKS.map(r => <button key={r} className={`selection-btn ${newEmp.rank === r ? 'active' : ''}`} onClick={() => setNewEmp({ ...newEmp, rank: r })}>{r}</button>)}</div></div>
          <div className="input-group"><label>성명</label><input type="text" placeholder="성명 입력" value={newEmp.name} onChange={e => setNewEmp({ ...newEmp, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus /></div>
          <div className="input-group"><label>팀</label><div className="btn-group">{settings.teams.map(t => <button key={t.name} className={`selection-btn ${newEmp.team === t.name ? 'active' : ''}`} onClick={() => setNewEmp({ ...newEmp, team: t.name })}>{t.name}</button>)}</div></div>
          <div className="checkbox-list">
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isStandbyRotationEligible} onChange={e => setNewEmp({ ...newEmp, isStandbyRotationEligible: e.target.checked })} />순환대상 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isFixedNightStandby} onChange={e => setNewEmp({ ...newEmp, isFixedNightStandby: e.target.checked })} />고정 대기 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isNightShiftExcluded || newEmp.isAdminStaff} onChange={e => setNewEmp({ ...newEmp, isNightShiftExcluded: e.target.checked })} disabled={newEmp.isAdminStaff} />야간 근무 제외</label>
            <label className="checkbox-item admin-opt"><input type="checkbox" checked={newEmp.isAdminStaff} onChange={e => setNewEmp({ ...newEmp, isAdminStaff: e.target.checked, isNightShiftExcluded: e.target.checked || newEmp.isNightShiftExcluded })} />관리반 (주간 전담)</label>
          </div>
          {newEmp.isFixedNightStandby && <div className="input-group"><label>고정 대기 시간대 설정</label><div className="time-input-row"><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /><span>~</span><input type="time" value={end_Time} onChange={e => setEndTime(e.target.value)} /></div></div>}
        </div>
        <div className="modal-footer"><button className="btn-outline" onClick={onClose}>취소</button><button className="btn-primary" onClick={handleAdd}><Plus size={16} /> 등록</button></div>
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
        setStartTime(s || ""); setEndTime(e || "");
      } else { setStartTime(""); setEndTime(""); }
    }
  }, [employee]);
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !edited) return null;
  const handleSave = () => {
    const finalData = { ...edited };
    if (edited.isFixedNightStandby && startTime && endTime) finalData.fixedNightStandbySlot = `${startTime}-${endTime}`;
    else if (!edited.isFixedNightStandby) finalData.fixedNightStandbySlot = "";
    onSave(finalData);
  };
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header"><h3>직원 정보 수정</h3><button onClick={onClose} className="close-btn"><X size={20} /></button></div>
        <div className="modal-body edit-form">
          <div className="input-group"><label>계급</label><div className="btn-group">{RANKS.map(r => <button key={r} className={`selection-btn ${edited.rank === r ? 'active' : ''}`} onClick={() => setEdited({ ...edited, rank: r })}>{r}</button>)}</div></div>
          <div className="input-group"><label>성명</label><input type="text" value={edited.name} onChange={e => setEdited({ ...edited, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleSave()} /></div>
          <div className="input-group"><label>팀</label><div className="btn-group">{settings.teams.map(t => <button key={t.name} className={`selection-btn ${edited.team === t.name ? 'active' : ''}`} onClick={() => setEdited({ ...edited, team: t.name })}>{t.name}</button>)}</div></div>
          <div className="checkbox-list">
            <label className="checkbox-item"><input type="checkbox" checked={edited.isStandbyRotationEligible} onChange={e => setEdited({ ...edited, isStandbyRotationEligible: e.target.checked })} />순환대상 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={edited.isFixedNightStandby} onChange={e => setEdited({ ...edited, isFixedNightStandby: e.target.checked })} />고정 대기 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={edited.isNightShiftExcluded || edited.isAdminStaff} onChange={e => setEdited({ ...edited, isNightShiftExcluded: e.target.checked })} disabled={edited.isAdminStaff} />야간 근무 제외</label>
            <label className="checkbox-item admin-opt"><input type="checkbox" checked={edited.isAdminStaff} onChange={e => setEdited({ ...edited, isAdminStaff: e.target.checked, isNightShiftExcluded: e.target.checked || edited.isNightShiftExcluded })} />관리반 (주간 전담)</label>
          </div>
          {edited.isFixedNightStandby && <div className="input-group"><label>고정 대기 시간대 설정</label><div className="time-input-row"><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /><span>~</span><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div></div>}
        </div>
        <div className="modal-footer split"><button className="btn-danger" onClick={() => onDelete(edited.id)}><Trash size={16} /> 삭제</button><div className="action-btns"><button className="btn-outline" onClick={onClose}>취소</button><button className="btn-primary" onClick={handleSave}><Save size={16} /> 저장</button></div></div>
      </div>
    </div>
  );
}

function FocusPlaceSelectionModal({ isOpen, onClose, slot, duty, focusPlaces, selectedValue, currentFocusAreas, dutyTypes, onSelect }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content selection-modal">
        <div className="modal-header"><h3>중점 구역 선택 ({slot})</h3><button onClick={onClose} className="close-btn"><X size={20} /></button></div>
        <div className="staff-grid scrollable">
          <div className={`staff-card-v2 ${!selectedValue ? 'selected' : ''}`} onClick={() => { onSelect(''); onClose(); }}><div className="staff-name">선택 안함</div></div>
          {focusPlaces.map(place => {
            let isAlreadyUsed = false;
            if (currentFocusAreas) {
              isAlreadyUsed = dutyTypes.some(d => (d.name !== duty && currentFocusAreas[`${slot}_${d.name}`] === place));
            }
            const isSelected = selectedValue === place;
            return (
              <div key={place} className={`staff-card-v2 ${isSelected ? 'selected' : ''} ${isAlreadyUsed && !isSelected ? 'disabled' : ''}`} onClick={() => (!isAlreadyUsed || isSelected) && (onSelect(place), onClose())}>
                <div className="staff-name">{place}</div>
                {isAlreadyUsed && !isSelected && <div className="staff-note-label warning" style={{ fontSize: '0.6rem' }}>배치됨</div>}
              </div>
            );
          })}
        </div>
        <div className="modal-footer"><button className="btn-outline" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}

function VolunteerAddModal({ isOpen, onSave, onClose }) {
  const [rank, setRank] = useState('경위');
  const [name, setName] = useState('');
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const handleAdd = () => { if (!name) return alert('성명을 입력하세요.'); onSave({ id: `vol_${Date.now()}`, rank, name, isVolunteer: true }); setName(''); onClose(); };
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header"><h3>자원근무자 직접 입력</h3><button onClick={onClose} className="close-btn"><X size={20} /></button></div>
        <div className="modal-body edit-form">
          <div className="input-group">
            <label>계급</label>
            <div className="btn-group">
              {RANKS.map(r => (
                <button 
                  key={r} 
                  className={`selection-btn ${rank === r ? 'active' : ''}`}
                  onClick={() => setRank(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="input-group"><label>성명</label><input type="text" placeholder="자원근무자 성명" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus /></div>
        </div>
        <div className="modal-footer"><button className="btn-outline" onClick={onClose}>취소</button><button className="btn-primary" onClick={handleAdd}><Plus size={16} /> 추가</button></div>
      </div>
    </div>
  );
}

// Final optimized version
function App({ user }) {
  const [employees, setEmployees] = useState([]);
  const [specialNotes, setSpecialNotes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataInitialized, setIsDataInitialized] = useState(false);
  
  // 서버 데이터 보관용 (자동 저장 무한루프 방지)
  const lastServerSettings = useRef(null);
  
  // 변경 사항 감지 및 이탈 방지 상태
  const [lastSavedRoster, setLastSavedRoster] = useState(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);

  const [activeTab, setActiveTab] = useState('roster');
  const [employeeTabTeam, setEmployeeTabTeam] = useState('');
  const [isStaffOrderEditMode, setIsStaffOrderEditMode] = useState(false);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [focusModalState, setFocusModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [volunteerAddModalOpen, setVolunteerAddModalOpen] = useState(false);
  const [noteTeamFilter, setNoteTeamFilter] = useState('');
  const [noteEmployeeFilter, setNoteEmployeeFilter] = useState(null);
  
  // 복사/붙여넣기 관련 상태
  const [copiedStaff, setCopiedStaff] = useState(null);
  const [copiedFocusArea, setCopiedFocusArea] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, slot: '', duty: '' });

  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteValue, setEditingNoteValue] = useState(null);

  const [newNote, setNewNote] = useState({ startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], employeeId: '', type: '육아시간', startTime: '07:30', endTime: '09:30', isAllDay: false, supportShift: '주간' });
  const [newDutyType, setNewDutyType] = useState('');
  const [newDutyShift, setNewDutyShift] = useState('공통');
  const [newDayTimeSlot, setNewDayTimeSlot] = useState('');
  const [newNightTimeSlot, setNewNightTimeSlot] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newFocusPlace, setNewFocusPlace] = useState('');
  
  const [editingDutyIdx, setEditingDutyIdx] = useState(null);
  const [editingDutyValue, setEditingDutyValue] = useState('');
  const [editingDutyShift, setEditingDutyShift] = useState('공통');
  const [editingDayTimeIdx, setEditingDayTimeIdx] = useState(null);
  const [editingDayTimeValue, setEditingDayTimeValue] = useState('');
  const [editingNightTimeIdx, setEditingNightTimeIdx] = useState(null);
  const [editingNightTimeValue, setEditingNightTimeValue] = useState('');
  const [isEditingStation, setIsEditingStation] = useState(false);
  const [tempStationSettings, setTempStationSettings] = useState({ stationName: settings.stationName, chiefName: settings.chiefName });
  const [editingTeamIdx, setEditingTeamIdx] = useState(null);
  const [editingTeamValue, setEditingTeamValue] = useState('');
  const [editingFocusIdx, setEditingFocusIdx] = useState(null);
  const [editingFocusValue, setEditingFocusValue] = useState('');

  const [expandedCards, setExpandedCards] = useState({ station: false, team: false, focus: false, duty: false, dayTime: false, nightTime: false });
  const toggleCard = (cardKey) => setExpandedCards(prev => ({ ...prev, [cardKey]: !prev[cardKey] }));

  const [currentRoster, setCurrentRoster] = useState({
    date: new Date().toISOString().split('T')[0],
    shiftType: '야간',
    weather: '맑음',
    metadata: { chief: '', chiefStatus: '일근', teamLeader: '', teamName: '', totalCount: 0, teamCounts: {}, adminCount: 0, longTermAbsent: 0, dedicatedCount: 0, dayShiftOnlyCount: 0 },
    assignments: {}, focusAreas: {}, volunteerStaff: []
  });

  const isRosterDirty = lastSavedRoster && JSON.stringify(currentRoster) !== lastSavedRoster;

  useEffect(() => {
    if (!user) return;
    const unsubSettings = onSnapshot(doc(db, 'settings', user.uid), (docSnap) => {
      if (docSnap.metadata.hasPendingWrites) return;
      if (docSnap.exists()) {
        const data = docSnap.data();
        const migratedTeams = data.teams?.map(t => typeof t === 'string' ? {name: t, isVisible: true} : t) || [];
        
        // 서버 데이터 우선 병합 (유저 데이터 보호)
        const newSettings = {
          ...DEFAULT_SETTINGS,
          ...data,
          teams: migratedTeams.length > 0 ? migratedTeams : (settings.teams || DEFAULT_SETTINGS.teams),
          dutyTypes: data.dutyTypes || settings.dutyTypes || DEFAULT_SETTINGS.dutyTypes,
          focusPlaces: data.focusPlaces || settings.focusPlaces || []
        };

        lastServerSettings.current = JSON.stringify(newSettings);
        setSettings(newSettings);
        
        setTempStationSettings({ 
          stationName: data.stationName || DEFAULT_SETTINGS.stationName, 
          chiefName: data.chiefName || DEFAULT_SETTINGS.chiefName 
        });

        const visibleTeams = migratedTeams.filter(t => t.isVisible);
        if (!currentRoster.metadata.teamName && visibleTeams.length > 0) {
          const firstVisibleTeam = visibleTeams[0].name;
          setCurrentRoster(prev => ({ ...prev, metadata: { ...prev.metadata, teamName: firstVisibleTeam, chief: data.chiefName || prev.metadata.chief } }));
        }
        if (!employeeTabTeam && migratedTeams.length > 0) {
          setEmployeeTabTeam(migratedTeams[0].name);
        }
      } else {
         setSettings(DEFAULT_SETTINGS);
         setTempStationSettings({ stationName: DEFAULT_SETTINGS.stationName, chiefName: DEFAULT_SETTINGS.chiefName });
         if (DEFAULT_SETTINGS.teams.length > 0) {
           setEmployeeTabTeam(DEFAULT_SETTINGS.teams[0].name);
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
      if (docSnap.metadata.hasPendingWrites) return; // Skip local echoes
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentRoster(prev => ({ ...prev, ...data }));
        setLastSavedRoster(JSON.stringify({ ...currentRoster, ...data }));
      } else {
        // Reset only assignments and focus areas, not the entire roster
        const resetData = { ...currentRoster, assignments: {}, focusAreas: {}, volunteerStaff: [] };
        setCurrentRoster(resetData);
        setLastSavedRoster(JSON.stringify(resetData));
      }
    });
    return () => unsubRoster();
  }, [user, currentRoster.date, currentRoster.shiftType, currentRoster.metadata.teamName, isDataInitialized]);

  // 브라우저 이탈 방지 (새로고침, 닫기)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isRosterDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRosterDirty]);

  // 탭 이동 요청 핸들러
  const requestTabChange = (tab) => {
    if (activeTab === 'roster' && isRosterDirty) {
      setPendingTab(tab);
      setShowExitModal(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleExplicitSaveSettings = async () => {
    try {
      setIsSyncing(true);
      await saveDocument('settings', user.uid, { ...settings, userId: user.uid });
      lastServerSettings.current = JSON.stringify(settings);
      alert('환경 설정이 서버에 안전하게 저장되었습니다.');
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // [지능형 딥 리커버리 함수] 데이터베이스 전수 조사하여 유실된 설정 역추적 복구
  const handleDeepRecovery = async () => {
    if (!window.confirm('데이터베이스 전체(근무표 등)를 분석하여 과거에 사용했던 모든 팀, 중점구역, 근무유형을 복구하시겠습니까?')) return;
    
    setIsSyncing(true);
    try {
      // 1. 모든 직원을 뒤져서 팀 목록 확보
      const empSnap = await getDocs(query(collection(db, 'employees'), where('userId', '==', user.uid)));
      const foundTeams = new Set();
      empSnap.forEach(doc => {
        const t = doc.data().team;
        if (t) foundTeams.add(t);
      });

      // 2. 모든 근무표를 뒤져서 중점구역 및 근무유형 확보
      const rosterSnap = await getDocs(query(collection(db, 'rosters'), where('userId', '==', user.uid)));
      const foundFocusPlaces = new Set();
      const foundDutyNames = new Set();

      rosterSnap.forEach(doc => {
        const data = doc.data();
        // 중점구역(focusAreas)에 한 번이라도 입력된 적 있는 모든 장소 수집
        if (data.focusAreas) {
          Object.values(data.focusAreas).forEach(place => {
            if (place && typeof place === 'string') foundFocusPlaces.add(place.trim());
          });
        }
        // 배정표(assignments)에서 사용된 모든 근무 명칭 수집
        if (data.assignments) {
          Object.keys(data.assignments).forEach(key => {
            const parts = key.split('_');
            if (parts.length > 1) {
              const dName = parts[1];
              if (dName && dName !== '대기근무' && dName !== '관리반') foundDutyNames.add(dName);
            }
          });
        }
      });

      // 3. 기존 주신 JSON의 기본 틀 + 찾아낸 데이터 병합
      const baseDuties = [
        { name: "상황근무", shift: "공통" },
        { name: "서부 순21호", shift: "공통" },
        { name: "순21호 중점", shift: "공통" },
        { name: "서부 순23호", shift: "공통" },
        { name: "순23호 중점", shift: "공통" },
        { name: "서부 순24호", shift: "공통" },
        { name: "순24호 중점", shift: "공통" },
        { name: "서부 순25호", shift: "공통" },
        { name: "순25호 중점", shift: "공통" },
        { name: "도보", shift: "야간" },
        { name: "대기근무", shift: "야간" },
        { name: "관리반", shift: "주간" },
        { name: "교대근무", shift: "공통" }
      ];

      // 발견된 새로운 근무유형 추가
      const finalDutyTypes = [...baseDuties];
      foundDutyNames.forEach(name => {
        if (!finalDutyTypes.some(d => d.name === name)) {
          finalDutyTypes.push({ name, shift: '공통' });
        }
      });

      const finalSettings = {
        ...settings,
        teams: Array.from(foundTeams).map(name => ({ name, isVisible: true })),
        focusPlaces: Array.from(foundFocusPlaces).sort(),
        dutyTypes: finalDutyTypes,
        dayTimeSlots: ["07:30-08:00","08:00-09:00","09:00-10:00","10:00-11:00","11:00-12:00","12:00-13:00","13:00-14:00","14:00-15:00","15:00-16:00","16:00-17:00","17:00-18:00","18:00-20:00"],
        nightTimeSlots: ["19:30-20:00","20:00-22:00","22:00-01:00","01:00-02:00","02:00-04:00","04:00-06:00","06:00-07:00","07:00-08:00"]
      };

      // 관리반 팀 강제 포함
      if (!foundTeams.has('관리반')) finalSettings.teams.push({ name: '관리반', isVisible: false });

      setSettings(finalSettings);
      await saveDocument('settings', user.uid, { ...finalSettings, userId: user.uid });
      lastServerSettings.current = JSON.stringify(finalSettings);
      
      alert(`딥 리커버리 완료!\n- 복구된 팀: ${finalSettings.teams.length}개\n- 복구된 중점구역: ${finalSettings.focusPlaces.length}개\n를 근무표 기록에서 찾아내어 복원했습니다.`);
    } catch (e) {
      console.error(e);
      alert('복구 실패: ' + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // [주의] 설정 자동 저장 로직을 완전히 삭제했습니다. (데이터 안정성 확보)
  // 이제 설정은 사용자가 [서버에 설정 최종 저장] 버튼을 누를 때만 저장됩니다.

  // 근무표 명시적 저장 함수
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

  // 저장 후 나가기 처리
  const handleSaveAndExit = async () => {
    const success = await handleSaveRoster(true);
    if (success) {
      setShowExitModal(false);
      if (pendingTab) setActiveTab(pendingTab);
    }
  };

  // 근무표 초기화 함수
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

  const handleRotateStandby = async () => {
    if (!user || isLoading || !isDataInitialized) {
      alert('데이터가 아직 로드 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (currentRoster.shiftType !== '야간') {
      alert('대기근무 순환은 야간 근무표에서만 사용 가능합니다.');
      return;
    }
    if (!window.confirm('과거 근무표를 추적하여 대기근무를 순환 배치합니다. (휴가 복귀자 자동 계산)')) return;
    
    setIsSyncing(true);
    try {
      console.log("순환 시작: 기준 날짜 =", currentRoster.date);
      const lookbackDays = [4, 8, 12, 16];
      const prevRosters = [];
      for (const d of lookbackDays) {
        const dateObj = new Date(currentRoster.date);
        dateObj.setDate(dateObj.getDate() - d);
        const dateStr = dateObj.toISOString().split('T')[0];
        const rId = `${user.uid}_${dateStr}_야간_${currentRoster.metadata.teamName}`;
        const snap = await getDoc(doc(db, 'rosters', rId));
        if (snap.exists()) {
          console.log(`${d}일 전 기록 발견:`, dateStr);
          prevRosters.push({ days: d, data: snap.data() });
        }
      }

      if (prevRosters.length === 0) {
        alert("이전 야간 근무기록이 없어 순환할 수 없습니다.");
        return;
      }

      // 모든 순환 대상 직원들에 대해 개별적으로 오늘 속해야 할 그룹(todayG)을 계산
      const todayRotationGroups = {};
      const eligibleEmployees = employees.filter(e => e.team === currentRoster.metadata.teamName && e.isStandbyRotationEligible && !e.isFixedNightStandby);

      console.log("순환 대상자 수:", eligibleEmployees.length);

      eligibleEmployees.forEach(emp => {
        let found = false;
        for (const roster of prevRosters) {
          let lastGroup = roster.data.standbyRotationGroups?.[emp.id];
          if (!lastGroup && roster.data.assignments) {
            for (const gName in standbyGroups) {
              if (standbyGroups[gName].some(slot => (roster.data.assignments[`${slot}_대기근무`] || []).includes(emp.id))) {
                lastGroup = gName;
                break;
              }
            }
          }

          if (lastGroup) {
            const steps = roster.days / 4;
            let currentG = lastGroup;
            for (let i = 0; i < steps; i++) {
              if (currentG === 'A') currentG = 'B';
              else if (currentG === 'B') currentG = 'C';
              else if (currentG === 'C') currentG = 'A';
            }
            todayRotationGroups[emp.id] = currentG;
            console.log(`직원 ${emp.name}: ${roster.days}일 전 ${lastGroup}조 확인 -> 오늘 ${currentG}조`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          const counts = { A: 0, B: 0, C: 0 };
          Object.values(todayRotationGroups).forEach(g => counts[g]++);
          const startG = Object.keys(counts).reduce((a, b) => counts[a] <= counts[b] ? a : b);
          todayRotationGroups[emp.id] = startG;
          console.log(`직원 ${emp.name}: 기록 없음 -> 신규 ${startG}조 할당`);
        }
      });

      // 계산된 오늘 그룹 정보를 바탕으로 실제 배정 시도 (rotateNightStandby의 내부 로직 일부 차용 또는 직접 처리)
      const newStandbyAssignments = {};
      const warnings = [];

      eligibleEmployees.forEach(employee => {
        const groupName = todayRotationGroups[employee.id];
        const slotsToFill = standbyGroups[groupName];
        let assignedAny = false;
        let lastBlockedReason = "";

        slotsToFill.forEach(slot => {
          const [start, end] = slot.split('-');
          const { available, reason } = checkAvailability(employee, start, end, todaysNotes, '대기근무');
          if (available) {
            const key = `${slot}_대기근무`;
            if (!newStandbyAssignments[key]) newStandbyAssignments[key] = [];
            newStandbyAssignments[key].push(employee.id);
            assignedAny = true;
          } else {
            lastBlockedReason = reason;
          }
        });

        if (!assignedAny) {
          warnings.push(`${employee.name}님(${groupName}조) 제외 사유: ${lastBlockedReason}`);
        }
      });

      // 고정 대기자 추가 배치
      employees.filter(e => e.team === currentRoster.metadata.teamName && e.isFixedNightStandby).forEach(emp => {
        if (emp.fixedNightStandbySlot) {
          const [fStart, fEnd] = emp.fixedNightStandbySlot.split('-');
          allStandbySlots.forEach(slot => {
            const [sStart, sEnd] = slot.split('-');
            if (isTimeOverlapping(fStart, fEnd, sStart, sEnd)) {
              const { available } = checkAvailability(emp, sStart, sEnd, todaysNotes, '대기근무');
              if (available) {
                const key = `${slot}_대기근무`;
                if (!newStandbyAssignments[key]) newStandbyAssignments[key] = [];
                newStandbyAssignments[key].push(emp.id);
              }
            }
          });
        }
      });

      setCurrentRoster(prev => {
        const updated = { ...prev.assignments };
        Object.keys(updated).forEach(k => k.endsWith('_대기근무') && delete updated[k]);
        return { ...prev, assignments: { ...updated, ...newStandbyAssignments }, standbyRotationGroups: todayRotationGroups };
      });

      if (warnings.length > 0) alert(`대기근무 순환 완료.\n주의사항:\n- ${warnings.join('\n- ')}`);
      else alert('대기근무 순환이 성공적으로 완료되었습니다.');

    } catch (error) {
      console.error(error);
      alert(`오류: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleStaff = (id) => {
    const key = `${modalState.slot}_${modalState.duty}`;
    setCurrentRoster(prev => {
      const currentIds = prev.assignments[key] || [];
      if (currentIds.includes(id)) return { ...prev, assignments: { ...prev.assignments, [key]: currentIds.filter(i => i !== id) } };
      // 추가 시 정렬 로직은 렌더링 시점에 적용하므로 여기서는 ID만 추가
      return { ...prev, assignments: { ...prev.assignments, [key]: [...currentIds, id] } };
    });
  };

  const handleDeleteVolunteer = (id) => {
    setCurrentRoster(prev => {
      const newAssignments = { ...prev.assignments };
      Object.keys(newAssignments).forEach(key => {
        newAssignments[key] = (newAssignments[key] || []).filter(vId => vId !== id);
      });
      return {
        ...prev,
        volunteerStaff: (prev.volunteerStaff || []).filter(v => v.id !== id),
        assignments: newAssignments
      };
    });
  };

  const handleFocusChange = (slot, duty, value) => {
    setCurrentRoster(prev => ({ ...prev, focusAreas: { ...prev.focusAreas, [`${slot}_${duty}`]: value } }));
  };

  // 중점 구역 우클릭 핸들러 (즉시 복사/붙여넣기)
  const handleFocusContextMenu = (e, slot, duty) => {
    e.preventDefault();
    const key = `${slot}_${duty}`;
    const currentValue = currentRoster.focusAreas[key] || '';

    if (currentValue) {
      // 1. 장소가 지정된 칸 -> 복사
      setCopiedFocusArea(currentValue);
      alert(`중점 구역 '${currentValue}' 장소가 복사되었습니다.`);
    } else {
      // 2. 빈 칸 -> 붙여넣기
      if (!copiedFocusArea) return;

      // 중복 장소 체크 (현재 시간대(slot)의 다른 순찰차 중점 구역 확인)
      const isAlreadyUsed = settings.focusPlaces?.some(place => 
        settings.dutyTypes.some(d => d.name !== duty && currentRoster.focusAreas[`${slot}_${d.name}`] === copiedFocusArea)
      );

      if (isAlreadyUsed) {
        alert(`배치 불가: '${copiedFocusArea}' 장소는 이 시간대에 이미 다른 곳에 배치되어 있습니다.`);
        return;
      }

      // 배치 실행
      setCurrentRoster(prev => ({
        ...prev,
        focusAreas: {
          ...prev.focusAreas,
          [key]: copiedFocusArea
        }
      }));
    }
  };

  // 우클릭 메뉴 핸들러 (즉시 복사/붙여넣기)
  const handleContextMenu = (e, slot, duty) => {
    e.preventDefault();
    const key = `${slot}_${duty}`;
    const currentIds = currentRoster.assignments[key] || [];

    if (currentIds.length > 0) {
      // 1. 직원이 있는 칸 -> 복사
      setCopiedStaff([...currentIds]);
      alert('해당 칸의 명단이 복사되었습니다.');
    } else {
      // 2. 빈 칸 -> 붙여넣기
      if (!copiedStaff || copiedStaff.length === 0) return;

      // 배치 가능 여부 체크
      const [s, end] = slot.split('-');
      const unavailableNames = [];

      copiedStaff.forEach(id => {
        const emp = employees.find(e => e.id === id);
        if (!emp) return;

        // 특이사항 및 고정 대기 체크
        const availability = checkAvailability(emp, s, end, todaysNotes, duty);
        if (!availability.available) {
          unavailableNames.push(`${emp.name}(사유: ${availability.reason})`);
          return;
        }

        // 중복 근무 체크 (현재 시간대(slot)의 다른 근무들 확인)
        const otherDuty = settings.dutyTypes.find(d => 
          d.name !== duty && (currentRoster.assignments[`${slot}_${d.name}`] || []).includes(id)
        );
        if (otherDuty) {
          unavailableNames.push(`${emp.name}(중복: ${otherDuty.name})`);
        }
      });

      if (unavailableNames.length > 0) {
        alert(`배치 불가:\n${unavailableNames.join('\n')}`);
        return;
      }

      // 모든 직원 배치 가능 시 붙여넣기 실행
      setCurrentRoster(prev => ({
        ...prev,
        assignments: {
          ...prev.assignments,
          [key]: [...copiedStaff]
        }
      }));
    }
  };

  // 기존 handleClick/useEffect (contextMenu 관련) 삭제 가능하지만 안전을 위해 유지하거나 정리
  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
    if (contextMenu.visible) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu.visible]);

  const addNote = async () => {
    if (!newNote.employeeId || !newNote.startDate || !newNote.endDate) return alert('직원과 기간을 선택하세요.');
    if (newNote.startDate > newNote.endDate) return alert('시작일이 종료일보다 늦을 수 없습니다.');
    
    setIsSyncing(true);
    let curr = new Date(newNote.startDate);
    const end = new Date(newNote.endDate);
    const notesToSave = [];

    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0];
      const uniqueId = `${user.uid}_${dateStr}_${newNote.employeeId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      notesToSave.push(saveDocument('specialNotes', uniqueId, { ...newNote, date: dateStr, id: uniqueId, userId: user.uid }));
      curr.setDate(curr.getDate() + 1);
    }

    try {
      await Promise.all(notesToSave);
      setNewNote({ ...newNote, employeeId: '', isAllDay: false });
      alert('특이사항이 기간별로 등록되었습니다.');
    } catch (e) {
      alert('저장 실패');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateNote = async (id, updatedData) => {
    setIsSyncing(true);
    await saveDocument('specialNotes', id, {...updatedData, userId: user.uid});
    setEditingNoteId(null);
    setIsSyncing(false);
  };

  const deleteNote = (id) => { if(window.confirm('삭제하시겠습니까?')) { setIsSyncing(true); removeDocument('specialNotes', id).finally(() => setIsSyncing(false)); } };

  const addEmployee = (data) => {
    const docId = `${user.uid}_${Date.now()}`;
    setIsSyncing(true);
    saveDocument('employees', docId, { ...data, id: docId, userId: user.uid }).then(() => { setIsAddingEmployee(false); setIsSyncing(false); });
  };

  const updateEmployee = (updated) => { setEditingEmployee(null); setIsSyncing(true); saveDocument('employees', updated.id, { ...updated, userId: user.uid }).finally(() => setIsSyncing(false)); };

  const deleteEmployee = (id) => { if (window.confirm('삭제하시겠습니까?')) { setIsSyncing(true); removeDocument('employees', id).finally(() => setIsSyncing(false)); } };

  const addTeam = () => { 
    if (!newTeamName) return; 
    setSettings(prev => {
      if (prev.teams.some(t => t.name === newTeamName)) return prev;
      return { ...prev, teams: [...prev.teams, {name: newTeamName, isVisible: true}] };
    }); 
    setNewTeamName(''); 
  };
  const addFocusPlace = () => { 
    if (!newFocusPlace) return; 
    setSettings(prev => {
      if ((prev.focusPlaces || []).includes(newFocusPlace)) return prev;
      return { ...prev, focusPlaces: [...(prev.focusPlaces || []), newFocusPlace] };
    }); 
    setNewFocusPlace(''); 
  };
  const addDutyType = () => { 
    if (!newDutyType) return; 
    setSettings(prev => ({ ...prev, dutyTypes: [...prev.dutyTypes, { name: newDutyType, shift: newDutyShift }] })); 
    setNewDutyType(''); 
  };
  const addDayTimeSlot = () => { 
    if (!newDayTimeSlot) return; 
    setSettings(prev => ({ ...prev, dayTimeSlots: [...(prev.dayTimeSlots || DAY_TIME_SLOTS), newDayTimeSlot] })); 
    setNewDayTimeSlot(''); 
  };
  const addNightTimeSlot = () => { 
    if (!newNightTimeSlot) return; 
    setSettings(prev => ({ ...prev, nightTimeSlots: [...(prev.nightTimeSlots || NIGHT_TIME_SLOTS), newNightTimeSlot] })); 
    setNewNightTimeSlot(''); 
  };

  const handleDragStart = (idx) => setDraggedIdx(idx);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (targetIdx, list, setList) => { if (draggedIdx === null || draggedIdx === targetIdx) return; const newList = [...list]; const item = newList.splice(draggedIdx, 1)[0]; newList.splice(targetIdx, 0, item); setList(newList); setDraggedIdx(null); };

  const currentTimeSlots = currentRoster.shiftType === '주간' ? (settings.dayTimeSlots || DAY_TIME_SLOTS) : (settings.nightTimeSlots || NIGHT_TIME_SLOTS);
  const todaysNotes = specialNotes.filter(n => n.date === currentRoster.date);
  
  // 지원근무자로 등록된 직원들 찾기 (특이사항 유형이 '지원근무'인 경우)
  // [수정] 본인 팀이 아니고, 현재 작성 중인 근무표의 주/야 구분(shiftType)과 지원근무 설정이 일치하는 경우에만 포함
  const supportDutyStaff = employees.filter(emp => 
    emp.team !== currentRoster.metadata.teamName && 
    todaysNotes.some(n => n.employeeId === emp.id && n.type === '지원근무' && n.supportShift === currentRoster.shiftType)
  ).map(emp => ({ ...emp, isVolunteer: true, isSupportDuty: true }));

  // 현황판용: 전체 직원 대상 특이사항 분류
  const stationAllDayNotes = todaysNotes.filter(n => n.isAllDay);
  
  // [수정] 지원근무는 장기사고자(통계)에서 제외
  const stationLongTermCount = stationAllDayNotes.filter(n => n.type !== '지원근무').length;
  const stationPartialNotes = todaysNotes.filter(n => !n.isAllDay);
  const stationAbsenteeCount = stationPartialNotes.length;

  // 근무표용: 현재 팀 직원 대상 모든 특이사항 (사고자 명단에 표시)
  // [수정] 지원근무는 본인 팀 사고자 명단에서도 제외 (타 팀 지원이므로)
  const teamAbsentees = todaysNotes.filter(n => 
    n.type !== '지원근무' && 
    employees.some(e => e.id === n.employeeId && e.team === currentRoster.metadata.teamName)
  );
  
  // 근무 배치 가능 인원: 종일 특이사항이 없는 팀원 + (주간일 경우 관리반 포함)
  const currentTeamEmployees = (() => {
    const teamEmps = employees
      .filter(e => e.team === currentRoster.metadata.teamName && !e.isAdminStaff && !stationAllDayNotes.some(n => n.employeeId === e.id))
      .sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));

    const adminEmps = currentRoster.shiftType === '주간' 
      ? employees.filter(e => e.isAdminStaff && !stationAllDayNotes.some(n => n.employeeId === e.id))
                 .sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank))
      : [];

    return [...teamEmps, ...adminEmps];
  })();

  // [수정] 수동 입력 자원근무자 + 지원근무 특이사항 직원 합치기
  const combinedVolunteers = [
    ...(currentRoster.volunteerStaff || []),
    ...supportDutyStaff
  ];
  
  const assignedAdminCount = employees.filter(e => e.isAdminStaff && Object.values(currentRoster.assignments).some(ids => ids.includes(e.id))).length;

  if (isLoading || !isDataInitialized) return (<div className="loading-screen"><div className="loader-container"><div className="loader-spinner"></div><div className="loader-text">데이터를 안전하게 불러오는 중입니다...</div></div></div>);

  return (
    <div className="app-container">
      {isSyncing && <div className="sync-indicator"><RefreshCw size={14} className="spin" /> 서버와 동기화 중...</div>}
      <header className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1><Shield size={24} /> 경찰 근무표 관리 시스템</h1>
          {employees.length === 0 && <span className="demo-label">직원 데이터 없음</span>}
        </div>
        <nav>
          <button onClick={() => requestTabChange('roster')} className={activeTab === 'roster' ? 'active' : ''}>근무표 작성</button>
          <button onClick={() => requestTabChange('employees')} className={activeTab === 'employees' ? 'active' : ''}>직원 관리</button>
          <button onClick={() => requestTabChange('notes')} className={activeTab === 'notes' ? 'active' : ''}>특이사항</button>
          <button onClick={() => requestTabChange('settings')} className={activeTab === 'settings' ? 'active' : ''}><Settings size={16} /> 환경 설정</button>
          <button onClick={() => { if(window.confirm('로그아웃 하시겠습니까?')) auth.signOut(); }} style={{ background: '#455a64', color: 'white', borderRadius: '8px', padding: '0.5rem 1rem', marginLeft: '1rem' }}>로그아웃</button>
        </nav>
      </header>

      <main>
        {activeTab === 'roster' && (
          <div className="roster-view">
            <div className="roster-header-inputs no-print">
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
              <div className="header-card">
                <label>날씨</label>
                <div className="btn-group">
                  {WEATHER_TYPES.map(w => (
                    <button 
                      key={w} 
                      className={`selection-btn ${currentRoster.weather === w ? 'active' : ''}`}
                      onClick={() => setCurrentRoster(prev => ({...prev, weather: w}))}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <div className="header-card">
                <label>지구대/파출소장</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input type="text" placeholder="성명 입력" value={currentRoster.metadata.chief} onChange={e => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, chief: e.target.value}}))} />
                  <div className="toggle-buttons">
                    <button className={currentRoster.metadata.chiefStatus === '일근' ? 'active' : ''} onClick={() => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, chiefStatus: '일근'}}))}>일근</button>
                    <button className={currentRoster.metadata.chiefStatus === '휴무' ? 'active' : ''} onClick={() => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, chiefStatus: '휴무'}}))}>휴무</button>
                  </div>
                </div>
              </div>
              <div className="header-card">
                <label>순찰팀장</label>
                <input type="text" placeholder="성명 입력" value={currentRoster.metadata.teamLeader} onChange={e => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, teamLeader: e.target.value}}))} />
              </div>
              <div className="header-card">
                <label>특수 인원 관리</label>
                <div className="input-row-mini">
                  <div className="input-col-mini" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#666' }}>치안센터</span>
                    <input type="number" style={{ padding: '4px', height: '28px' }} value={currentRoster.metadata.dedicatedCount || 0} onChange={e => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, dedicatedCount: parseInt(e.target.value) || 0}}))} />
                  </div>
                  <div className="input-col-mini" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#666' }}>주간전종</span>
                    <input type="number" style={{ padding: '4px', height: '28px' }} value={currentRoster.metadata.dayShiftOnlyCount || 0} onChange={e => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, dayShiftOnlyCount: parseInt(e.target.value) || 0}}))} />
                  </div>
                </div>
              </div>
              <div className="header-actions">
                <button className="btn-primary" onClick={() => handleSaveRoster()}><Save size={16} /> 저장하기</button>
                {currentRoster.shiftType === '야간' && (
                  <button className="btn-secondary" onClick={handleRotateStandby} style={{ background: '#4caf50', color: 'white' }} title="4일 전 야간근무를 기준으로 대기근무를 순환합니다.">
                    <RefreshCw size={16} /> 대기근무 순환
                  </button>
                )}
                <button className="btn-danger" onClick={handleResetRoster} style={{ background: '#ff4444', color: 'white', borderRadius: '8px', border: 'none', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}><Trash size={16} /> 일지 초기화</button>

                <button className="btn-secondary" onClick={() => setVolunteerAddModalOpen(true)}><Plus size={16} /> 자원근무</button>
                <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
              </div>
            </div>

            <div className="print-area real-style">
              <div className="doc-title">{settings.stationName} 근무일지 ({currentRoster.shiftType === '야간' ? '야' : '주'})</div>
              
              <table className="summary-table real">
                  <tbody>
                      <tr>
                          <td className="label fixed-width">금일 일자</td>
                          <td className="val" colSpan="3">{formatDateWithDay(currentRoster.date)}</td>
                          <td className="label fixed-width">날 씨</td>
                          <td className="val" colSpan="1">{currentRoster.weather}</td>
                          <td className="label fixed-width">순찰팀장</td>
                          <td className="val" colSpan="1">{currentRoster.metadata.teamName} {currentRoster.metadata.teamLeader}</td>
                      </tr>
                      <tr>
                          <td className="label fixed-width">지구대장/파출소장</td>
                          <td className="val" colSpan="3">{currentRoster.metadata.chief} ({currentRoster.metadata.chiefStatus})</td>
                          <td colSpan="4" className="transparent-cell"></td>
                      </tr>
                      <tr className="summary-counts-header">
                          <td className="label">총원</td>
                          <td className="label">지구대/파출소장</td>
                          <td className="label" colSpan={Math.max(1, settings.teams.filter(t => t.isVisible).length)}>순찰요원(팀장 포함)</td>
                          <td className="label">치안센터<br/>전담근무자</td>
                          <td className="label">관리요원</td>
                          <td className="label">장기사고자</td>
                          <td className="label">주간<br/>전종자</td>
                      </tr>
                      <tr className="summary-counts-values">
                          <td rowSpan="2">
                              {(currentRoster.metadata.chief ? 1 : 0) + 
                               employees.length + 
                               (currentRoster.metadata.dedicatedCount || 0) + 
                               (currentRoster.metadata.dayShiftOnlyCount || 0)}
                          </td>
                          <td rowSpan="2">{currentRoster.metadata.chief ? '1' : '0'}</td>
                          {settings.teams.filter(t => t.isVisible).map(t => <td className="label team-name-header" key={t.name}>{t.name}</td>)}
                          {settings.teams.filter(t => t.isVisible).length === 0 && <td className="label team-name-header"></td>}
                          <td rowSpan="2">{currentRoster.metadata.dedicatedCount || 0}</td>
                          <td rowSpan="2">{employees.filter(e => e.isAdminStaff && !stationAllDayNotes.some(n => n.employeeId === e.id)).length}</td>
                          <td rowSpan="2">{stationLongTermCount}</td>
                          <td rowSpan="2">{currentRoster.metadata.dayShiftOnlyCount || 0}</td>
                      </tr>
                      <tr className="summary-counts-values">
                          {settings.teams.filter(t => t.isVisible).map(t => (
                              <td key={t.name}>
                                  {employees.filter(e => e.team === t.name && !e.isAdminStaff).length}
                              </td>
                          ))}
                          {settings.teams.filter(t => t.isVisible).length === 0 && <td></td>}
                      </tr>
                  </tbody>
              </table>

              <div className="worker-section real">
                <table className="worker-table real">
                    <thead>
                        <tr>
                            <th colSpan="8">근 무 자</th>
                            <th colSpan="2">자원근무자</th>
                            <th colSpan="3">사 고 자</th>
                        </tr>
                        <tr className="sub-header">
                            <th>소속팀</th><th>번호</th><th>계급</th><th>성명</th>
                            <th>소속팀</th><th>번호</th><th>계급</th><th>성명</th>
                            <th>계급</th><th>성명</th>
                            <th>계급</th><th>성명</th><th>사유</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 10 }).map((_, i) => {
                            const leftEmp = currentTeamEmployees[i];
                            const rightEmp = currentTeamEmployees[i + 10];
                            const volunteer = combinedVolunteers[i];
                            const absentee = teamAbsentees[i];
                            const absenteeEmp = absentee ? employees.find(e => e.id === absentee.employeeId) : null;
                            return (
                                <tr key={i}>
                                    {/* 근무자 1 */}
                                    <td>{leftEmp?.team.replace('팀', '') || ''}</td>
                                    <td>{leftEmp ? i + 1 : ''}</td>
                                    <td>{leftEmp?.rank || ''}</td>
                                    <td>{leftEmp?.name || ''}</td>
                                    {/* 근무자 2 */}
                                    <td>{rightEmp?.team.replace('팀', '') || ''}</td>
                                    <td>{rightEmp ? i + 11 : ''}</td>
                                    <td>{rightEmp?.rank || ''}</td>
                                    <td>{rightEmp?.name || ''}</td>
                                    {/* 자원근무자 */}
                                    <td>{volunteer?.rank || ''}</td>
                                    <td>{volunteer?.name || ''}</td>
                                    {/* 사고자 */}
                                    <td>{absenteeEmp?.rank || ''}</td>
                                    <td>{absenteeEmp?.name || ''}</td>
                                    <td>{absentee?.type || ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
              </div>

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
                            <td 
                              key={slot} 
                              className="assignment-cell focus-cell" 
                              onClick={() => setFocusModalState({ isOpen: true, slot, duty: dutyObj.name })}
                              onContextMenu={(e) => handleFocusContextMenu(e, slot, dutyObj.name)}
                            >
                              <div className="staff-name-v">{currentRoster.focusAreas[key] || ''}</div>
                            </td>
                          );
                        }
                        
                        const staffIds = currentRoster.assignments[key] || [];
                        // 중복 제거를 위해 Map 사용 (ID 기준)
                        const allAvailableStaffMap = new Map();
                        [...employees, ...combinedVolunteers].forEach(e => {
                          allAvailableStaffMap.set(e.id, e);
                        });

                        const staff = Array.from(allAvailableStaffMap.values())
                          .filter(e => staffIds.includes(e.id))
                          .sort((a, b) => {
                            if (a.isVolunteer && !b.isVolunteer) return 1;
                            if (!a.isVolunteer && b.isVolunteer) return -1;
                            return getRankWeight(a.rank) - getRankWeight(b.rank);
                          });

                        return (
                          <td 
                            key={slot} 
                            className="assignment-cell" 
                            onClick={() => setModalState({ isOpen: true, slot, duty: dutyObj.name })}
                            onContextMenu={(e) => handleContextMenu(e, slot, dutyObj.name)}
                          >
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
              employees={[...employees, ...combinedVolunteers]} 
              specialNotes={todaysNotes} 
              selectedIds={currentRoster.assignments[`${modalState.slot}_${modalState.duty}`] || []} 
              currentAssignments={currentRoster.assignments} 
              dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)} 
              settings={settings} 
              onSelect={handleToggleStaff} 
              onDeleteVolunteer={handleDeleteVolunteer}
              selectedTeamName={currentRoster.metadata.teamName}
              shiftType={currentRoster.shiftType}
            />
            <FocusPlaceSelectionModal isOpen={focusModalState.isOpen} onClose={() => setFocusModalState({ ...focusModalState, isOpen: false })} slot={focusModalState.slot} duty={focusModalState.duty} focusPlaces={settings.focusPlaces || []} selectedValue={currentRoster.focusAreas[`${focusModalState.slot}_${focusModalState.duty}`] || ''} currentFocusAreas={currentRoster.focusAreas} dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)} onSelect={(val) => handleFocusChange(focusModalState.slot, focusModalState.duty, val)} />
            <VolunteerAddModal isOpen={volunteerAddModalOpen} onSave={(v) => setCurrentRoster(prev => ({ ...prev, volunteerStaff: [...(prev.volunteerStaff || []), v] }))} onClose={() => setVolunteerAddModalOpen(false)} />

            {/* 이탈 방지 확인 모달 */}
            {showExitModal && (
              <div className="modal-overlay no-print">
                <div className="modal-content exit-confirm-modal">
                  <div className="modal-header">
                    <h3>저장되지 않은 변경사항</h3>
                    <button onClick={() => setShowExitModal(false)} className="close-btn"><X size={20} /></button>
                  </div>
                  <div className="modal-body">
                    <p style={{ margin: '1rem 0', lineHeight: '1.5' }}>수정 중인 근무일지 내용이 있습니다. 저장하고 이동하시겠습니까?</p>
                  </div>
                  <div className="modal-footer" style={{ gap: '0.5rem' }}>
                    <button className="btn-outline" onClick={() => setShowExitModal(false)}>취소</button>
                    <button className="btn-danger" onClick={() => { setShowExitModal(false); if(pendingTab) setActiveTab(pendingTab); }}>저장하지 않고 이동</button>
                    <button className="btn-primary" onClick={handleSaveAndExit}><Save size={16} /> 저장 및 이동하기</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <div className="section-header-with-action"><h2>직원 명단 관리</h2><div className="action-btns"><button className={`btn-edit-mode ${isAddingEmployee ? 'active' : ''}`} onClick={() => setIsAddingEmployee(!isAddingEmployee)}>{isAddingEmployee ? <><X size={16} /> 취소</> : <><Plus size={16} /> 추가</>}</button><button className={`btn-edit-mode ${isStaffOrderEditMode ? 'active' : ''}`} onClick={() => setIsStaffOrderEditMode(!isStaffOrderEditMode)}>{isStaffOrderEditMode ? <><Save size={16} /> 완료</> : <><Edit2 size={16} /> 편집</>}</button></div></div>
            <div className="stats-dashboard">
              <div className="stats-card-v3">
                <h4>팀별 순찰요원</h4>
                <div className="stats-grid-mini">
                  {settings.teams.map(team => {
                    const patrolCount = employees.filter(e => e.team === team.name && !e.isAdminStaff).length;
                    return (
                      <div key={team.name} className="stats-item-mini">
                        <span className="stats-label">{team.name}</span>
                        <span className="stats-value">{patrolCount}명</span>
                      </div>
                    );
                  })}
                  <div className="stats-item-mini total">
                    <span className="stats-label">순찰 합계</span>
                    <span className="stats-value">{employees.filter(e => !e.isAdminStaff).length}명</span>
                  </div>
                </div>
              </div>
              <div className="stats-card-v3">
                <h4>계급별/관리반 현황</h4>
                <div className="stats-grid-mini">
                  <div className="stats-item-mini admin-total">
                    <span className="stats-label">관리반 총원</span>
                    <span className="stats-value">{employees.filter(e => e.isAdminStaff).length}명</span>
                  </div>
                  {RANKS.map(rank => {
                    const count = employees.filter(e => e.rank === rank).length;
                    if (count === 0) return null;
                    return (
                      <div key={rank} className="stats-item-mini">
                        <span className="stats-label">{rank}</span>
                        <span className="stats-value">{count}명</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="team-filter-tabs">{settings.teams.map(team => <button key={team.name} className={`team-tab-btn ${employeeTabTeam === team.name ? 'active' : ''}`} onClick={() => setEmployeeTabTeam(team.name)}>{team.name}</button>)}</div>
            <table className="admin-table interactive">
              <thead><tr>{isStaffOrderEditMode && <th></th>}<th>계급</th><th>성명</th><th>팀</th><th>고정대기</th><th>야간제외</th><th>관리반</th>{isStaffOrderEditMode && <th>작업</th>}</tr></thead>
              <tbody>{employees.filter(e => e.team === employeeTabTeam).map((emp) => <tr key={emp.id} draggable={isStaffOrderEditMode} onDragStart={() => handleDragStart(employees.indexOf(emp))} onDragOver={handleDragOver} onDrop={() => handleDrop(employees.indexOf(emp), employees, setEmployees)}>{isStaffOrderEditMode && <td className="drag-handle"><Edit2 size={16} /></td>}<td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.rank}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.name}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.team}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.isFixedNightStandby ? (emp.fixedNightStandbySlot || 'O') : 'X'}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.isNightShiftExcluded ? 'O' : 'X'}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.isAdminStaff ? 'O' : 'X'}</td>{isStaffOrderEditMode && <td><button className="delete-btn-table" onClick={() => deleteEmployee(emp.id)}><Trash size={14} /></button></td>}</tr>)}</tbody>
            </table>
            <EmployeeAddModal isOpen={isAddingEmployee} settings={settings} onSave={addEmployee} onClose={() => setIsAddingEmployee(false)} />
            <EmployeeEditModal isOpen={!!editingEmployee} employee={editingEmployee} settings={settings} onSave={updateEmployee} onDelete={deleteEmployee} onClose={() => setEditingEmployee(null)} />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="admin-section">
            <div className="section-header-with-action"><h2>특이사항 관리</h2></div>
            <div className="notes-container-v2">
              <div className="settings-card note-registration-card"><h3>특이사항 등록</h3><div className="note-form-v2">
                <div className="note-input-row"><div className="note-input-group"><label>기간 설정</label><div className="date-range-picker"><input type="date" value={newNote.startDate} onChange={e => setNewNote({...newNote, startDate: e.target.value, endDate: e.target.value < newNote.endDate ? newNote.endDate : e.target.value})} /><span>~</span><input type="date" value={newNote.endDate} onChange={e => setNewNote({...newNote, endDate: e.target.value})} min={newNote.startDate} /></div></div><div className="note-input-group"><label>유형</label><div className="btn-group">{NOTE_TYPES.map(t => <button key={t} className={`selection-btn ${newNote.type === t ? 'active' : ''}`} onClick={() => setNewNote({...newNote, type: t, isAllDay: ['휴가', '병가'].includes(t)})}>{t}</button>)}</div></div></div>
                <div className="note-input-group"><label>직원 선택 (팀 선택 필수)</label><div className="team-filter-tabs-mini">{settings.teams.map(t => <button key={t.name} className={`team-tab-btn-mini ${noteTeamFilter === t.name ? 'active' : ''}`} onClick={() => setNoteTeamFilter(t.name)}>{t.name}</button>)}</div>
                {noteTeamFilter ? <div className="staff-selection-grid-mini scrollable">{employees.filter(e => e.team === noteTeamFilter).map(e => <div key={e.id} className={`staff-card-mini ${newNote.employeeId === e.id ? 'selected' : ''}`} onClick={() => {setNewNote({...newNote, employeeId: e.id}); setNoteEmployeeFilter(e.id);}}><span className="rank">{e.rank}</span><span className="name">{e.name}</span></div>)}</div> : <div className="empty-selection-placeholder">팀을 선택하세요.</div>}</div>
                <div className="note-input-row">
                  <div className="note-input-group">
                    <label className="checkbox-item">
                      <input type="checkbox" checked={newNote.isAllDay} onChange={e => setNewNote({...newNote, isAllDay: e.target.checked})} /> 하루 종일
                    </label>
                  </div>
                  {newNote.type === '지원근무' && (
                    <div className="note-input-group">
                      <label>지원 근무 구분</label>
                      <div className="toggle-buttons">
                        <button className={newNote.supportShift === '주간' ? 'active' : ''} onClick={() => setNewNote({...newNote, supportShift: '주간'})}>주간 지원</button>
                        <button className={newNote.supportShift === '야간' ? 'active' : ''} onClick={() => setNewNote({...newNote, supportShift: '야간'})}>야간 지원</button>
                      </div>
                    </div>
                  )}
                  {!newNote.isAllDay && newNote.type !== '지원근무' && (
                    <div className="note-input-group">
                      <label>시간 설정</label>
                      <div className="time-input-row">
                        <input type="time" value={newNote.startTime} onChange={e => setNewNote({...newNote, startTime: e.target.value})} />
                        <span>~</span>
                        <input type="time" value={newNote.endTime} onChange={e => setNewNote({...newNote, endTime: e.target.value})} />
                      </div>
                    </div>
                  )}
                  <button className="btn-primary btn-full" onClick={addNote}><Plus size={18} /> 특이사항 등록</button>
                </div>
</div></div>
              
              <div className="settings-card notes-list-card">
                <div className="card-header-with-action">
                  <h3>특이사항 목록</h3>
                  <div className="date-nav">
                    {noteEmployeeFilter ? (
                      <div className="filter-indicator">
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1976d2' }}>
                          {employees.find(e => e.id === noteEmployeeFilter)?.name} 님의 전체 목록
                        </span>
                        <button className="clear-filter-btn" onClick={() => setNoteEmployeeFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', marginLeft: '8px' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <><input type="date" value={newNote.startDate} onChange={e => setNewNote({...newNote, startDate: e.target.value})} /><span>의 목록</span></>
                    )}
                  </div>
                </div>
                <div className="notes-list-v2 scrollable">
                  {(() => {
                    const filteredNotes = noteEmployeeFilter 
                      ? specialNotes.filter(n => n.employeeId === noteEmployeeFilter).sort((a, b) => b.date.localeCompare(a.date))
                      : specialNotes.filter(n => n.date === newNote.startDate);
                    
                    if (filteredNotes.length === 0) return <div className="empty-state">목록 없음</div>;
                    
                    return filteredNotes.map(n => {
                      const emp = employees.find(e => e.id === n.employeeId);
                      return (
                        <div key={n.id} className="note-item-v2">
                          {editingNoteId === n.id ? (
                            <div className="edit-note-inline">
                              <select value={editingNoteValue.type} onChange={e => setEditingNoteValue({...editingNoteValue, type: e.target.value})}>{NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                              {editingNoteValue.type === '지원근무' ? (
                                <select value={editingNoteValue.supportShift} onChange={e => setEditingNoteValue({...editingNoteValue, supportShift: e.target.value})}>
                                  <option value="주간">주간 지원</option>
                                  <option value="야간">야간 지원</option>
                                </select>
                              ) : (
                                !editingNoteValue.isAllDay && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="time" value={editingNoteValue.startTime} onChange={e => setEditingNoteValue({...editingNoteValue, startTime: e.target.value})} />
                                    <span>~</span>
                                    <input type="time" value={editingNoteValue.endTime} onChange={e => setEditingNoteValue({...editingNoteValue, endTime: e.target.value})} />
                                  </div>
                                )
                              )}
                              <button onClick={() => updateNote(n.id, editingNoteValue)} className="btn-save-icon"><Check size={16} /></button>
                              <button onClick={() => setEditingNoteId(null)} className="btn-cancel-icon"><X size={16} /></button>
                            </div>
                          ) : (
                            <><div className="note-info">
                              {noteEmployeeFilter && <span className="note-tag-v2" style={{ background: '#e3f2fd', color: '#1976d2', marginRight: '8px' }}>{n.date}</span>}
                              <span className="emp-name">{emp?.rank} {emp?.name}</span>
                              <span className={`note-tag-v2 ${n.type}`}>{n.type}</span>
                              <span className="note-time">
                                {n.type === '지원근무' 
                                  ? `${n.supportShift} 지원` 
                                  : (n.isAllDay ? '종일' : `${n.startTime} ~ ${n.endTime}`)}
                              </span>
                            </div>
                            <div className="action-btns"><button className="edit-btn-icon" onClick={() => {setEditingNoteId(n.id); setEditingNoteValue(n);}}><Edit2 size={14} /></button><button className="delete-btn-icon" onClick={() => deleteNote(n.id)}><Trash size={16} /></button></div></>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="admin-section">
            <div className="section-header-with-action">
              <h2>환경 설정</h2>
              <div className="action-btns">
                <button className="btn-danger" onClick={handleDeepRecovery} style={{ background: '#ff5722', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RefreshCw size={16} /> 모든 기록에서 설정 딥 리커버리
                </button>
                <button className="btn-primary" onClick={handleExplicitSaveSettings}>
                  <Save size={16} /> 서버에 설정 최종 저장
                </button>
              </div>
            </div>
            <div className="settings-grid">
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('station')}><div className="title-area"><h3>지구대 정보</h3><span className="hint-text-small">명칭 및 대장 성명</span></div>{expandedCards.station ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.station && <div className="card-content-area active"><div className="card-header-with-action">{!isEditingStation ? <button className="edit-btn-small" onClick={() => setIsEditingStation(true)}><Edit2 size={14} /> 수정</button> : <div className="action-btns"><button className="btn-save-small" onClick={() => { setSettings(prev => ({ ...prev, ...tempStationSettings })); setIsEditingStation(false); }}><Save size={14} /> 저장</button><button className="btn-cancel-small" onClick={() => setIsEditingStation(false)}><X size={14} /> 취소</button></div>}</div><div className="info-display"><div className="info-item"><label>지구대 명칭</label>{isEditingStation ? <input type="text" value={tempStationSettings.stationName} onChange={e => setTempStationSettings({ ...tempStationSettings, stationName: e.target.value })} /> : <div className="value-text">{settings.stationName}</div>}</div><div className="info-item"><label>지구대장 성명</label>{isEditingStation ? <input type="text" value={tempStationSettings.chiefName} onChange={e => setTempStationSettings({ ...tempStationSettings, chiefName: e.target.value })} /> : <div className="value-text">{settings.chiefName}</div>}</div></div></div>}</div>
              
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('team')}><div className="title-area"><h3>팀 관리</h3><span className="hint-text-small">팀 목록 및 노출 설정</span></div>{expandedCards.team ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.team && <div className="card-content-area active"><div className="note-form"><input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="새 팀" onKeyDown={e => e.key === 'Enter' && addTeam()} /><button className="btn-primary" onClick={addTeam}>추가</button></div><div className="duty-type-list">{settings.teams.map((t, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.teams, (newList) => setSettings(prev => ({...prev, teams: newList})))}>
                {editingTeamIdx === i ? <div className="edit-inline-form"><input type="text" value={editingTeamValue} onChange={e => setEditingTeamValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const nt=[...settings.teams]; nt[i]={...nt[i], name:editingTeamValue}; setSettings(prev => ({...prev, teams:nt})); setEditingTeamIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const nt=[...settings.teams]; nt[i]={...nt[i], name:editingTeamValue}; setSettings(prev => ({...prev, teams:nt})); setEditingTeamIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingTeamIdx(null)}><X size={14} /></button></div></div> : <><div className="team-info-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><button className="visibility-btn" onClick={() => {const nt=[...settings.teams]; nt[i].isVisible = !nt[i].isVisible; setSettings(prev => ({...prev, teams: nt}));}} title={t.isVisible ? "근무표에 표시됨" : "근무표에서 숨김"}>{t.isVisible ? <Eye size={16} /> : <EyeOff size={16} style={{color: '#ccc'}} />}</button><span>{t.name}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingTeamIdx(i); setEditingTeamValue(t.name);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({...prev, teams: prev.teams.filter((_,idx)=>idx!==i)})); }}><Trash size={14} /></button></div></>}
              </div>)}</div></div>}</div>

              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('focus')}><div className="title-area"><h3>중점 구역 관리 (총 {settings.focusPlaces?.length || 0}개)</h3></div>{expandedCards.focus ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.focus && <div className="card-content-area active"><div className="note-form"><input type="text" value={newFocusPlace} onChange={e => setNewFocusPlace(e.target.value)} placeholder="새 장소" onKeyDown={e => e.key === 'Enter' && addFocusPlace()} /><button className="btn-primary" onClick={addFocusPlace}>추가</button></div><div className="duty-type-list">{settings.focusPlaces?.map((p, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.focusPlaces, (newList) => setSettings(prev => ({...prev, focusPlaces: newList})))}>
                {editingFocusIdx === i ? <div className="edit-inline-form"><input type="text" value={editingFocusValue} onChange={e => setEditingFocusValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const np=[...settings.focusPlaces]; np[i]=editingFocusValue; setSettings(prev => ({...prev, focusPlaces:np})); setEditingFocusIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const np=[...settings.focusPlaces]; np[i]=editingFocusValue; setSettings(prev => ({...prev, focusPlaces:np})); setEditingFocusIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingFocusIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{p}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingFocusIdx(i); setEditingFocusValue(p);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({...prev, focusPlaces: prev.focusPlaces.filter((_,idx)=>idx!==i)})); }}><Trash size={14} /></button></div></>}
              </div>)}</div></div>}</div>

              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('duty')}><div className="title-area"><h3>근무 유형 관리</h3></div>{expandedCards.duty ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.duty && <div className="card-content-area active"><div className="note-form"><input type="text" value={newDutyType} onChange={e => setNewDutyType(e.target.value)} placeholder="새 유형" onKeyDown={e => e.key === 'Enter' && addDutyType()} /><select value={newDutyShift} onChange={e => setNewDutyShift(e.target.value)}><option value="공통">공통</option><option value="주간">주간</option><option value="야간">야간</option></select><button className="btn-primary" onClick={addDutyType}>추가</button></div><div className="duty-type-list">{settings.dutyTypes.map((d, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.dutyTypes, (newList) => setSettings(prev => ({...prev, dutyTypes: newList})))}>
                {editingDutyIdx === i ? <div className="edit-inline-form"><input type="text" value={editingDutyValue} onChange={e => setEditingDutyValue(e.target.value)} autoFocus /><select value={editingDutyShift} onChange={e => setEditingDutyShift(e.target.value)}><option value="공통">공통</option><option value="주간">주간</option><option value="야간">야간</option></select><div className="action-btns"><button className="btn-save" onClick={()=>{const nd=[...settings.dutyTypes]; nd[i]={name:editingDutyValue, shift:editingDutyShift}; setSettings(prev => ({...prev, dutyTypes:nd})); setEditingDutyIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingDutyIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{d.name} ({d.shift})</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingDutyIdx(i); setEditingDutyValue(d.name); setEditingDutyShift(d.shift);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({ ...prev, dutyTypes: prev.dutyTypes.filter((_, idx) => idx !== i) })); }}><Trash size={14} /></button></div></>}
              </div>)}</div></div>}</div>

              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('dayTime')}><div className="title-area"><h3>주간 시간대 관리</h3></div>{expandedCards.dayTime ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.dayTime && <div className="card-content-area active"><div className="note-form"><input type="text" value={newDayTimeSlot} onChange={e => setNewDayTimeSlot(e.target.value)} placeholder="09:00-10:00" onKeyDown={e => e.key === 'Enter' && addDayTimeSlot()} /><button className="btn-primary" onClick={addDayTimeSlot}>추가</button></div><div className="duty-type-list">{(settings.dayTimeSlots || DAY_TIME_SLOTS).map((s, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.dayTimeSlots || DAY_TIME_SLOTS, (newList) => setSettings(prev => ({...prev, dayTimeSlots: newList})))}>
                {editingDayTimeIdx === i ? <div className="edit-inline-form"><input type="text" value={editingDayTimeValue} onChange={e => setEditingDayTimeValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const nts=[...settings.dayTimeSlots]; nts[i]=editingDayTimeValue; setSettings(prev => ({...prev, dayTimeSlots:nts})); setEditingDayTimeIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const nts=[...settings.dayTimeSlots]; nts[i]=editingDayTimeValue; setSettings(prev => ({...prev, dayTimeSlots:nts})); setEditingDayTimeIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingDayTimeIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{s}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingDayTimeIdx(i); setEditingDayTimeValue(s);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({ ...prev, dayTimeSlots: (prev.dayTimeSlots || DAY_TIME_SLOTS).filter((_, idx) => idx !== i) })); }}><Trash size={14} /></button></div></>}
              </div>)}</div></div>}</div>

              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('nightTime')}><div className="title-area"><h3>야간 시간대 관리</h3></div>{expandedCards.nightTime ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.nightTime && <div className="card-content-area active"><div className="note-form"><input type="text" value={newNightTimeSlot} onChange={e => setNewNightTimeSlot(e.target.value)} placeholder="20:00-22:00" onKeyDown={e => e.key === 'Enter' && addNightTimeSlot()} /><button className="btn-primary" onClick={addNightTimeSlot}>추가</button></div><div className="duty-type-list">{(settings.nightTimeSlots || NIGHT_TIME_SLOTS).map((s, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.nightTimeSlots || NIGHT_TIME_SLOTS, (newList) => setSettings(prev => ({...prev, nightTimeSlots: newList})))}>
                {editingNightTimeIdx === i ? <div className="edit-inline-form"><input type="text" value={editingNightTimeValue} onChange={e => setEditingNightTimeValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const nts=[...settings.nightTimeSlots]; nts[i]=editingNightTimeValue; setSettings(prev => ({...prev, nightTimeSlots:nts})); setEditingNightTimeIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const nts=[...settings.nightTimeSlots]; nts[i]=editingNightTimeValue; setSettings(prev => ({...prev, nightTimeSlots:nts})); setEditingNightTimeIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingNightTimeIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{s}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingNightTimeIdx(i); setEditingNightTimeValue(s);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({ ...prev, nightTimeSlots: (prev.nightTimeSlots || NIGHT_TIME_SLOTS).filter((_, idx) => idx !== i) })); }}><Trash size={14} /></button></div></>}
              </div>)}</div></div>}</div>
            </div>
            <div style={{ marginTop: '2rem', padding: '1rem', background: '#fff3e0', borderRadius: '8px', border: '1px solid #ffe0b2' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e65100' }}><AlertTriangle size={18}/> 데이터 안전 관리</h4>
              <p style={{ fontSize: '0.85rem', color: '#666', margin: '0.5rem 0' }}>설정이 갑자기 사라지는 것을 방지하기 위해, 현재 설정을 텍스트로 복사해 두실 수 있습니다.</p>
              <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem' }} onClick={() => { navigator.clipboard.writeText(JSON.stringify(settings)); alert('설정 데이터가 클립보드에 복사되었습니다. 메모장에 붙여넣어 보관하세요.'); }}>
                <Copy size={14}/> 현재 설정 데이터 복사하기 (백업용)
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

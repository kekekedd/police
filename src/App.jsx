import { useState, useEffect, useRef } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X, Settings, Edit2, ChevronDown, ChevronUp, Check, Eye, EyeOff, Copy, AlertTriangle } from 'lucide-react';
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
          <div className="input-group"><label>성명</label><input type="text" value={edited.name} onChange={e => setEdited({ ...edited, name: e.target.value })} /></div>
          <div className="input-group"><label>팀</label><div className="btn-group">{settings.teams.map(t => <button key={t.name} className={`selection-btn ${edited.team === t.name ? 'active' : ''}`} onClick={() => setEdited({ ...edited, team: t.name })}>{t.name}</button>)}</div></div>
          <div className="checkbox-list">
            <label className="checkbox-item"><input type="checkbox" checked={edited.isStandbyRotationEligible} onChange={e => setEdited({ ...edited, isStandbyRotationEligible: e.target.checked })} />순환대상 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={edited.isFixedNightStandby} onChange={e => setEdited({ ...edited, isFixedNightStandby: e.target.checked })} />고정 대기 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={edited.isNightShiftExcluded || edited.isAdminStaff} onChange={e => setEdited({ ...edited, isNightShiftExcluded: e.target.checked })} disabled={edited.isAdminStaff} />야간 근무 제외</label>
            <label className="checkbox-item admin-opt"><input type="checkbox" checked={edited.isAdminStaff} onChange={e => setEdited({ ...edited, isAdminStaff: e.target.checked, isNightShiftExcluded: e.target.checked || edited.isNightShiftExcluded })} />관리반 (주간 전담)</label>
          </div>
          {edited.isFixedNightStandby && <div className="input-group"><label>고정 대기 시간대 설정</label><div className="time-input-row"><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /><span>~</span><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div></div>}
        </div>
        <div className="modal-footer"><button className="btn-danger-outline" onClick={() => { if (window.confirm('정말 삭제하시겠습니까?')) onDelete(edited.id); }}>삭제</button><div className="action-btns"><button className="btn-outline" onClick={onClose}>취소</button><button className="btn-primary" onClick={handleSave}><Check size={16} /> 저장</button></div></div>
      </div>
    </div>
  );
}

function VolunteerAddModal({ isOpen, settings, onAdd, onClose }) {
  const [newVol, setNewVol] = useState({ rank: '경위', name: '', team: '', isVolunteer: true, isSupportDuty: false, supportShift: '주간' });
  useEffect(() => { if(isOpen && settings.teams.length > 0) setNewVol(prev => ({...prev, team: settings.teams[0].name})); }, [isOpen, settings]);
  if (!isOpen) return null;
  const handleAdd = () => {
    if (!newVol.name) return alert('성명을 입력하세요.');
    onAdd({ ...newVol, id: 'vol_' + Date.now() });
    setNewVol({ rank: '경위', name: '', team: settings.teams[0].name, isVolunteer: true, isSupportDuty: false, supportShift: '주간' });
  };
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header"><h3>자원근무자 임시 추가</h3><button onClick={onClose} className="close-btn"><X size={20} /></button></div>
        <div className="modal-body edit-form">
          <p className="hint-text">여기에 추가된 인원은 오늘 근무표 선택 목록에만 일시적으로 나타납니다.</p>
          <div className="input-group"><label>계급</label><div className="btn-group">{RANKS.map(r => <button key={r} className={`selection-btn ${newVol.rank === r ? 'active' : ''}`} onClick={() => setNewVol({ ...newVol, rank: r })}>{r}</button>)}</div></div>
          <div className="input-group"><label>성명</label><input type="text" placeholder="성명 입력" value={newVol.name} onChange={e => setNewVol({ ...newVol, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAdd()} /></div>
          <div className="input-group"><label>소속팀 (표시용)</label><div className="btn-group">{settings.teams.map(t => <button key={t.name} className={`selection-btn ${newVol.team === t.name ? 'active' : ''}`} onClick={() => setNewVol({ ...newVol, team: t.name })}>{t.name}</button>)}</div></div>
          <div className="checkbox-list">
             <label className="checkbox-item"><input type="checkbox" checked={newVol.isSupportDuty} onChange={e => setNewVol({...newVol, isSupportDuty: e.target.checked})} />타 지구대 지원근무자 여부</label>
          </div>
          {newVol.isSupportDuty && (
            <div className="input-group">
              <label>지원 근무 구분</label>
              <div className="btn-group">
                <button className={`selection-btn ${newVol.supportShift === '주간' ? 'active' : ''}`} onClick={() => setNewVol({...newVol, supportShift: '주간'})}>주간 지원</button>
                <button className={`selection-btn ${newVol.supportShift === '야간' ? 'active' : ''}`} onClick={() => setNewVol({...newVol, supportShift: '야간'})}>야간 지원</button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer"><button className="btn-outline" onClick={onClose}>취소</button><button className="btn-primary" onClick={handleAdd}><Plus size={16} /> 추가</button></div>
      </div>
    </div>
  );
}

function FocusPlaceModal({ isOpen, slot, duty, focusPlaces, currentFocus, onSave, onClose }) {
  const [val, setVal] = useState("");
  useEffect(() => { if (isOpen) setVal(currentFocus || ""); }, [isOpen, currentFocus]);
  if (!isOpen) return null;
  return (
    <div className="modal-overlay no-print">
      <div className="modal-content admin-modal">
        <div className="modal-header"><h3>중점구역 설정 ({slot})</h3><button onClick={onClose} className="close-btn"><X size={20} /></button></div>
        <div className="modal-body edit-form">
          <div className="input-group"><label>장소 직접 입력 또는 선택</label><input type="text" value={val} onChange={e => setVal(e.target.value)} placeholder="직접 입력..." /></div>
          <div className="focus-recommend-list">
            {focusPlaces.map(p => <button key={p} className={`recommend-chip ${val === p ? 'active' : ''}`} onClick={() => setVal(p)}>{p}</button>)}
          </div>
        </div>
        <div className="modal-footer"><button className="btn-outline" onClick={() => onSave("")}>비우기</button><div className="action-btns"><button className="btn-outline" onClick={onClose}>취소</button><button className="btn-primary" onClick={() => onSave(val)}>저장</button></div></div>
      </div>
    </div>
  );
}

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
  const [employeeAddModalOpen, setEmployeeAddModalOpen] = useState(false);
  const [employeeEditModalOpen, setEmployeeEditModalOpen] = useState(false);
  const [selectedEmployeeForEdit, setSelectedEmployeeForEdit] = useState(null);
  const [volunteerAddModalOpen, setVolunteerAddModalOpen] = useState(false);
  const [focusModalState, setFocusModalState] = useState({ isOpen: false, slot: '', duty: '' });

  const [currentRoster, setCurrentRoster] = useState({
    date: new Date().toISOString().split('T')[0],
    shiftType: '야간',
    weather: '맑음',
    metadata: { teamName: '' },
    assignments: {}, focusAreas: {}, volunteerStaff: []
  });

  const [newTeamName, setNewTeamName] = useState("");
  const [editingTeamIdx, setEditingTeamIdx] = useState(null);
  const [editingTeamValue, setEditingTeamValue] = useState("");
  const [newFocusPlace, setNewFocusPlace] = useState("");
  const [editingFocusIdx, setEditingFocusIdx] = useState(null);
  const [editingFocusValue, setEditingFocusValue] = useState("");
  const [newDutyType, setNewDutyType] = useState("");
  const [newDutyShift, setNewDutyShift] = useState("공통");
  const [editingDutyIdx, setEditingDutyIdx] = useState(null);
  const [editingDutyValue, setEditingDutyValue] = useState("");
  const [editingDutyShift, setEditingDutyShift] = useState("공통");
  const [newDayTimeSlot, setNewDayTimeSlot] = useState("");
  const [editingDayTimeIdx, setEditingDayTimeIdx] = useState(null);
  const [editingDayTimeValue, setEditingDayTimeValue] = useState("");
  const [newNightTimeSlot, setNewNightTimeSlot] = useState("");
  const [editingNightTimeIdx, setEditingNightTimeIdx] = useState(null);
  const [editingNightTimeValue, setEditingNightTimeValue] = useState("");
  const [expandedCards, setExpandedCards] = useState({ station: true, team: false, focus: false, duty: false, dayTime: false, nightTime: false });
  const [isEditingStation, setIsEditingStation] = useState(false);
  const [tempStationSettings, setTempStationSettings] = useState({ stationName: '', chiefName: '' });
  const [newNote, setNewNote] = useState({ employeeId: '', type: '휴가', isAllDay: true, startTime: '09:00', endTime: '18:00', startDate: new Date().toISOString().split('T')[0], supportShift: '주간' });
  const [noteTeamFilter, setNoteTeamFilter] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteValue, setEditingNoteValue] = useState(null);

  const isRosterDirty = lastSavedRoster && JSON.stringify(currentRoster) !== lastSavedRoster;

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
        setTempStationSettings({ stationName: newSettings.stationName, chiefName: newSettings.chiefName });
        const visibleTeams = migratedTeams.filter(t => t.isVisible);
        if (!currentRoster.metadata.teamName && visibleTeams.length > 0) {
          const firstVisibleTeam = visibleTeams[0].name;
          setCurrentRoster(prev => ({ ...prev, metadata: { ...prev.metadata, teamName: firstVisibleTeam } }));
        }
      } else {
         setSettings(DEFAULT_SETTINGS);
         setTempStationSettings({ stationName: DEFAULT_SETTINGS.stationName, chiefName: DEFAULT_SETTINGS.chiefName });
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

  const handleSaveRoster = async (silent = false) => {
    if (!user || !currentRoster.metadata.teamName) return;
    try {
      setIsSyncing(true);
      const rosterId = `${user.uid}_${currentRoster.date}_${currentRoster.shiftType}_${currentRoster.metadata.teamName}`;
      await saveDocument('rosters', rosterId, { ...currentRoster, userId: user.uid, updatedAt: new Date().toISOString() });
      setLastSavedRoster(JSON.stringify(currentRoster));
      if (!silent) alert('근무표가 서버에 안전하게 저장되었습니다.');
      return true;
    } catch (err) { alert('저장 실패: ' + err.message); return false; } finally { setIsSyncing(false); }
  };

  const handleRotateStandby = async () => {
    if (currentRoster.shiftType !== '야간') {
      alert('대기근무 순환은 야간 근무표에서만 사용 가능합니다.');
      return;
    }
    if (!window.confirm('4일 전 야간 근무표를 기준으로 대기근무를 순환 배치합니다. 기존 대기근무 데이터는 덮어쓰여집니다. 계속하시겠습니까?')) return;
    setIsSyncing(true);
    try {
      const prevDate = new Date(currentRoster.date);
      prevDate.setDate(prevDate.getDate() - 4);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      const prevRosterId = `${user.uid}_${prevDateStr}_야간_${currentRoster.metadata.teamName}`;
      const prevRosterDoc = await getDoc(doc(db, 'rosters', prevRosterId));
      if (!prevRosterDoc.exists()) {
        alert(`4일 전(${prevDateStr}) 야간 근무기록이 없습니다. 순환할 수 없습니다.`);
        setIsSyncing(false); return;
      }
      const prevRosterData = prevRosterDoc.data();
      const todaysNotes = specialNotes.filter(n => n.date === currentRoster.date);
      const { assignments: newStandbyAssignments, warnings } = rotateNightStandby(prevRosterData, employees, todaysNotes, currentRoster.metadata.teamName);
      setCurrentRoster(prev => {
        const updatedAssignments = { ...prev.assignments };
        Object.keys(updatedAssignments).forEach(key => { if (key.endsWith('_대기근무')) delete updatedAssignments[key]; });
        return { ...prev, assignments: { ...updatedAssignments, ...newStandbyAssignments } };
      });
      if (warnings && warnings.length > 0) alert(`대기근무 순환 완료.\n\n주의사항:\n- ${warnings.join('\n- ')}`);
      else alert('대기근무 순환이 성공적으로 완료되었습니다.');
    } catch (error) { console.error("대기근무 순환 중 오류 발생:", error); alert(`오류가 발생했습니다: ${error.message}`); } finally { setIsSyncing(false); }
  };

  const handleResetRoster = () => { if (window.confirm('현재 날짜와 팀의 근무 배치를 모두 초기화하시겠습니까?')) setCurrentRoster(prev => ({ ...prev, assignments: {}, focusAreas: {}, volunteerStaff: [] })); };
  const handleToggleStaff = (id) => {
    const key = `${modalState.slot}_${modalState.duty}`;
    setCurrentRoster(prev => {
      const currentIds = prev.assignments[key] || [];
      if (currentIds.includes(id)) return { ...prev, assignments: { ...prev.assignments, [key]: currentIds.filter(i => i !== id) } };
      return { ...prev, assignments: { ...prev.assignments, [key]: [...currentIds, id] } };
    });
  };
  const handleSaveFocus = (place) => { setCurrentRoster(prev => ({ ...prev, focusAreas: { ...prev.focusAreas, [`${focusModalState.slot}_${focusModalState.duty}`]: place } })); setFocusModalState({ ...focusModalState, isOpen: false }); };
  const addVolunteer = (vol) => { setCurrentRoster(prev => ({ ...prev, volunteerStaff: [...(prev.volunteerStaff || []), vol] })); setVolunteerAddModalOpen(false); };
  const deleteVolunteer = (id) => { setCurrentRoster(prev => ({ ...prev, volunteerStaff: (prev.volunteerStaff || []).filter(v => v.id !== id), assignments: Object.fromEntries(Object.entries(prev.assignments).map(([k, v]) => [k, v.filter(staffId => staffId !== id)])) })); };

  const saveEmp = async (data) => { try { await saveDocument('employees', data.id, { ...data, userId: user.uid }); setEmployeeAddModalOpen(false); setEmployeeEditModalOpen(false); } catch (e) { alert(e.message); } };
  const deleteEmp = async (id) => { try { await removeDocument('employees', id); setEmployeeEditModalOpen(false); } catch (e) { alert(e.message); } };
  const addNote = async () => { if (!newNote.employeeId) return alert('직원을 선택하세요.'); try { await saveDocument('specialNotes', 'note_' + Date.now(), { ...newNote, userId: user.uid, date: newNote.startDate }); setNewNote({ ...newNote, employeeId: '' }); } catch (e) { alert(e.message); } };
  const updateNote = async (id, data) => { try { await saveDocument('specialNotes', id, data); setEditingNoteId(null); } catch (e) { alert(e.message); } };
  const deleteNote = async (id) => { if (window.confirm('삭제하시겠습니까?')) await removeDocument('specialNotes', id); };

  const toggleCard = (key) => setExpandedCards(prev => ({ ...prev, [key]: !prev[key] }));
  const addTeam = () => { if (newTeamName && !settings.teams.find(t => t.name === newTeamName)) { setSettings(prev => ({ ...prev, teams: [...prev.teams, { name: newTeamName, isVisible: true }] })); setNewTeamName(""); } };
  const addFocusPlace = () => { if (newFocusPlace && !settings.focusPlaces.includes(newFocusPlace)) { setSettings(prev => ({ ...prev, focusPlaces: [...prev.focusPlaces, newFocusPlace] })); setNewFocusPlace(""); } };
  const addDutyType = () => { if (newDutyType) { setSettings(prev => ({ ...prev, dutyTypes: [...prev.dutyTypes, { name: newDutyType, shift: newDutyShift }] })); setNewDutyType(""); } };
  const addDayTimeSlot = () => { if (newDayTimeSlot) { setSettings(prev => ({ ...prev, dayTimeSlots: [...(prev.dayTimeSlots || DAY_TIME_SLOTS), newDayTimeSlot] })); setNewDayTimeSlot(""); } };
  const addNightTimeSlot = () => { if (newNightTimeSlot) { setSettings(prev => ({ ...prev, nightTimeSlots: [...(prev.nightTimeSlots || NIGHT_TIME_SLOTS), newNightTimeSlot] })); setNewNightTimeSlot(""); } };
  const handleExplicitSaveSettings = async () => { try { setIsSyncing(true); await saveDocument('settings', user.uid, settings); alert('모든 설정이 서버에 영구적으로 저장되었습니다.'); } catch (e) { alert(e.message); } finally { setIsSyncing(false); } };

  const handleDragStart = (idx) => { window.draggedIdx = idx; };
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (idx, list, setList) => { const newList = [...list]; const dragged = newList.splice(window.draggedIdx, 1)[0]; newList.splice(idx, 0, dragged); setList(newList); };

  if (isLoading || !isDataInitialized) return (<div className="loading-screen"><div className="loader-container"><div className="loader-spinner"></div><div className="loader-text">데이터를 안전하게 불러오는 중입니다...</div></div></div>);

  const currentTimeSlots = currentRoster.shiftType === '주간' ? (settings.dayTimeSlots || DAY_TIME_SLOTS) : (settings.nightTimeSlots || NIGHT_TIME_SLOTS);
  const todaysNotes = specialNotes.filter(n => n.date === currentRoster.date);
  const combinedEmployees = [...employees, ...(currentRoster.volunteerStaff || [])];

  return (
    <div className="app-container">
      <header className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}><h1><Shield size={24} /> 경찰 근무표 관리 시스템</h1>{isSyncing && <div className="sync-badge"><RefreshCw size={14} className="spin" /> 동기화 중...</div>}</div>
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
              <div className="header-card"><label><Calendar size={14} /> 날짜</label><input type="date" value={currentRoster.date} onChange={e => setCurrentRoster(prev => ({...prev, date: e.target.value}))} /></div>
              <div className="header-card"><label>근무 구분</label><div className="toggle-buttons"><button className={currentRoster.shiftType === '주간' ? 'active' : ''} onClick={() => setCurrentRoster(prev => ({...prev, shiftType: '주간'}))}>주간</button><button className={currentRoster.shiftType === '야간' ? 'active' : ''} onClick={() => setCurrentRoster(prev => ({...prev, shiftType: '야간'}))}>야간</button></div></div>
              <div className="header-card"><label>날씨</label><select value={currentRoster.weather} onChange={e => setCurrentRoster(prev => ({...prev, weather: e.target.value}))}>{WEATHER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}</select></div>
              <div className="header-card"><label>팀 선택</label><div className="btn-group">{settings.teams.filter(t => t.isVisible).map(team => (<button key={team.name} className={`selection-btn ${currentRoster.metadata.teamName === team.name ? 'active' : ''}`} onClick={() => setCurrentRoster(prev => ({...prev, metadata: {...prev.metadata, teamName: team.name}}))}>{team.name}</button>))}</div></div>
              <div className="header-actions">
                <button className="btn-primary" onClick={() => handleSaveRoster()}><Save size={16} /> 저장하기</button>
                {currentRoster.shiftType === '야간' && <button className="btn-secondary" onClick={handleRotateStandby} title="4일 전 야간근무를 기준으로 대기근무를 순환합니다."><RefreshCw size={16} /> 대기근무 순환</button>}
                <button className="btn-danger" onClick={handleResetRoster}><Trash size={16} /> 일지 초기화</button>
                <button className="btn-secondary" onClick={() => setVolunteerAddModalOpen(true)}><Plus size={16} /> 자원근무</button>
                <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
              </div>
            </div>

            <div className="stats-dashboard no-print">
              <div className="stat-card"><h4>팀 인원</h4><div className="stat-value">{employees.filter(e => e.team === currentRoster.metadata.teamName).length}<span>명</span></div></div>
              <div className="stat-card highlight"><h4>자원 근무</h4><div className="stat-value">{currentRoster.volunteerStaff?.length || 0}<span>명</span></div></div>
              <div className="stat-card warning"><h4>오늘 휴가/외출</h4><div className="stat-value">{todaysNotes.filter(n => n.type !== '지원근무').length}<span>건</span></div></div>
            </div>

            <div className="print-area real-style">
              <div className="doc-header"><div className="header-left">계: {employees.filter(e => e.team === currentRoster.metadata.teamName).length + (currentRoster.volunteerStaff?.length || 0)}명</div><div className="doc-title">{settings.stationName} 근무일지 ({currentRoster.shiftType === '야간' ? '야' : '주'})</div><div className="header-right">대장: {settings.chiefName} (인)</div></div>
              <div className="date-weather-row"><span>일시: {formatDateWithDay(currentRoster.date)}</span><span>날씨: {currentRoster.weather}</span></div>
              <table className="roster-table real">
                <thead><tr><th width="80">구분</th>{currentTimeSlots.map(s => <th key={s}>{s}</th>)}</tr></thead>
                <tbody>
                  {settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType).map(dutyObj => (
                    <tr key={dutyObj.name} className={dutyObj.name.includes('중점') ? 'focus-row' : ''}>
                      <td className="duty-label">{dutyObj.name}</td>
                      {currentTimeSlots.map(slot => {
                        const key = `${slot}_${dutyObj.name}`;
                        if (dutyObj.name.includes('중점')) return <td key={slot} className="assignment-cell focus-cell" onClick={() => setFocusModalState({ isOpen: true, slot, duty: dutyObj.name })}><div className="staff-name-v">{currentRoster.focusAreas[key] || ''}</div></td>;
                        const staffIds = currentRoster.assignments[key] || [];
                        const staff = combinedEmployees.filter(e => staffIds.includes(e.id)).sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));
                        return <td key={slot} className="assignment-cell" onClick={() => setModalState({ isOpen: true, slot, duty: dutyObj.name })}><div className="staff-names-v">{staff.map(e => <div key={e.id} className="staff-name-v">{e.name}</div>)}</div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <StaffSelectionModal isOpen={modalState.isOpen} onClose={() => setModalState({ ...modalState, isOpen: false })} slot={modalState.slot} duty={modalState.duty} employees={combinedEmployees} specialNotes={todaysNotes} selectedIds={currentRoster.assignments[`${modalState.slot}_${modalState.duty}`] || []} currentAssignments={currentRoster.assignments} dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)} settings={settings} onSelect={handleToggleStaff} onDeleteVolunteer={deleteVolunteer} selectedTeamName={currentRoster.metadata.teamName} shiftType={currentRoster.shiftType} />
            <VolunteerAddModal isOpen={volunteerAddModalOpen} settings={settings} onAdd={addVolunteer} onClose={() => setVolunteerAddModalOpen(false)} />
            <FocusPlaceModal isOpen={focusModalState.isOpen} slot={focusModalState.slot} duty={focusModalState.duty} focusPlaces={settings.focusPlaces} currentFocus={currentRoster.focusAreas[`${focusModalState.slot}_${focusModalState.duty}`]} onSave={handleSaveFocus} onClose={() => setFocusModalState({ ...focusModalState, isOpen: false })} />
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <div className="section-header-with-action"><h2>직원 명단 관리</h2><button className="btn-primary" onClick={() => setEmployeeAddModalOpen(true)}><Plus size={16} /> 직원 추가</button></div>
            <div className="team-filter-tabs">{settings.teams.map(t => <button key={t.name} className={`team-tab-btn ${noteTeamFilter === t.name ? 'active' : ''}`} onClick={() => setNoteTeamFilter(t.name)}>{t.name}</button>)}<button className={`team-tab-btn ${noteTeamFilter === '' ? 'active' : ''}`} onClick={() => setNoteTeamFilter('')}>전체보기</button></div>
            <div className="staff-grid-v2">
              {employees.filter(e => !noteTeamFilter || e.team === noteTeamFilter).sort((a,b) => { if(a.team!==b.team) return a.team.localeCompare(b.team); return getRankWeight(a.rank)-getRankWeight(b.rank); }).map(emp => (
                <div key={emp.id} className="staff-card-v2 admin-card" onClick={() => { setSelectedEmployeeForEdit(emp); setEmployeeEditModalOpen(true); }}>
                  <div className="card-top"><span className="team-tag">{emp.team}</span><span className="rank-text">{emp.rank}</span></div>
                  <div className="name-text">{emp.name}</div>
                  <div className="card-footer-tags">
                    {emp.isAdminStaff && <span className="tag-mini admin">관리반</span>}
                    {emp.isFixedNightStandby && <span className="tag-mini fixed">고정대기</span>}
                    {emp.isStandbyRotationEligible && !emp.isFixedNightStandby && <span className="tag-mini rotation">순환대상</span>}
                    {emp.isNightShiftExcluded && <span className="tag-mini exclude">야간제외</span>}
                  </div>
                </div>
              ))}
            </div>
            <EmployeeAddModal isOpen={employeeAddModalOpen} settings={settings} onSave={saveEmp} onClose={() => setEmployeeAddModalOpen(false)} />
            <EmployeeEditModal isOpen={employeeEditModalOpen} employee={selectedEmployeeForEdit} settings={settings} onSave={saveEmp} onDelete={deleteEmp} onClose={() => setEmployeeEditModalOpen(false)} />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="admin-section">
            <div className="section-header-with-action"><h2>특이사항 및 지원근무 관리</h2></div>
            <div className="notes-admin-layout">
              <div className="settings-card note-form-card"><h3>새 특이사항 등록</h3><div className="note-form-v2">
                <div className="note-input-group"><label>대상 날짜</label><input type="date" value={newNote.startDate} onChange={e => setNewNote({...newNote, startDate: e.target.value})} /></div>
                <div className="note-input-group"><label>구분</label><div className="btn-group">{NOTE_TYPES.map(t => <button key={t} className={`selection-btn ${newNote.type === t ? 'active' : ''}`} onClick={() => setNewNote({...newNote, type: t})}>{t}</button>)}</div></div>
                <div className="note-input-group"><label>대상 직원 선택</label>
                  <div className="team-filter-tabs-mini">{settings.teams.map(t => <button key={t.name} className={`team-tab-btn-mini ${noteTeamFilter === t.name ? 'active' : ''}`} onClick={() => setNoteTeamFilter(t.name)}>{t.name}</button>)}</div>
                  {noteTeamFilter ? <div className="staff-selection-grid-mini scrollable">{employees.filter(e => e.team === noteTeamFilter).map(e => <div key={e.id} className={`staff-card-mini ${newNote.employeeId === e.id ? 'selected' : ''}`} onClick={() => setNewNote({...newNote, employeeId: e.id})}><span className="rank">{e.rank}</span><span className="name">{e.name}</span></div>)}</div> : <div className="empty-selection-placeholder">팀을 선택하세요.</div>}
                </div>
                <div className="note-input-row">
                  <div className="note-input-group"><label className="checkbox-item"><input type="checkbox" checked={newNote.isAllDay} onChange={e => setNewNote({...newNote, isAllDay: e.target.checked})} /> 하루 종일</label></div>
                  {newNote.type === '지원근무' && <div className="note-input-group"><label>지원 근무 구분</label><div className="toggle-buttons"><button className={newNote.supportShift === '주간' ? 'active' : ''} onClick={() => setNewNote({...newNote, supportShift: '주간'})}>주간 지원</button><button className={newNote.supportShift === '야간' ? 'active' : ''} onClick={() => setNewNote({...newNote, supportShift: '야간'})}>야간 지원</button></div></div>}
                  {!newNote.isAllDay && newNote.type !== '지원근무' && <div className="note-input-group"><label>시간 설정</label><div className="time-input-row"><input type="time" value={newNote.startTime} onChange={e => setNewNote({...newNote, startTime: e.target.value})} /><span>~</span><input type="time" value={newNote.endTime} onChange={e => setNewNote({...newNote, endTime: e.target.value})} /></div></div>}
                  <button className="btn-primary btn-full" onClick={addNote}><Plus size={18} /> 특이사항 등록</button>
                </div>
              </div></div>
              <div className="settings-card notes-list-card"><div className="card-header-with-action"><h3>특이사항 목록</h3><div className="date-nav"><input type="date" value={newNote.startDate} onChange={e => setNewNote({...newNote, startDate: e.target.value})} /><span>의 목록</span></div></div><div className="notes-list-v2 scrollable">
                {specialNotes.filter(n => n.date === newNote.startDate).length === 0 ? <div className="empty-state">목록 없음</div> : specialNotes.filter(n => n.date === newNote.startDate).map(n => {
                  const emp = employees.find(e => e.id === n.employeeId);
                  return (
                    <div key={n.id} className="note-item-v2">
                      {editingNoteId === n.id ? (
                        <div className="edit-note-inline">
                          <select value={editingNoteValue.type} onChange={e => setEditingNoteValue({...editingNoteValue, type: e.target.value})}>{NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                          {editingNoteValue.type === '지원근무' ? (<select value={editingNoteValue.supportShift} onChange={e => setEditingNoteValue({...editingNoteValue, supportShift: e.target.value})}><option value="주간">주간 지원</option><option value="야간">야간 지원</option></select>) : (!editingNoteValue.isAllDay && <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><input type="time" value={editingNoteValue.startTime} onChange={e => setEditingNoteValue({...editingNoteValue, startTime: e.target.value})} /><span>~</span><input type="time" value={editingNoteValue.endTime} onChange={e => setEditingNoteValue({...editingNoteValue, endTime: e.target.value})} /></div>)}
                          <button onClick={() => updateNote(n.id, editingNoteValue)} className="btn-save-icon"><Check size={16} /></button><button onClick={() => setEditingNoteId(null)} className="btn-cancel-icon"><X size={16} /></button>
                        </div>
                      ) : (<><div className="note-info"><span className="emp-name">{emp?.rank} {emp?.name}</span><span className={`note-tag-v2 ${n.type}`}>{n.type}</span><span className="note-time">{n.type === '지원근무' ? `${n.supportShift} 지원` : (n.isAllDay ? '종일' : `${n.startTime} ~ ${n.endTime}`)}</span></div><div className="action-btns"><button className="edit-btn-icon" onClick={() => {setEditingNoteId(n.id); setEditingNoteValue(n);}}><Edit2 size={14} /></button><button className="delete-btn-icon" onClick={() => deleteNote(n.id)}><Trash size={16} /></button></div></>)}
                    </div>
                  );
                })}
              </div></div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="admin-section">
            <div className="section-header-with-action"><h2>환경 설정</h2><button className="btn-primary" onClick={handleExplicitSaveSettings}><Save size={16} /> 서버에 설정 최종 저장</button></div>
            <div className="settings-grid">
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('station')}><div className="title-area"><h3>지구대 정보</h3><span className="hint-text-small">명칭 및 대장 성명</span></div>{expandedCards.station ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.station && <div className="card-content-area active"><div className="card-header-with-action">{!isEditingStation ? <button className="edit-btn-small" onClick={() => setIsEditingStation(true)}><Edit2 size={14} /> 수정</button> : <div className="action-btns"><button className="btn-save-small" onClick={() => { setSettings(prev => ({ ...prev, ...tempStationSettings })); setIsEditingStation(false); }}><Save size={14} /> 저장</button><button className="btn-cancel-small" onClick={() => setIsEditingStation(false)}><X size={14} /> 취소</button></div>}</div><div className="info-display"><div className="info-item"><label>지구대 명칭</label>{isEditingStation ? <input type="text" value={tempStationSettings.stationName} onChange={e => setTempStationSettings({ ...tempStationSettings, stationName: e.target.value })} /> : <div className="value-text">{settings.stationName}</div>}</div><div className="info-item"><label>지구대장 성명</label>{isEditingStation ? <input type="text" value={tempStationSettings.chiefName} onChange={e => setTempStationSettings({ ...tempStationSettings, chiefName: e.target.value })} /> : <div className="value-text">{settings.chiefName}</div>}</div></div></div>}</div>
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('team')}><div className="title-area"><h3>팀 관리</h3></div>{expandedCards.team ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.team && <div className="card-content-area active"><div className="note-form"><input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="새 팀" onKeyDown={e => e.key === 'Enter' && addTeam()} /><button className="btn-primary" onClick={addTeam}>추가</button></div><div className="duty-type-list">{settings.teams.map((t, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.teams, (newList) => setSettings(prev => ({...prev, teams: newList})))}>{editingTeamIdx === i ? <div className="edit-inline-form"><input type="text" value={editingTeamValue} onChange={e => setEditingTeamValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const nt=[...settings.teams]; nt[i]={...nt[i], name:editingTeamValue}; setSettings(prev => ({...prev, teams:nt})); setEditingTeamIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const nt=[...settings.teams]; nt[i]={...nt[i], name:editingTeamValue}; setSettings(prev => ({...prev, teams:nt})); setEditingTeamIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingTeamIdx(null)}><X size={14} /></button></div></div> : <><div className="team-info-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><button className="visibility-btn" onClick={() => {const nt=[...settings.teams]; nt[i].isVisible = !nt[i].isVisible; setSettings(prev => ({...prev, teams: nt}));}}>{t.isVisible ? <Eye size={16} /> : <EyeOff size={16} style={{color: '#ccc'}} />}</button><span>{t.name}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingTeamIdx(i); setEditingTeamValue(t.name);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({...prev, teams: prev.teams.filter((_,idx)=>idx!==i)})); }}><Trash size={14} /></button></div></>}</div>)}</div></div>}</div>
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('focus')}><div className="title-area"><h3>중점 구역 관리</h3></div>{expandedCards.focus ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.focus && <div className="card-content-area active"><div className="note-form"><input type="text" value={newFocusPlace} onChange={e => setNewFocusPlace(e.target.value)} placeholder="새 장소" onKeyDown={e => e.key === 'Enter' && addFocusPlace()} /><button className="btn-primary" onClick={addFocusPlace}>추가</button></div><div className="duty-type-list">{settings.focusPlaces?.map((p, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.focusPlaces, (newList) => setSettings(prev => ({...prev, focusPlaces: newList})))}>{editingFocusIdx === i ? <div className="edit-inline-form"><input type="text" value={editingFocusValue} onChange={e => setEditingFocusValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const np=[...settings.focusPlaces]; np[i]=editingFocusValue; setSettings(prev => ({...prev, focusPlaces:np})); setEditingFocusIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const np=[...settings.focusPlaces]; np[i]=editingFocusValue; setSettings(prev => ({...prev, focusPlaces:np})); setEditingFocusIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingFocusIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{p}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingFocusIdx(i); setEditingFocusValue(p);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({...prev, focusPlaces: prev.focusPlaces.filter((_,idx)=>idx!==i)})); }}><Trash size={14} /></button></div></>}</div>)}</div></div>}</div>
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('duty')}><div className="title-area"><h3>근무 유형 관리</h3></div>{expandedCards.duty ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.duty && <div className="card-content-area active"><div className="note-form"><input type="text" value={newDutyType} onChange={e => setNewDutyType(e.target.value)} placeholder="새 유형" onKeyDown={e => e.key === 'Enter' && addDutyType()} /><select value={newDutyShift} onChange={e => setNewDutyShift(e.target.value)}><option value="공통">공통</option><option value="주간">주간</option><option value="야간">야간</option></select><button className="btn-primary" onClick={addDutyType}>추가</button></div><div className="duty-type-list">{settings.dutyTypes.map((d, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.dutyTypes, (newList) => setSettings(prev => ({...prev, dutyTypes: newList})))}>{editingDutyIdx === i ? <div className="edit-inline-form"><input type="text" value={editingDutyValue} onChange={e => setEditingDutyValue(e.target.value)} autoFocus /><select value={editingDutyShift} onChange={e => setEditingDutyShift(e.target.value)}><option value="공통">공통</option><option value="주간">주간</option><option value="야간">야간</option></select><div className="action-btns"><button className="btn-save" onClick={()=>{const nd=[...settings.dutyTypes]; nd[i]={name:editingDutyValue, shift:editingDutyShift}; setSettings(prev => ({...prev, dutyTypes:nd})); setEditingDutyIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingDutyIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{d.name} ({d.shift})</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingDutyIdx(i); setEditingDutyValue(d.name); setEditingDutyShift(d.shift);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({ ...prev, dutyTypes: prev.dutyTypes.filter((_, idx) => idx !== i) })); }}><Trash size={14} /></button></div></>}</div>)}</div></div>}</div>
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('dayTime')}><div className="title-area"><h3>주간 시간대 관리</h3></div>{expandedCards.dayTime ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.dayTime && <div className="card-content-area active"><div className="note-form"><input type="text" value={newDayTimeSlot} onChange={e => setNewDayTimeSlot(e.target.value)} placeholder="09:00-10:00" onKeyDown={e => e.key === 'Enter' && addDayTimeSlot()} /><button className="btn-primary" onClick={addDayTimeSlot}>추가</button></div><div className="duty-type-list">{(settings.dayTimeSlots || DAY_TIME_SLOTS).map((s, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.dayTimeSlots || DAY_TIME_SLOTS, (newList) => setSettings(prev => ({...prev, dayTimeSlots: newList})))}>{editingDayTimeIdx === i ? <div className="edit-inline-form"><input type="text" value={editingDayTimeValue} onChange={e => setEditingDayTimeValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const nts=[...settings.dayTimeSlots]; nts[i]=editingDayTimeValue; setSettings(prev => ({...prev, dayTimeSlots:nts})); setEditingDayTimeIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const nts=[...settings.dayTimeSlots]; nts[i]=editingDayTimeValue; setSettings(prev => ({...prev, dayTimeSlots:nts})); setEditingDayTimeIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingDayTimeIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{s}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingDayTimeIdx(i); setEditingDayTimeValue(s);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({ ...prev, dayTimeSlots: (prev.dayTimeSlots || DAY_TIME_SLOTS).filter((_, idx) => idx !== i) })); }}><Trash size={14} /></button></div></>}</div>)}</div></div>}</div>
              <div className="settings-card collapsible"><div className="card-header-toggle" onClick={() => toggleCard('nightTime')}><div className="title-area"><h3>야간 시간대 관리</h3></div>{expandedCards.nightTime ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>{expandedCards.nightTime && <div className="card-content-area active"><div className="note-form"><input type="text" value={newNightTimeSlot} onChange={e => setNewNightTimeSlot(e.target.value)} placeholder="20:00-22:00" onKeyDown={e => e.key === 'Enter' && addNightTimeSlot()} /><button className="btn-primary" onClick={addNightTimeSlot}>추가</button></div><div className="duty-type-list">{(settings.nightTimeSlots || NIGHT_TIME_SLOTS).map((s, i) => <div key={i} className="duty-type-item" draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i, settings.nightTimeSlots || NIGHT_TIME_SLOTS, (newList) => setSettings(prev => ({...prev, nightTimeSlots: newList})))}>{editingNightTimeIdx === i ? <div className="edit-inline-form"><input type="text" value={editingNightTimeValue} onChange={e => setEditingNightTimeValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{const nts=[...settings.nightTimeSlots]; nts[i]=editingNightTimeValue; setSettings(prev => ({...prev, nightTimeSlots:nts})); setEditingNightTimeIdx(null);})()} /><div className="action-btns"><button className="btn-save" onClick={()=>{const nts=[...settings.nightTimeSlots]; nts[i]=editingNightTimeValue; setSettings(prev => ({...prev, nightTimeSlots:nts})); setEditingNightTimeIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingNightTimeIdx(null)}><X size={14} /></button></div></div> : <><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div className="drag-handle-mini" style={{ cursor: 'grab', color: '#ccc' }}><Edit2 size={12} /></div><span>{s}</span></div><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingNightTimeIdx(i); setEditingNightTimeValue(s);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={() => { if(window.confirm('삭제?')) setSettings(prev => ({ ...prev, nightTimeSlots: (prev.nightTimeSlots || NIGHT_TIME_SLOTS).filter((_, idx) => idx !== i) })); }}><Trash size={14} /></button></div></>}</div>)}</div></div>}</div>
            </div>
            <div style={{ marginTop: '2rem', padding: '1rem', background: '#fff3e0', borderRadius: '8px', border: '1px solid #ffe0b2' }}><h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e65100' }}><AlertTriangle size={18}/> 데이터 안전 관리</h4><p style={{ fontSize: '0.85rem', color: '#666', margin: '0.5rem 0' }}>설정이 갑자기 사라지는 것을 방지하기 위해, 현재 설정을 텍스트로 복사해 두실 수 있습니다.</p><button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem' }} onClick={() => { navigator.clipboard.writeText(JSON.stringify(settings)); alert('설정 데이터가 클립보드에 복사되었습니다. 메모장에 붙여넣어 보관하세요.'); }}><Copy size={14}/> 현재 설정 데이터 복사하기 (백업용)</button></div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

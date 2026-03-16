import { useState, useEffect } from 'react';
import { Calendar, Shield, Plus, Trash, Save, Printer, RefreshCw, X, Settings, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { isTimeOverlapping, checkAvailability } from './utils/rotation';
import { auth, db, saveDocument, getDocument, removeDocument } from './firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import './App.css';

const INITIAL_EMPLOYEES = [];

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

const DEFAULT_SETTINGS = {
  stationName: '○○ 지구대',
  chiefName: '',
  dutyTypes: DEFAULT_DUTY_TYPES,
  teams: ['1팀', '2팀', '3팀', '4팀'],
  focusPlaces: ['신사역', '논현역', '학동역', '압구정역', '가로수길', '도산공원', '신사상가', '잠원한강공원', '을지병원사거리'],
  dayTimeSlots: DAY_TIME_SLOTS,
  nightTimeSlots: NIGHT_TIME_SLOTS
};

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
            const note = specialNotes.find(n => n.employeeId === emp.id && (n.isAllDay || isTimeOverlapping(s, e, n.startTime, n.endTime)));
            
            return (
              <div 
                key={emp.id} 
                className={`staff-card-v2 ${isSelected ? 'selected' : ''} ${isBlocked && !isSelected ? 'disabled' : ''}`}
                onClick={() => (!isBlocked || isSelected) && onSelect(emp.id)}
              >
                <div className="staff-rank">{emp.rank}</div>
                <div className="staff-name">{emp.name}</div>
                {emp.isVolunteer && <div className="staff-note-label 지원근무">자원근무</div>}
                {note && <div className={`staff-note-label ${note.type}`}>{note.type}</div>}
                {otherDutyName && !note && <div className="staff-note-label warning">{otherDutyName}</div>}
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
            <div className="btn-group">
              {RANKS.map(r => (
                <button 
                  key={r} 
                  className={`selection-btn ${newEmp.rank === r ? 'active' : ''}`}
                  onClick={() => setNewEmp({ ...newEmp, rank: r })}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="input-group">
            <label>성명</label>
            <input 
              type="text" 
              placeholder="성명 입력" 
              value={newEmp.name} 
              onChange={e => setNewEmp({ ...newEmp, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
          </div>
          <div className="input-group">
            <label>팀</label>
            <div className="btn-group">
              {settings.teams.map(t => (
                <button 
                  key={t} 
                  className={`selection-btn ${newEmp.team === t ? 'active' : ''}`}
                  onClick={() => setNewEmp({ ...newEmp, team: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="checkbox-list">
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isStandbyRotationEligible} onChange={e => setNewEmp({ ...newEmp, isStandbyRotationEligible: e.target.checked })} />순환대상 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isFixedNightStandby} onChange={e => setNewEmp({ ...newEmp, isFixedNightStandby: e.target.checked })} />고정 대기 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={newEmp.isNightShiftExcluded} onChange={e => setNewEmp({ ...newEmp, isNightShiftExcluded: e.target.checked })} />야간 근무 제외</label>
          </div>
          <div className="input-group">
            <label>고정 대기 시간대 설정</label>
            <div className="time-input-row">
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={!newEmp.isFixedNightStandby} />
              <span>~</span>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={!newEmp.isFixedNightStandby} />
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
            <div className="btn-group">
              {RANKS.map(r => (
                <button 
                  key={r} 
                  className={`selection-btn ${edited.rank === r ? 'active' : ''}`}
                  onClick={() => setEdited({ ...edited, rank: r })}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="input-group">
            <label>성명</label>
            <input 
              type="text" 
              value={edited.name} 
              onChange={e => setEdited({ ...edited, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="input-group">
            <label>팀</label>
            <div className="btn-group">
              {settings.teams.map(t => (
                <button 
                  key={t} 
                  className={`selection-btn ${edited.team === t ? 'active' : ''}`}
                  onClick={() => setEdited({ ...edited, team: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="checkbox-list">
            <label className="checkbox-item"><input type="checkbox" checked={edited.isStandbyRotationEligible} onChange={e => setEdited({ ...edited, isStandbyRotationEligible: e.target.checked })} />순환대상 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={edited.isFixedNightStandby} onChange={e => setEdited({ ...edited, isFixedNightStandby: e.target.checked })} />고정 대기 여부</label>
            <label className="checkbox-item"><input type="checkbox" checked={edited.isNightShiftExcluded} onChange={e => setEdited({ ...edited, isNightShiftExcluded: e.target.checked })} />야간 근무 제외</label>
          </div>
          <div className="input-group">
            <label>고정 대기 시간대 설정</label>
            <div className="time-input-row">
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={!edited.isFixedNightStandby} />
              <span>~</span>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={!edited.isFixedNightStandby} />
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

function FocusPlaceSelectionModal({ isOpen, onClose, slot, duty, focusPlaces, selectedValue, currentFocusAreas, dutyTypes, onSelect }) {
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
              isAlreadyUsed = dutyTypes.some(d => {
                if (d.name === duty) return false;
                const key = `${slot}_${d.name}`;
                return currentFocusAreas[key] === place;
              });
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

function App({ user }) {
  const [employees, setEmployees] = useState([]);
  const [specialNotes, setSpecialNotes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('roster');
  const [employeeTabTeam, setEmployeeTabTeam] = useState('1팀');
  const [isStaffOrderEditMode, setIsStaffOrderEditMode] = useState(false);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [focusModalState, setFocusModalState] = useState({ isOpen: false, slot: '', duty: '' });
  const [volunteerAddModalOpen, setVolunteerAddModalOpen] = useState(false);
  const [noteTeamFilter, setNoteTeamFilter] = useState('');
  
  const [newNote, setNewNote] = useState({ 
    startDate: new Date().toISOString().split('T')[0], 
    endDate: new Date().toISOString().split('T')[0], 
    employeeId: '', 
    type: '육아시간', 
    startTime: '07:30', 
    endTime: '09:30', 
    isAllDay: false 
  });

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

  const [expandedCards, setExpandedCards] = useState({
    station: false,
    team: false,
    focus: false,
    duty: false,
    dayTime: false,
    nightTime: false
  });

  const toggleCard = (cardKey) => {
    setExpandedCards(prev => ({ ...prev, [cardKey]: !prev[cardKey] }));
  };

  const [currentRoster, setCurrentRoster] = useState({
    date: new Date().toISOString().split('T')[0],
    shiftType: '야간',
    weather: '맑음',
    metadata: { chief: DEFAULT_SETTINGS.chiefName, teamLeader: '', teamName: '2팀', totalCount: 0, teamCounts: { '1팀': 0, '2팀': 0, '3팀': 0, '4팀': 0 }, adminCount: 2, longTermAbsent: 0 },
    assignments: {},
    focusAreas: {},
    volunteerStaff: []
  });

  useEffect(() => {
    if (!user) return;

    const fetchSettings = async () => {
      try {
        const savedSettings = await getDocument('settings', user.uid);
        if (savedSettings) {
          setSettings(savedSettings);
          setTempStationSettings({ stationName: savedSettings.stationName, chiefName: savedSettings.chiefName });
          if (savedSettings.teams?.length > 0) setEmployeeTabTeam(savedSettings.teams[0]);
        }
      } catch (e) {
        console.error("Settings load error:", e);
      }
    };
    fetchSettings();

    const qEmployees = query(collection(db, 'employees'), where('userId', '==', user.uid));
    const unsubEmployees = onSnapshot(qEmployees, (snapshot) => {
      const staffList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(staffList);
      setIsLoading(false);
    }, (error) => {
      console.error("Employees sync error:", error);
      setIsLoading(false);
    });

    const qNotes = query(collection(db, 'specialNotes'), where('userId', '==', user.uid));
    const unsubNotes = onSnapshot(qNotes, (snapshot) => {
      const notesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSpecialNotes(notesList);
    });

    return () => {
      unsubEmployees();
      unsubNotes();
    };
  }, [user]);

  useEffect(() => {
    if (!user || isLoading) return;

    const rosterId = `${user.uid}_${currentRoster.date}_${currentRoster.shiftType}`;
    const docRef = doc(db, 'rosters', rosterId);
    
    const unsubRoster = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const saved = docSnap.data();
        setCurrentRoster(prev => ({ 
          ...prev, 
          ...saved, 
          volunteerStaff: saved.volunteerStaff || [] 
        }));
      } else {
        const initialAssignments = {};
        if (currentRoster.shiftType === '야간') {
          employees.forEach(emp => {
            if (emp.team === currentRoster.metadata.teamName && emp.isFixedNightStandby && emp.fixedNightStandbySlot) {
              const [s, e] = emp.fixedNightStandbySlot.split('-');
              const notesForDate = specialNotes.filter(n => n.date === currentRoster.date);
              if (checkAvailability(emp, s, e, notesForDate).available) {
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
          volunteerStaff: [] 
        }));
      }
    });

    return () => unsubRoster();
  }, [user, currentRoster.date, currentRoster.shiftType, isLoading, employees, specialNotes]);

  useEffect(() => {
    if (user && !isLoading) { 
      saveDocument('settings', user.uid, { ...settings, userId: user.uid }); 
    }
  }, [settings, isLoading, user]);

  const currentTimeSlots = currentRoster.shiftType === '주간' ? (settings.dayTimeSlots || DAY_TIME_SLOTS) : (settings.nightTimeSlots || NIGHT_TIME_SLOTS);

  const handleToggleStaff = (id) => {
    const key = `${modalState.slot}_${modalState.duty}`;
    const employee = [...employees, ...(currentRoster.volunteerStaff || [])].find(e => e.id === id);
    setCurrentRoster(prev => {
      const currentIds = prev.assignments[key] || [];
      if (currentIds.includes(id)) return { ...prev, assignments: { ...prev.assignments, [key]: currentIds.filter(i => i !== id) } };
      const duplicate = settings.dutyTypes.find(d => d.name !== modalState.duty && (prev.assignments[`${modalState.slot}_${d.name}`] || []).includes(id));
      if (duplicate) { alert(`${employee.rank} ${employee.name}님은 현재 동일 시간대에 [${duplicate.name}] 근무에 배치되어 있습니다.`); return prev; }
      return { ...prev, assignments: { ...prev.assignments, [key]: [...currentIds, id] } };
    });
  };

  const handleFocusChange = (slot, duty, value) => {
    const key = `${slot}_${duty}`;
    if (!value) { setCurrentRoster(prev => ({ ...prev, focusAreas: { ...prev.focusAreas, [key]: '' } })); return; }
    if (settings.dutyTypes.some(d => d.name !== duty && currentRoster.focusAreas[`${slot}_${d.name}`] === value)) { alert(`'${value}' 구역은 이미 해당 시간대의 다른 근무지에 배치되어 있습니다.`); return; }
    setCurrentRoster(prev => ({ ...prev, focusAreas: { ...prev.focusAreas, [key]: value } }));
  };

  const handleNextNightGenerate = () => {
    alert('이 기능은 이전 야간 데이터를 필요로 합니다. Firestore 연동 후 개선 예정입니다.');
  };

  const handleSave = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return alert('로그인이 필요합니다.');
    setIsSyncing(true);
    try {
      const rosterId = `${currentUser.uid}_${currentRoster.date}_${currentRoster.shiftType}`;
      await saveDocument('rosters', rosterId, { ...currentRoster, userId: currentUser.uid, updatedAt: new Date().toISOString() });
    } catch (e) { 
      alert('저장 실패'); 
    } finally {
      setIsSyncing(false);
    }
  };

  const addNote = async () => {
    if (!newNote.employeeId || !newNote.startDate || !newNote.endDate) return alert('직원과 기간을 선택하세요.');
    if (newNote.startDate > newNote.endDate) return alert('시작일이 종료일보다 늦을 수 없습니다.');
    
    setIsSyncing(true);
    const currentUser = auth.currentUser;
    const notesToSave = [];
    let curr = new Date(newNote.startDate);
    const end = new Date(newNote.endDate);

    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0];
      const noteId = `${Date.now()}_${dateStr}_${newNote.employeeId}`;
      notesToSave.push({
        ...newNote,
        date: dateStr,
        id: noteId,
        userId: currentUser.uid
      });
      curr.setDate(curr.getDate() + 1);
    }

    try {
      await Promise.all(notesToSave.map(n => saveDocument('specialNotes', n.id, n)));
      setNewNote({ ...newNote, employeeId: '', type: '육아시간', isAllDay: false });
    } catch (e) {
      alert('저장 실패');
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteNote = async (id) => { 
    setIsSyncing(true);
    try { 
      await removeDocument('specialNotes', id); 
    } catch (e) { 
      alert('삭제 실패'); 
    } finally {
      setIsSyncing(false);
    }
  };

  const addEmployee = async (data) => {
    const currentUser = auth.currentUser;
    const staffWithUser = { ...data, userId: currentUser.uid };
    setIsSyncing(true);
    try { 
      await saveDocument('employees', data.id, staffWithUser); 
      setIsAddingEmployee(false); 
    } catch (e) { 
      alert('추가 실패'); 
    } finally {
      setIsSyncing(false);
    }
  };

  const updateEmployee = async (updated) => { 
    setEditingEmployee(null); 
    setIsSyncing(true);
    try { 
      await saveDocument('employees', updated.id, updated); 
    } catch (e) { 
      alert('수정 실패'); 
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteEmployee = async (id) => { 
    if (window.confirm('정말 삭제하시겠습니까?')) { 
      setIsSyncing(true);
      try { 
        await removeDocument('employees', id); 
      } catch (e) { 
        alert('삭제 실패'); 
      } finally {
        setIsSyncing(false);
      }
    } 
  };

  const handleDragStart = (idx) => setDraggedIdx(idx);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (targetIdx, list, setList) => { if (draggedIdx === null || draggedIdx === targetIdx) return; const newList = [...list]; const item = newList.splice(draggedIdx, 1)[0]; newList.splice(targetIdx, 0, item); setList(newList); setDraggedIdx(null); };

  const addTeam = () => { if (!newTeamName) return; if (settings.teams?.includes(newTeamName)) return alert('이미 존재합니다.'); setSettings({ ...settings, teams: [...(settings.teams || []), newTeamName] }); setNewTeamName(''); };
  const addFocusPlace = () => { if (!newFocusPlace) return; if (settings.focusPlaces?.includes(newFocusPlace)) return alert('이미 존재합니다.'); setSettings({ ...settings, focusPlaces: [...(settings.focusPlaces || []), newFocusPlace] }); setNewFocusPlace(''); };
  const addDutyType = () => { if (!newDutyType) return; if (settings.dutyTypes?.some(d => d.name === newDutyType)) return alert('이미 존재합니다.'); setSettings({ ...settings, dutyTypes: [...settings.dutyTypes, { name: newDutyType, shift: newDutyShift }] }); setNewDutyType(''); };
  const addDayTimeSlot = () => { if (!newDayTimeSlot) return; if (settings.dayTimeSlots?.includes(newDayTimeSlot)) return alert('이미 존재합니다.'); setSettings({ ...settings, dayTimeSlots: [...(settings.dayTimeSlots || DAY_TIME_SLOTS), newDayTimeSlot] }); setNewDayTimeSlot(''); };
  const addNightTimeSlot = () => { if (!newNightTimeSlot) return; if (settings.nightTimeSlots?.includes(newNightTimeSlot)) return alert('이미 존재합니다.'); setSettings({ ...settings, nightTimeSlots: [...(settings.nightTimeSlots || NIGHT_TIME_SLOTS), newNightTimeSlot] }); setNewNightTimeSlot(''); };

  const casualties = specialNotes.filter(n => n.date === currentRoster.date && (['병가', '휴가'].includes(n.type) || n.isAllDay)).sort((a, b) => employees.findIndex(e => e.id === a.employeeId) - employees.findIndex(e => e.id === b.employeeId));
  const casualtyIds = new Set(casualties.map(n => n.employeeId));
  const currentTeamEmployees = employees.filter(e => e.team === currentRoster.metadata.teamName && !casualtyIds.has(e.id));

  if (isLoading) return (
    <div className="loading-screen">
      <div className="loader-container">
        <div className="loader-spinner"></div>
        <div className="loader-text">데이터를 안전하게 불러오는 중입니다...</div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {isSyncing && (
        <div className="sync-indicator">
          <RefreshCw size={14} className="spin" /> 서버와 동기화 중...
        </div>
      )}
      <header className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1><Shield size={24} /> 경찰 근무표 관리 시스템</h1>
          {employees.length === 0 && (
            <span style={{ fontSize: '0.75rem', background: '#ffd54f', color: '#000', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
              직원 데이터 없음
            </span>
          )}
        </div>
        <nav>
          <button onClick={() => setActiveTab('roster')} className={activeTab === 'roster' ? 'active' : ''}>근무표 작성</button>
          <button onClick={() => setActiveTab('employees')} className={activeTab === 'employees' ? 'active' : ''}>직원 관리</button>
          <button onClick={() => setActiveTab('notes')} className={activeTab === 'notes' ? 'active' : ''}>특이사항</button>
          <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active' : ''}><Settings size={16} /> 환경 설정</button>
          <button onClick={() => auth.signOut()} style={{ background: '#455a64', color: 'white', borderRadius: '8px', padding: '0.5rem 1rem', marginLeft: '1rem' }}>로그아웃</button>
        </nav>
      </header>

      <main>
        {activeTab === 'roster' && (
          <div className="roster-view">
            <div className="roster-header-inputs no-print">
              <div className="header-card">
                <label><Calendar size={14} /> 날짜</label>
                <input type="date" value={currentRoster.date} onChange={e => setCurrentRoster({...currentRoster, date: e.target.value})} />
              </div>
              <div className="header-card">
                <label>구분</label>
                <div className="toggle-buttons">
                  <button className={currentRoster.shiftType === '주간' ? 'active' : ''} onClick={() => setCurrentRoster({...currentRoster, shiftType: '주간'})}>주간</button>
                  <button className={currentRoster.shiftType === '야간' ? 'active' : ''} onClick={() => setCurrentRoster({...currentRoster, shiftType: '야간'})}>야간</button>
                </div>
              </div>
              <div className="header-card">
                <label>팀명</label>
                <input type="text" placeholder="예: 2팀" value={currentRoster.metadata.teamName} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamName: e.target.value}})} />
              </div>
              <div className="header-card">
                <label>지구대장</label>
                <input type="text" placeholder="성명 입력" value={currentRoster.metadata.chief} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, chief: e.target.value}})} />
              </div>
              <div className="header-card">
                <label>순찰팀장</label>
                <input type="text" placeholder="성명 입력" value={currentRoster.metadata.teamLeader} onChange={e => setCurrentRoster({...currentRoster, metadata: {...currentRoster.metadata, teamLeader: e.target.value}})} />
              </div>
              <div className="header-actions">
                <button className="btn-secondary" onClick={handleNextNightGenerate} disabled={currentRoster.shiftType !== '야간'}><RefreshCw size={16} /> 자동 순번</button>
                <button className="btn-outline" onClick={() => setVolunteerAddModalOpen(true)}><Plus size={16} /> 자원근무</button>
                <button className="btn-primary" onClick={handleSave}><Save size={16} /> 저장</button>
                <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> 인쇄</button>
              </div>
            </div>

            <div className="print-area real-style">
              <div className="doc-title">{settings.stationName} 근무일지 ({currentRoster.shiftType === '야간' ? '야' : '주'})</div>
              <table className="summary-table real">
                <tbody>
                  <tr><td className="label">날 짜</td><td colSpan="3" className="val">{formatDateWithDay(currentRoster.date)}</td><td className="label">날 씨</td><td colSpan="3" className="val"><select className="no-print" value={currentRoster.weather} onChange={e => setCurrentRoster({...currentRoster, weather: e.target.value})}>{WEATHER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}</select><span className="print-only">{currentRoster.weather}</span></td></tr>
                  <tr><td className="label">지구대장</td><td colSpan="3" className="val">{currentRoster.metadata.chief}</td><td className="label">순찰팀장</td><td className="val">{currentRoster.metadata.teamName}</td><td colSpan="2" className="val">{currentRoster.metadata.teamLeader}</td></tr>
                  <tr className="summary-counts"><td className="label">총원</td><td className="label">소장</td><td className="label" colSpan="3">순찰요원</td><td className="label">관리요원</td><td className="label">사고자</td><td className="label">전종자</td></tr>
                  <tr className="summary-values"><td>{currentRoster.metadata.totalCount}</td><td>1</td><td colSpan="3">{Object.entries(currentRoster.metadata.teamCounts).map(([t, c]) => <span key={t}>{t}({c}) </span>)}</td><td>{currentRoster.metadata.adminCount}</td><td>{casualties.length}</td><td>0</td></tr>
                </tbody>
              </table>
              <div className="worker-section real">
                <table className="worker-table real">
                  <thead><tr><th colSpan="2">근 무 자</th><th colSpan="2">사 고 자</th><th colSpan="2">자원근무자</th></tr><tr className="sub-header"><th>계급</th><th>성명</th><th>성명</th><th>사유</th><th>계급</th><th>성명</th></tr></thead>
                  <tbody>
                    {Array.from({ length: Math.max(1, currentTeamEmployees.length, casualties.length, (currentRoster.volunteerStaff || []).length) }).map((_, i) => (
                      <tr key={i}>
                        <td>{currentTeamEmployees[i]?.rank || ''}</td><td>{currentTeamEmployees[i]?.name || ''}</td>
                        <td>{casualties[i] ? employees.find(e => e.id === casualties[i].employeeId)?.name : ''}</td><td>{casualties[i]?.type || ''}</td>
                        <td>{currentRoster.volunteerStaff?.[i]?.rank || ''}</td><td>{currentRoster.volunteerStaff?.[i]?.name || ''}</td>
                      </tr>
                    ))}
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
                        if (dutyObj.name.includes('중점')) return <td key={slot} className="assignment-cell focus-cell" onClick={() => setFocusModalState({ isOpen: true, slot, duty: dutyObj.name })}><div className="staff-name-v">{currentRoster.focusAreas[key] || ''}</div></td>;
                        const staff = (currentRoster.assignments[key] || []).map(id => [...employees, ...(currentRoster.volunteerStaff || [])].find(e => e.id === id)).filter(Boolean);
                        return <td key={slot} className="assignment-cell" onClick={() => setModalState({ isOpen: true, slot, duty: dutyObj.name })}><div className="staff-names-v">{staff.map(e => <div key={e.id} className="staff-name-v">{e.name}</div>)}</div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <StaffSelectionModal isOpen={modalState.isOpen} onClose={() => setModalState({ ...modalState, isOpen: false })} slot={modalState.slot} duty={modalState.duty} employees={[...employees, ...(currentRoster.volunteerStaff || [])]} specialNotes={specialNotes.filter(n => n.date === currentRoster.date)} selectedIds={currentRoster.assignments[`${modalState.slot}_${modalState.duty}`] || []} currentAssignments={currentRoster.assignments} dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)} onSelect={handleToggleStaff} />
            <FocusPlaceSelectionModal isOpen={focusModalState.isOpen} onClose={() => setFocusModalState({ ...focusModalState, isOpen: false })} slot={focusModalState.slot} duty={focusModalState.duty} focusPlaces={settings.focusPlaces || []} selectedValue={currentRoster.focusAreas[`${focusModalState.slot}_${focusModalState.duty}`] || ''} currentFocusAreas={currentRoster.focusAreas} dutyTypes={settings.dutyTypes.filter(d => d.shift === '공통' || d.shift === currentRoster.shiftType)} onSelect={(val) => handleFocusChange(focusModalState.slot, focusModalState.duty, val)} />
            <VolunteerAddModal isOpen={volunteerAddModalOpen} onSave={(v) => setCurrentRoster(prev => ({ ...prev, volunteerStaff: [...(prev.volunteerStaff || []), v] }))} onClose={() => setVolunteerAddModalOpen(false)} />
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="admin-section">
            <div className="section-header-with-action"><h2>직원 명단 관리</h2><div className="action-btns"><button className={`btn-edit-mode ${isAddingEmployee ? 'active' : ''}`} onClick={() => setIsAddingEmployee(!isAddingEmployee)}>{isAddingEmployee ? <><X size={16} /> 취소</> : <><Plus size={16} /> 추가</>}</button><button className={`btn-edit-mode ${isStaffOrderEditMode ? 'active' : ''}`} onClick={() => setIsStaffOrderEditMode(!isStaffOrderEditMode)}>{isStaffOrderEditMode ? <><Save size={16} /> 완료</> : <><Edit2 size={16} /> 편집</>}</button></div></div>
            
            <div className="stats-dashboard">
              <div className="stats-card-v3">
                <h4>팀별 인원</h4>
                <div className="stats-grid-mini">
                  {settings.teams.map(team => {
                    const count = employees.filter(e => e.team === team).length;
                    return (
                      <div key={team} className="stats-item-mini">
                        <span className="stats-label">{team}</span>
                        <span className="stats-value">{count}명</span>
                      </div>
                    );
                  })}
                  <div className="stats-item-mini total">
                    <span className="stats-label">합계</span>
                    <span className="stats-value">{employees.length}명</span>
                  </div>
                </div>
              </div>
              <div className="stats-card-v3">
                <h4>계급별 인원</h4>
                <div className="stats-grid-mini">
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

            <div className="team-filter-tabs">{settings.teams.map(team => <button key={team} className={`team-tab-btn ${employeeTabTeam === team ? 'active' : ''}`} onClick={() => setEmployeeTabTeam(team)}>{team}</button>)}</div>
            <table className="admin-table interactive">
              <thead><tr>{isStaffOrderEditMode && <th></th>}<th>계급</th><th>성명</th><th>팀</th><th>고정대기</th><th>야간제외</th>{isStaffOrderEditMode && <th>작업</th>}</tr></thead>
              <tbody>
                {employees.filter(e => e.team === employeeTabTeam).map((emp) => (
                  <tr key={emp.id} draggable={isStaffOrderEditMode} onDragStart={() => handleDragStart(employees.indexOf(emp))} onDragOver={handleDragOver} onDrop={() => handleDrop(employees.indexOf(emp), employees, setEmployees)}>
                    {isStaffOrderEditMode && <td className="drag-handle"><Edit2 size={16} /></td>}
                    <td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.rank}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.name}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.team}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.isFixedNightStandby ? (emp.fixedNightStandbySlot || 'O') : 'X'}</td><td onClick={() => !isStaffOrderEditMode && setEditingEmployee(emp)}>{emp.isNightShiftExcluded ? 'O' : 'X'}</td>
                    {isStaffOrderEditMode && <td><button className="delete-btn-table" onClick={() => deleteEmployee(emp.id)}><Trash size={14} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <EmployeeAddModal isOpen={isAddingEmployee} settings={settings} onSave={addEmployee} onClose={() => setIsAddingEmployee(false)} />
            <EmployeeEditModal isOpen={!!editingEmployee} employee={editingEmployee} settings={settings} onSave={updateEmployee} onDelete={deleteEmployee} onClose={() => setEditingEmployee(null)} />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="admin-section">
            <div className="section-header-with-action">
              <h2>특이사항 관리</h2>
            </div>

            <div className="notes-container-v2">
              <div className="settings-card note-registration-card">
                <h3>특이사항 등록</h3>
                <div className="note-form-v2">
                  <div className="note-input-row">
                    <div className="note-input-group">
                      <label>기간 설정</label>
                      <div className="date-range-picker">
                        <input type="date" value={newNote.startDate} onChange={e => setNewNote({...newNote, startDate: e.target.value, endDate: e.target.value < newNote.endDate ? newNote.endDate : e.target.value})} />
                        <span>~</span>
                        <input type="date" value={newNote.endDate} onChange={e => setNewNote({...newNote, endDate: e.target.value})} min={newNote.startDate} />
                      </div>
                    </div>
                    <div className="note-input-group">
                      <label>유형</label>
                      <div className="btn-group">
                        {NOTE_TYPES.map(t => (
                          <button key={t} className={`selection-btn ${newNote.type === t ? 'active' : ''}`} onClick={() => setNewNote({...newNote, type: t, isAllDay: ['휴가', '병가'].includes(t)})}>{t}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="note-input-group">
                    <label>직원 선택 (팀별)</label>
                    <div className="team-filter-tabs-mini">
                      <button className={`team-tab-btn-mini ${noteTeamFilter === '' ? 'active' : ''}`} onClick={() => setNoteTeamFilter('')}>전체</button>
                      {settings.teams.map(t => (
                        <button key={t} className={`team-tab-btn-mini ${noteTeamFilter === t ? 'active' : ''}`} onClick={() => setNoteTeamFilter(t)}>{t}</button>
                      ))}
                    </div>
                    <div className="staff-selection-grid-mini scrollable">
                      {employees
                        .filter(e => !noteTeamFilter || e.team === noteTeamFilter)
                        .map(e => (
                          <div key={e.id} className={`staff-card-mini ${newNote.employeeId === e.id ? 'selected' : ''}`} onClick={() => setNewNote({...newNote, employeeId: e.id})}>
                            <span className="rank">{e.rank}</span>
                            <span className="name">{e.name}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  <div className="note-input-row">
                    <div className="note-input-group">
                      <label className="checkbox-item"><input type="checkbox" checked={newNote.isAllDay} onChange={e => setNewNote({...newNote, isAllDay: e.target.checked})} /> 하루 종일</label>
                    </div>
                    {!newNote.isAllDay && (
                      <div className="note-input-group">
                        <label>시간 설정</label>
                        <div className="time-input-row">
                          <input type="time" value={newNote.startTime} onChange={e => setNewNote({...newNote, startTime: e.target.value})} />
                          <span>~</span>
                          <input type="time" value={newNote.endTime} onChange={e => setNewNote({...newNote, endTime: e.target.value})} />
                        </div>
                      </div>
                    )}
                    <button className="btn-primary btn-full" onClick={addNote} style={{ marginTop: 'auto' }}><Plus size={18} /> 특이사항 등록</button>
                  </div>
                </div>
              </div>

              <div className="settings-card notes-list-card">
                <div className="card-header-with-action">
                  <h3>특이사항 목록</h3>
                  <div className="date-nav">
                    <input type="date" value={newNote.startDate} onChange={e => setNewNote({...newNote, startDate: e.target.value})} />
                    <span>의 목록</span>
                  </div>
                </div>
                <div className="notes-list-v2 scrollable">
                  {specialNotes.filter(n => n.date === newNote.startDate).length === 0 ? (
                    <div className="empty-state">해당 날짜에 등록된 특이사항이 없습니다.</div>
                  ) : (
                    specialNotes
                      .filter(n => n.date === newNote.startDate)
                      .sort((a, b) => employees.findIndex(e => e.id === a.employeeId) - employees.findIndex(e => e.id === b.employeeId))
                      .map(n => {
                        const emp = employees.find(e => e.id === n.employeeId);
                        return (
                          <div key={n.id} className="note-item-v2">
                            <div className="note-info">
                              <span className="emp-name">{emp?.rank} {emp?.name}</span>
                              <span className={`note-tag-v2 ${n.type}`}>{n.type}</span>
                              <span className="note-time">{n.isAllDay ? '종일' : `${n.startTime} ~ ${n.endTime}`}</span>
                            </div>
                            <button className="delete-btn-icon" onClick={() => deleteNote(n.id)}><Trash size={16} /></button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="admin-section">
            <h2>환경 설정</h2>
            <div className="settings-grid">
              <div className="settings-card collapsible">
                <div className="card-header-toggle" onClick={() => toggleCard('station')}>
                  <div className="title-area">
                    <h3>지구대 정보</h3>
                    <span className="hint-text-small">지구대 명칭 및 대장 성명 설정</span>
                  </div>
                  {expandedCards.station ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
                {expandedCards.station && (
                  <div className="card-content-area active">
                    <div className="card-header-with-action">
                      {!isEditingStation ? <button className="edit-btn-small" onClick={() => setIsEditingStation(true)}><Edit2 size={14} /> 수정</button> : <div className="action-btns"><button className="btn-save-small" onClick={() => { setSettings({ ...settings, ...tempStationSettings }); setIsEditingStation(false); }}><Save size={14} /> 저장</button><button className="btn-cancel-small" onClick={() => setIsEditingStation(false)}><X size={14} /> 취소</button></div>}
                    </div>
                    <div className="info-display">
                      <div className="info-item"><label>지구대 명칭</label>{isEditingStation ? <input type="text" value={tempStationSettings.stationName} onChange={e => setTempStationSettings({ ...tempStationSettings, stationName: e.target.value })} /> : <div className="value-text">{settings.stationName}</div>}</div>
                      <div className="info-item"><label>지구대장 성명</label>{isEditingStation ? <input type="text" value={tempStationSettings.chiefName} onChange={e => setTempStationSettings({ ...tempStationSettings, chiefName: e.target.value })} /> : <div className="value-text">{settings.chiefName}</div>}</div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="settings-card collapsible">
                <div className="card-header-toggle" onClick={() => toggleCard('team')}>
                  <div className="title-area">
                    <h3>팀 관리</h3>
                    <span className="hint-text-small">근무 팀(조) 목록 관리</span>
                  </div>
                  {expandedCards.team ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
                {expandedCards.team && (
                  <div className="card-content-area active">
                    <div className="note-form">
                      <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="새 팀" onKeyDown={e => e.key === 'Enter' && addTeam()} />
                      <button className="btn-primary" onClick={addTeam}>추가</button>
                    </div>
                    <div className="duty-type-list">
                      {settings.teams.map((t, i) => (
                        <div key={i} className="duty-type-item">
                          {editingTeamIdx === i ? (
                            <div className="edit-inline-form">
                              <input type="text" value={editingTeamValue} onChange={e => setEditingTeamValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (()=>{if(!editingTeamValue)return;const nt=[...settings.teams];nt[i]=editingTeamValue;setSettings({...settings,teams:nt});setEditingTeamIdx(null);})()} />
                              <div className="action-btns"><button className="btn-save" onClick={()=>{if(!editingTeamValue)return;const nt=[...settings.teams];nt[i]=editingTeamValue;setSettings({...settings,teams:nt});setEditingTeamIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingTeamIdx(null)}><X size={14} /></button></div>
                            </div>
                          ) : (
                            <><span>{t}</span><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingTeamIdx(i);setEditingTeamValue(t);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={()=>{if(window.confirm('삭제하시겠습니까?'))setSettings({...settings,teams:settings.teams.filter((_,idx)=>idx!==i)});}}><Trash size={14} /></button></div></>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-card collapsible">
                <div className="card-header-toggle" onClick={() => toggleCard('focus')}>
                  <div className="title-area">
                    <h3>중점 구역 관리</h3>
                    <span className="hint-text-small">거점 및 중점 순찰 구역 설정</span>
                  </div>
                  {expandedCards.focus ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
                {expandedCards.focus && (
                  <div className="card-content-area active">
                    <div className="note-form">
                      <input type="text" value={newFocusPlace} onChange={e => setNewFocusPlace(e.target.value)} placeholder="새 장소" onKeyDown={e => e.key === 'Enter' && addFocusPlace()} />
                      <button className="btn-primary" onClick={addFocusPlace}>추가</button>
                    </div>
                    <div className="duty-type-list">
                      {settings.focusPlaces?.map((p, i) => (
                        <div key={i} className="duty-type-item">
                          {editingFocusIdx === i ? (
                            <div className="edit-inline-form">
                              <input type="text" value={editingFocusValue} onChange={e => setEditingFocusValue(e.target.value)} autoFocus />
                              <div className="action-btns"><button className="btn-save" onClick={()=>{if(!editingFocusValue)return;const np=[...settings.focusPlaces];np[i]=editingFocusValue;setSettings({...settings,focusPlaces:np});setEditingFocusIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingFocusIdx(null)}><X size={14} /></button></div>
                            </div>
                          ) : (
                            <><span>{p}</span><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingFocusIdx(i);setEditingFocusValue(p);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={()=>{if(window.confirm('삭제하시겠습니까?'))setSettings({...settings,focusPlaces:settings.focusPlaces.filter((_,idx)=>idx!==i)});}}><Trash size={14} /></button></div></>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-card collapsible">
                <div className="card-header-toggle" onClick={() => toggleCard('duty')}>
                  <div className="title-area">
                    <h3>근무 유형 관리</h3>
                    <span className="hint-text-small">상황, 순찰, 대기 등 근무 항목 설정</span>
                  </div>
                  {expandedCards.duty ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
                {expandedCards.duty && (
                  <div className="card-content-area active">
                    <p className="hint-text">각 지구대 근무 실정에 맞게 근무 항목을 수정하거나 추가하세요.</p>
                    <div className="note-form">
                      <input type="text" value={newDutyType} onChange={e => setNewDutyType(e.target.value)} placeholder="새 유형" onKeyDown={e => e.key === 'Enter' && addDutyType()} />
                      <select value={newDutyShift} onChange={e => setNewDutyShift(e.target.value)}><option value="공통">공통</option><option value="주간">주간</option><option value="야간">야간</option></select>
                      <button className="btn-primary" onClick={addDutyType}>추가</button>
                    </div>
                    <div className="duty-type-list">
                      {settings.dutyTypes.map((d, i) => (
                        <div key={i} className="duty-type-item">
                          {editingDutyIdx === i ? (
                            <div className="edit-inline-form">
                              <input type="text" value={editingDutyValue} onChange={e => setEditingDutyValue(e.target.value)} autoFocus />
                              <select value={editingDutyShift} onChange={e => setEditingDutyShift(e.target.value)}><option value="공통">공통</option><option value="주간">주간</option><option value="야간">야간</option></select>
                              <div className="action-btns"><button className="btn-save" onClick={()=>{if(!editingDutyValue)return;const nd=[...settings.dutyTypes];nd[i]={name:editingDutyValue,shift:editingDutyShift};setSettings({...settings,dutyTypes:nd});setEditingDutyIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingDutyIdx(null)}><X size={14} /></button></div>
                            </div>
                          ) : (
                            <><span>{d.name} ({d.shift})</span><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingDutyIdx(i);setEditingDutyValue(d.name);setEditingDutyShift(d.shift);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={()=>{if(window.confirm('삭제하시겠습니까?'))setSettings({ ...settings, dutyTypes: settings.dutyTypes.filter((_, idx) => idx !== i) });}}><Trash size={14} /></button></div></>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-card collapsible">
                <div className="card-header-toggle" onClick={() => toggleCard('dayTime')}>
                  <div className="title-area">
                    <h3>주간 시간대 관리</h3>
                    <span className="hint-text-small">주간 근무 시간표 슬롯 설정</span>
                  </div>
                  {expandedCards.dayTime ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
                {expandedCards.dayTime && (
                  <div className="card-content-area active">
                    <div className="note-form">
                      <input type="text" value={newDayTimeSlot} onChange={e => setNewDayTimeSlot(e.target.value)} placeholder="09:00-10:00" onKeyDown={e => e.key === 'Enter' && addDayTimeSlot()} />
                      <button className="btn-primary" onClick={addDayTimeSlot}>추가</button>
                    </div>
                    <div className="duty-type-list">
                      {(settings.dayTimeSlots || DAY_TIME_SLOTS).map((s, i) => (
                        <div key={i} className="duty-type-item">
                          {editingDayTimeIdx === i ? (
                            <div className="edit-inline-form">
                              <input type="text" value={editingDayTimeValue} onChange={e => setEditingDayTimeValue(e.target.value)} autoFocus />
                              <div className="action-btns"><button className="btn-save" onClick={()=>{if(!editingDayTimeValue)return;const nts=[...settings.dayTimeSlots];nts[i]=editingDayTimeValue;setSettings({...settings,dayTimeSlots:nts});setEditingDayTimeIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingDayTimeIdx(null)}><X size={14} /></button></div>
                            </div>
                          ) : (
                            <><span>{s}</span><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingDayTimeIdx(i);setEditingDayTimeValue(s);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={()=>{if(window.confirm('삭제하시겠습니까?'))setSettings({ ...settings, dayTimeSlots: (settings.dayTimeSlots || DAY_TIME_SLOTS).filter((_, idx) => idx !== i) });}}><Trash size={14} /></button></div></>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-card collapsible">
                <div className="card-header-toggle" onClick={() => toggleCard('nightTime')}>
                  <div className="title-area">
                    <h3>야간 시간대 관리</h3>
                    <span className="hint-text-small">야간 근무 시간표 슬롯 설정</span>
                  </div>
                  {expandedCards.nightTime ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
                {expandedCards.nightTime && (
                  <div className="card-content-area active">
                    <div className="note-form">
                      <input type="text" value={newNightTimeSlot} onChange={e => setNewNightTimeSlot(e.target.value)} placeholder="20:00-22:00" onKeyDown={e => e.key === 'Enter' && addNightTimeSlot()} />
                      <button className="btn-primary" onClick={addNightTimeSlot}>추가</button>
                    </div>
                    <div className="duty-type-list">
                      {(settings.nightTimeSlots || NIGHT_TIME_SLOTS).map((s, i) => (
                        <div key={i} className="duty-type-item">
                          {editingNightTimeIdx === i ? (
                            <div className="edit-inline-form">
                              <input type="text" value={editingNightTimeValue} onChange={e => setEditingNightTimeValue(e.target.value)} autoFocus />
                              <div className="action-btns"><button className="btn-save" onClick={()=>{if(!editingNightTimeValue)return;const nts=[...settings.nightTimeSlots];nts[i]=editingNightTimeValue;setSettings({...settings,nightTimeSlots:nts});setEditingNightTimeIdx(null);}}><Save size={14} /></button><button className="btn-cancel" onClick={()=>setEditingNightTimeIdx(null)}><X size={14} /></button></div>
                            </div>
                          ) : (
                            <><span>{s}</span><div className="action-btns"><button className="edit-btn" onClick={()=>{setEditingNightTimeIdx(i);setEditingNightTimeValue(s);}}><Edit2 size={14} /></button><button className="delete-btn" onClick={()=>{if(window.confirm('삭제하시겠습니까?'))setSettings({ ...settings, nightTimeSlots: (settings.nightTimeSlots || NIGHT_TIME_SLOTS).filter((_, idx) => idx !== i) });}}><Trash size={14} /></button></div></>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

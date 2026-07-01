import { useState, useEffect } from "react";

const DAYS = ["월", "화", "수", "목", "금", "토"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat"];
const STATUS_OPTIONS = ["완료", "진행중", "예정", "보류"];
const STATUS_COLORS = {
  "완료": { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" },
  "진행중": { bg: "#e3f2fd", text: "#1565c0", border: "#42a5f5" },
  "예정": { bg: "#fff8e1", text: "#f57f17", border: "#ffe082" },
  "보류": { bg: "#e3f2fd", text: "#b71c1c", border: "#42a5f5" },
};

const TODAY_KEY = (() => { const d = new Date().getDay(); if (d === 0) return "mon"; if (d === 6) return "sat"; return DAY_KEYS[d - 1]; })();

function getWeekDates() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(now);
  mon.setDate(diff);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { month: d.getMonth() + 1, date: d.getDate() };
  });
}

function getWeekLabel() {
  const dates = getWeekDates();
  const now = new Date();
  const year = now.getFullYear();
  const fmt = ({ month, date }) => `${year}.${String(month).padStart(2, "0")}.${String(date).padStart(2, "0")}`;
  return `${fmt(dates[0])} ~ ${fmt(dates[5])}`;
}

const WEEK_DATES = getWeekDates();

// 고정 업무를 각 요일 맨 앞에 반영 (이미 있으면 스킵)
function applyPinned(data, pinnedList) {
  if (!pinnedList.length) return data;
  const result = {};
  DAY_KEYS.forEach((k) => {
    const day = data[k] || { tasks: [], special: "" };
    const existingTexts = day.tasks.filter(t => t.pinned).map(t => t.text);
    const toAdd = pinnedList
      .filter(p => !day.tasks.some(t => t.pinnedId === p.id))
      .map(p => ({ id: Math.random(), pinnedId: p.id, text: p.text, done: false, status: "예정", pinned: true }));
    const unpinned = day.tasks.filter(t => !t.pinned || pinnedList.some(p => p.id === t.pinnedId));
    result[k] = { ...day, tasks: [...toAdd, ...unpinned.filter(t => !t.pinned), ...unpinned.filter(t => t.pinned && pinnedList.some(p => p.id === t.pinnedId))] };
  });
  return result;
}

const initialDayData = () => ({
  tasks: [],
  special: "",
});

const initData = () => {
  const d = {};
  DAY_KEYS.forEach((k) => (d[k] = initialDayData()));
  return d;
};

const STORAGE_KEY = "work_journal_data";

// window.storage(아티팩트 전용) 우선, 없으면 localStorage fallback
const store = {
  async get(key) {
    if (typeof window.storage !== "undefined") {
      try { return await window.storage.get(key); } catch {}
    }
    try {
      const val = localStorage.getItem(key);
      return val ? { value: val } : null;
    } catch {}
    return null;
  },
  async set(key, value) {
    let ok = false;
    if (typeof window.storage !== "undefined") {
      try { const r = await window.storage.set(key, value); if (r) ok = true; } catch {}
    }
    try { localStorage.setItem(key, value); ok = true; } catch {}
    return ok;
  }
};

export default function App() {
  const [data, setData] = useState(initData);
  const [activeDay, setActiveDay] = useState(TODAY_KEY);
  const [view, setView] = useState("journal");
  const [newTaskText, setNewTaskText] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [pinModal, setPinModal] = useState(null); // { taskId, selectedDays }
  const [saveStatus, setSaveStatus] = useState(null);
  const [pinned, setPinned] = useState([]);
  const weekLabel = getWeekLabel();

  // 앱 시작 시 저장된 데이터 불러오기
  useEffect(() => {
    (async () => {
      try {
        const result = await store.get(STORAGE_KEY);
        const parsed = result?.value ? JSON.parse(result.value) : {};
        const ensured = {};
        DAY_KEYS.forEach((k) => {
          ensured[k] = parsed[k] || initialDayData();
        });
        // 고정 업무를 각 요일에 반영
        const pinnedRaw = parsed["__pinned__"] || [];
        setData(applyPinned(ensured, pinnedRaw));
        setPinned(pinnedRaw);
      } catch(e) {
        console.error("불러오기 오류:", e);
        setData(initData());
      }
      setLoaded(true);
    })();
  }, []);

  // 데이터 변경 시 자동 저장
  useEffect(() => {
    if (!loaded) return;
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      try {
        const savePayload = { ...data, __pinned__: pinned };
        const result = await store.set(STORAGE_KEY, JSON.stringify(savePayload));
        if (result) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus(null), 2000);
        } else {
          setSaveStatus("error");
        }
      } catch(e) {
        setSaveStatus("error");
        console.error("저장 오류:", e);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [data, pinned, loaded]);

  const updateDay = (dayKey, updater) => {
    setData((prev) => ({ ...prev, [dayKey]: updater(prev[dayKey]) }));
  };

  const addTask = () => {
    const text = newTaskText.trim();
    if (!text) return;
    updateDay(activeDay, (d) => ({
      ...d,
      tasks: [...d.tasks, { id: Math.random(), text, done: false, status: "예정" }],
    }));
    setNewTaskText("");
  };

  const openPinModal = (taskId) => {
    const task = dayData.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.pinned) {
      // 고정 해제: 플래그만 제거, 업무는 유지
      const newPinned = pinned.filter(p => p.id !== task.pinnedId);
      setPinned(newPinned);
      setData(prev => {
        const next = {};
        DAY_KEYS.forEach(k => {
          next[k] = { ...prev[k], tasks: prev[k].tasks.map(t =>
            t.pinnedId === task.pinnedId ? { ...t, pinned: false, pinnedId: undefined } : t
          )};
        });
        return next;
      });
    } else {
      // 모달 열기: 현재 요일 기본 선택
      setPinModal({ taskId, selectedDays: [activeDay] });
    }
  };

  const togglePinDay = (dayKey) => {
    setPinModal(prev => {
      const sel = prev.selectedDays.includes(dayKey)
        ? prev.selectedDays.filter(d => d !== dayKey)
        : [...prev.selectedDays, dayKey];
      return { ...prev, selectedDays: sel };
    });
  };

  const confirmPin = () => {
    if (!pinModal) return;
    const { taskId, selectedDays } = pinModal;
    const task = dayData.tasks.find(t => t.id === taskId);
    if (!task || selectedDays.length === 0) { setPinModal(null); return; }
    const newPin = { id: Math.random(), text: task.text, days: selectedDays };
    setPinned(prev => [...prev, newPin]);
    setData(prev => {
      const next = {};
      DAY_KEYS.forEach(k => {
        if (k === activeDay) {
          // 현재 요일: 선택됐으면 고정 플래그, 아니면 그대로
          next[k] = { ...prev[k], tasks: prev[k].tasks.map(t =>
            t.id === taskId
              ? { ...t, pinned: selectedDays.includes(k), pinnedId: selectedDays.includes(k) ? newPin.id : undefined }
              : t
          )};
        } else if (selectedDays.includes(k)) {
          // 선택된 다른 요일: 없으면 추가
          const already = prev[k].tasks.some(t => t.pinnedId === newPin.id);
          next[k] = already ? prev[k] : {
            ...prev[k],
            tasks: [{ id: Math.random(), pinnedId: newPin.id, text: newPin.text, done: false, status: "예정", pinned: true }, ...prev[k].tasks]
          };
        } else {
          next[k] = prev[k];
        }
      });
      return next;
    });
    setPinModal(null);
  };

  const toggleDone = (dayKey, taskId) => {
    updateDay(dayKey, (d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.id === taskId ? { ...t, done: !t.done, status: !t.done ? "완료" : "진행중" } : t
      ),
    }));
  };

  const setStatus = (dayKey, taskId, status) => {
    updateDay(dayKey, (d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.id === taskId ? { ...t, status, done: status === "완료" } : t
      ),
    }));
  };

  const deleteTask = (dayKey, taskId) => {
    updateDay(dayKey, (d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId) }));
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  const submitEdit = (dayKey, taskId) => {
    const text = editingText.trim();
    if (!text) return;
    updateDay(dayKey, (d) => ({
      ...d,
      tasks: d.tasks.map((t) => t.id === taskId ? { ...t, text } : t),
    }));
    setEditingId(null);
    setEditingText("");
  };

  const setSpecial = (dayKey, val) => {
    updateDay(dayKey, (d) => ({ ...d, special: val }));
  };

  const dayData = data[activeDay];
  const totalTasks = DAY_KEYS.reduce((s, k) => s + data[k].tasks.length, 0);
  const doneTasks = DAY_KEYS.reduce((s, k) => s + data[k].tasks.filter((t) => t.done).length, 0);
  const allDayDone = dayData.tasks.length > 0 && dayData.tasks.every((t) => t.done);

  const checkAllDay = () => {
    const nextDone = !allDayDone;
    updateDay(activeDay, (d) => ({
      ...d,
      tasks: d.tasks.map((t) => ({ ...t, done: nextDone, status: nextDone ? "완료" : "진행중" })),
    }));
  };

  const generateReport = async () => {
    setReportLoading(true);
    setReportContent(null);
    setView("report");

    const summary = DAY_KEYS.map((k, i) => {
      const d = data[k];
      const tasks = d.tasks.map((t) => `- ${t.text} [${t.status}]`).join("\n") || "- 업무 없음";
      const sp = d.special ? `\n특이사항: ${d.special}` : "";
      return `${DAYS[i]}요일:\n${tasks}${sp}`;
    }).join("\n\n");

    const prompt = `다음은 이번 주 업무일지 내용입니다:\n\n${summary}\n\n위 내용을 바탕으로 주간업무보고 양식에 맞게 각 요일별 주요 업무 내용을 간결하고 전문적으로 요약해 주세요. JSON 형식으로만 응답하세요 (백틱이나 마크다운 없이 순수 JSON만):\n{"mon":{"tasks":"요약내용","status":"진행상황"},"tue":{"tasks":"...","status":"..."},"wed":{"tasks":"...","status":"..."},"thu":{"tasks":"...","status":"..."},"fri":{"tasks":"...","status":"..."},"sat":{"tasks":"...","status":"..."},"special":"기타특이사항"}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
      const text = json.content?.map((c) => c.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      setReportContent(JSON.parse(clean));
    } catch (e) {
      setReportContent({ error: `오류: ${e.message}` });
    }
    setReportLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1565c0", padding: "0 24px", boxShadow: "0 2px 8px rgba(21,101,192,0.3)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📋</div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>업무일지</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{weekLabel}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {saveStatus === "saving" && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>저장 중...</span>}
            {saveStatus === "saved" && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>✓ 저장됨</span>}
            {saveStatus === "error" && <span style={{ fontSize: 12, color: "#ffcdd2", fontWeight: 600 }}>⚠ 저장 실패</span>}
            <button onClick={() => setView("journal")} style={{ padding: "8px 18px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", background: view === "journal" ? "#fff" : "rgba(255,255,255,0.12)", color: view === "journal" ? "#1565c0" : "#fff" }}>
              📝 일지 작성
            </button>
            <button onClick={generateReport} style={{ padding: "8px 18px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", background: view === "report" ? "#fff" : "rgba(255,255,255,0.12)", color: view === "report" ? "#1565c0" : "#fff" }}>
              📊 주간보고 생성
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>

        {/* Progress bar */}
        {view === "journal" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>이번 주 진행률</span>
              <span style={{ fontSize: 13, color: "#1565c0", fontWeight: 700 }}>{totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}% ({doneTasks}/{totalTasks})</span>
            </div>
            <div style={{ height: 8, background: "#e3f2fd", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0}%`, background: "linear-gradient(90deg, #1565c0, #42a5f5)", borderRadius: 8, transition: "width 0.4s" }} />
            </div>
          </div>
        )}

        {view === "journal" && (
          <div style={{ display: "flex", gap: 16 }}>
            {/* Day tabs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 72 }}>
              {DAY_KEYS.map((k, i) => {
                const count = data[k].tasks.length;
                const done = data[k].tasks.filter((t) => t.done).length;
                const isActive = activeDay === k;
                return (
                  <button key={k} onClick={() => setActiveDay(k)} style={{ padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", background: isActive ? "#1565c0" : "#fff", color: isActive ? "#fff" : "#444", fontWeight: 700, fontSize: 15, boxShadow: isActive ? "0 2px 8px rgba(21,101,192,0.25)" : "0 1px 3px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    {DAYS[i]}
                    <span style={{ fontSize: 11, fontWeight: 500, color: isActive ? "rgba(255,255,255,0.75)" : "#aaa" }}>
                      {WEEK_DATES[i].month}/{WEEK_DATES[i].date}
                    </span>
                    {count > 0 && (
                      <span style={{ fontSize: 10, color: isActive ? "rgba(255,255,255,0.7)" : "#bbb" }}>{done}/{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Task panel */}
            <div style={{ flex: 1 }}>
              <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                {/* Panel header */}
                <div style={{ background: "#1565c0", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
                    {DAYS[DAY_KEYS.indexOf(activeDay)]}요일 ({WEEK_DATES[DAY_KEYS.indexOf(activeDay)].month}/{WEEK_DATES[DAY_KEYS.indexOf(activeDay)].date}) 업무
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{dayData.tasks.filter((t) => t.done).length}/{dayData.tasks.length} 완료</span>
                    {dayData.tasks.length > 0 && (
                      <button onClick={checkAllDay} style={{ padding: "5px 12px", borderRadius: 6, border: "1.5px solid rgba(255,255,255,0.4)", background: allDayDone ? "#fff" : "rgba(255,255,255,0.12)", color: allDayDone ? "#1565c0" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        {allDayDone ? "✓ 전체 완료" : "전체 체크"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Add task */}
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: 10 }}>
                  <input
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTask()}
                    placeholder="업무 내용 입력 후 Enter 또는 추가 클릭"
                    style={{ flex: 1, padding: "10px 14px", border: "1.5px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none", color: "#333" }}
                  />
                  <button onClick={addTask} style={{ padding: "10px 18px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    + 추가
                  </button>
                </div>

                {/* Task list */}
                <div style={{ padding: "12px 20px", minHeight: 200 }}>
                  {dayData.tasks.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#bbb", paddingTop: 48, fontSize: 14 }}>
                      <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                      등록된 업무가 없습니다
                    </div>
                  ) : (
                    dayData.tasks.map((task) => {
                      const sc = STATUS_COLORS[task.status];
                      return (
                        <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #f5f5f5" }}>
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() => toggleDone(activeDay, task.id)}
                            style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#1565c0", flexShrink: 0 }}
                          />
                          {editingId === task.id ? (
                            <input
                              autoFocus
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitEdit(activeDay, task.id);
                                if (e.key === "Escape") { setEditingId(null); setEditingText(""); }
                              }}
                              onBlur={() => submitEdit(activeDay, task.id)}
                              style={{ flex: 1, fontSize: 14, padding: "3px 8px", border: "1.5px solid #1565c0", borderRadius: 6, outline: "none", color: "#222" }}
                            />
                          ) : (
                            <span
                              onDoubleClick={() => startEdit(task)}
                              title="더블클릭하여 수정"
                              style={{ flex: 1, fontSize: 14, color: task.done ? "#aaa" : "#222", textDecoration: task.done ? "line-through" : "none", cursor: "text" }}
                            >
                              {task.pinned && <span style={{ fontSize: 11, color: "#1565c0", marginRight: 4, fontWeight: 700 }}>고정</span>}
                              {task.text}
                            </span>
                          )}
                          <select
                            value={task.status}
                            onChange={(e) => setStatus(activeDay, task.id, e.target.value)}
                            style={{ padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${sc.border}`, background: sc.bg, color: sc.text, fontWeight: 600, fontSize: 12, cursor: "pointer", outline: "none" }}
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          {editingId !== task.id && (
                            <>
                              <button
                                onClick={() => openPinModal(task.id)}
                                title={task.pinned ? "고정 해제" : "고정 (매일 자동 추가)"}
                                style={{ background: task.pinned ? "#e3f2fd" : "none", border: `1px solid ${task.pinned ? "#1565c0" : "#ddd"}`, borderRadius: 4, cursor: "pointer", color: task.pinned ? "#1565c0" : "#aaa", fontSize: 11, fontWeight: 700, padding: "2px 7px", lineHeight: "18px" }}
                              >{task.pinned ? "고정중" : "고정"}</button>
                              <button
                                onClick={() => startEdit(task)}
                                style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", color: "#888", fontSize: 11, fontWeight: 600, padding: "2px 7px", lineHeight: "18px" }}
                                title="수정"
                              >수정</button>
                            </>
                          )}
                          <button
                            onClick={() => deleteTask(activeDay, task.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}
                          >×</button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Special notes */}
                <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #f0f0f0" }}>
                  <label style={{ fontSize: 13, color: "#888", fontWeight: 600, display: "block", marginBottom: 6 }}>특이사항</label>
                  <textarea
                    value={dayData.special}
                    onChange={(e) => setSpecial(activeDay, e.target.value)}
                    placeholder="특이사항을 입력하세요"
                    rows={2}
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8, fontSize: 13, resize: "vertical", outline: "none", color: "#444", boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Report */}
        {view === "report" && (
          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1565c0" }}>업무보고</div>
                <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{weekLabel}</div>
              </div>
              <button onClick={generateReport} style={{ padding: "8px 16px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                🔄 재생성
              </button>
            </div>

            {reportLoading && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#666" }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>⚙️</div>
                <div style={{ fontWeight: 600 }}>AI가 주간보고를 작성 중입니다...</div>
                <div style={{ fontSize: 13, color: "#aaa", marginTop: 8 }}>업무일지를 분석하여 자동으로 요약합니다</div>
              </div>
            )}

            {reportContent && !reportContent.error && (
              <div>
                <div style={{ padding: "0 32px 24px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
                    <thead>
                      <tr style={{ background: "#1565c0" }}>
                        <th style={{ padding: "14px 16px", color: "#fff", fontWeight: 700, fontSize: 14, width: 80, textAlign: "center", border: "1px solid #1565c0" }}>요일</th>
                        <th style={{ padding: "14px 16px", color: "#fff", fontWeight: 700, fontSize: 14, textAlign: "center", border: "1px solid #1565c0" }}>주요 업무 내용</th>
                        <th style={{ padding: "14px 16px", color: "#fff", fontWeight: 700, fontSize: 14, width: 120, textAlign: "center", border: "1px solid #1565c0" }}>진행상황</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAY_KEYS.map((k, i) => {
                        const row = reportContent[k] || {};
                        const rawTasks = data[k].tasks;
                        const done = rawTasks.filter((t) => t.done).length;
                        const total = rawTasks.length;
                        return (
                          <tr key={k} style={{ background: i % 2 === 1 ? "#e3f2fd" : "#fff" }}>
                            <td style={{ padding: "20px 16px", textAlign: "center", fontWeight: 700, fontSize: 15, color: "#1565c0", border: "1px solid #e3f2fd", verticalAlign: "top" }}>
                              {DAYS[i]}
                              {total > 0 && <div style={{ fontSize: 11, color: "#aaa", fontWeight: 400, marginTop: 4 }}>{done}/{total}</div>}
                            </td>
                            <td style={{ padding: "16px 20px", fontSize: 14, color: "#333", border: "1px solid #e3f2fd", lineHeight: 1.7, verticalAlign: "top" }}>
                              {row.tasks || <span style={{ color: "#bbb" }}>업무 없음</span>}
                            </td>
                            <td style={{ padding: "16px 20px", fontSize: 14, color: "#333", border: "1px solid #e3f2fd", lineHeight: 1.7, verticalAlign: "top" }}>
                              {row.status || <span style={{ color: "#bbb" }}>-</span>}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: "#e3f2fd" }}>
                        <td style={{ padding: "16px", textAlign: "center", fontWeight: 700, fontSize: 13, color: "#555", border: "1px solid #e3f2fd", verticalAlign: "top" }}>기타<br />특이사항</td>
                        <td colSpan={2} style={{ padding: "16px 20px", fontSize: 14, color: "#444", border: "1px solid #e3f2fd", lineHeight: 1.7 }}>
                          {reportContent.special || "-"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ margin: "0 32px 32px", padding: "16px 20px", background: "#e3f2fd", borderRadius: 10, border: "1px solid #e3f2fd" }}>
                  <div style={{ fontSize: 12, color: "#888", fontWeight: 700, marginBottom: 10 }}>📋 이번 주 업무 목록</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                    {DAY_KEYS.map((k, i) => {
                      const tasks = data[k].tasks;
                      if (!tasks.length) return null;
                      return (
                        <div key={k} style={{ minWidth: 140 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1565c0", marginBottom: 4 }}>{DAYS[i]}요일</div>
                          {tasks.map((t) => (
                            <div key={t.id} style={{ fontSize: 12, color: "#555", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                              <span>{t.done ? "✅" : "⬜"}</span>
                              <span style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "#aaa" : "#444" }}>{t.text}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {reportContent?.error && (
              <div style={{ padding: "40px", textAlign: "center", color: "#e53935" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                <div>{reportContent.error}</div>
              </div>
            )}

            {!reportLoading && !reportContent && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#999" }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>📊</div>
                <div>상단의 "주간보고 생성" 버튼을 눌러 보고서를 작성하세요</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 고정 요일 선택 모달 */}
      {pinModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 28px 24px", minWidth: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1565c0", marginBottom: 6 }}>고정할 요일 선택</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>선택한 요일에 이 업무가 고정됩니다</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
              {DAY_KEYS.map((k, i) => {
                const sel = pinModal.selectedDays.includes(k);
                return (
                  <button key={k} onClick={() => togglePinDay(k)} style={{ width: 48, height: 48, borderRadius: 10, border: sel ? "2px solid #1565c0" : "2px solid #e0e0e0", background: sel ? "#e3f2fd" : "#fafafa", color: sel ? "#1565c0" : "#888", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    {DAYS[i]}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPinModal(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #e0e0e0", background: "#fff", color: "#888", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>취소</button>
              <button onClick={confirmPin} disabled={pinModal.selectedDays.length === 0} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: pinModal.selectedDays.length === 0 ? "#e0e0e0" : "#1565c0", color: "#fff", fontWeight: 700, fontSize: 14, cursor: pinModal.selectedDays.length === 0 ? "not-allowed" : "pointer" }}>
                {pinModal.selectedDays.length === 0 ? "요일을 선택하세요" : pinModal.selectedDays.length + "개 요일에 고정"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

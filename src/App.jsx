import { useState, useEffect, useRef } from "react";

// 세션 및 설정 키
const SESSION_KEY = "diary-session-hash";

// 유틸리티 함수들
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function getMoodEmoji(mood) {
  const moods = { "😊": "기쁨", "😢": "슬픔", "😤": "화남", "😌": "평온", "🤩": "설렘", "😴": "피곤" };
  return moods[mood] || "";
}

const MOOD_LIST = ["😊", "😌", "🤩", "😢", "😤", "😴"];

async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 메인 App 컴포넌트
export default function App() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list");
  const [currentEntry, setCurrentEntry] = useState(null);
  const [passwordHash, setPasswordHash] = useState(sessionStorage.getItem(SESSION_KEY) || "");
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, msg: "", type: "info" });

  const showToast = (msg, type = "info") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: "", type: "info" }), 3000);
  };

  useEffect(() => { fetchEntries(); }, []);

  async function fetchEntries() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/entries");
      if (res.ok) {
        const data = await res.json();
        const parsedData = data.map(item => ({
          ...item,
          tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []),
          media: typeof item.media === 'string' ? JSON.parse(item.media) : (item.media || [])
        }));
        setEntries(parsedData);
      }
    } catch (err) {
      showToast("데이터 로드 실패", "error");
    } finally {
      setIsLoading(false);
    }
  }

  const handleSave = async (formData) => {
    if (!passwordHash) {
      showToast("먼저 비밀번호를 설정하세요.", "error");
      return;
    }
    const payload = { ...formData, password_hash: passwordHash };
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast("저장되었습니다.");
        await fetchEntries();
        setView("list");
        setCurrentEntry(null);
      } else {
        showToast("권한이 없거나 저장에 실패했습니다.", "error");
      }
    } catch (err) {
      showToast("서버 오류 발생", "error");
    }
  };

  const handleSetAuth = async (rawPw) => {
    const hash = await hashPassword(rawPw);
    setPasswordHash(hash);
    sessionStorage.setItem(SESSION_KEY, hash);
    showToast("인증되었습니다.");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password_hash: passwordHash })
      });
      if (res.ok) {
        showToast("삭제되었습니다.");
        await fetchEntries();
        setView("list");
      } else {
        showToast("삭제 권한이 없습니다.", "error");
      }
    } catch (err) {
      showToast("삭제 오류", "error");
    }
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 onClick={() => { setView("list"); setCurrentEntry(null); }} style={styles.logo}>🌿 나의 하루 일기</h1>
        <div style={styles.headerBtns}>
          {!passwordHash ? (
            <button onClick={() => { const pw = prompt("비밀번호 입력"); if(pw) handleSetAuth(pw); }} style={styles.authBtn}>로그인</button>
          ) : (
            <>
              <button onClick={() => { setView("write"); setCurrentEntry(null); }} style={styles.writeBtn}>새 일기</button>
              <button onClick={() => { setPasswordHash(""); sessionStorage.removeItem(SESSION_KEY); }} style={styles.authBtn}>로그아웃</button>
            </>
          )}
        </div>
      </header>

      <main style={styles.main}>
        {isLoading ? <div style={styles.loading}>불러오는 중...</div> : (
          <>
            {view === "list" && <ListView entries={entries} onRead={(e) => { setCurrentEntry(e); setView("read"); }} />}
            {view === "write" && <WriteView onSave={handleSave} onCancel={() => setView("list")} editData={currentEntry} />}
            {view === "read" && <ReadView entry={currentEntry} onEdit={() => setView("write")} onDelete={() => handleDelete(currentEntry.id)} onBack={() => setView("list")} isAuthor={!!passwordHash} />}
          </>
        )}
      </main>

      {toast.show && <div style={{...styles.toast, backgroundColor: toast.type === "error" ? "#e74c3c" : "#2ecc71"}}>{toast.msg}</div>}
    </div>
  );
}

// --- UI 컴포넌트들 (에러 방지를 위해 모두 포함) ---

function ListView({ entries, onRead }) {
  if (entries.length === 0) return <div style={{textAlign:"center", padding:"100px 0", color:"#95a5a6"}}>첫 일기를 작성해보세요.</div>;
  return (
    <div style={styles.listGrid}>
      {entries.map(entry => (
        <div key={entry.id} style={styles.card} onClick={() => onRead(entry)}>
          <div style={styles.cardMood}>{entry.mood}</div>
          <div style={styles.cardDate}>{formatDate(entry.date)}</div>
          <h3 style={styles.cardTitle}>{entry.title}</h3>
          <p style={styles.cardPreview}>{entry.content.substring(0, 60)}...</p>
        </div>
      ))}
    </div>
  );
}

function WriteView({ onSave, onCancel, editData }) {
  const [title, setTitle] = useState(editData?.title || "");
  const [content, setContent] = useState(editData?.content || "");
  const [mood, setMood] = useState(editData?.mood || "😊");
  const [date, setDate] = useState(editData?.date || getTodayStr());

  return (
    <div style={styles.formCard}>
      <input style={styles.inputTitle} value={title} onChange={e => setTitle(e.target.value)} placeholder="오늘의 제목" />
      <div style={styles.formRow}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.inputDate} />
        <div style={styles.moodPicker}>
          {MOOD_LIST.map(m => (
            <span key={m} onClick={() => setMood(m)} style={{...styles.moodItem, opacity: mood === m ? 1 : 0.3}}>{m}</span>
          ))}
        </div>
      </div>
      <textarea style={styles.textarea} value={content} onChange={e => setContent(e.target.value)} placeholder="오늘 어떤 일이 있었나요?" />
      <div style={styles.btnGroup}>
        <button onClick={onCancel} style={styles.cancelBtn}>취소</button>
        <button onClick={() => onSave({ id: editData?.id || crypto.randomUUID(), title, content, mood, date })} style={styles.saveBtn}>저장하기</button>
      </div>
    </div>
  );
}

function ReadView({ entry, onEdit, onDelete, onBack, isAuthor }) {
  return (
    <div style={styles.readCard}>
      <div style={styles.readHeader}>
        <div style={styles.readMood}>{entry.mood}</div>
        <div style={styles.readDate}>{formatDate(entry.date)}</div>
      </div>
      <h2 style={styles.readTitle}>{entry.title}</h2>
      <div style={styles.readContent}>{entry.content}</div>
      <div style={styles.readNav}>
        <button onClick={onBack} style={styles.cancelBtn}>뒤로가기</button>
        {isAuthor && (
          <div style={{gap: 10, display: "flex"}}>
            <button onClick={onEdit} style={styles.editBtn}>수정</button>
            <button onClick={onDelete} style={styles.deleteBtn}>삭제</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  app: { fontFamily: "'Noto Serif KR', serif", backgroundColor: "#f8f9fa", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", backgroundColor: "#fff", borderBottom: "1px solid #eee" },
  logo: { fontSize: "22px", color: "#27ae60", cursor: "pointer", margin: 0 },
  headerBtns: { display: "flex", gap: 10 },
  main: { padding: "40px 20px", maxWidth: "800px", margin: "0 auto" },
  listGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 20 },
  card: { background: "#fff", padding: 25, borderRadius: 15, boxShadow: "0 4px 6px rgba(0,0,0,0.05)", cursor: "pointer" },
  cardMood: { fontSize: 30, marginBottom: 10 },
  cardDate: { fontSize: 13, color: "#95a5a6", marginBottom: 8 },
  cardTitle: { fontSize: 18, margin: "0 0 10px 0", color: "#2c3e50" },
  cardPreview: { fontSize: 14, color: "#7f8c8d", lineHeight: 1.6 },
  formCard: { background: "#fff", padding: 30, borderRadius: 20, boxShadow: "0 10px 25px rgba(0,0,0,0.05)" },
  inputTitle: { width: "100%", border: "none", borderBottom: "2px solid #eee", fontSize: 24, padding: "10px 0", marginBottom: 20, outline: "none" },
  formRow: { display: "flex", justifyContent: "space-between", marginBottom: 20 },
  textarea: { width: "100%", minHeight: 300, border: "1px solid #eee", borderRadius: 10, padding: 15, fontSize: 16, lineHeight: 1.8, outline: "none", resize: "none" },
  btnGroup: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 },
  saveBtn: { padding: "12px 30px", background: "#27ae60", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" },
  cancelBtn: { padding: "12px 20px", background: "#eee", border: "none", borderRadius: 8, cursor: "pointer" },
  readCard: { background: "#fff", padding: 40, borderRadius: 20, boxShadow: "0 5px 15px rgba(0,0,0,0.05)" },
  readTitle: { fontSize: 28, margin: "20px 0" },
  readContent: { lineHeight: 1.9, whiteSpace: "pre-wrap" },
  deleteBtn: { background: "#e74c3c", color: "#fff", border: "none", padding: "8px 15px", borderRadius: 5, cursor: "pointer" },
  editBtn: { background: "#3498db", color: "#fff", border: "none", padding: "8px 15px", borderRadius: 5, cursor: "pointer" },
  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 20px", borderRadius: 20, zIndex: 1000 }
};

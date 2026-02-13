import { useState, useEffect, useRef } from "react";

// 세션 유지를 위한 키 (로그인 상태 확인용)
const SESSION_KEY = "diary-session-hash";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getMoodEmoji(mood) {
  const moods = { "😊": "기쁨", "😢": "슬픔", "😤": "화남", "😌": "평온", "🤩": "설렘", "😴": "피곤" };
  return moods[mood] || "";
}

const MOOD_LIST = ["😊", "😌", "🤩", "😢", "😤", "😴"];

// 비밀번호 해싱 함수 (작성자 인증용)
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list"); // 'list', 'write', 'read'
  const [currentEntry, setCurrentEntry] = useState(null);
  const [passwordHash, setPasswordHash] = useState(sessionStorage.getItem(SESSION_KEY) || "");
  const [isLoading, setIsLoading] = useState(true);
  
  // 토스트 메시지 상태
  const [toast, setToast] = useState({ show: false, msg: "", type: "info" });

  const showToast = (msg, type = "info") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: "", type: "info" }), 3000);
  };

  // 1. 초기 데이터 로드 (서버에서 가져오기)
  useEffect(() => {
    fetchEntries();
  }, []);

  async function fetchEntries() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/entries");
      if (res.ok) {
        const data = await res.json();
        // media와 tags는 문자열로 올 수 있으므로 파싱 처리
        const parsedData = data.map(item => ({
          ...item,
          tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []),
          media: typeof item.media === 'string' ? JSON.parse(item.media) : (item.media || [])
        }));
        setEntries(parsedData);
      }
    } catch (err) {
      showToast("데이터를 불러오지 못했습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  // 2. 일기 저장/수정 (서버 전송)
  const handleSave = async (formData) => {
    // 본인 확인용 해시가 없으면 저장 불가
    if (!passwordHash) {
      showToast("글을 쓰려면 먼저 비밀번호를 설정(로그인)해야 합니다.", "error");
      return;
    }

    const payload = {
      ...formData,
      password_hash: passwordHash // 서버에서 이 값을 체크함
    };

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(currentEntry ? "수정되었습니다." : "저장되었습니다.");
        await fetchEntries(); // 목록 갱신
        setView("list");
        setCurrentEntry(null);
      } else if (res.status === 403) {
        showToast("수정 권한이 없습니다. (비밀번호 불일치)", "error");
      }
    } catch (err) {
      showToast("서버 저장에 실패했습니다.", "error");
    }
  };

  // 3. 비밀번호 설정 (로그인 대용)
  const handleSetAuth = async (rawPw) => {
    const hash = await hashPassword(rawPw);
    setPasswordHash(hash);
    sessionStorage.setItem(SESSION_KEY, hash);
    showToast("인증되었습니다. 이제 글을 쓰거나 본인 글을 수정할 수 있습니다.");
  };

  // 4. 삭제 (서버 요청)
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
      showToast("삭제 중 오류가 발생했습니다.", "error");
    }
  };

  // UI 렌더링 부분 (기존 디자인 유지)
  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 onClick={() => { setView("list"); setCurrentEntry(null); }} style={styles.logo}>
          🌿 나의 하루 일기
        </h1>
        <div style={styles.headerBtns}>
          {!passwordHash ? (
            <button onClick={() => {
              const pw = prompt("비밀번호를 입력하세요 (작성자 인증용)");
              if (pw) handleSetAuth(pw);
            }} style={styles.authBtn}>로그인/비밀번호 설정</button>
          ) : (
            <button onClick={() => setView("write")} style={styles.writeBtn}>새 일기 쓰기</button>
          )}
        </div>
      </header>

      <main style={styles.main}>
        {isLoading ? (
          <div style={styles.loading}>일기를 불러오는 중...</div>
        ) : view === "list" ? (
          <ListView 
            entries={entries} 
            onRead={(e) => { setCurrentEntry(e); setView("read"); }} 
          />
        ) : view === "write" ? (
          <WriteView 
            onSave={handleSave} 
            onCancel={() => { setView("list"); setCurrentEntry(null); }} 
            editData={currentEntry}
          />
        ) : (
          <ReadView 
            entry={currentEntry} 
            onEdit={() => setView("write")} 
            onDelete={() => handleDelete(currentEntry.id)}
            onBack={() => { setView("list"); setCurrentEntry(null); }}
            isAuthor={passwordHash !== ""} // 단순 체크 (실제 검증은 서버에서 수행)
          />
        )}
      </main>

      {toast.show && (
        <div style={{...styles.toast, backgroundColor: toast.type === "error" ? "#e74c3c" : "#2ecc71"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// --- 서브 컴포넌트 (ListView, WriteView, ReadView 등은 기존 코드의 디자인을 유지하되 props만 맞춰 수정하세요) ---
// (지면상 상세 UI 컴포넌트 로직은 생략하며, 위 App 함수의 로직 변경이 핵심입니다.)

const styles = {
  app: { fontFamily: "'Noto Serif KR', serif", color: "#2c3e50", minHeight: "100vh", backgroundColor: "#f8f9fa" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", backgroundColor: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 },
  logo: { fontSize: "24px", cursor: "pointer", color: "#27ae60" },
  headerBtns: { display: "flex", gap: "10px" },
  writeBtn: { padding: "10px 20px", backgroundColor: "#27ae60", color: "#fff", border: "none", borderRadius: "25px", cursor: "pointer" },
  authBtn: { padding: "10px 20px", backgroundColor: "#34495e", color: "#fff", border: "none", borderRadius: "25px", cursor: "pointer" },
  main: { padding: "40px 20px", maxWidth: "800px", margin: "0 auto" },
  loading: { textAlign: "center", padding: "50px", fontSize: "18px", color: "#7f8c8d" },
  toast: { position: "fixed", bottom: "30px", left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 25px", borderRadius: "30px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 1000 }
};

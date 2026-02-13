import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "diary-entries-v2";
const AUTH_KEY = "diary-auth-setup";
const SESSION_KEY = "diary-session";

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMood, setFilterMood] = useState("");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const textRef = useRef(null);
  const fileInputRef = useRef(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState(null);
  const [authInput, setAuthInput] = useState("");
  const [authConfirm, setAuthConfirm] = useState("");
  const [authError, setAuthError] = useState("");
  const [passwordHash, setPasswordHash] = useState(null);
  const [pendingWrite, setPendingWrite] = useState(false); // 로그인 후 글쓰기로 이동

  const [form, setForm] = useState({
    date: getTodayStr(),
    title: "",
    content: "",
    mood: "😊",
    tags: "",
    media: [],
  });

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const authResult = await window.storage.get(AUTH_KEY).catch(() => null);
        if (authResult && authResult.value) {
          const hash = authResult.value;
          setPasswordHash(hash);
          const session = sessionStorage.getItem(SESSION_KEY);
          if (session === hash) {
            setIsAuthenticated(true);
          } else {
            setAuthView("login");
          }
        } else {
          setAuthView("setup");
        }
        const result = await window.storage.get(STORAGE_KEY).catch(() => null);
        if (result && result.value) {
          setEntries(JSON.parse(result.value));
        }
      } catch {
        setEntries([]);
      }
      setLoading(false);
    }
    init();
  }, []);

  async function saveEntries(updated) {
    setEntries(updated);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      showToast("저장 중 오류가 발생했습니다.", "error");
    }
  }

  async function handleSetupPassword() {
    setAuthError("");
    if (authInput.length < 4) { setAuthError("비밀번호는 4자 이상이어야 합니다."); return; }
    if (authInput !== authConfirm) { setAuthError("비밀번호가 일치하지 않습니다."); return; }
    const hash = await hashPassword(authInput);
    await window.storage.set(AUTH_KEY, hash);
    setPasswordHash(hash);
    sessionStorage.setItem(SESSION_KEY, hash);
    setIsAuthenticated(true);
    setAuthView(null);
    setAuthInput("");
    setAuthConfirm("");
    showToast("비밀번호가 설정되었습니다! 🔐");
  }

  async function handleLogin() {
    setAuthError("");
    const hash = await hashPassword(authInput);
    if (hash === passwordHash) {
      sessionStorage.setItem(SESSION_KEY, hash);
      setIsAuthenticated(true);
      setAuthView(null);
      setAuthInput("");
      if (pendingWrite) {
        setPendingWrite(false);
        setForm({ date: getTodayStr(), title: "", content: "", mood: "😊", tags: "", media: [] });
        setEditMode(false);
        setSelected(null);
        setView("write");
        setTimeout(() => textRef.current?.focus(), 100);
      }
    } else {
      setAuthError("비밀번호가 틀렸습니다.");
    }
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function handleMediaChange(e) {
    const files = Array.from(e.target.files);
    const converted = await Promise.all(files.map(fileToBase64));
    setForm((prev) => ({ ...prev, media: [...prev.media, ...converted] }));
    e.target.value = "";
  }

  function removeMedia(idx) {
    setForm((prev) => ({ ...prev, media: prev.media.filter((_, i) => i !== idx) }));
  }

  function openWrite(entry = null) {
    if (!isAuthenticated) { setPendingWrite(true); setAuthView("login"); return; }
    if (entry) {
      setForm({ date: entry.date, title: entry.title, content: entry.content, mood: entry.mood, tags: entry.tags || "", media: entry.media || [] });
      setEditMode(true);
      setSelected(entry);
    } else {
      setForm({ date: getTodayStr(), title: "", content: "", mood: "😊", tags: "", media: [] });
      setEditMode(false);
      setSelected(null);
    }
    setView("write");
    setTimeout(() => textRef.current?.focus(), 100);
  }

  async function handleSave() {
    if (!form.title.trim()) { showToast("제목을 입력해주세요.", "error"); return; }
    if (!form.content.trim()) { showToast("내용을 입력해주세요.", "error"); return; }
    if (editMode && selected) {
      const updated = entries.map((e) => e.id === selected.id ? { ...e, ...form, updatedAt: new Date().toISOString() } : e);
      await saveEntries(updated);
      setSelected({ ...selected, ...form });
      showToast("수정되었습니다! ✏️");
      setView("read");
    } else {
      const newEntry = { id: Date.now().toString(), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const updated = [newEntry, ...entries].sort((a, b) => b.date.localeCompare(a.date));
      await saveEntries(updated);
      showToast("저장되었습니다! 🌿");
      setSelected(newEntry);
      setView("read");
    }
  }

  async function handleDelete(entry) {
    const updated = entries.filter((e) => e.id !== entry.id);
    await saveEntries(updated);
    setDeleteConfirm(null);
    showToast("삭제되었습니다.");
    setView("list");
    setSelected(null);
  }

  function openRead(entry) { setSelected(entry); setView("read"); }

  const filtered = entries.filter((e) => {
    const matchSearch = !searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase()) || e.content.toLowerCase().includes(searchQuery.toLowerCase()) || (e.tags || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchMood = !filterMood || e.mood === filterMood;
    return matchSearch && matchMood;
  });

  const grouped = filtered.reduce((acc, e) => {
    const month = e.date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(e);
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.loadingWrap}>
          <div style={styles.loadingSpinner} />
          <p style={styles.loadingText}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (authView === "setup" || authView === "login") {
    const isSetup = authView === "setup";
    return (
      <div style={styles.root}>
        <div style={styles.bgTexture} />
        <div style={styles.authWrap}>
          <div style={styles.authCard}>
            <div style={styles.authIcon}>{isSetup ? "🔐" : "🌿"}</div>
            <h2 style={styles.authTitle}>{isSetup ? "비밀번호 설정" : "나의 하루 일기"}</h2>
            <p style={styles.authSub}>{isSetup ? "일기를 보호할 비밀번호를 설정해주세요." : "비밀번호를 입력해주세요."}</p>
            <input style={styles.authInput} type="password" placeholder={isSetup ? "비밀번호 입력 (4자 이상)" : "비밀번호"} value={authInput} onChange={(e) => setAuthInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (isSetup ? handleSetupPassword() : handleLogin())} autoFocus />
            {isSetup && (
              <input style={{ ...styles.authInput, marginTop: 10 }} type="password" placeholder="비밀번호 확인" value={authConfirm} onChange={(e) => setAuthConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSetupPassword()} />
            )}
            {authError && <p style={styles.authError}>{authError}</p>}
            <button style={styles.authBtn} onClick={isSetup ? handleSetupPassword : handleLogin}>
              {isSetup ? "설정 완료" : "입장하기"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.bgTexture} />
      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "error" ? "#c0392b" : "#2d6a4f" }}>{toast.msg}</div>
      )}
      {deleteConfirm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>정말 삭제할까요?</p>
            <p style={styles.modalSub}>「{deleteConfirm.title}」을 삭제하면 되돌릴 수 없습니다.</p>
            <div style={styles.modalActions}>
              <button style={styles.btnGhost} onClick={() => setDeleteConfirm(null)}>취소</button>
              <button style={styles.btnDanger} onClick={() => handleDelete(deleteConfirm)}>삭제</button>
            </div>
          </div>
        </div>
      )}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo} onClick={() => setView("list")}>
            <span style={styles.logoLeaf}>🌿</span>
            <span style={styles.logoText}>나의 하루 일기</span>
          </div>
          <div style={styles.headerRight}>
            {view !== "list" && <button style={styles.btnBack} onClick={() => setView("list")}>← 목록</button>}
            {view === "list" && <button style={styles.btnPrimary} onClick={() => openWrite()}>+ 새 일기</button>}
            {view === "read" && selected && isAuthenticated && (
              <>
                <button style={styles.btnSecondary} onClick={() => openWrite(selected)}>✏️ 수정</button>
                <button style={styles.btnDanger2} onClick={() => setDeleteConfirm(selected)}>🗑️ 삭제</button>
              </>
            )}
          </div>
        </div>
      </header>
      <main style={styles.main}>
        {view === "list" && (
          <div style={styles.listContainer}>
            <div style={styles.statsRow}>
              <div style={styles.statCard}><span style={styles.statNum}>{entries.length}</span><span style={styles.statLabel}>총 일기</span></div>
              <div style={styles.statCard}><span style={styles.statNum}>{entries.filter((e) => e.date === getTodayStr()).length > 0 ? "✓" : "○"}</span><span style={styles.statLabel}>오늘 기록</span></div>
              <div style={styles.statCard}><span style={styles.statNum}>{[...new Set(entries.map((e) => e.date.slice(0, 7)))].length}</span><span style={styles.statLabel}>달 수</span></div>
            </div>
            <div style={styles.searchRow}>
              <input style={styles.searchInput} placeholder="🔍  제목, 내용, 태그 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <div style={styles.moodFilter}>
                <button style={{ ...styles.moodBtn, ...(filterMood === "" ? styles.moodBtnActive : {}) }} onClick={() => setFilterMood("")}>전체</button>
                {MOOD_LIST.map((m) => (
                  <button key={m} style={{ ...styles.moodBtn, ...(filterMood === m ? styles.moodBtnActive : {}) }} onClick={() => setFilterMood(filterMood === m ? "" : m)}>{m}</button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div style={styles.empty}>
                <div style={styles.emptyIcon}>📖</div>
                <p style={styles.emptyTitle}>{entries.length === 0 ? "첫 일기를 써보세요" : "검색 결과가 없어요"}</p>
                {entries.length === 0 && <button style={styles.btnPrimary} onClick={() => openWrite()}>오늘 하루 기록하기</button>}
              </div>
            ) : (
              Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => (
                <div key={month}>
                  <div style={styles.monthLabel}>
                    {new Date(month + "-01").toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
                    <span style={styles.monthCount}>{items.length}개</span>
                  </div>
                  <div style={styles.entryGrid}>
                    {items.map((entry) => (
                      <div key={entry.id} style={styles.card} onClick={() => openRead(entry)}>
                        {entry.media && entry.media.length > 0 && entry.media[0].type.startsWith("image/") && (
                          <div style={styles.cardThumb}>
                            <img src={entry.media[0].data} alt="썸네일" style={styles.cardThumbImg} />
                            {entry.media.length > 1 && <span style={styles.cardMediaCount}>+{entry.media.length - 1}</span>}
                          </div>
                        )}
                        {entry.media && entry.media.length > 0 && entry.media[0].type.startsWith("video/") && (
                          <div style={styles.cardThumb}>
                            <div style={styles.cardVideoThumb}>🎬</div>
                            {entry.media.length > 1 && <span style={styles.cardMediaCount}>+{entry.media.length - 1}</span>}
                          </div>
                        )}
                        <div style={styles.cardBody}>
                          <div style={styles.cardTop}>
                            <span style={styles.cardMood}>{entry.mood}</span>
                            <span style={styles.cardDate}>{entry.date.slice(5).replace("-", ".")}</span>
                          </div>
                          <h3 style={styles.cardTitle}>{entry.title}</h3>
                          <p style={styles.cardExcerpt}>{entry.content.slice(0, 80)}{entry.content.length > 80 ? "..." : ""}</p>
                          {entry.tags && (
                            <div style={styles.cardTags}>
                              {entry.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} style={styles.tag}>#{t}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === "write" && (
          <div style={styles.writeContainer}>
            <h2 style={styles.writeHeading}>{editMode ? "일기 수정" : "새 일기 쓰기"}</h2>
            <div style={styles.writeForm}>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>날짜</label>
                  <input type="date" style={styles.inputDate} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>오늘의 기분</label>
                  <div style={styles.moodPicker}>
                    {MOOD_LIST.map((m) => (
                      <button key={m} style={{ ...styles.moodPickBtn, ...(form.mood === m ? styles.moodPickBtnActive : {}) }} onClick={() => setForm({ ...form, mood: m })} title={getMoodEmoji(m)}>{m}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>제목</label>
                <input style={styles.inputText} placeholder="오늘 하루를 한 줄로..." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>내용</label>
                <textarea ref={textRef} style={styles.textarea} placeholder="오늘 있었던 일, 느꼈던 감정, 생각들을 자유롭게 적어보세요..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={14} />
                <div style={styles.charCount}>{form.content.length}자</div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>사진 / 동영상 <span style={styles.labelSub}>(여러 개 첨부 가능)</span></label>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={handleMediaChange} />
                <button style={styles.mediaUploadBtn} onClick={() => fileInputRef.current?.click()}>📎 파일 추가하기</button>
                {form.media.length > 0 && (
                  <div style={styles.mediaPreviewGrid}>
                    {form.media.map((m, idx) => (
                      <div key={idx} style={styles.mediaPreviewItem}>
                        {m.type.startsWith("image/") ? (
                          <img src={m.data} alt={m.name} style={styles.mediaPreviewImg} />
                        ) : (
                          <video src={m.data} style={styles.mediaPreviewImg} controls />
                        )}
                        <button style={styles.mediaRemoveBtn} onClick={() => removeMedia(idx)}>✕</button>
                        <span style={styles.mediaFileName}>{m.type.startsWith("image/") ? "🖼" : "🎬"} {m.name.slice(0, 14)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>태그 <span style={styles.labelSub}>(쉼표로 구분)</span></label>
                <input style={styles.inputText} placeholder="여행, 일상, 감사..." value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div style={styles.formActions}>
                <button style={styles.btnGhost} onClick={() => setView(editMode ? "read" : "list")}>취소</button>
                <button style={styles.btnSave} onClick={handleSave}>{editMode ? "수정 완료" : "저장하기"}</button>
              </div>
            </div>
          </div>
        )}

        {view === "read" && selected && (
          <div style={styles.readContainer}>
            <div style={styles.readCard}>
              <div style={styles.readHeader}>
                <div style={styles.readMoodDate}>
                  <span style={styles.readMood}>{selected.mood}</span>
                  <span style={styles.readDateStr}>{formatDate(selected.date)}</span>
                </div>
                <h1 style={styles.readTitle}>{selected.title}</h1>
                {selected.tags && (
                  <div style={styles.readTags}>
                    {selected.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} style={styles.tag}>#{t}</span>)}
                  </div>
                )}
                <div style={styles.readMeta}>
                  작성 {new Date(selected.createdAt).toLocaleString("ko-KR")}
                  {selected.updatedAt !== selected.createdAt && <span> · 수정 {new Date(selected.updatedAt).toLocaleString("ko-KR")}</span>}
                </div>
              </div>
              <div style={styles.readDivider} />
              {selected.media && selected.media.length > 0 && (
                <div style={styles.mediaGallery}>
                  {selected.media.map((m, idx) => (
                    <div key={idx} style={styles.mediaGalleryItem}>
                      {m.type.startsWith("image/") ? (
                        <img src={m.data} alt={m.name} style={styles.mediaGalleryImg} onClick={() => window.open(m.data, "_blank")} />
                      ) : (
                        <video src={m.data} style={styles.mediaGalleryImg} controls playsInline />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={styles.readContent}>
                {selected.content.split("\n").map((line, i) => <p key={i} style={styles.readPara}>{line || <br />}</p>)}
              </div>
            </div>
            <div style={styles.readNav}>
              {(() => {
                const idx = entries.findIndex((e) => e.id === selected.id);
                const prev = entries[idx + 1];
                const next = entries[idx - 1];
                return (
                  <>
                    {prev ? <button style={styles.navBtn} onClick={() => openRead(prev)}>← {prev.title.slice(0, 20)}{prev.title.length > 20 ? "..." : ""}</button> : <div />}
                    {next ? <button style={styles.navBtn} onClick={() => openRead(next)}>{next.title.slice(0, 20)}{next.title.length > 20 ? "..." : ""} →</button> : <div />}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </main>
      <footer style={styles.footer}>나의 하루를 기록하는 공간 🌿</footer>
    </div>
  );
}

const palette = {
  bg: "#faf8f3", surface: "#ffffff", ink: "#2c2c2c", inkLight: "#6b6b6b",
  inkMuted: "#9b9b9b", accent: "#3d6b47", accentLight: "#e8f0ea",
  accentSoft: "#c4dbc9", border: "#e4dfd6", danger: "#c0392b", dangerLight: "#fdecea",
};

const styles = {
  root: { minHeight: "100vh", background: palette.bg, fontFamily: "'Noto Serif KR', 'Georgia', serif", color: palette.ink, position: "relative", overflowX: "hidden" },
  bgTexture: { position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8bfad' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`, pointerEvents: "none", zIndex: 0 },
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16 },
  loadingSpinner: { width: 40, height: 40, border: "3px solid #e4dfd6", borderTop: "3px solid #3d6b47", borderRadius: "50%", animation: "spin 0.9s linear infinite" },
  loadingText: { color: "#9b9b9b", fontSize: 14, fontFamily: "sans-serif" },
  authWrap: { position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px" },
  authCard: { background: "#fff", border: "1px solid #e4dfd6", borderRadius: 24, padding: "48px 40px", maxWidth: 380, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center" },
  authIcon: { fontSize: 48, marginBottom: 16 },
  authTitle: { fontSize: 24, fontWeight: 800, margin: "0 0 8px", color: "#2c2c2c", textAlign: "center" },
  authSub: { fontSize: 14, color: "#6b6b6b", margin: "0 0 24px", textAlign: "center", fontFamily: "sans-serif", lineHeight: 1.6 },
  authInput: { width: "100%", padding: "12px 16px", border: "1.5px solid #e4dfd6", borderRadius: 12, fontSize: 15, background: "#faf8f3", color: "#2c2c2c", outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
  authError: { color: "#c0392b", fontSize: 13, margin: "8px 0 0", fontFamily: "sans-serif", textAlign: "center" },
  authBtn: { marginTop: 20, width: "100%", background: "#3d6b47", color: "#fff", border: "none", borderRadius: 30, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3 },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 24px", borderRadius: 30, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", letterSpacing: 0.3, fontFamily: "sans-serif" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: palette.surface, borderRadius: 16, padding: "32px 36px", maxWidth: 360, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle: { fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: palette.ink },
  modalSub: { fontSize: 14, color: palette.inkLight, margin: "0 0 24px", lineHeight: 1.6 },
  modalActions: { display: "flex", gap: 12, justifyContent: "flex-end" },
  header: { position: "sticky", top: 0, zIndex: 100, background: "rgba(250,248,243,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${palette.border}` },
  headerInner: { maxWidth: 860, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" },
  logoLeaf: { fontSize: 22 },
  logoText: { fontSize: 18, fontWeight: 700, color: palette.accent, letterSpacing: -0.3 },
  headerRight: { display: "flex", gap: 8, alignItems: "center" },
  btnPrimary: { background: palette.accent, color: "#fff", border: "none", borderRadius: 24, padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { background: palette.accentLight, color: palette.accent, border: "none", borderRadius: 24, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnDanger2: { background: palette.dangerLight, color: palette.danger, border: "none", borderRadius: 24, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "transparent", color: palette.inkLight, border: `1px solid ${palette.border}`, borderRadius: 24, padding: "8px 18px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  btnDanger: { background: palette.danger, color: "#fff", border: "none", borderRadius: 24, padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnSave: { background: palette.accent, color: "#fff", border: "none", borderRadius: 24, padding: "12px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3 },
  btnBack: { background: "transparent", color: palette.inkLight, border: "none", padding: "6px 12px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  main: { position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px", minHeight: "calc(100vh - 120px)" },
  listContainer: { maxWidth: 860 },
  statsRow: { display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" },
  statCard: { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 90, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
  statNum: { fontSize: 26, fontWeight: 800, color: palette.accent },
  statLabel: { fontSize: 12, color: palette.inkMuted, fontFamily: "sans-serif" },
  searchRow: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 },
  searchInput: { width: "100%", padding: "12px 18px", border: `1.5px solid ${palette.border}`, borderRadius: 30, fontSize: 14, background: palette.surface, color: palette.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
  moodFilter: { display: "flex", gap: 8, flexWrap: "wrap" },
  moodBtn: { background: palette.surface, border: `1.5px solid ${palette.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 14, cursor: "pointer", fontFamily: "sans-serif", color: palette.inkLight },
  moodBtnActive: { background: palette.accentLight, borderColor: palette.accent, color: palette.accent, fontWeight: 600 },
  monthLabel: { fontSize: 13, fontWeight: 700, color: palette.inkMuted, letterSpacing: 0.5, marginBottom: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 10, fontFamily: "sans-serif" },
  monthCount: { fontSize: 11, background: palette.accentLight, color: palette.accent, padding: "2px 8px", borderRadius: 10, fontWeight: 700 },
  entryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginBottom: 32 },
  card: { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
  cardThumb: { position: "relative", width: "100%", height: 160, overflow: "hidden", background: "#f0ebe4" },
  cardThumbImg: { width: "100%", height: "100%", objectFit: "cover" },
  cardVideoThumb: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 },
  cardMediaCount: { position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 10, fontFamily: "sans-serif" },
  cardBody: { padding: "16px" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardMood: { fontSize: 20 },
  cardDate: { fontSize: 12, color: palette.inkMuted, fontFamily: "sans-serif", fontWeight: 600 },
  cardTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.4, color: palette.ink },
  cardExcerpt: { fontSize: 13, color: palette.inkLight, lineHeight: 1.6, margin: "0 0 10px", fontFamily: "sans-serif" },
  cardTags: { display: "flex", flexWrap: "wrap", gap: 4 },
  tag: { fontSize: 11, background: palette.accentLight, color: palette.accent, padding: "2px 8px", borderRadius: 10, fontWeight: 600, fontFamily: "sans-serif" },
  empty: { textAlign: "center", padding: "80px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 18, color: palette.inkLight, fontFamily: "sans-serif" },
  writeContainer: { maxWidth: 680, margin: "0 auto" },
  writeHeading: { fontSize: 26, fontWeight: 800, marginBottom: 28, color: palette.ink },
  writeForm: { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 20, padding: "32px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" },
  formRow: { display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" },
  formGroup: { marginBottom: 20, flex: 1, minWidth: 200 },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: palette.inkLight, marginBottom: 8, fontFamily: "sans-serif", letterSpacing: 0.3 },
  labelSub: { fontWeight: 400, color: palette.inkMuted },
  inputDate: { width: "100%", padding: "10px 14px", border: `1.5px solid ${palette.border}`, borderRadius: 10, fontSize: 14, background: palette.bg, color: palette.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
  inputText: { width: "100%", padding: "10px 14px", border: `1.5px solid ${palette.border}`, borderRadius: 10, fontSize: 15, background: palette.bg, color: palette.ink, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  moodPicker: { display: "flex", gap: 6 },
  moodPickBtn: { fontSize: 22, background: "transparent", border: "2px solid transparent", borderRadius: 10, padding: "4px 6px", cursor: "pointer" },
  moodPickBtnActive: { background: palette.accentLight, border: `2px solid ${palette.accent}` },
  textarea: { width: "100%", padding: "14px", border: `1.5px solid ${palette.border}`, borderRadius: 10, fontSize: 15, background: palette.bg, color: palette.ink, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.8, boxSizing: "border-box" },
  charCount: { textAlign: "right", fontSize: 12, color: palette.inkMuted, marginTop: 4, fontFamily: "sans-serif" },
  mediaUploadBtn: { background: palette.accentLight, color: palette.accent, border: `1.5px dashed ${palette.accentSoft}`, borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "sans-serif" },
  mediaPreviewGrid: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 },
  mediaPreviewItem: { position: "relative", width: 100, borderRadius: 10, overflow: "hidden", border: `1px solid ${palette.border}`, background: palette.bg, display: "flex", flexDirection: "column" },
  mediaPreviewImg: { width: 100, height: 80, objectFit: "cover", display: "block" },
  mediaRemoveBtn: { position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  mediaFileName: { fontSize: 10, color: palette.inkMuted, padding: "4px 6px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", fontFamily: "sans-serif" },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 },
  mediaGallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 28 },
  mediaGalleryItem: { borderRadius: 12, overflow: "hidden", border: `1px solid ${palette.border}` },
  mediaGalleryImg: { width: "100%", maxHeight: 320, objectFit: "cover", display: "block", cursor: "pointer" },
  readContainer: { maxWidth: 680, margin: "0 auto" },
  readCard: { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 20, padding: "40px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", marginBottom: 24 },
  readHeader: { marginBottom: 24 },
  readMoodDate: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  readMood: { fontSize: 32 },
  readDateStr: { fontSize: 15, color: palette.inkLight, fontFamily: "sans-serif", fontWeight: 600 },
  readTitle: { fontSize: 28, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.3, color: palette.ink },
  readTags: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  readMeta: { fontSize: 12, color: palette.inkMuted, fontFamily: "sans-serif" },
  readDivider: { height: 1, background: palette.border, margin: "24px 0" },
  readContent: {},
  readPara: { fontSize: 16, lineHeight: 1.9, margin: "0 0 12px", color: palette.ink },
  readNav: { display: "flex", justifyContent: "space-between", gap: 12 },
  navBtn: { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 30, padding: "10px 20px", fontSize: 13, color: palette.inkLight, cursor: "pointer", fontFamily: "sans-serif", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  footer: { position: "relative", zIndex: 1, textAlign: "center", padding: "20px", fontSize: 13, color: palette.inkMuted, borderTop: `1px solid ${palette.border}`, fontFamily: "sans-serif" },
};

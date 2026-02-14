import { useState, useEffect, useRef } from "react";

// 세션 키
const SESSION_KEY = "diary-session-hash";

// 유틸리티 함수들
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function getMoodLabel(mood) {
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

export default function App() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [passwordHash, setPasswordHash] = useState(sessionStorage.getItem(SESSION_KEY) || "");
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMood, setFilterMood] = useState("");
  const textRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => { fetchEntries(); }, []);

  async function fetchEntries() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/entries");
      if (res.ok) {
        const data = await res.json();
        const parsed = data.map(item => ({
          ...item,
          tags: typeof item.tags === "string" ? (item.tags || "") : (item.tags || ""),
          media: typeof item.media === "string" ? JSON.parse(item.media || "[]") : (item.media || []),
        }));
        setEntries(parsed);
      } else {
        showToast("데이터 로드 실패", "error");
      }
    } catch {
      showToast("서버에 연결할 수 없습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  const handleSave = async (formData) => {
    if (!passwordHash) {
      const pw = prompt("비밀번호를 입력하세요");
      if (!pw) return;
      const hash = await hashPassword(pw);
      setPasswordHash(hash);
      sessionStorage.setItem(SESSION_KEY, hash);
      showToast("인증되었습니다.");
      // 인증 후 다시 저장 시도
      const payload = {
        ...formData,
        tags: formData.tags || "",
        media: formData.media || [],
        password_hash: hash,
      };
      await _doSave(payload);
      return;
    }
    const payload = {
      ...formData,
      tags: formData.tags || "",
      media: formData.media || [],
      password_hash: passwordHash,
    };
    await _doSave(payload);
  };

  async function _doSave(payload) {
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast(editMode ? "수정되었습니다. ✏️" : "저장되었습니다. 🌿");
        await fetchEntries();
        setView("list");
        setSelected(null);
        setEditMode(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "저장에 실패했습니다.", "error");
      }
    } catch {
      showToast("서버 오류가 발생했습니다.", "error");
    }
  }

  const handleSetAuth = async (rawPw) => {
    const hash = await hashPassword(rawPw);
    setPasswordHash(hash);
    sessionStorage.setItem(SESSION_KEY, hash);
    showToast("인증되었습니다.");
  };

  const handleDelete = async (entry, pwToUse) => {
    setDeleteConfirm(null);
    setDeletePassword("");

    // 사용할 해시: 파라미터로 받은 것 > 세션에 있는 것
    let hashToUse = pwToUse;
    if (!hashToUse) {
      hashToUse = passwordHash;
    }
    if (!hashToUse) {
      showToast("비밀번호가 없습니다. 다시 로그인해주세요.", "error");
      return;
    }

    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, password_hash: hashToUse }),
      });
      if (res.ok) {
        showToast("삭제되었습니다.");
        await fetchEntries();
        setView("list");
        setSelected(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "삭제 권한이 없습니다.", "error");
      }
    } catch {
      showToast("삭제 오류가 발생했습니다.", "error");
    }
  };

  function openWrite(entry = null) {
    if (entry) {
      setSelected(entry);
      setEditMode(true);
    } else {
      setSelected(null);
      setEditMode(false);
    }
    setView("write");
    setTimeout(() => textRef.current?.focus(), 100);
  }

  function openRead(entry) {
    setSelected(entry);
    setView("read");
  }

  const filtered = entries.filter(e => {
    const matchSearch = !searchQuery ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.tags || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchMood = !filterMood || e.mood === filterMood;
    return matchSearch && matchMood;
  });

  const grouped = filtered.reduce((acc, e) => {
    const month = e.date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(e);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div style={s.root}>
        <div style={s.loadingWrap}>
          <div style={s.loadingSpinner} />
          <p style={s.loadingText}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.bgTexture} />

      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? "#c0392b" : "#2d6a4f" }}>
          {toast.msg}
        </div>
      )}

      {deleteConfirm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <p style={s.modalTitle}>정말 삭제할까요?</p>
            <p style={s.modalSub}>「{deleteConfirm.title}」을 삭제하면 되돌릴 수 없습니다.</p>
            <input
              type="password"
              placeholder="비밀번호 확인"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              onKeyDown={async e => {
                if (e.key === "Enter" && deletePassword) {
                  const hash = await hashPassword(deletePassword);
                  handleDelete(deleteConfirm, hash);
                }
              }}
              style={s.modalPwInput}
              autoFocus
            />
            <div style={s.modalActions}>
              <button style={s.btnGhost} onClick={() => { setDeleteConfirm(null); setDeletePassword(""); }}>취소</button>
              <button
                style={{ ...s.btnDanger, opacity: deletePassword ? 1 : 0.5 }}
                onClick={async () => {
                  if (!deletePassword) return;
                  const hash = await hashPassword(deletePassword);
                  handleDelete(deleteConfirm, hash);
                }}
              >삭제</button>
            </div>
          </div>
        </div>
      )}

      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo} onClick={() => { setView("list"); setSelected(null); }}>
            <span style={s.logoLeaf}>🌿</span>
            <span style={s.logoText}>나의 하루 일기</span>
          </div>
          <div style={s.headerRight}>
            {view !== "list" && (
              <button style={s.btnBack} onClick={() => setView("list")}>← 목록</button>
            )}
            {view === "list" && (
              <button style={s.btnPrimary} onClick={() => openWrite()}>+ 새 일기</button>
            )}
            {view === "read" && selected && !!passwordHash && (
              <>
                <button style={s.btnSecondary} onClick={() => openWrite(selected)}>✏️ 수정</button>
                <button style={s.btnDanger2} onClick={() => setDeleteConfirm(selected)}>🗑️ 삭제</button>
              </>
            )}
            {!passwordHash ? (
              <button style={s.authBtn} onClick={() => {
                const pw = prompt("비밀번호 입력");
                if (pw) handleSetAuth(pw);
              }}>로그인</button>
            ) : (
              <button style={s.authBtn} onClick={() => {
                setPasswordHash("");
                sessionStorage.removeItem(SESSION_KEY);
                showToast("로그아웃되었습니다.");
              }}>로그아웃</button>
            )}
          </div>
        </div>
      </header>

      <main style={s.main}>
        {view === "list" && (
          <div style={s.listContainer}>
            <div style={s.statsRow}>
              <div style={s.statCard}>
                <span style={s.statNum}>{entries.length}</span>
                <span style={s.statLabel}>총 일기</span>
              </div>
              <div style={s.statCard}>
                <span style={s.statNum}>{entries.filter(e => e.date === getTodayStr()).length > 0 ? "✓" : "○"}</span>
                <span style={s.statLabel}>오늘 기록</span>
              </div>
              <div style={s.statCard}>
                <span style={s.statNum}>{[...new Set(entries.map(e => e.date.slice(0, 7)))].length}</span>
                <span style={s.statLabel}>달 수</span>
              </div>
            </div>

            <div style={s.searchRow}>
              <input
                style={s.searchInput}
                placeholder="🔍  제목, 내용, 태그 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <div style={s.moodFilter}>
                <button style={{ ...s.moodBtn, ...(filterMood === "" ? s.moodBtnActive : {}) }} onClick={() => setFilterMood("")}>전체</button>
                {MOOD_LIST.map(m => (
                  <button key={m} style={{ ...s.moodBtn, ...(filterMood === m ? s.moodBtnActive : {}) }} onClick={() => setFilterMood(filterMood === m ? "" : m)}>{m}</button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={s.empty}>
                <div style={s.emptyIcon}>📖</div>
                <p style={s.emptyTitle}>{entries.length === 0 ? "첫 일기를 써보세요" : "검색 결과가 없어요"}</p>
                {entries.length === 0 && <button style={s.btnPrimary} onClick={() => openWrite()}>오늘 하루 기록하기</button>}
              </div>
            ) : (
              Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => (
                <div key={month}>
                  <div style={s.monthLabel}>
                    {new Date(month + "-01").toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
                    <span style={s.monthCount}>{items.length}개</span>
                  </div>
                  <div style={s.entryGrid}>
                    {items.map(entry => (
                      <div key={entry.id} style={s.card} onClick={() => openRead(entry)}>
                        {entry.media && entry.media.length > 0 && entry.media[0].type?.startsWith("image/") && (
                          <div style={s.cardThumb}>
                            <img src={entry.media[0].data} alt="썸네일" style={s.cardThumbImg} />
                            {entry.media.length > 1 && <span style={s.cardMediaCount}>+{entry.media.length - 1}</span>}
                          </div>
                        )}
                        <div style={s.cardBody}>
                          <div style={s.cardTop}>
                            <span style={s.cardMood}>{entry.mood}</span>
                            <span style={s.cardDate}>{entry.date.slice(5).replace("-", ".")}</span>
                          </div>
                          <h3 style={s.cardTitle}>{entry.title}</h3>
                          <p style={s.cardExcerpt}>{entry.content.slice(0, 80)}{entry.content.length > 80 ? "..." : ""}</p>
                          {entry.tags && (
                            <div style={s.cardTags}>
                              {entry.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                                <span key={t} style={s.tag}>#{t}</span>
                              ))}
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
          <WriteView
            textRef={textRef}
            editData={selected}
            editMode={editMode}
            onSave={handleSave}
            onCancel={() => setView(editMode ? "read" : "list")}
          />
        )}

        {view === "read" && selected && (
          <div style={s.readContainer}>
            <div style={s.readCard}>
              <div style={s.readHeader}>
                <div style={s.readMoodDate}>
                  <span style={s.readMood}>{selected.mood}</span>
                  <span style={s.readDateStr}>{formatDate(selected.date)}</span>
                </div>
                <h1 style={s.readTitle}>{selected.title}</h1>
                {selected.tags && (
                  <div style={s.readTags}>
                    {selected.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                      <span key={t} style={s.tag}>#{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={s.readDivider} />
              {selected.media && selected.media.length > 0 && (
                <div style={s.mediaGallery}>
                  {selected.media.map((m, idx) => (
                    <div key={idx} style={s.mediaGalleryItem}>
                      {m.type?.startsWith("image/") ? (
                        <img src={m.data} alt={m.name} style={s.mediaGalleryImg} onClick={() => window.open(m.data, "_blank")} />
                      ) : (
                        <video src={m.data} style={s.mediaGalleryImg} controls playsInline />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={s.readContent}>
                {selected.content.split("\n").map((line, i) => (
                  <p key={i} style={s.readPara}>{line || <br />}</p>
                ))}
              </div>
            </div>
            <div style={s.readNav}>
              {(() => {
                const idx = entries.findIndex(e => e.id === selected.id);
                const prev = entries[idx + 1];
                const next = entries[idx - 1];
                return (
                  <>
                    {prev ? <button style={s.navBtn} onClick={() => openRead(prev)}>← {prev.title.slice(0, 20)}{prev.title.length > 20 ? "..." : ""}</button> : <div />}
                    {next ? <button style={s.navBtn} onClick={() => openRead(next)}>{next.title.slice(0, 20)}{next.title.length > 20 ? "..." : ""} →</button> : <div />}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </main>
      <footer style={s.footer}>나의 하루를 기록하는 공간 🌿</footer>
    </div>
  );
}

function WriteView({ textRef, editData, editMode, onSave, onCancel }) {
  const [form, setForm] = useState({
    date: editData?.date || getTodayStr(),
    title: editData?.title || "",
    content: editData?.content || "",
    mood: editData?.mood || "😊",
    tags: editData?.tags || "",
    media: editData?.media || [],
  });
  const fileInputRef = useRef(null);

  async function handleMediaChange(e) {
    const files = Array.from(e.target.files);
    const converted = await Promise.all(
      files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }))
    );
    setForm(prev => ({ ...prev, media: [...prev.media, ...converted] }));
    e.target.value = "";
  }

  function removeMedia(idx) {
    setForm(prev => ({ ...prev, media: prev.media.filter((_, i) => i !== idx) }));
  }

  function handleSubmit() {
    if (!form.title.trim()) { alert("제목을 입력해주세요."); return; }
    if (!form.content.trim()) { alert("내용을 입력해주세요."); return; }
    onSave({ id: editData?.id || crypto.randomUUID(), ...form });
  }

  return (
    <div style={s.writeContainer}>
      <h2 style={s.writeHeading}>{editMode ? "일기 수정" : "새 일기 쓰기"}</h2>
      <div style={s.writeForm}>
        <div style={s.formRow}>
          <div style={s.formGroup}>
            <label style={s.label}>날짜</label>
            <input type="date" style={s.inputDate} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>오늘의 기분</label>
            <div style={s.moodPicker}>
              {MOOD_LIST.map(m => (
                <button key={m} title={getMoodLabel(m)} style={{ ...s.moodPickBtn, ...(form.mood === m ? s.moodPickBtnActive : {}) }} onClick={() => setForm({ ...form, mood: m })}>{m}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>제목</label>
          <input style={s.inputText} placeholder="오늘 하루를 한 줄로..." value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>내용</label>
          <textarea ref={textRef} style={s.textarea} placeholder="오늘 있었던 일, 느꼈던 감정, 생각들을 자유롭게 적어보세요..." value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={14} />
          <div style={s.charCount}>{form.content.length}자</div>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>사진 / 동영상 <span style={s.labelSub}>(여러 개 첨부 가능)</span></label>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={handleMediaChange} />
          <button style={s.mediaUploadBtn} onClick={() => fileInputRef.current?.click()}>📎 파일 추가하기</button>
          {form.media.length > 0 && (
            <div style={s.mediaPreviewGrid}>
              {form.media.map((m, idx) => (
                <div key={idx} style={s.mediaPreviewItem}>
                  {m.type?.startsWith("image/") ? (
                    <img src={m.data} alt={m.name} style={s.mediaPreviewImg} />
                  ) : (
                    <video src={m.data} style={s.mediaPreviewImg} controls />
                  )}
                  <button style={s.mediaRemoveBtn} onClick={() => removeMedia(idx)}>✕</button>
                  <span style={s.mediaFileName}>{m.type?.startsWith("image/") ? "🖼" : "🎬"} {m.name.slice(0, 14)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>태그 <span style={s.labelSub}>(쉼표로 구분)</span></label>
          <input style={s.inputText} placeholder="여행, 일상, 감사..." value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
        </div>

        <div style={s.formActions}>
          <button style={s.btnGhost} onClick={onCancel}>취소</button>
          <button style={s.btnSave} onClick={handleSubmit}>{editMode ? "수정 완료" : "저장하기"}</button>
        </div>
      </div>
    </div>
  );
}

const palette = {
  bg: "#faf8f3", surface: "#ffffff", ink: "#2c2c2c", inkLight: "#6b6b6b",
  inkMuted: "#9b9b9b", accent: "#3d6b47", accentLight: "#e8f0ea",
  accentSoft: "#c4dbc9", border: "#e4dfd6", danger: "#c0392b", dangerLight: "#fdecea",
};

const s = {
  root: { minHeight: "100vh", background: palette.bg, fontFamily: "'Noto Serif KR', 'Georgia', serif", color: palette.ink, position: "relative", overflowX: "hidden" },
  bgTexture: { position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8bfad' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`, pointerEvents: "none", zIndex: 0 },
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16 },
  loadingSpinner: { width: 40, height: 40, border: "3px solid #e4dfd6", borderTop: "3px solid #3d6b47", borderRadius: "50%", animation: "spin 0.9s linear infinite" },
  loadingText: { color: "#9b9b9b", fontSize: 14, fontFamily: "sans-serif" },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 24px", borderRadius: 30, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", fontFamily: "sans-serif" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: palette.surface, borderRadius: 16, padding: "32px 36px", maxWidth: 360, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle: { fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: palette.ink },
  modalSub: { fontSize: 14, color: palette.inkLight, margin: "0 0 24px", lineHeight: 1.6 },
  modalPwInput: { width: "100%", padding: "10px 14px", border: `1.5px solid ${palette.border}`, borderRadius: 10, fontSize: 14, background: palette.bg, color: palette.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box", marginBottom: 16 },
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
  authBtn: { background: "transparent", color: palette.inkLight, border: `1px solid ${palette.border}`, borderRadius: 24, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
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
  readContainer: { maxWidth: 680, margin: "0 auto" },
  readCard: { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 20, padding: "40px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", marginBottom: 24 },
  readHeader: { marginBottom: 24 },
  readMoodDate: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  readMood: { fontSize: 32 },
  readDateStr: { fontSize: 15, color: palette.inkLight, fontFamily: "sans-serif", fontWeight: 600 },
  readTitle: { fontSize: 28, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.3, color: palette.ink },
  readTags: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  readDivider: { height: 1, background: palette.border, margin: "24px 0" },
  readContent: {},
  readPara: { fontSize: 16, lineHeight: 1.9, margin: "0 0 12px", color: palette.ink },
  readNav: { display: "flex", justifyContent: "space-between", gap: 12 },
  navBtn: { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 30, padding: "10px 20px", fontSize: 13, color: palette.inkLight, cursor: "pointer", fontFamily: "sans-serif", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  mediaGallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 28 },
  mediaGalleryItem: { borderRadius: 12, overflow: "hidden", border: `1px solid ${palette.border}` },
  mediaGalleryImg: { width: "100%", maxHeight: 320, objectFit: "cover", display: "block", cursor: "pointer" },
  footer: { position: "relative", zIndex: 1, textAlign: "center", padding: "20px", fontSize: 13, color: palette.inkMuted, borderTop: `1px solid ${palette.border}`, fontFamily: "sans-serif" },
};

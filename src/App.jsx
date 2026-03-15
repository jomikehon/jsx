import { useState, useEffect, useRef } from "react";

const SESSION_KEY = "diary-session-token";
const USERNAME_KEY = "diary-username";
const DARK_KEY = "diary-dark-mode";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "America/New_York" });
}
function getTodayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function getMoodLabel(m) {
  return { "😊": "기쁨", "😢": "슬픔", "😤": "화남", "😌": "평온", "🤩": "설렘", "😴": "피곤" }[m] || "";
}
const MOOD_LIST = ["😊", "😌", "🤩", "😢", "😤", "😴"];

function getPalette(dark) {
  if (dark) return {
    bg: "#1a1a1a", surface: "#242424", surfaceAlt: "#2e2e2e",
    ink: "#e8e4dc", inkLight: "#a0998e", inkMuted: "#6b6460",
    accent: "#6ab07a", accentLight: "#1e3325", accentSoft: "#2d4f36",
    border: "#333333", danger: "#e05c5c", dangerLight: "#3a1f1f",
    headerBg: "rgba(26,26,26,0.92)",
  };
  return {
    bg: "#faf8f3", surface: "#ffffff", surfaceAlt: "#f5f2eb",
    ink: "#2c2c2c", inkLight: "#6b6b6b", inkMuted: "#9b9b9b",
    accent: "#3d6b47", accentLight: "#e8f0ea", accentSoft: "#c4dbc9",
    border: "#e4dfd6", danger: "#c0392b", dangerLight: "#fdecea",
    headerBg: "rgba(250,248,243,0.92)",
  };
}

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem(DARK_KEY) === "1");
  const p = getPalette(dark);
  const s = makeStyles(p);

  useEffect(() => {
    localStorage.setItem(DARK_KEY, dark ? "1" : "0");
    document.body.style.background = p.bg;
  }, [dark]);

  const [token, setToken] = useState(sessionStorage.getItem(SESSION_KEY) || "");
  const [username, setUsername] = useState(sessionStorage.getItem(USERNAME_KEY) || "");
  const [showLogin, setShowLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMood, setFilterMood] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const textRef = useRef(null);

  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState(() => localStorage.getItem("diary-comment-author") || "");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deleteCommentConfirm, setDeleteCommentConfirm] = useState(null);

  // ── 번역 상태 ──
  const [translation, setTranslation] = useState(null);   // { title, content }
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      ...(token ? { "X-Session-Token": token } : {}),
    };
  }

  useEffect(() => { fetchEntries(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft") setLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
      if (e.key === "ArrowRight") setLightbox(prev => prev && prev.index < prev.media.filter(m => m.type?.startsWith("image/")).length - 1 ? { ...prev, index: prev.index + 1 } : prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function fetchEntries() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/entries");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.map(item => ({ ...item, tags: item.tags || "", media: [] })));
      }
    } catch {
      showToast("서버에 연결할 수 없습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchMedia(entryId) {
    try {
      const res = await fetch(`/api/media?entry_id=${encodeURIComponent(entryId)}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  // ── 번역 (Claude API) ──
  async function handleTranslate() {
    if (!selected) return;
    if (translation) { setShowTranslation(t => !t); return; }
    setTranslating(true);
    setShowTranslation(true);
    try {
      const prompt = `Translate the following Korean diary entry into natural, fluent English. Return ONLY a JSON object with two fields: "title" and "content". Do not add any explanation or extra text.\n\nTitle: ${selected.title}\n\nContent:\n${selected.content}`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setTranslation(parsed);
    } catch {
      showToast("번역에 실패했습니다.", "error");
      setShowTranslation(false);
    } finally {
      setTranslating(false);
    }
  }

  async function fetchComments(entryId) {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/comments?entry_id=${encodeURIComponent(entryId)}`);
      if (res.ok) {
        setComments(await res.json());
      } else {
        setComments([]);
      }
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function handleCommentSubmit() {
    if (!commentText.trim()) return;
    // 로그인 안 했을 때 닉네임 필수
    const authorName = token ? username : commentAuthor.trim();
    if (!authorName) { showToast("닉네임을 입력해주세요.", "error"); return; }
    // 닉네임 localStorage 저장 (비로그인 사용자 편의)
    if (!token) localStorage.setItem("diary-comment-author", authorName);
    setCommentSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_id: selected.id,
          content: commentText.trim(),
          author: authorName,
          // 로그인 사용자는 토큰도 함께 전송 (서버에서 user_id 매핑)
          ...(token ? { token } : {}),
        }),
      });
      if (res.ok) {
        setCommentText("");
        await fetchComments(selected.id);
        showToast("댓글이 등록되었습니다. 💬");
      } else {
        const d = await res.json();
        showToast(d.error || "댓글 저장 실패", "error");
      }
    } catch {
      showToast("서버 오류가 발생했습니다.", "error");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleCommentDelete(comment) {
    setDeleteCommentConfirm(null);
    try {
      const res = await fetch("/api/comments", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ id: comment.id }),
      });
      if (res.ok) {
        await fetchComments(selected.id);
        showToast("댓글이 삭제되었습니다.");
      } else {
        showToast("댓글 삭제 권한이 없습니다.", "error");
      }
    } catch {
      showToast("서버 오류가 발생했습니다.", "error");
    }
  }

  async function handleLogin(e) {
    e?.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPw }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token); setUsername(data.username);
        sessionStorage.setItem(SESSION_KEY, data.token);
        sessionStorage.setItem(USERNAME_KEY, data.username);
        setShowLogin(false); setLoginUser(""); setLoginPw("");
        showToast(`${data.username}님, 환영합니다! 🌿`);
      } else {
        setLoginError(data.error || "로그인 실패");
      }
    } catch {
      setLoginError("서버 오류가 발생했습니다.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    if (token) {
      await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
    }
    setToken(""); setUsername("");
    sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(USERNAME_KEY);
    setView("list"); setSelected(null);
    showToast("로그아웃되었습니다.");
  }

  const handleSave = async (formData) => {
    if (!token) { setShowLogin(true); return; }
    try {
      const { media, ...textData } = formData;
      const res = await fetch("/api/entries", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ ...textData, tags: textData.tags || "" }),
      });
      const resData = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setToken(""); setUsername("");
          sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(USERNAME_KEY);
          setShowLogin(true);
          showToast("세션이 만료되었습니다. 다시 로그인해주세요.", "error");
        } else {
          showToast(resData.error || "저장에 실패했습니다.", "error");
        }
        return;
      }
      if (editMode) {
        await fetch(`/api/media?entry_id=${encodeURIComponent(formData.id)}`, { method: "DELETE", headers: authHeaders() });
      }
      const mediaList = Array.isArray(media) ? media : [];
      let mediaError = false;
      for (let i = 0; i < mediaList.length; i++) {
        const m = mediaList[i];
        try {
          const mRes = await fetch("/api/media", {
            method: "POST", headers: authHeaders(),
            body: JSON.stringify({ entry_id: formData.id, sort_order: i, name: m.name || "", type: m.type || "", data: m.data }),
          });
          if (!mRes.ok) mediaError = true;
        } catch { mediaError = true; }
      }
      if (mediaError) {
        showToast("일기는 저장됐지만 일부 미디어 업로드에 실패했습니다.", "error");
      } else {
        showToast(editMode ? "수정되었습니다. ✏️" : "저장되었습니다. 🌿");
      }
      await fetchEntries();
      const savedId = formData.id;
      const savedMedia = await fetchMedia(savedId);
      setSelected({ ...textData, id: savedId, media: savedMedia });
      setView("read"); setEditMode(false); setMediaLoading(false);
      await fetchComments(savedId);
    } catch {
      showToast("서버 오류가 발생했습니다.", "error");
    }
  };

  const handleDelete = async (entry) => {
    setDeleteConfirm(null);
    try {
      const res = await fetch("/api/delete", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id: entry.id }) });
      const data = await res.json();
      if (res.ok) {
        showToast("삭제되었습니다.");
        await fetchEntries();
        setView("list"); setSelected(null);
      } else if (res.status === 401) {
        setToken(""); setUsername("");
        sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(USERNAME_KEY);
        setShowLogin(true);
        showToast("세션이 만료되었습니다. 다시 로그인해주세요.", "error");
      } else {
        showToast(data.error || "삭제 권한이 없습니다.", "error");
      }
    } catch {
      showToast("삭제 오류가 발생했습니다.", "error");
    }
  };

  async function openWrite(entry = null) {
    if (!token) { setShowLogin(true); return; }
    let entryWithMedia = entry;
    if (entry && (!entry.media || entry.media.length === 0)) {
      const media = await fetchMedia(entry.id);
      entryWithMedia = { ...entry, media };
    }
    setSelected(entryWithMedia || null); setEditMode(!!entry); setView("write");
    setTimeout(() => textRef.current?.focus(), 100);
  }

  async function openRead(entry) {
    setSelected({ ...entry, media: [] }); setComments([]); setCommentText("");
    setTranslation(null); setShowTranslation(false);
    setView("read"); setMediaLoading(true);
    try {
      const [media] = await Promise.all([fetchMedia(entry.id), fetchComments(entry.id)]);
      setSelected(prev => prev?.id === entry.id ? { ...prev, media } : prev);
    } finally {
      setMediaLoading(false);
    }
  }

  const filtered = entries.filter(e => {
    const q = searchQuery.toLowerCase();
    return (!q || e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) || e.tags.toLowerCase().includes(q))
      && (!filterMood || e.mood === filterMood);
  });

  const grouped = filtered.reduce((acc, e) => {
    const m = e.date.slice(0, 7);
    (acc[m] = acc[m] || []).push(e);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div style={s.root}>
        <div style={s.loadingWrap}>
          <div style={s.spinner} />
          <p style={s.loadingText}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.bgTexture} />

      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? p.danger : "#2d6a4f" }}>
          {toast.msg}
        </div>
      )}

      {showLogin && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalIcon}>🌿</div>
            <h2 style={s.modalTitle}>로그인</h2>
            <p style={s.modalSub}>등록된 계정으로 로그인하세요.</p>
            <input style={s.modalInput} placeholder="아이디" value={loginUser}
              onChange={e => setLoginUser(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus />
            <input style={{ ...s.modalInput, marginTop: 10 }} type="password" placeholder="비밀번호" value={loginPw}
              onChange={e => setLoginPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            {loginError && <p style={s.errorText}>{loginError}</p>}
            <div style={s.modalActions}>
              <button style={s.btnGhost} onClick={() => { setShowLogin(false); setLoginError(""); }}>취소</button>
              <button style={s.btnPrimary} onClick={handleLogin} disabled={loginLoading}>
                {loginLoading ? "확인 중..." : "입장하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <p style={s.modalTitle}>정말 삭제할까요?</p>
            <p style={s.modalSub}>「{deleteConfirm.title}」을 삭제하면 되돌릴 수 없습니다.</p>
            <div style={s.modalActions}>
              <button style={s.btnGhost} onClick={() => setDeleteConfirm(null)}>취소</button>
              <button style={s.btnDanger} onClick={() => handleDelete(deleteConfirm)}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {deleteCommentConfirm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <p style={s.modalTitle}>댓글을 삭제할까요?</p>
            <p style={s.modalSub}>삭제된 댓글은 복구할 수 없습니다.</p>
            <div style={s.modalActions}>
              <button style={s.btnGhost} onClick={() => setDeleteCommentConfirm(null)}>취소</button>
              <button style={s.btnDanger} onClick={() => handleCommentDelete(deleteCommentConfirm)}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 800,
          display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(null)}>
          {lightbox.index > 0 && (
            <button style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 48, height: 48, fontSize: 22, color: "#fff", cursor: "pointer", zIndex: 1 }}
              onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: prev.index - 1 })); }}>‹</button>
          )}
          <img src={lightbox.media[lightbox.index].data} alt={lightbox.media[lightbox.index].name}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", userSelect: "none" }}
            onClick={e => e.stopPropagation()} />
          {lightbox.index < lightbox.media.filter(m => m.type?.startsWith("image/")).length - 1 && (
            <button style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 48, height: 48, fontSize: 22, color: "#fff", cursor: "pointer", zIndex: 1 }}
              onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: prev.index + 1 })); }}>›</button>
          )}
          <button style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 40, height: 40, fontSize: 18, color: "#fff", cursor: "pointer", zIndex: 1 }}
            onClick={() => setLightbox(null)}>✕</button>
          {lightbox.media.filter(m => m.type?.startsWith("image/")).length > 1 && (
            <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
              {lightbox.media.filter(m => m.type?.startsWith("image/")).map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", cursor: "pointer",
                  background: i === lightbox.index ? "#fff" : "rgba(255,255,255,0.35)" }}
                  onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: i })); }} />
              ))}
            </div>
          )}
        </div>
      )}

      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo} onClick={() => { setView("list"); setSelected(null); }}>
            <span>🌿</span>
            <span style={s.logoText}>My life is so simple</span>
          </div>
          <div style={s.headerRight}>
            {view !== "list" && <button style={s.btnBack} onClick={() => setView("list")}>← 목록</button>}
            {view === "list" && <button style={s.btnPrimary} onClick={() => openWrite()}>+ 새 글</button>}
            {view === "read" && selected && token && (
              <>
                <button style={s.btnSecondary} onClick={() => openWrite(selected)}>✏️ 수정</button>
                <button style={s.btnDanger2} onClick={() => setDeleteConfirm(selected)}>🗑️ 삭제</button>
              </>
            )}
            <button
              style={{ ...s.authBtn, fontSize: 18, padding: "5px 10px", lineHeight: 1 }}
              onClick={() => setDark(d => !d)}
              title={dark ? "라이트 모드" : "다크 모드"}
            >{dark ? "☀️" : "🌙"}</button>
            {token ? (
              <div style={s.userBadge}>
                <span style={s.userName}>{username}</span>
                <button style={s.authBtn} onClick={handleLogout}>로그아웃</button>
              </div>
            ) : (
              <button style={s.authBtn} onClick={() => setShowLogin(true)}>로그인</button>
            )}
          </div>
        </div>
      </header>

      <main style={s.main}>
        {view === "list" && (
          <div>
            <div style={s.statsRow}>
              <div style={s.statCard}><span style={s.statNum}>{entries.length}</span><span style={s.statLabel}>총 건</span></div>
              <div style={s.statCard}><span style={s.statNum}>{entries.filter(e => e.date === getTodayStr()).length > 0 ? "✓" : "○"}</span><span style={s.statLabel}>오늘 기록</span></div>
              <div style={s.statCard}><span style={s.statNum}>{[...new Set(entries.map(e => e.date.slice(0, 7)))].length}</span><span style={s.statLabel}>달 수</span></div>
            </div>
            <div style={s.searchRow}>
              <input style={s.searchInput} placeholder="🔍  제목, 내용, 태그 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <div style={s.moodFilter}>
                <button style={{ ...s.moodBtn, ...(filterMood === "" ? s.moodBtnActive : {}) }} onClick={() => setFilterMood("")}>전체</button>
                {MOOD_LIST.map(m => (
                  <button key={m} style={{ ...s.moodBtn, ...(filterMood === m ? s.moodBtnActive : {}) }} onClick={() => setFilterMood(filterMood === m ? "" : m)}>{m}</button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize: 56 }}>📖</div>
                <p style={{ fontSize: 18, color: p.inkLight, fontFamily: "sans-serif" }}>
                  {entries.length === 0 ? "첫 글을 써보세요" : "검색 결과가 없어요"}
                </p>
                {entries.length === 0 && <button style={s.btnPrimary} onClick={() => openWrite()}>기록하기</button>}
              </div>
            ) : (
              Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => (
                <div key={month}>
                  <div style={s.monthLabel}>
                    {new Date(month + "-01T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "America/New_York" })}
                    <span style={s.monthCount}>{items.length}개</span>
                  </div>
                  <div style={s.entryGrid}>
                    {items.map(entry => (
                      <div key={entry.id} className="card" style={s.card} onClick={() => openRead(entry)}>
                        {entry.media?.length > 0 && entry.media[0].type?.startsWith("image/") && (
                          <div style={s.cardThumb}>
                            <img src={entry.media[0].data} alt="" style={s.cardThumbImg} />
                            {entry.media.length > 1 && <span style={s.cardMediaCount}>+{entry.media.length - 1}</span>}
                          </div>
                        )}
                        <div style={s.cardBody}>
                          <div style={s.cardTop}>
                            <span style={{ fontSize: 20 }}>{entry.mood}</span>
                            <span style={s.cardDate}>{entry.date.slice(5).replace("-", ".")}</span>
                          </div>
                          <h3 style={s.cardTitle}>{entry.title}</h3>
                          <p style={s.cardExcerpt}>{entry.content.slice(0, 80)}{entry.content.length > 80 ? "..." : ""}</p>
                          {entry.tags && (
                            <div style={s.cardTags}>
                              {entry.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => <span key={t} style={s.tag}>#{t}</span>)}
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
            textRef={textRef} editData={selected} editMode={editMode}
            onSave={handleSave} onCancel={() => setView(editMode ? "read" : "list")}
            p={p} s={s}
          />
        )}

        {view === "read" && selected && (
          <div style={s.readContainer}>
            <div style={s.readCard}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 32 }}>{selected.mood}</span>
                  <span style={{ fontSize: 15, color: p.inkLight, fontFamily: "sans-serif", fontWeight: 600 }}>{formatDate(selected.date)}</span>
                  {/* 번역 버튼 */}
                  <button
                    style={{ ...s.translateBtn, marginLeft: "auto", ...(showTranslation ? s.translateBtnActive : {}) }}
                    onClick={handleTranslate}
                    title="영어로 번역"
                  >
                    {translating ? "🔄 번역 중..." : showTranslation ? "🌐 번역 닫기" : "🌐 영어로 번역"}
                  </button>
                </div>
                <h1 style={s.readTitle}>{selected.title}</h1>
                {selected.tags && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {selected.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => <span key={t} style={s.tag}>#{t}</span>)}
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: p.border, margin: "24px 0" }} />
              {mediaLoading && (
                <div style={{ textAlign: "center", padding: "16px 0", color: p.inkMuted, fontSize: 14, fontFamily: "sans-serif" }}>
                  🖼️ 미디어 불러오는 중...
                </div>
              )}
              {!mediaLoading && selected.media?.length > 0 && (
                <div style={s.mediaGallery}>
                  {selected.media.map((m, idx) => (
                    <div key={idx} style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${p.border}` }}>
                      {m.type?.startsWith("image/") ? (
                        <img src={m.data} alt={m.name}
                          style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block", cursor: "zoom-in" }}
                          onClick={() => setLightbox({ media: selected.media, index: idx })} />
                      ) : (
                        <video src={m.data} style={{ width: "100%", maxHeight: 320 }} controls playsInline />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 원문 */}
              <div>
                {selected.content.split("\n").map((line, i) => (
                  <p key={i} style={{ fontSize: 16, lineHeight: 1.9, margin: "0 0 12px", color: p.ink }}>{line || <br />}</p>
                ))}
              </div>

              {/* 번역 결과 패널 */}
              {showTranslation && (
                <div style={s.translationPanel}>
                  {translating ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: p.inkMuted, fontFamily: "sans-serif", fontSize: 14 }}>
                      <div style={{ width: 18, height: 18, border: `2px solid ${p.border}`, borderTop: `2px solid ${p.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                      Translating with Claude AI...
                    </div>
                  ) : translation ? (
                    <>
                      <div style={s.translationBadge}>🇺🇸 English Translation</div>
                      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px", color: p.ink, fontFamily: "Georgia, serif", lineHeight: 1.4 }}>
                        {translation.title}
                      </h2>
                      <div style={{ height: 1, background: p.border, marginBottom: 16 }} />
                      <div>
                        {translation.content.split("\n").map((line, i) => (
                          <p key={i} style={{ fontSize: 15, lineHeight: 1.85, margin: "0 0 12px", color: p.ink, fontFamily: "Georgia, serif" }}>{line || <br />}</p>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {/* ── 댓글 섹션 ── */}
            <div style={s.commentSection}>
              <h3 style={s.commentHeading}>
                💬 댓글
                {comments.length > 0 && <span style={s.commentCount}>{comments.length}</span>}
              </h3>

              <div style={s.commentInputWrap}>
                {/* 닉네임 행: 로그인 시 자동, 비로그인 시 입력 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={s.commentAvatar}>
                    {token ? username[0]?.toUpperCase() : (commentAuthor.trim()[0]?.toUpperCase() || "?")}
                  </span>
                  {token ? (
                    <span style={{ fontSize: 13, fontWeight: 700, color: p.accent, fontFamily: "sans-serif" }}>{username}</span>
                  ) : (
                    <input
                      style={{ ...s.commentNicknameInput }}
                      placeholder="닉네임 (필수)"
                      value={commentAuthor}
                      onChange={e => setCommentAuthor(e.target.value)}
                      maxLength={20}
                    />
                  )}
                </div>
                <textarea
                  style={s.commentTextarea}
                  placeholder="댓글을 입력하세요..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCommentSubmit(); }}
                  rows={3}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: p.inkMuted, fontFamily: "sans-serif" }}>Ctrl+Enter로 등록</span>
                  <button
                    style={{ ...s.btnPrimary, opacity: (commentSubmitting || !commentText.trim() || (!token && !commentAuthor.trim())) ? 0.5 : 1 }}
                    onClick={handleCommentSubmit}
                    disabled={commentSubmitting || !commentText.trim() || (!token && !commentAuthor.trim())}
                  >
                    {commentSubmitting ? "등록 중..." : "등록"}
                  </button>
                </div>
              </div>

              {commentsLoading ? (
                <div style={{ textAlign: "center", padding: 20, color: p.inkMuted, fontFamily: "sans-serif", fontSize: 14 }}>불러오는 중...</div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: p.inkMuted, fontFamily: "sans-serif", fontSize: 14 }}>
                  아직 댓글이 없어요. 첫 댓글을 남겨보세요! 🌱
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                  {comments.map(c => (
                    <div key={c.id} style={s.commentItem}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={s.commentAvatar}>{c.author?.[0]?.toUpperCase() || "?"}</span>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: p.accent, fontFamily: "sans-serif" }}>{c.author || "익명"}</span>
                            <span style={{ fontSize: 11, color: p.inkMuted, fontFamily: "sans-serif", marginLeft: 8 }}>
                              {c.created_at ? new Date(c.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                            </span>
                          </div>
                        </div>
                        {/* 로그인 사용자는 본인 댓글 삭제, 관리자(토큰 있음)는 모든 댓글 삭제 가능 */}
                        {token && (
                          <button style={{ background: "transparent", border: "none", color: p.inkMuted, cursor: "pointer", fontSize: 12, padding: "2px 6px", fontFamily: "sans-serif" }}
                            onClick={() => setDeleteCommentConfirm(c)}>삭제</button>
                        )}
                      </div>
                      <p style={{ margin: "8px 0 0 36px", fontSize: 14, lineHeight: 1.7, color: p.ink, fontFamily: "sans-serif" }}>
                        {c.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
              {(() => {
                const idx = entries.findIndex(e => e.id === selected.id);
                const prev = entries[idx + 1], next = entries[idx - 1];
                return (<>
                  {prev ? <button style={s.navBtn} onClick={() => openRead(prev)}>← {prev.title.slice(0, 20)}{prev.title.length > 20 ? "..." : ""}</button> : <div />}
                  {next ? <button style={s.navBtn} onClick={() => openRead(next)}>{next.title.slice(0, 20)}{next.title.length > 20 ? "..." : ""} →</button> : <div />}
                </>);
              })()}
            </div>
          </div>
        )}
      </main>

      <footer style={s.footer}>나의 인생을 기록하는 공간 🌿</footer>
    </div>
  );
}

// ── WriteView ─────────────────────────────────────────────────────────────────
function WriteView({ textRef, editData, editMode, onSave, onCancel, p, s }) {
  const [form, setForm] = useState({
    date: editData?.date || getTodayStr(),
    title: editData?.title || "",
    content: editData?.content || "",
    mood: editData?.mood || "😊",
    tags: editData?.tags || "",
    media: editData?.media || [],
  });
  const fileRef = useRef(null);

  async function handleMedia(e) {
    const files = Array.from(e.target.files);
    const converted = await Promise.all(files.map(f => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({ name: f.name, type: f.type, data: r.result });
      r.onerror = rej;
      r.readAsDataURL(f);
    })));
    setForm(prev => ({ ...prev, media: [...prev.media, ...converted] }));
    e.target.value = "";
  }

  return (
    <div style={s.writeContainer}>
      <h2 style={s.writeHeading}>{editMode ? "글 수정" : "새 글 쓰기"}</h2>
      <div style={s.writeForm}>
        <div style={s.formRow}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={s.label}>날짜</label>
            <input type="date" style={s.inputDate} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={s.label}>오늘의 기분</label>
            <div style={{ display: "flex", gap: 6 }}>
              {MOOD_LIST.map(m => (
                <button key={m} title={getMoodLabel(m)}
                  style={{ fontSize: 22, border: `2px solid ${form.mood === m ? p.accent : "transparent"}`, borderRadius: 10, padding: "4px 6px", cursor: "pointer", background: form.mood === m ? p.accentLight : "transparent" }}
                  onClick={() => setForm({ ...form, mood: m })}>{m}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>제목</label>
          <input style={s.inputText} placeholder="오늘 하루를 한 줄로..." value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>내용</label>
          <textarea ref={textRef} style={s.textarea} placeholder="있었던 일, 느꼈던 감정을 자유롭게 적어보세요..." value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={14} />
          <div style={{ textAlign: "right", fontSize: 12, color: p.inkMuted, marginTop: 4, fontFamily: "sans-serif" }}>{form.content.length}자</div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>사진 / 동영상 <span style={{ fontWeight: 400, color: p.inkMuted }}>(여러 개 가능)</span></label>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={handleMedia} />
          <button style={s.mediaUploadBtn} onClick={() => fileRef.current?.click()}>📎 파일 추가하기</button>
          {form.media.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
              {form.media.map((m, idx) => (
                <div key={idx} style={{ position: "relative", width: 100, borderRadius: 10, overflow: "hidden", border: `1px solid ${p.border}` }}>
                  {m.type?.startsWith("image/") ? <img src={m.data} style={{ width: 100, height: 80, objectFit: "cover", display: "block" }} alt="" /> : <video src={m.data} style={{ width: 100, height: 80, objectFit: "cover" }} />}
                  <button onClick={() => setForm(prev => ({ ...prev, media: prev.media.filter((_, i) => i !== idx) }))}
                    style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 10, cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>태그 <span style={{ fontWeight: 400, color: p.inkMuted }}>(쉼표로 구분)</span></label>
          <input style={s.inputText} placeholder="여행, 일상, 감사..." value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button style={s.btnGhost} onClick={onCancel}>취소</button>
          <button style={s.btnSave} onClick={() => {
            if (!form.title.trim()) { alert("제목을 입력해주세요."); return; }
            if (!form.content.trim()) { alert("내용을 입력해주세요."); return; }
            onSave({ id: editData?.id || crypto.randomUUID(), ...form });
          }}>{editMode ? "수정 완료" : "저장하기"}</button>
        </div>
      </div>
    </div>
  );
}

// ── 스타일 팩토리 ──────────────────────────────────────────────────────────────
function makeStyles(p) {
  return {
    root: { minHeight: "100vh", background: p.bg, fontFamily: "'Noto Serif KR', Georgia, serif", color: p.ink, position: "relative", overflowX: "hidden", transition: "background 0.3s, color 0.3s" },
    bgTexture: { position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8bfad' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`, pointerEvents: "none", zIndex: 0 },
    loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16 },
    spinner: { width: 40, height: 40, border: `3px solid ${p.border}`, borderTop: `3px solid ${p.accent}`, borderRadius: "50%", animation: "spin 0.9s linear infinite" },
    loadingText: { color: p.inkMuted, fontSize: 14, fontFamily: "sans-serif" },
    toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 24px", borderRadius: 30, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", fontFamily: "sans-serif", whiteSpace: "nowrap" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" },
    modal: { background: p.surface, borderRadius: 20, padding: "36px 40px", maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", alignItems: "stretch" },
    modalIcon: { fontSize: 40, textAlign: "center", marginBottom: 12 },
    modalTitle: { fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: p.ink, textAlign: "center" },
    modalSub: { fontSize: 14, color: p.inkLight, margin: "0 0 20px", lineHeight: 1.6, textAlign: "center", fontFamily: "sans-serif" },
    modalInput: { width: "100%", padding: "12px 14px", border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 14, background: p.bg, color: p.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
    modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
    errorText: { color: p.danger, fontSize: 13, margin: "8px 0 0", fontFamily: "sans-serif", textAlign: "center" },
    header: { position: "sticky", top: 0, zIndex: 100, background: p.headerBg, backdropFilter: "blur(12px)", borderBottom: `1px solid ${p.border}`, transition: "background 0.3s" },
    headerInner: { maxWidth: 860, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" },
    logo: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", fontSize: 22 },
    logoText: { fontSize: 18, fontWeight: 700, color: p.accent, letterSpacing: -0.3 },
    headerRight: { display: "flex", gap: 8, alignItems: "center" },
    userBadge: { display: "flex", alignItems: "center", gap: 8 },
    userName: { fontSize: 13, color: p.accent, fontWeight: 700, fontFamily: "sans-serif" },
    btnPrimary: { background: p.accent, color: "#fff", border: "none", borderRadius: 24, padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnSecondary: { background: p.accentLight, color: p.accent, border: "none", borderRadius: 24, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnDanger2: { background: p.dangerLight, color: p.danger, border: "none", borderRadius: 24, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnGhost: { background: "transparent", color: p.inkLight, border: `1px solid ${p.border}`, borderRadius: 24, padding: "8px 18px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
    btnDanger: { background: p.danger, color: "#fff", border: "none", borderRadius: 24, padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnSave: { background: p.accent, color: "#fff", border: "none", borderRadius: 24, padding: "12px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    btnBack: { background: "transparent", color: p.inkLight, border: "none", padding: "6px 12px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
    authBtn: { background: "transparent", color: p.inkLight, border: `1px solid ${p.border}`, borderRadius: 24, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
    main: { position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px" },
    statsRow: { display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" },
    statCard: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 12, padding: "16px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 90, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
    statNum: { fontSize: 26, fontWeight: 800, color: p.accent },
    statLabel: { fontSize: 12, color: p.inkMuted, fontFamily: "sans-serif" },
    searchRow: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 },
    searchInput: { width: "100%", padding: "12px 18px", border: `1.5px solid ${p.border}`, borderRadius: 30, fontSize: 14, background: p.surface, color: p.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
    moodFilter: { display: "flex", gap: 8, flexWrap: "wrap" },
    moodBtn: { background: p.surface, border: `1.5px solid ${p.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 14, cursor: "pointer", color: p.inkLight, fontFamily: "sans-serif" },
    moodBtnActive: { background: p.accentLight, borderColor: p.accent, color: p.accent, fontWeight: 600 },
    monthLabel: { fontSize: 13, fontWeight: 700, color: p.inkMuted, letterSpacing: 0.5, marginBottom: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 10, fontFamily: "sans-serif" },
    monthCount: { fontSize: 11, background: p.accentLight, color: p.accent, padding: "2px 8px", borderRadius: 10, fontWeight: 700 },
    entryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginBottom: 32 },
    card: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", transition: "transform 0.15s, box-shadow 0.15s" },
    cardThumb: { position: "relative", width: "100%", height: 160, overflow: "hidden", background: p.surfaceAlt },
    cardThumbImg: { width: "100%", height: "100%", objectFit: "cover" },
    cardMediaCount: { position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 10, fontFamily: "sans-serif" },
    cardBody: { padding: 16 },
    cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    cardDate: { fontSize: 12, color: p.inkMuted, fontFamily: "sans-serif", fontWeight: 600 },
    cardTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.4, color: p.ink },
    cardExcerpt: { fontSize: 13, color: p.inkLight, lineHeight: 1.6, margin: "0 0 10px", fontFamily: "sans-serif" },
    cardTags: { display: "flex", flexWrap: "wrap", gap: 4 },
    tag: { fontSize: 11, background: p.accentLight, color: p.accent, padding: "2px 8px", borderRadius: 10, fontWeight: 600, fontFamily: "sans-serif" },
    empty: { textAlign: "center", padding: "80px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
    writeContainer: { maxWidth: 680, margin: "0 auto" },
    writeHeading: { fontSize: 26, fontWeight: 800, marginBottom: 28, color: p.ink },
    writeForm: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 20, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" },
    formRow: { display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" },
    label: { display: "block", fontSize: 13, fontWeight: 700, color: p.inkLight, marginBottom: 8, fontFamily: "sans-serif", letterSpacing: 0.3 },
    inputDate: { width: "100%", padding: "10px 14px", border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 14, background: p.bg, color: p.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
    inputText: { width: "100%", padding: "10px 14px", border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 15, background: p.bg, color: p.ink, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
    textarea: { width: "100%", padding: 14, border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 15, background: p.bg, color: p.ink, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.8, boxSizing: "border-box" },
    mediaUploadBtn: { background: p.accentLight, color: p.accent, border: `1.5px dashed ${p.accentSoft}`, borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "sans-serif" },
    readContainer: { maxWidth: 680, margin: "0 auto" },
    readCard: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 20, padding: 40, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", marginBottom: 24 },
    readTitle: { fontSize: 28, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.3, color: p.ink },
    mediaGallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 28 },
    navBtn: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 30, padding: "10px 20px", fontSize: 13, color: p.inkLight, cursor: "pointer", fontFamily: "sans-serif", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    footer: { position: "relative", zIndex: 1, textAlign: "center", padding: 20, fontSize: 13, color: p.inkMuted, borderTop: `1px solid ${p.border}`, fontFamily: "sans-serif" },
    commentSection: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 20, padding: "28px 32px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", marginBottom: 16 },
    commentHeading: { fontSize: 17, fontWeight: 700, color: p.ink, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontFamily: "sans-serif" },
    commentCount: { fontSize: 12, background: p.accentLight, color: p.accent, padding: "2px 8px", borderRadius: 10, fontWeight: 700 },
    commentInputWrap: { background: p.surfaceAlt, borderRadius: 12, padding: "16px 18px", marginBottom: 20, border: `1px solid ${p.border}` },
    commentTextarea: { width: "100%", padding: "10px 12px", border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 14, background: p.bg, color: p.ink, outline: "none", fontFamily: "sans-serif", resize: "vertical", lineHeight: 1.7, boxSizing: "border-box" },
    commentNicknameInput: { flex: 1, padding: "5px 10px", border: `1.5px solid ${p.border}`, borderRadius: 20, fontSize: 13, fontWeight: 600, background: p.bg, color: p.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box", maxWidth: 160 },
    commentItem: { background: p.surfaceAlt, border: `1px solid ${p.border}`, borderRadius: 12, padding: "14px 16px" },
    commentAvatar: { width: 28, height: 28, minWidth: 28, borderRadius: "50%", background: p.accentSoft, color: p.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: "sans-serif" },
    // ── 번역 스타일 ──
    translateBtn: { background: p.surfaceAlt, color: p.inkLight, border: `1px solid ${p.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "sans-serif", whiteSpace: "nowrap", transition: "all 0.15s" },
    translateBtnActive: { background: p.accentLight, color: p.accent, borderColor: p.accent },
    translationPanel: { marginTop: 28, padding: "24px 28px", background: p.surfaceAlt, borderRadius: 14, border: `1.5px solid ${p.accentSoft}`, borderLeft: `4px solid ${p.accent}` },
    translationBadge: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: p.accent, background: p.accentLight, padding: "3px 10px", borderRadius: 20, marginBottom: 14, fontFamily: "sans-serif", letterSpacing: 0.3 },
  };
}

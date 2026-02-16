import { useState, useEffect, useRef } from "react";

const SESSION_KEY = "diary-session-token";
const USERNAME_KEY = "diary-username";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}
function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function getMoodLabel(m) {
  return { "😊": "기쁨", "😢": "슬픔", "😤": "화남", "😌": "평온", "🤩": "설렘", "😴": "피곤" }[m] || "";
}
const MOOD_LIST = ["😊", "😌", "🤩", "😢", "😤", "😴"];

export default function App() {
  // ── 인증 상태 ──
  const [token, setToken] = useState(sessionStorage.getItem(SESSION_KEY) || "");
  const [username, setUsername] = useState(sessionStorage.getItem(USERNAME_KEY) || "");

  // ── 로그인 폼 ──
  const [showLogin, setShowLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── 일기 데이터 ──
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── 뷰 상태 ──
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // ── UI 상태 ──
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMood, setFilterMood] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { media, index }
  const textRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── API 헬퍼: 항상 토큰 헤더 포함 ──
  function authHeaders() {
    return {
      "Content-Type": "application/json",
      ...(token ? { "X-Session-Token": token } : {}),
    };
  }

  useEffect(() => { fetchEntries(); }, []);

  // ESC 키로 라이트박스 닫기
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
        setEntries(data.map(item => ({
          ...item,
          tags: item.tags || "",
          media: [],  // 미디어는 상세보기 시 lazy 로드
        })));
      }
    } catch {
      showToast("서버에 연결할 수 없습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  // 미디어 lazy 로드 — 1개씩 받아온 행을 배열로 조립
  async function fetchMedia(entryId) {
    try {
      const res = await fetch(`/api/media?entry_id=${encodeURIComponent(entryId)}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  // ── 로그인 ──
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
        setToken(data.token);
        setUsername(data.username);
        sessionStorage.setItem(SESSION_KEY, data.token);
        sessionStorage.setItem(USERNAME_KEY, data.username);
        setShowLogin(false);
        setLoginUser("");
        setLoginPw("");
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

  // ── 로그아웃 ──
  async function handleLogout() {
    if (token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    setToken("");
    setUsername("");
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(USERNAME_KEY);
    setView("list");
    setSelected(null);
    showToast("로그아웃되었습니다.");
  }

  // ── 일기 저장/수정 ──
  const handleSave = async (formData) => {
    if (!token) { setShowLogin(true); return; }
    try {
      // 1단계: 텍스트 데이터만 저장 (media 제외 → SQLITE_TOOBIG 방지)
      const { media, ...textData } = formData;
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...textData, tags: textData.tags || "" }),
      });
      const resData = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setToken(""); setUsername("");
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.removeItem(USERNAME_KEY);
          setShowLogin(true);
          showToast("세션이 만료되었습니다. 다시 로그인해주세요.", "error");
        } else {
          showToast(resData.error || "저장에 실패했습니다.", "error");
        }
        return;
      }

      // 2단계: 기존 미디어 삭제 (수정 시)
      if (editMode) {
        await fetch(`/api/media?entry_id=${encodeURIComponent(formData.id)}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
      }

      // 3단계: 미디어를 1개씩 순차 업로드 (절대 묶지 않음 → SQLITE_TOOBIG 방지)
      const mediaList = Array.isArray(media) ? media : [];
      let mediaError = false;
      for (let i = 0; i < mediaList.length; i++) {
        const m = mediaList[i];
        try {
          const mRes = await fetch("/api/media", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              entry_id: formData.id,
              sort_order: i,
              name: m.name || "",
              type: m.type || "",
              data: m.data,
            }),
          });
          if (!mRes.ok) {
            const mData = await mRes.json();
            console.error(`미디어 ${i} 업로드 실패:`, mData.error);
            mediaError = true;
          }
        } catch (e) {
          console.error(`미디어 ${i} 업로드 오류:`, e);
          mediaError = true;
        }
      }

      if (mediaError) {
        showToast("일기는 저장됐지만 일부 미디어 업로드에 실패했습니다.", "error");
      } else {
        showToast(editMode ? "수정되었습니다. ✏️" : "저장되었습니다. 🌿");
      }
      // entries 갱신 후 방금 저장한 항목으로 이동 (미디어 즉시 표시)
      await fetchEntries();
      const savedId = formData.id;
      const savedMedia = await fetchMedia(savedId);
      setSelected({ ...textData, id: savedId, media: savedMedia });
      setView("read");
      setEditMode(false);
      setMediaLoading(false);
    } catch (e) {
      console.error("handleSave 오류:", e);
      showToast("서버 오류가 발생했습니다.", "error");
    }
  };

  // ── 일기 삭제 ──
  const handleDelete = async (entry) => {
    setDeleteConfirm(null);
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ id: entry.id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("삭제되었습니다.");
        await fetchEntries();
        setView("list");
        setSelected(null);
      } else if (res.status === 401) {
        setToken(""); setUsername("");
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(USERNAME_KEY);
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
    // 수정 시 미디어 로드
    if (entry && (!entry.media || entry.media.length === 0)) {
      const media = await fetchMedia(entry.id);
      entryWithMedia = { ...entry, media };
    }
    setSelected(entryWithMedia || null);
    setEditMode(!!entry);
    setView("write");
    setTimeout(() => textRef.current?.focus(), 100);
  }

  async function openRead(entry) {
    setSelected({ ...entry, media: [] });
    setView("read");
    setMediaLoading(true);
    try {
      const media = await fetchMedia(entry.id);
      setSelected(prev => prev?.id === entry.id ? { ...prev, media } : prev);
    } finally {
      setMediaLoading(false);
    }
  }

  // ── 필터링 ──
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

      {/* ── Toast ── */}
      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? "#c0392b" : "#2d6a4f" }}>
          {toast.msg}
        </div>
      )}

      {/* ── 로그인 모달 ── */}
      {showLogin && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalIcon}>🌿</div>
            <h2 style={s.modalTitle}>로그인</h2>
            <p style={s.modalSub}>등록된 계정으로 로그인하세요.</p>
            <input
              style={s.modalInput}
              placeholder="아이디"
              value={loginUser}
              onChange={e => setLoginUser(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              autoFocus
            />
            <input
              style={{ ...s.modalInput, marginTop: 10 }}
              type="password"
              placeholder="비밀번호"
              value={loginPw}
              onChange={e => setLoginPw(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
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

      {/* ── 삭제 확인 모달 ── */}
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

      {/* ── 라이트박스 ── */}
      {lightbox && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 800,
            display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(null)}
        >
          {/* 이전 버튼 */}
          {lightbox.index > 0 && (
            <button
              style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
                width: 48, height: 48, fontSize: 22, color: "#fff", cursor: "pointer", zIndex: 1 }}
              onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: prev.index - 1 })); }}
            >‹</button>
          )}

          {/* 이미지 */}
          <img
            src={lightbox.media[lightbox.index].data}
            alt={lightbox.media[lightbox.index].name}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain",
              borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", userSelect: "none" }}
            onClick={e => e.stopPropagation()}
          />

          {/* 다음 버튼 */}
          {lightbox.index < lightbox.media.filter(m => m.type?.startsWith("image/")).length - 1 && (
            <button
              style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
                width: 48, height: 48, fontSize: 22, color: "#fff", cursor: "pointer", zIndex: 1 }}
              onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: prev.index + 1 })); }}
            >›</button>
          )}

          {/* 닫기 버튼 */}
          <button
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)",
              border: "none", borderRadius: "50%", width: 40, height: 40, fontSize: 18,
              color: "#fff", cursor: "pointer", zIndex: 1 }}
            onClick={() => setLightbox(null)}
          >✕</button>

          {/* 인디케이터 (여러 장일 때) */}
          {lightbox.media.filter(m => m.type?.startsWith("image/")).length > 1 && (
            <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
              display: "flex", gap: 6 }}>
              {lightbox.media.filter(m => m.type?.startsWith("image/")).map((_, i) => (
                <div key={i}
                  style={{ width: 8, height: 8, borderRadius: "50%", cursor: "pointer",
                    background: i === lightbox.index ? "#fff" : "rgba(255,255,255,0.35)" }}
                  onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: i })); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo} onClick={() => { setView("list"); setSelected(null); }}>
            <span>🌿</span>
            <span style={s.logoText}>My life is so simple</span>
          </div>
          <div style={s.headerRight}>
            {view !== "list" && <button style={s.btnBack} onClick={() => setView("list")}>← 목록</button>}
            {view === "list" && <button style={s.btnPrimary} onClick={() => openWrite()}>+ 새 일기</button>}
            {view === "read" && selected && token && (
              <>
                <button style={s.btnSecondary} onClick={() => openWrite(selected)}>✏️ 수정</button>
                <button style={s.btnDanger2} onClick={() => setDeleteConfirm(selected)}>🗑️ 삭제</button>
              </>
            )}
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

      {/* ── Main ── */}
      <main style={s.main}>

        {/* LIST */}
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
                    {new Date(month + "-01T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long" })}
                    <span style={s.monthCount}>{items.length}개</span>
                  </div>
                  <div style={s.entryGrid}>
                    {items.map(entry => (
                      <div key={entry.id} style={s.card} onClick={() => openRead(entry)}>
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

        {/* WRITE */}
        {view === "write" && (
          <WriteView
            textRef={textRef}
            editData={selected}
            editMode={editMode}
            onSave={handleSave}
            onCancel={() => setView(editMode ? "read" : "list")}
          />
        )}

        {/* READ */}
        {view === "read" && selected && (
          <div style={s.readContainer}>
            <div style={s.readCard}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 32 }}>{selected.mood}</span>
                  <span style={{ fontSize: 15, color: p.inkLight, fontFamily: "sans-serif", fontWeight: 600 }}>{formatDate(selected.date)}</span>
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
              <div>
                {selected.content.split("\n").map((line, i) => (
                  <p key={i} style={{ fontSize: 16, lineHeight: 1.9, margin: "0 0 12px", color: p.ink }}>{line || <br />}</p>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
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
function WriteView({ textRef, editData, editMode, onSave, onCancel }) {
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
                  style={{ fontSize: 22, background: "transparent", border: `2px solid ${form.mood === m ? p.accent : "transparent"}`, borderRadius: 10, padding: "4px 6px", cursor: "pointer", background: form.mood === m ? p.accentLight : "transparent" }}
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
                  {m.type?.startsWith("image/") ? <img src={m.data} style={{ width: 100, height: 80, objectFit: "cover", display: "block" }} /> : <video src={m.data} style={{ width: 100, height: 80, objectFit: "cover" }} />}
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

// ── 스타일 ─────────────────────────────────────────────────────────────────────
const p = {
  bg: "#faf8f3", surface: "#ffffff", ink: "#2c2c2c", inkLight: "#6b6b6b",
  inkMuted: "#9b9b9b", accent: "#3d6b47", accentLight: "#e8f0ea",
  accentSoft: "#c4dbc9", border: "#e4dfd6", danger: "#c0392b", dangerLight: "#fdecea",
};

const s = {
  root: { minHeight: "100vh", background: p.bg, fontFamily: "'Noto Serif KR', Georgia, serif", color: p.ink, position: "relative", overflowX: "hidden" },
  bgTexture: { position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8bfad' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`, pointerEvents: "none", zIndex: 0 },
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16 },
  spinner: { width: 40, height: 40, border: "3px solid #e4dfd6", borderTop: "3px solid #3d6b47", borderRadius: "50%", animation: "spin 0.9s linear infinite" },
  loadingText: { color: p.inkMuted, fontSize: 14, fontFamily: "sans-serif" },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 24px", borderRadius: 30, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", fontFamily: "sans-serif", whiteSpace: "nowrap" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: p.surface, borderRadius: 20, padding: "36px 40px", maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", alignItems: "stretch" },
  modalIcon: { fontSize: 40, textAlign: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: p.ink, textAlign: "center" },
  modalSub: { fontSize: 14, color: p.inkLight, margin: "0 0 20px", lineHeight: 1.6, textAlign: "center", fontFamily: "sans-serif" },
  modalInput: { width: "100%", padding: "12px 14px", border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 14, background: p.bg, color: p.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  errorText: { color: p.danger, fontSize: 13, margin: "8px 0 0", fontFamily: "sans-serif", textAlign: "center" },
  header: { position: "sticky", top: 0, zIndex: 100, background: "rgba(250,248,243,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${p.border}` },
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
  statCard: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 12, padding: "16px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 90, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
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
  card: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
  cardThumb: { position: "relative", width: "100%", height: 160, overflow: "hidden", background: "#f0ebe4" },
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
  writeForm: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 20, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" },
  formRow: { display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: p.inkLight, marginBottom: 8, fontFamily: "sans-serif", letterSpacing: 0.3 },
  inputDate: { width: "100%", padding: "10px 14px", border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 14, background: p.bg, color: p.ink, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box" },
  inputText: { width: "100%", padding: "10px 14px", border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 15, background: p.bg, color: p.ink, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  textarea: { width: "100%", padding: 14, border: `1.5px solid ${p.border}`, borderRadius: 10, fontSize: 15, background: p.bg, color: p.ink, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.8, boxSizing: "border-box" },
  mediaUploadBtn: { background: p.accentLight, color: p.accent, border: `1.5px dashed ${p.accentSoft}`, borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "sans-serif" },
  readContainer: { maxWidth: 680, margin: "0 auto" },
  readCard: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 20, padding: 40, boxShadow: "0 4px 20px rgba(0,0,0,0.06)", marginBottom: 24 },
  readTitle: { fontSize: 28, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.3, color: p.ink },
  mediaGallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 28 },
  navBtn: { background: p.surface, border: `1px solid ${p.border}`, borderRadius: 30, padding: "10px 20px", fontSize: 13, color: p.inkLight, cursor: "pointer", fontFamily: "sans-serif", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  footer: { position: "relative", zIndex: 1, textAlign: "center", padding: 20, fontSize: 13, color: p.inkMuted, borderTop: `1px solid ${p.border}`, fontFamily: "sans-serif" },
};

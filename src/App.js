// ROADCHART BUILD MARKER: v15-print-compact
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Trash2, Printer, Music, ListMusic, X, Save, CornerDownLeft, Music2, Maximize2, Minimize2,
  Undo2, Redo2, Download, Upload, Menu, Share2, Copy, Check,
} from "lucide-react";

function RoadchartMark({ size = 20, pinColor = "#f2a33c", noteColor = "#1a170f" }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M16 2C9.4 2 4 7.4 4 14C4 22.8 16 38 16 38C16 38 28 22.8 28 14C28 7.4 22.6 2 16 2Z" fill={pinColor} />
      <g transform="rotate(-18 15 15)">
        <rect x="17.1" y="5.5" width="1.7" height="11.5" rx="0.85" fill={noteColor} />
        <ellipse cx="14" cy="17" rx="3.7" ry="2.8" fill={noteColor} />
      </g>
    </svg>
  );
}

// ---------- helpers ----------
const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
const stripHtml = (html) => (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
const secRhythms = (sec) => sec.rhythms || (sec.rhythm ? [sec.rhythm] : []);

const emptySection = (name = "VERSE") => ({
  id: uid(),
  type: "section",
  name,
  technique: "",
  bars: 4,
  repeatLabel: "4x",
  rhythms: [],
});

const emptyBreak = () => ({ id: uid(), type: "break" });
const emptyNav = (label) => ({ id: uid(), type: "nav", label });
const NAV_PRESETS = ["D.S. al Coda", "D.C. al Fine", "To Coda", "Coda", "Fine", "D.S."];

const emptyRhythmData = () => ({ id: uid(), startBar: 1, barCount: 1, subdivision: 2, slots: Array(8).fill("rest"), size: "sm", note: "" });

const emptyStandaloneRhythm = () => ({ id: uid(), label: "", subdivision: 4, beats: 2, slots: Array(8).fill("rest") });

const emptySong = () => ({
  id: uid(),
  title: "",
  artist: "",
  bpm: 100,
  groove: "",
  timeSignature: "4/4",
  isPublic: false,
  sections: [emptySection()],
  rhythms: [],
});

const parseBeatsPerBar = (ts) => {
  const n = parseInt(String(ts || "4/4").split("/")[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
};
const TIME_SIG_PRESETS = ["4/4", "3/4", "2/4", "6/8", "9/8", "12/8", "5/4", "7/8"];

// ---------- optional real backend (Supabase) ----------
// Fill these in with your own project's values (Supabase dashboard -> Project Settings -> API).
// Leave them as-is to keep using local, browser-only storage (no account, no sync).
const SUPABASE_URL = "https://snfymzdycsoyioqutkfj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BylqEBXOMXWC3N-vm7ArtA_1moHgNmi";
const BACKEND_ON = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

async function sbFetch(path, { method = "GET", token, body, headers = {} } = {}) {
  const reqHeaders = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    ...headers,
  };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("İstek 9 saniyede cevap vermedi (zaman aşımı) — bu önizleme ortamı dış API'ye ulaşamıyor olabilir.");
    }
    throw new Error(`Ağ hatası: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const msg = (data && (data.error_description || data.msg || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const sbAuth = {
  signUp: (email, password) => sbFetch("/auth/v1/signup", { method: "POST", body: { email, password } }),
  signIn: (email, password) =>
    sbFetch("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }),
};

const sbSongs = {
  list: (token) => sbFetch("/rest/v1/songs?select=*&order=updated_at.desc", { token }),
  upsert: (token, row) =>
    sbFetch("/rest/v1/songs?on_conflict=id", {
      method: "POST",
      token,
      body: row,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    }),
  remove: (token, id) => sbFetch(`/rest/v1/songs?id=eq.${id}`, { method: "DELETE", token }),
  getPublic: (id) => sbFetch(`/rest/v1/songs?id=eq.${id}&is_public=eq.true&select=*`),
};

const SECTION_PRESETS = [
  "INTRO", "VERSE", "PRE-CHORUS", "CHORUS", "POST-CHORUS", "BRIDGE",
  "SOLO", "BREAKDOWN", "BREAK", "INTERLUDE", "TURNAROUND", "OUTRO", "TAG",
];

const COLORS = { yellow: "#f0d94a", green: "#8fd07c", blue: "#8fc7e8", pink: "#efa3c4" };

const STORAGE_KEY = "drum-charts:library:v3";
const LANG_KEY = "drum-charts:lang";

const TRANSLATIONS = {
  tr: {
    brand: "Roadchart",
    newSong: "Yeni Parça",
    emptySongList: 'Henüz parça yok. "Yeni Parça" ile başla.',
    untitledSong: "İsimsiz Parça",
    deleteTooltip: "Sil",
    noSongSelected: "Soldan bir parça seç ya da yeni bir tane oluştur.",
    autoSaving: "Otomatik kaydediliyor",
    saveFailed: "Kaydetme başarısız — değişiklikler bu oturumda kalır",
    printPdf: "PDF / Yazdır",
    songNamePlaceholder: "PARÇA ADI",
    artistPlaceholder: "Sanatçı / kaynak",
    bpmLabel: "BPM",
    timeSigLabel: "Ölçü Türü",
    grooveLabel: "Groove",
    groovePlaceholder: "örn. half-time shuffle, 16'lık funk, düz 4",
    totalBarsSuffix: "ölçü toplam",
    lineBreak: "satır sonu",
    gridHint: "Aynı ismi tekrar eklediğinde otomatik olarak kendi sütununun altına, yeni bir satıra düşer.",
    techniquePlaceholder: "teknik",
    namePlaceholder: "AD",
    barsLabel: "ölçü",
    addRhythm: "ritim",
    addSection: "Bölüm Ekle",
    generalRhythmHeading: "Genel Ritim Notları",
    generalRhythmSub: "Belirli bir bara bağlı olmayan, örn. bitiş/fin figürleri için.",
    rhythmLabelPlaceholder: "örn. FİN SENKOP",
    quarter: "4'lük", eighth: "8'lik", sixteenth: "16'lık",
    beatsSuffix: "vuruş",
    rhythmHint: "Bir vuruşa tıkla: es → nota → aksan (>) → ghost note (parantez) → bağ (senkop) → es",
    addRhythm2: "Ritim Ekle",
    barLabel: "ÖLÇÜ",
    alignToEnd: "sona hizala",
    alignToEndTooltip: "Bölümün son ölçülerine hizala",
    done: "bitti",
    edit: "düzenle",
    lengthLabel: "uzunluk",
    startLabel: "başlangıç",
    rhythmNotePlaceholder: "not (örn. senkop + atak)",
    sizeTooltip: "boyut",
    removeTooltip: "kaldır",
    highlightTooltip: "seçili metni bu renkle işaretle",
    eraseTooltip: "vurguyu temizle",
    confirmDeleteSong: '"{title}" parçasını silmek istediğine emin misin? Bu geri alınamaz.',
    backup: "Yedekle",
    importBackup: "İçe Aktar",
    importSuccess: "{count} parça içe aktarıldı.",
    importError: "Dosya okunamadı. Geçerli bir yedek dosyası olduğundan emin ol.",
    undoTooltip: "Geri al",
    redoTooltip: "Yinele",
    shareBtn: "Paylaş",
    shareOnLabel: "Herkese açık — link'e sahip olan görebilir",
    shareOffLabel: "Kapalı — sadece sen görüyorsun",
    shareCopy: "Kopyala",
    shareCopied: "Kopyalandı!",
    shareNotFound: "Bu parça bulunamadı ya da artık paylaşılmıyor.",
    sharedBadge: "👁 Salt okunur, paylaşılmış görünüm",
    shareTryIt: "Kendi chart'ını oluştur",
    authEmail: "E-posta",
    authPassword: "Şifre",
    authSignIn: "Giriş Yap",
    authSignUp: "Hesap Oluştur",
    authToggleToSignUp: "Hesabın yok mu? Kayıt ol",
    authToggleToSignIn: "Zaten hesabın var mı? Giriş yap",
    authSignOut: "Çıkış",
    authSyncing: "Hesabınla senkronize",
    authError: "Bir şeyler ters gitti, tekrar dene.",
    authCheckEmail: "Kayıt başarılı — Supabase e-posta doğrulaması istiyorsa gelen kutunu kontrol et, sonra giriş yap.",
    authSessionNote: "Not: bu oturum sadece bu sekme açıkken sürer, sayfayı yenilersen tekrar giriş yapman gerekir.",
  },
  en: {
    brand: "Roadchart",
    newSong: "New Song",
    emptySongList: 'No songs yet. Start with "New Song".',
    untitledSong: "Untitled Song",
    deleteTooltip: "Delete",
    noSongSelected: "Pick a song on the left, or create a new one.",
    autoSaving: "Auto-saving",
    saveFailed: "Save failed — changes will stay for this session only",
    printPdf: "PDF / Print",
    songNamePlaceholder: "SONG TITLE",
    artistPlaceholder: "Artist / source",
    bpmLabel: "BPM",
    timeSigLabel: "Time Signature",
    grooveLabel: "Groove",
    groovePlaceholder: "e.g. half-time shuffle, 16th funk, straight 4",
    totalBarsSuffix: "bars total",
    lineBreak: "line break",
    gridHint: "Adding the same name again automatically drops into a new row under its own column.",
    techniquePlaceholder: "technique",
    namePlaceholder: "NAME",
    barsLabel: "bars",
    addRhythm: "rhythm",
    addSection: "Add Section",
    generalRhythmHeading: "General Rhythm Notes",
    generalRhythmSub: "For figures not tied to a specific bar, e.g. an ending/tag.",
    rhythmLabelPlaceholder: "e.g. ENDING SYNCOPATION",
    quarter: "quarter", eighth: "eighth", sixteenth: "16th",
    beatsSuffix: "beats",
    rhythmHint: "Tap a beat to cycle: rest → note → accent (>) → ghost note (parens) → tie (syncopation) → rest",
    addRhythm2: "Add Rhythm",
    barLabel: "BAR",
    alignToEnd: "align to end",
    alignToEndTooltip: "Align to the section's final bars",
    done: "done",
    edit: "edit",
    lengthLabel: "length",
    startLabel: "start",
    rhythmNotePlaceholder: "note (e.g. syncopation + accent)",
    sizeTooltip: "size",
    removeTooltip: "remove",
    highlightTooltip: "highlight the selected text with this color",
    eraseTooltip: "clear highlight",
    confirmDeleteSong: 'Delete "{title}"? This can\'t be undone.',
    backup: "Backup",
    importBackup: "Import",
    importSuccess: "{count} song(s) imported.",
    importError: "Couldn't read the file. Make sure it's a valid backup file.",
    undoTooltip: "Undo",
    redoTooltip: "Redo",
    shareBtn: "Share",
    shareOnLabel: "Public — anyone with the link can view",
    shareOffLabel: "Private — only you can see it",
    shareCopy: "Copy",
    shareCopied: "Copied!",
    shareNotFound: "This song wasn't found, or isn't shared anymore.",
    sharedBadge: "👁 Read-only shared view",
    shareTryIt: "Make your own chart",
    authEmail: "Email",
    authPassword: "Password",
    authSignIn: "Sign In",
    authSignUp: "Create Account",
    authToggleToSignUp: "No account? Sign up",
    authToggleToSignIn: "Already have an account? Sign in",
    authSignOut: "Sign out",
    authSyncing: "Synced to your account",
    authError: "Something went wrong, try again.",
    authCheckEmail: "Signed up — if Supabase requires email verification, check your inbox, then sign in.",
    authSessionNote: "Note: this session only lasts while this tab is open — refreshing means signing in again.",
  },
};

// ---------- grid pivot: same-name sections stack into the same column ----------
function buildGrid(sections) {
  const columns = [];
  const colIndex = {};
  const rows = [];
  let current = null;

  sections.forEach((sec) => {
    if (sec.type === "break") {
      if (current && current.cells.some(Boolean)) {
        rows.push({ type: "spacer", id: sec.id });
        current = null;
      } else if (rows.length && rows[rows.length - 1].type === "cells") {
        rows.push({ type: "spacer", id: sec.id });
      }
      return;
    }
    if (sec.type === "nav") {
      current = null;
      rows.push({ type: "nav", id: sec.id, label: sec.label });
      return;
    }
    const name = stripHtml(sec.name).toUpperCase() || "?";
    if (!(name in colIndex)) {
      colIndex[name] = columns.length;
      columns.push(name);
    }
    const col = colIndex[name];
    if (!current) {
      current = { type: "cells", cells: [] };
      rows.push(current);
    }
    if (current.cells[col]) {
      current = { type: "cells", cells: [] };
      rows.push(current);
    }
    current.cells[col] = sec;
  });

  // normalize: turn sparse "holes" into explicit nulls so every row has
  // exactly columns.length entries and empty slots actually render (and align)
  rows.forEach((row) => {
    if (row.type !== "cells") return;
    const norm = new Array(columns.length).fill(null);
    for (let i = 0; i < columns.length; i++) norm[i] = row.cells[i] || null;
    row.cells = norm;
  });

  return { columns, rows };
}

const RHYTHM_ORDER = ["rest", "hit", "accent", "ghost", "tie"];
const nextRhythmVal = (v) => RHYTHM_ORDER[(RHYTHM_ORDER.indexOf(v) + 1) % RHYTHM_ORDER.length];

// ---------- rhythm grid SVG (scalable, click-and-drag to paint) ----------
function RhythmGrid({ subdivision, beats, slots, onToggle, scale = 1, beatsPerBar = 4 }) {
  const [paintVal, setPaintVal] = useState(null);

  useEffect(() => {
    if (paintVal === null) return;
    const stop = () => setPaintVal(null);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [paintVal]);

  const startPaint = (idx) => {
    const v = nextRhythmVal(slots[idx]);
    setPaintVal(v);
    onToggle(idx, v);
  };
  const dragOver = (idx) => {
    if (paintVal !== null) onToggle(idx, paintVal);
  };

  const spacing = 26 * scale;
  const marginX = 14 * scale;
  const groupGap = 12 * scale;
  const width = beats * subdivision * spacing + (beats - 1) * groupGap + marginX * 2;
  const height = 62 * scale;
  const noteY = 42 * scale;
  const beamTopBase = 12 * scale;
  const beamGap = 4.5 * scale;

  const groups = [];
  for (let g = 0; g < beats; g++) groups.push(slots.slice(g * subdivision, g * subdivision + subdivision));

  let cursorX = marginX;
  const elements = [];

  groups.forEach((group, gi) => {
    const xs = group.map((_, i) => cursorX + i * spacing);
    const beamLines = subdivision === 1 ? 0 : subdivision === 2 ? 1 : 2;

    let runStart = null;
    const runs = [];
    group.forEach((s, i) => {
      const active = s === "hit" || s === "tie" || s === "accent" || s === "ghost";
      if (active && runStart === null) runStart = i;
      if (!active && runStart !== null) { runs.push([runStart, i - 1]); runStart = null; }
    });
    if (runStart !== null) runs.push([runStart, group.length - 1]);

    runs.forEach(([a, b]) => {
      for (let bl = 0; bl < beamLines; bl++) {
        const y = beamTopBase + bl * beamGap;
        if (a === b) {
          elements.push(<line key={`bm-${gi}-${a}-${bl}`} x1={xs[a]} y1={y} x2={xs[a] + 10 * scale} y2={y + 3 * scale}
            stroke="#1a170f" strokeWidth={2.2 * scale} strokeLinecap="round" />);
        } else {
          elements.push(<line key={`bm-${gi}-${a}-${b}-${bl}`} x1={xs[a]} y1={y} x2={xs[b]} y2={y}
            stroke="#1a170f" strokeWidth={2.6 * scale} strokeLinecap="round" />);
        }
      }
    });

    group.forEach((s, i) => {
      const x = xs[i];
      const idx = gi * subdivision + i;
      if (s === "hit" || s === "tie" || s === "accent" || s === "ghost") {
        const rx = s === "ghost" ? 5 * scale : 6 * scale;
        const ry = s === "ghost" ? 3.8 * scale : 4.6 * scale;
        elements.push(
          <g key={`n-${idx}`}>
            <line x1={x} y1={noteY - 2} x2={x} y2={beamTopBase} stroke="#1a170f" strokeWidth={2 * scale} />
            <ellipse cx={x} cy={noteY} rx={rx} ry={ry} fill="#1a170f" />
            {s === "ghost" && (
              <>
                <text x={x - rx - 5 * scale} y={noteY + 4 * scale} fontSize={13 * scale} fontWeight="700" fill="#1a170f" textAnchor="middle">(</text>
                <text x={x + rx + 5 * scale} y={noteY + 4 * scale} fontSize={13 * scale} fontWeight="700" fill="#1a170f" textAnchor="middle">)</text>
              </>
            )}
            {s === "accent" && (
              <text x={x} y={beamTopBase - 3 * scale} fontSize={13 * scale} fontWeight="900" fill="#1a170f" textAnchor="middle">&gt;</text>
            )}
            {s === "tie" && i > 0 && (
              <path d={`M ${xs[i - 1] + 5 * scale} ${noteY + 8 * scale} Q ${(xs[i - 1] + x) / 2} ${noteY + 14 * scale} ${x - 5 * scale} ${noteY + 8 * scale}`}
                fill="none" stroke="#8a5c1e" strokeWidth={1.5 * scale} />
            )}
          </g>
        );
      } else {
        elements.push(
          <g key={`r-${idx}`}>
            <line x1={x - 4.5 * scale} y1={noteY - 4.5 * scale} x2={x + 4.5 * scale} y2={noteY + 4.5 * scale} stroke="#a49d89" strokeWidth={2.2 * scale} strokeLinecap="round" />
            <line x1={x - 4.5 * scale} y1={noteY + 4.5 * scale} x2={x + 4.5 * scale} y2={noteY - 4.5 * scale} stroke="#a49d89" strokeWidth={2.2 * scale} strokeLinecap="round" />
          </g>
        );
      }
      elements.push(
        <rect key={`h-${idx}`} x={x - spacing / 2} y={2} width={spacing} height={height - 4} fill="transparent"
          onMouseDown={() => startPaint(idx)} onMouseEnter={() => dragOver(idx)}
          style={{ cursor: "pointer" }} />
      );
    });

    cursorX += subdivision * spacing + groupGap;
  });

  const barX = [{ x: marginX - 7 * scale, major: true }];
  let bx = marginX - 7 * scale;
  groups.forEach((_, gi) => {
    bx += subdivision * spacing;
    const boundaryIndex = gi + 1;
    barX.push({ x: bx + groupGap / 2 - 2.5 * scale, major: boundaryIndex % beatsPerBar === 0 });
    bx += groupGap;
  });

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {barX.map((b, i) => (
        <line key={`b-${i}`} x1={b.x} y1={b.major ? 2 : 5} x2={b.x} y2={b.major ? height - 2 : height - 5}
          stroke={b.major ? "#1a170f" : "#d8d0bd"} strokeWidth={b.major ? 2 : 1.3} />
      ))}
      {elements}
    </svg>
  );
}

// apply the chosen color to whatever text is currently selected on the page
// (used by the swatch buttons; mousedown+preventDefault on the button keeps the selection alive)
function applyHighlight(color) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.toString().trim() === "") return;
  try {
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("hiliteColor", false, color);
  } catch (e) {
    try { document.execCommand("backColor", false, color); } catch (e2) { /* no-op */ }
  }
}

function HighlightableField({ html, onChange, className, placeholder, multiline = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (html || "")) {
      ref.current.innerHTML = html || "";
    }
  }, [html]);
  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      onKeyDown={(e) => { if (!multiline && e.key === "Enter") e.preventDefault(); }}
    />
  );
}

function CellRhythm({ rhythm, secBars, beatsPerBar, onChange, onRemove, t }) {
  const hasContent = (rhythm.slots || []).some((s) => s !== "rest");
  const [editing, setEditing] = useState(!hasContent);
  const scale = rhythm.size === "lg" ? 1 : 0.72;
  const barCount = rhythm.barCount || 1;
  const startBar = rhythm.startBar || 1;
  const bpb = beatsPerBar || 4;

  const setSubdivision = (sub) => onChange({ ...rhythm, subdivision: sub, slots: Array(barCount * bpb * sub).fill("rest") });
  const setBarCount = (bc) => {
    const b = Math.max(1, bc);
    onChange({ ...rhythm, barCount: b, slots: Array(b * bpb * rhythm.subdivision).fill("rest") });
  };
  const setStartBar = (sb) => onChange({ ...rhythm, startBar: Math.max(1, sb) });
  const alignToEnd = () => {
    if (!secBars) return;
    onChange({ ...rhythm, startBar: Math.max(1, Number(secBars) - barCount + 1) });
  };

  const endBar = startBar + barCount - 1;

  return (
    <div className="cell-rhythm">
      <div className="cell-rhythm-range">
        <span className="range-label">{t("barLabel")} {startBar}{barCount > 1 ? `–${endBar}` : ""}</span>
        <button className="rhythm-done" onClick={() => setEditing((v) => !v)}>{editing ? t("done") : t("edit")}</button>
      </div>

      {editing && (
        <div className="cell-rhythm-note-picker">
          {[[1, t("quarter")], [2, t("eighth")], [4, t("sixteenth")]].map(([v, label]) => (
            <button key={v} className={rhythm.subdivision === v ? "on" : ""} onClick={() => setSubdivision(v)}>{label}</button>
          ))}
          {secBars ? <button className="range-align" onClick={alignToEnd} title={t("alignToEndTooltip")}>{t("alignToEnd")}</button> : null}
        </div>
      )}

      <div className="cell-rhythm-scroll">
        <RhythmGrid subdivision={rhythm.subdivision} beats={barCount * bpb} beatsPerBar={bpb} slots={rhythm.slots} scale={scale}
          onToggle={(idx, val) => {
            const slots = [...rhythm.slots];
            slots[idx] = val !== undefined ? val : nextRhythmVal(slots[idx]);
            onChange({ ...rhythm, slots });
          }} />
      </div>

      {editing ? (
        <HighlightableField className="range-note" placeholder={t("rhythmNotePlaceholder")} html={rhythm.note || ""}
          multiline={false} onChange={(html) => onChange({ ...rhythm, note: html })} />
      ) : (
        rhythm.note ? <div className="range-note-view" dangerouslySetInnerHTML={{ __html: rhythm.note }} /> : null
      )}

      {editing && (
        <div className="cell-rhythm-bar">
          <div className="cell-beat-stepper">
            <span>{t("lengthLabel")}</span>
            <button onClick={() => setBarCount(barCount - 1)} title="−1">−</button>
            <b>{barCount}</b>
            <button onClick={() => setBarCount(barCount + 1)} title="+1">+</button>
          </div>
          <div className="cell-beat-stepper">
            <span>{t("startLabel")}</span>
            <button onClick={() => setStartBar(startBar - 1)} title="−1">−</button>
            <b>{startBar}</b>
            <button onClick={() => setStartBar(startBar + 1)} title="+1">+</button>
          </div>
          <div className="cell-rhythm-bar-right">
            <button onClick={() => onChange({ ...rhythm, size: rhythm.size === "lg" ? "sm" : "lg" })} title={t("sizeTooltip")}>
              {rhythm.size === "lg" ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
            </button>
            <button onClick={onRemove} title={t("removeTooltip")}><X size={10} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- chart cell ----------
function SectionCell({ sec, beatsPerBar, onChange, onDelete, t }) {
  return (
    <div className="cell">
      <div className="cell-inner">
        <HighlightableField className="c-technique" placeholder={t("techniquePlaceholder")} html={sec.technique} multiline={false}
          onChange={(html) => onChange({ technique: html })} />
        <HighlightableField className="c-name" placeholder={t("namePlaceholder")} html={sec.name} multiline={false}
          onChange={(html) => onChange({ name: html })} />
        <div className="c-bracket">⌣</div>
        <div className="c-repeat-wrap">
          <HighlightableField className="c-repeat" placeholder="4x" html={sec.repeatLabel || ""}
            onChange={(html) => onChange({ repeatLabel: html })} />
        </div>
        <div className="c-bars-row">
          <input className="c-bars" type="number" value={sec.bars} onChange={(e) => onChange({ bars: e.target.value })} />
          <span>{t("barsLabel")}</span>
        </div>

        {secRhythms(sec).map((rh, ri) => (
          <CellRhythm key={rh.id || ri} rhythm={rh} secBars={sec.bars} beatsPerBar={beatsPerBar} t={t}
            onChange={(r) => {
              const next = [...secRhythms(sec)];
              next[ri] = r;
              onChange({ rhythms: next, rhythm: undefined });
            }}
            onRemove={() => {
              const next = secRhythms(sec).filter((_, i) => i !== ri);
              onChange({ rhythms: next, rhythm: undefined });
            }}
          />
        ))}
        <button className="c-add-rhythm" onClick={() => onChange({ rhythms: [...secRhythms(sec), emptyRhythmData()], rhythm: undefined })}>
          <Music2 size={10} /> {t("addRhythm")}
        </button>
      </div>

      <div className="cell-toolbar">
        <div className="swatches">
          {Object.keys(COLORS).map((c) => (
            <button key={c} className="swatch" style={{ background: COLORS[c] }}
              onMouseDown={(e) => { e.preventDefault(); applyHighlight(COLORS[c]); }} title={t("highlightTooltip")} />
          ))}
          <button className="swatch eraser" onMouseDown={(e) => { e.preventDefault(); applyHighlight("transparent"); }} title={t("eraseTooltip")}>
            <X size={9} />
          </button>
        </div>
        <button className="cell-del" onClick={onDelete} title={t("removeTooltip")}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

// ---------- auth screen (only rendered when BACKEND_ON) ----------
function AuthScreen({ t, onAuthed }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    const onErr = (e) => {
      const msg = (e.reason && e.reason.message) || e.message || String(e.reason || e);
      console.error("Roadchart uncaught:", e);
      setError(`Beklenmeyen hata: ${msg}`);
      setBusy(false);
    };
    window.addEventListener("unhandledrejection", onErr);
    window.addEventListener("error", onErr);
    return () => {
      window.removeEventListener("unhandledrejection", onErr);
      window.removeEventListener("error", onErr);
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    try {
      if (mode === "signup") {
        const data = await sbAuth.signUp(email, password);
        if (data && data.access_token) onAuthed(data);
        else setInfo(t("authCheckEmail"));
      } else {
        const data = await sbAuth.signIn(email, password);
        onAuthed(data);
      }
    } catch (err) {
      console.error("Roadchart auth error:", err);
      setError(err.message || t("authError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <style>{`
        .auth-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: #14130f; font-family: 'Inter', system-ui, sans-serif; }
        .auth-card { background: #f2ede2; width: 300px; padding: 26px 24px; border-radius: 6px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 10px; }
        .auth-brand { font-family: 'Oswald','Arial Narrow',sans-serif; text-transform: uppercase; font-weight: 700;
          letter-spacing: 0.06em; color: #1a170f; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 15px; }
        .auth-card input { border: 1px solid #d8d0bd; border-radius: 3px; padding: 9px 10px; font-size: 13px;
          background: #fff; color: #1a170f; }
        .auth-card input:focus { outline: none; border-color: #f2a33c; }
        .auth-card button[type="submit"] { background: #f2a33c; color: #1a1408; border: none; border-radius: 3px;
          padding: 10px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; cursor: pointer; margin-top: 4px; }
        .auth-card button[type="submit"]:hover { background: #ffb75c; }
        .auth-card button[type="submit"]:disabled { opacity: 0.6; cursor: default; }
        .auth-toggle { background: none; border: none; color: #6b6555; font-size: 11.5px; cursor: pointer;
          text-decoration: underline; padding: 2px 0; }
        .auth-toggle:hover { color: #1a170f; }
        .auth-error { color: #fff; background: #b0281e; border-radius: 3px; padding: 8px 10px; font-size: 12px; font-weight: 600; }
        .auth-info { color: #fff; background: #4a7a4a; border-radius: 3px; padding: 8px 10px; font-size: 12px; font-weight: 600; }
        .auth-note { font-size: 10px; color: #8a8267; margin: 4px 0 0; line-height: 1.4; }
      `}</style>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><RoadchartMark size={22} /> {t("brand")}</div>
        <input type="text" autoComplete="username" placeholder={t("authEmail")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="text" autoComplete="current-password" placeholder={t("authPassword")} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}
        <button type="button" onClick={submit} disabled={busy}>
          {busy ? "…" : (mode === "signup" ? t("authSignUp") : t("authSignIn"))}
        </button>
        <button type="button" className="auth-toggle" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
          {mode === "signup" ? t("authToggleToSignIn") : t("authToggleToSignUp")}
        </button>
        <p className="auth-note">{t("authSessionNote")}</p>
      </form>
    </div>
  );
}


const CHART_STYLES = `
        .chart-app {
          --ink: #efece4; --ink-dim: #a7a49a; --stage: #14130f; --stage-2: #1c1a15;
          --paper: #f2ede2; --paper-line: #d8d0bd; --amber: #f2a33c; --amber-dim: #8a5c1e; --red: #d15a4a;
          font-family: 'Inter', system-ui, sans-serif; background: var(--stage); color: var(--ink);
          min-height: 100vh; display: flex; font-size: 14px;
        }
        .chart-app * { box-sizing: border-box; }
        .mono { font-family: 'JetBrains Mono', 'Roboto Mono', monospace; }

        .sidebar { width: 240px; flex-shrink: 0; background: var(--stage-2); border-right: 1px solid #2a271f;
          display: flex; flex-direction: column; height: 100vh; position: sticky; top: 0; }
        .sidebar-close { display: none; }
        .mobile-menu-btn { display: none; }
        .shared-topbar { display: flex; align-items: center; gap: 8px; max-width: 980px; margin: 0 auto 14px;
          padding: 4px 2px; }
        .shared-topbar .brand { font-family: 'Oswald','Arial Narrow',sans-serif; text-transform: uppercase;
          letter-spacing: 0.08em; font-weight: 600; font-size: 15px; color: var(--amber); flex: 1; }
        .shared-cta { font-size: 12px; font-weight: 700; color: var(--ink-dim); text-decoration: none;
          border: 1px solid #3a362c; border-radius: 3px; padding: 6px 12px; transition: all 0.15s; }
        .shared-cta:hover { color: var(--amber); border-color: var(--amber); }
        .sidebar-backdrop { display: none; }

        @media (max-width: 760px) {
          .chart-app { display: block; }
          .sidebar { position: fixed; top: 0; left: 0; height: 100dvh; width: 82vw; max-width: 320px;
            z-index: 40; transform: translateX(-100%); transition: transform 0.22s ease; box-shadow: 4px 0 24px rgba(0,0,0,0.5); }
          .sidebar.open { transform: translateX(0); }
          .sidebar-close { display: flex; align-items: center; justify-content: center; background: none; border: none;
            color: var(--ink-dim); width: 32px; height: 32px; margin-left: auto; }
          .sidebar-backdrop.show { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 39; }
          .mobile-menu-btn { display: flex; align-items: center; gap: 8px; width: 100%; background: var(--stage-2);
            border: none; border-bottom: 1px solid #2a271f; color: var(--ink); padding: 14px 16px; font-size: 14px;
            font-weight: 700; position: sticky; top: 0; z-index: 10; text-align: left; }
          .main { padding: 0 12px 60px; height: auto; min-height: 100vh; overflow-y: visible; }
          .toolbar { flex-wrap: wrap; gap: 8px; padding: 10px 2px; }
          .chart-header { flex-direction: column; align-items: stretch; gap: 12px; }
          .readout, .ts-readout { min-width: 0; }
          .groove-row { flex-wrap: wrap; }
          .staff-grid { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .cell { min-width: 132px; }
          /* bigger touch targets */
          .icon-btn, .print-btn, .footer-btn, .new-btn, .preset-chip, .cell-del, .swatch, .rhythm-done,
          .c-add-rhythm, .add-section, .add-rhythm { min-height: 34px; }
          .swatch { width: 18px; height: 18px; }
          .cell-toolbar { opacity: 1; }
        }
        .sidebar-head { padding: 18px 16px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #2a271f; }
        .sidebar-head .brand { font-family: 'Oswald','Arial Narrow',sans-serif; text-transform: uppercase;
          letter-spacing: 0.08em; font-weight: 600; font-size: 15px; color: var(--amber); flex: 1; }
        .lang-switch { display: flex; border: 1px solid #3a362c; border-radius: 3px; overflow: hidden; }
        .lang-switch button { background: transparent; border: none; color: var(--ink-dim); font-size: 10px;
          font-weight: 700; padding: 3px 6px; cursor: pointer; }
        .lang-switch button.on { background: var(--amber); color: #1a1408; }
        .new-btn { margin: 12px 14px; background: var(--amber); color: #1a1408; border: none; border-radius: 3px;
          padding: 9px 10px; font-weight: 700; font-size: 12.5px; letter-spacing: 0.04em; text-transform: uppercase;
          display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
        .new-btn:hover { background: #ffb75c; }
        .song-list { overflow-y: auto; flex: 1; padding: 4px 8px 16px; }
        .song-item { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 9px 10px;
          border-radius: 3px; cursor: pointer; color: var(--ink-dim); margin-bottom: 2px; }
        .song-item:hover { background: #24211a; color: var(--ink); }
        .song-item.active { background: #2a2419; color: var(--ink); box-shadow: inset 2px 0 0 var(--amber); }
        .song-item .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
        .song-item .del { opacity: 0; background: none; border: none; color: var(--ink-dim); cursor: pointer; padding: 2px; }
        .song-item:hover .del { opacity: 1; }
        .song-item .del:hover { color: var(--red); }
        .empty-list { padding: 24px 14px; color: var(--ink-dim); font-size: 12.5px; line-height: 1.5; }
        .sidebar-footer { padding: 10px; border-top: 1px solid #2a271f; display: flex; gap: 6px; }
        .footer-btn { flex: 1; background: transparent; border: 1px solid #3a362c; color: var(--ink-dim); border-radius: 3px;
          padding: 7px 4px; font-size: 10.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
        .footer-btn:hover { border-color: var(--amber); color: var(--amber); }

        .main { flex: 1; padding: 32px 40px 90px; overflow-y: auto; height: 100vh; }
        .no-song { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 70vh;
          color: var(--ink-dim); gap: 10px; }
        .no-song svg { opacity: 0.4; }

        .chart-card { background: var(--paper); color: #1a170f; max-width: 980px; margin: 0 auto; border-radius: 4px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.45); overflow: hidden; }
        .chart-header { padding: 22px 26px 18px; border-bottom: 2.5px solid #1a170f; display: flex;
          justify-content: space-between; align-items: flex-end; gap: 20px; }
        .title-input { font-family: 'Oswald','Arial Narrow',sans-serif; font-size: 28px; font-weight: 700;
          text-transform: uppercase; background: transparent; border: none; width: 100%; color: #1a170f; }
        .title-input:focus { outline: none; border-bottom: 1px dashed #1a170f; }
        .artist-input { background: transparent; border: none; font-size: 13px; color: #5c5745; margin-top: 2px; width: 100%; }
        .artist-input:focus { outline: none; border-bottom: 1px dashed #999; }
        .artist-input::placeholder, .title-input::placeholder { color: #a49d89; }
        .readout { font-family: 'JetBrains Mono','Roboto Mono',monospace; background: #1a1712; color: var(--amber);
          border-radius: 4px; padding: 8px 14px; text-align: center; min-width: 88px; }
        .ts-readout { min-width: 70px; }
        .ts-readout input { font-size: 20px !important; }
        .readout input { background: transparent; border: none; color: var(--amber); font-family: inherit;
          font-size: 24px; font-weight: 700; width: 100%; text-align: center; }
        .readout input:focus { outline: none; }
        .readout .lbl { font-size: 9px; letter-spacing: 0.15em; color: #d69a4e; margin-top: 2px; text-transform: uppercase; }

        .groove-row { padding: 10px 26px; border-bottom: 1px solid var(--paper-line); display: flex; align-items: center;
          gap: 10px; background: #ebe4d3; }
        .groove-row label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b6555; font-weight: 800; }
        .groove-row input { background: transparent; border: none; font-size: 13.5px; font-style: italic; color: #221f19;
          flex: 1; font-weight: 700; }
        .groove-row input:focus { outline: none; }
        .groove-row .total { font-family: 'JetBrains Mono',monospace; font-size: 11.5px; color: #6b6555; white-space: nowrap; }

        .presets-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 26px 4px; }
        .preset-chip { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid var(--paper-line);
          background: transparent; color: #4a4636; padding: 4px 9px; border-radius: 20px; cursor: pointer; font-weight: 700; }
        .preset-chip:hover { background: #1a170f; color: var(--paper); border-color: #1a170f; }
        .break-chip { border-color: var(--amber-dim); color: var(--amber-dim); }
        .nav-chip { border-color: #6b5a8a; color: #6b5a8a; }
        .nav-marker { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 8px;
          background: #ece4f5; border: 1px dashed #6b5a8a; border-radius: 4px; color: #4a3a68; font-weight: 800;
          font-family: 'Oswald','Arial Narrow',sans-serif; text-transform: uppercase; letter-spacing: 0.06em;
          font-size: 13px; padding: 8px 10px; margin: 4px 0; }
        .nav-marker-del { background: none; border: none; color: #8a7aa8; cursor: pointer; padding: 2px; }
        .nav-marker-del:hover { color: var(--red); }

        .hint { padding: 4px 26px 0; font-size: 11px; color: #8a8267; }

        /* grid staff */
        .staff-grid { display: grid; gap: 0; padding: 18px 22px 8px; overflow-x: auto; }
        .row-spacer { grid-column: 1 / -1; height: 16px; position: relative; }
        .row-spacer::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; border-top: 1.5px dashed #c9c2ac; }

        .cell { border-left: 2.5px solid #1a170f; position: relative; display: flex; flex-direction: column; min-width: 0; }
        .cell.empty-cell { border-left: 1px dashed #d8d0bd; }
        .cell:nth-last-child(-n+50) { }
        .cell-inner { padding: 10px 10px 6px; display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; min-width: 0; width: 100%; }
        .c-technique { text-align: center; font-size: 11px; font-style: italic; font-weight: 700; color: #3a3629;
          background: rgba(26,23,15,0.06); border-radius: 3px; width: 92%; padding: 1px 0; margin-bottom: 1px; cursor: text;
          min-height: 1.2em; }
        .c-technique:focus { outline: none; background: rgba(26,23,15,0.1); }
        .c-technique:empty:before { content: attr(data-placeholder); color: #a49d89; font-weight: 600; font-style: italic; }
        .c-name { text-align: center; font-family: 'Oswald','Arial Narrow',sans-serif; font-weight: 800; font-size: 16.5px;
          text-transform: uppercase; width: 100%; color: #1a170f; letter-spacing: 0.01em; cursor: text; min-height: 1.2em; }
        .c-name:focus { outline: none; }
        .c-name:empty:before { content: attr(data-placeholder); color: #a49d89; font-weight: 700; }
        .c-bracket { text-align: center; color: #6b6555; font-size: 13px; line-height: 0.5; margin: 2px 0; }
        .c-repeat-wrap { position: relative; width: 100%; }
        .c-repeat { position: relative; z-index: 1; text-align: center; font-family: 'JetBrains Mono',monospace;
          font-size: 13.5px; width: 100%; color: #1a170f; font-weight: 800; white-space: pre-wrap; word-break: break-word;
          min-height: 1.3em; cursor: text; }
        .c-repeat:focus, .range-note:focus { outline: none; }
        .c-repeat:empty:before, .range-note:empty:before { content: attr(data-placeholder); color: #a49d89; font-weight: 600; }
        .c-bars-row { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 4px; }
        .c-bars { width: 30px; font-family: 'JetBrains Mono',monospace; font-size: 10.5px; text-align: center;
          background: #f7f2e6; border: 1px solid var(--paper-line); border-radius: 2px; color: #6b6555; }
        .c-bars-row span { font-size: 9px; color: #8a8267; text-transform: uppercase; }

        .c-add-rhythm { margin-top: 6px; background: transparent; border: 1px dashed var(--paper-line); color: #8a8267;
          font-size: 9.5px; text-transform: uppercase; font-weight: 700; border-radius: 3px; padding: 3px 7px; cursor: pointer;
          display: flex; align-items: center; gap: 3px; }
        .c-add-rhythm:hover { border-color: #1a170f; color: #1a170f; }
        .cell-rhythm { margin-top: 6px; background: #ece5d4; border: 1px solid var(--paper-line); border-radius: 3px;
          padding: 3px 4px 2px; width: 100%; max-width: 100%; min-width: 0; }
        .cell-rhythm-range { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 2px; }
        .range-label { font-family: 'JetBrains Mono',monospace; font-size: 9px; font-weight: 800; color: var(--amber-dim);
          background: rgba(138,92,30,0.12); border-radius: 2px; padding: 1px 4px; white-space: nowrap; }
        .range-align { font-size: 8px; text-transform: uppercase; font-weight: 700; color: #8a8267; background: none;
          border: none; cursor: pointer; text-decoration: underline; padding: 0; white-space: nowrap; }
        .range-align:hover { color: #1a170f; }
        .range-note { width: 100%; margin-top: 3px; font-size: 9.5px; font-style: italic; color: #4a4636;
          border-top: 1px dashed var(--paper-line); padding-top: 2px; cursor: text; min-height: 1.2em; }
        .range-note-view { width: 100%; margin-top: 3px; font-size: 9.5px; font-style: italic; color: #4a4636;
          border-top: 1px dashed var(--paper-line); padding-top: 2px; }
        .rhythm-done { font-size: 8px; text-transform: uppercase; font-weight: 700; color: #8a8267; background: none;
          border: none; cursor: pointer; text-decoration: underline; padding: 0; white-space: nowrap; }
        .rhythm-done:hover { color: #1a170f; }
        .cell-rhythm-note-picker { display: flex; gap: 2px; margin-bottom: 2px; min-width: 0; }
        .cell-rhythm-note-picker button { flex: 1; font-size: 8px; padding: 1px 0; border: 1px solid var(--paper-line);
          background: transparent; color: #8a8267; border-radius: 2px; cursor: pointer; font-weight: 700; min-width: 0; }
        .cell-rhythm-note-picker button.on { background: var(--amber-dim); color: #fff2dc; border-color: var(--amber-dim); }
        .cell-rhythm-scroll { overflow-x: auto; width: 100%; max-width: 100%; min-width: 0; }
        .cell-rhythm-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 8px; margin-top: 3px; }
        .cell-rhythm-bar-right { display: flex; gap: 4px; margin-left: auto; }
        .cell-rhythm-bar button { background: none; border: none; color: #a49d89; cursor: pointer; padding: 1px; }
        .cell-rhythm-bar button:hover { color: #1a170f; }
        .cell-beat-stepper { display: flex; align-items: center; gap: 3px; font-size: 8px; color: #8a8267; font-weight: 700;
          text-transform: uppercase; }
        .cell-beat-stepper b { font-size: 10px; color: #4a4636; min-width: 9px; text-align: center; }
        .cell-beat-stepper button { width: 13px; height: 13px; line-height: 11px; border: 1px solid var(--paper-line);
          background: transparent; border-radius: 2px; cursor: pointer; font-size: 10px; padding: 0; color: #6b6555; }
        .cell-beat-stepper button:hover { border-color: #1a170f; color: #1a170f; }

        .cell-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 6px;
          opacity: 0; transition: opacity 0.1s; border-top: 1px solid #e4dcc7; margin-top: auto; }
        .cell:hover .cell-toolbar { opacity: 1; }
        .swatches { display: flex; gap: 3px; align-items: center; }
        .swatch { width: 11px; height: 11px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.25); cursor: pointer; padding: 0; }
        .swatch.eraser { width: 12px; height: 12px; border-radius: 50%; background: #fff; display: flex; align-items: center;
          justify-content: center; color: #a49d89; border: 1px solid var(--paper-line); }
        .swatch.eraser:hover { color: var(--red); border-color: var(--red); }
        .cell-del { background: none; border: none; cursor: pointer; color: #a49d89; padding: 2px; }
        .cell-del:hover { color: var(--red); }

        .add-row { display: flex; gap: 8px; padding: 8px 26px 20px; }
        .add-section { border: 1.5px dashed var(--paper-line); background: transparent; color: #4a4636; padding: 8px 12px;
          border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .add-section:hover { border-color: #1a170f; color: #1a170f; }

        .rhythm-block { border-top: 2.5px solid #1a170f; padding: 16px 26px 22px; background: #ece5d4; }
        .rhythm-block h3 { font-family: 'Oswald','Arial Narrow',sans-serif; text-transform: uppercase; font-size: 13px;
          letter-spacing: 0.08em; color: #4a4636; margin: 0 0 4px; display: flex; align-items: center; gap: 6px; font-weight: 800; }
        .rhythm-block .sub { font-size: 11px; color: #8a8267; margin: 0 0 10px; }
        .rhythm-card { background: var(--paper); border: 1px solid var(--paper-line); border-radius: 4px; padding: 10px 14px; margin-bottom: 10px; }
        .rhythm-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
        .rhythm-label { flex: 1; min-width: 120px; background: transparent; border: none; border-bottom: 1px dashed transparent;
          font-weight: 800; font-size: 12.5px; text-transform: uppercase; color: #1a170f; }
        .rhythm-label:focus { outline: none; border-bottom-color: #999; }
        .rhythm-label::placeholder { color: #b3ac98; }
        .seg-toggle { display: flex; border: 1px solid var(--paper-line); border-radius: 3px; overflow: hidden; }
        .seg-toggle button { background: transparent; border: none; padding: 3px 8px; font-size: 10.5px; cursor: pointer; color: #6b6555; font-weight: 700; }
        .seg-toggle button.on { background: var(--amber-dim); color: #fff2dc; }
        .beat-stepper { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #6b6555; }
        .beat-stepper button { width: 18px; height: 18px; border: 1px solid var(--paper-line); background: transparent; border-radius: 2px; cursor: pointer; }
        .rhythm-del { background: none; border: none; color: #a49d89; cursor: pointer; }
        .rhythm-del:hover { color: var(--red); }
        .rhythm-hint { font-size: 10px; color: #a49d89; margin-top: 2px; }
        .add-rhythm { border: 1.5px dashed var(--paper-line); background: transparent; color: #4a4636; padding: 8px 12px;
          border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .add-rhythm:hover { border-color: #1a170f; color: #1a170f; }

        .toolbar { max-width: 980px; margin: 0 auto 14px; display: flex; justify-content: space-between; align-items: center; }
        .toolbar .status { font-size: 11.5px; color: var(--ink-dim); display: flex; align-items: center; gap: 6px; }
        .toolbar-right { display: flex; align-items: center; gap: 8px; }
        .share-panel { max-width: 980px; margin: -6px auto 14px; background: var(--stage-2); border: 1px solid #3a362c;
          border-radius: 4px; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
        .share-toggle { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink); cursor: pointer; }
        .share-toggle input { width: 16px; height: 16px; }
        .share-link-row { display: flex; gap: 8px; }
        .share-link-input { flex: 1; background: #0f0e0a; border: 1px solid #3a362c; color: var(--amber);
          font-family: 'JetBrains Mono', monospace; font-size: 11.5px; border-radius: 3px; padding: 7px 10px; }
        .share-copy-btn { background: var(--amber); color: #1a1408; border: none; border-radius: 3px; padding: 7px 12px;
          font-size: 11.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
        .share-copy-btn:hover { background: #ffb75c; }
        .icon-btn { background: transparent; border: 1px solid #3a362c; color: var(--ink); width: 32px; height: 32px;
          border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .icon-btn:hover:not(:disabled) { border-color: var(--amber); color: var(--amber); }
        .icon-btn:disabled { opacity: 0.3; cursor: default; }
        .print-btn { background: transparent; border: 1px solid #3a362c; color: var(--ink); padding: 8px 14px;
          border-radius: 3px; cursor: pointer; font-size: 12.5px; display: flex; align-items: center; gap: 6px; font-weight: 600; }
        .print-btn:hover { border-color: var(--amber); color: var(--amber); }

        @media print {
          .sidebar, .toolbar, .presets-row, .add-row, .cell-toolbar, .add-rhythm, .hint, .c-add-rhythm, .c-bars-row, .shared-topbar { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          @page { margin: 10mm; }
          .chart-app { background: white; display: block; }
          .main { padding: 0; height: auto; min-height: 0; overflow: visible; }
          .chart-card { box-shadow: none; max-width: 100%; border: 1px solid #1a170f; }

          .chart-header { padding: 10px 14px 8px; gap: 10px; flex-wrap: nowrap; border-bottom-width: 1.5px; }
          .title-input { font-size: 19px !important; }
          .artist-input { font-size: 10px !important; }
          .readout { min-width: 56px; padding: 4px 8px; }
          .readout input, .readout div { font-size: 15px !important; }
          .ts-readout { min-width: 44px; }
          .ts-readout input, .ts-readout div { font-size: 13px !important; }
          .readout .lbl { font-size: 7px !important; }

          .groove-row { padding: 5px 14px; }
          .groove-row input, .groove-row div { font-size: 10px !important; }
          .total { font-size: 9px !important; }

          .staff-grid { padding: 6px 10px 4px; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)) !important; }
          .cell, .nav-marker, .rhythm-card { break-inside: avoid; page-break-inside: avoid; }
          .cell { border-left-width: 1.5px; }
          .cell-inner { padding: 4px 5px 3px; gap: 0; }
          .c-technique { font-size: 8px !important; padding: 0; margin-bottom: 0; }
          .c-name { font-size: 12px !important; }
          .c-bracket { font-size: 9px; margin: 0; }
          .c-repeat { font-size: 10px !important; }
          .row-spacer { height: 6px; }
          .nav-marker { font-size: 9px; padding: 3px 6px; margin: 2px 0; }

          .cell-rhythm { padding: 2px 3px 1px; margin-top: 2px; }
          .cell-rhythm-range .range-label { font-size: 7px !important; }
          .range-note-view { font-size: 7px !important; }

          .rhythm-block { padding: 8px 14px 10px; }
          .rhythm-block h3 { font-size: 10px; margin-bottom: 2px; }
          .rhythm-block .sub { font-size: 8px; margin-bottom: 4px; }
          .rhythm-card { padding: 6px 8px; margin-bottom: 6px; }
          .rhythm-label { font-size: 10px !important; }
        }
      `;

function ReadOnlySectionCell({ sec, beatsPerBar }) {
  return (
    <div className="cell">
      <div className="cell-inner">
        <div className="c-technique" dangerouslySetInnerHTML={{ __html: sec.technique || "" }} />
        <div className="c-name" dangerouslySetInnerHTML={{ __html: sec.name || "" }} />
        <div className="c-bracket">⌣</div>
        <div className="c-repeat-wrap">
          <div className="c-repeat" dangerouslySetInnerHTML={{ __html: sec.repeatLabel || "" }} />
        </div>
        {secRhythms(sec).map((rh, ri) => (
          <div className="cell-rhythm" key={rh.id || ri}>
            <div className="cell-rhythm-range">
              <span className="range-label">
                ÖLÇÜ {rh.startBar || 1}
                {(rh.barCount || 1) > 1 ? `–${(rh.startBar || 1) + (rh.barCount || 1) - 1}` : ""}
              </span>
            </div>
            <div className="cell-rhythm-scroll">
              <RhythmGrid subdivision={rh.subdivision} beats={(rh.barCount || 1) * (beatsPerBar || 4)}
                beatsPerBar={beatsPerBar || 4} slots={rh.slots} scale={rh.size === "lg" ? 1 : 0.72} onToggle={() => {}} />
            </div>
            {rh.note && <div className="range-note-view" dangerouslySetInnerHTML={{ __html: rh.note }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SharedView({ shareId, t }) {
  const [song, setSong] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    (async () => {
      try {
        const rows = await sbSongs.getPublic(shareId);
        if (rows && rows.length) {
          const r = rows[0];
          setSong({
            title: r.title || "", artist: r.artist || "", bpm: r.bpm || 100,
            groove: r.groove || "", timeSignature: r.time_signature || "4/4",
            sections: r.sections || [], rhythms: r.rhythms || [],
          });
          setStatus("ready");
        } else setStatus("notfound");
      } catch (e) { setStatus("error"); }
    })();
  }, [shareId]);

  if (status !== "ready") {
    return (
      <div className="chart-app">
        <style>{CHART_STYLES}</style>
        <main className="main">
          <div className="shared-topbar">
            <RoadchartMark size={20} /><span className="brand">{t("brand")}</span>
          </div>
          <div className="no-song">
            <RoadchartMark size={44} pinColor="#a7a49a" noteColor="#14130f" />
            <div>{status === "loading" ? "…" : status === "notfound" ? t("shareNotFound") : t("authError")}</div>
          </div>
        </main>
      </div>
    );
  }

  const grid = buildGrid(song.sections);
  const bpb = parseBeatsPerBar(song.timeSignature);
  const totalBarsVal = song.sections.filter((s) => s.type === "section").reduce((a, s) => a + (Number(s.bars) || 0), 0);

  return (
    <div className="chart-app">
      <style>{CHART_STYLES}</style>
      <main className="main">
        <div className="shared-topbar">
          <RoadchartMark size={20} /><span className="brand">{t("brand")}</span>
          <a className="shared-cta" href={window.location.origin + window.location.pathname}>{t("shareTryIt")} →</a>
        </div>
        <div className="toolbar">
          <div className="status"><Share2 size={13} color="#f2a33c" /> {t("sharedBadge")}</div>
          <button className="print-btn" onClick={() => window.print()}><Printer size={14} /> {t("printPdf")}</button>
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title-input">{song.title || t("untitledSong")}</div>
              <div className="artist-input">{song.artist}</div>
            </div>
            <div className="readout"><div style={{ fontSize: 24, fontWeight: 700 }}>{song.bpm}</div><div className="lbl">{t("bpmLabel")}</div></div>
            <div className="readout ts-readout"><div style={{ fontSize: 20, fontWeight: 700 }}>{song.timeSignature}</div><div className="lbl">{t("timeSigLabel")}</div></div>
          </div>
          <div className="groove-row">
            <label>{t("grooveLabel")}</label>
            <div style={{ flex: 1, fontStyle: "italic", fontWeight: 600 }}>{song.groove}</div>
            <div className="total mono">{totalBarsVal} {t("totalBarsSuffix")}</div>
          </div>
          <div className="staff-grid" style={{ gridTemplateColumns: `repeat(${Math.max(grid.columns.length, 1)}, minmax(120px, 1fr))` }}>
            {grid.rows.map((row, ri) =>
              row.type === "spacer" ? (
                <div className="row-spacer" key={row.id} />
              ) : row.type === "nav" ? (
                <div className="nav-marker" key={row.id}>{row.label}</div>
              ) : (
                row.cells.map((sec, ci) =>
                  sec ? <ReadOnlySectionCell key={sec.id} sec={sec} beatsPerBar={bpb} /> : <div className="cell empty-cell" key={`e-${ri}-${ci}`} />
                )
              )
            )}
          </div>
          {(song.rhythms || []).length > 0 && (
            <div className="rhythm-block">
              <h3><Music2 size={13} /> {t("generalRhythmHeading")}</h3>
              {song.rhythms.map((r) => (
                <div className="rhythm-card" key={r.id}>
                  {r.label && <div className="rhythm-label" style={{ marginBottom: 6 }}>{r.label}</div>}
                  <RhythmGrid subdivision={r.subdivision} beats={r.beats} beatsPerBar={bpb} slots={r.slots} onToggle={() => {}} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function App() {
  const [songs, setSongs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [lang, setLang] = useState("tr");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [session, setSession] = useState(null); // { access_token, user } — only used when BACKEND_ON
  const saveTimer = useRef(null);

  const t = (key) => (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(LANG_KEY, false);
        if (res && res.value) setLang(res.value);
      } catch (e) { /* no-op */ }
    })();
  }, []);

  const changeLang = (l) => {
    setLang(l);
    try {
      if (window.storage && window.storage.set) window.storage.set(LANG_KEY, l, false).catch(() => {});
    } catch (e) { /* no-op outside the Claude artifact sandbox */ }
  };

  // local (no-backend) load — unchanged behavior when BACKEND_ON is false
  useEffect(() => {
    if (BACKEND_ON) return; // backend mode loads on sign-in instead, see loadFromBackend()
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setSongs(parsed);
          setHistory([parsed]);
          setHistoryIndex(0);
          if (parsed.length) setActiveId(parsed[0].id);
        }
      } catch (e) { setStorageOk(false); } finally { setLoaded(true); }
    })();
  }, []);

  const loadFromBackend = async (token) => {
    setLoaded(false);
    try {
      const rows = await sbSongs.list(token);
      const mapped = (rows || []).map((r) => ({
        id: r.id, title: r.title || "", artist: r.artist || "", bpm: r.bpm || 100,
        groove: r.groove || "", timeSignature: r.time_signature || "4/4", isPublic: !!r.is_public, sections: r.sections || [], rhythms: r.rhythms || [],
      }));
      setSongs(mapped);
      setHistory([mapped]);
      setHistoryIndex(0);
      if (mapped.length) setActiveId(mapped[0].id);
    } catch (e) {
      setStorageOk(false);
    } finally {
      setLoaded(true);
    }
  };

  const handleAuthed = (data) => {
    setSession({ access_token: data.access_token, user: data.user });
    loadFromBackend(data.access_token);
  };
  const signOut = () => {
    setSession(null);
    setSongs([]); setHistory([]); setHistoryIndex(-1); setActiveId(null); setLoaded(false);
  };

  const persist = useCallback((next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (BACKEND_ON) {
        if (!session) return;
        try {
          await Promise.all(next.map((s) =>
            sbSongs.upsert(session.access_token, {
              id: s.id, user_id: session.user.id, title: s.title, artist: s.artist,
              bpm: Number(s.bpm) || 100, groove: s.groove, time_signature: s.timeSignature || "4/4", is_public: !!s.isPublic, sections: s.sections, rhythms: s.rhythms || [],
            })
          ));
        } catch (e) { setStorageOk(false); }
        return;
      }
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(next), false); } catch (e) { setStorageOk(false); }
    }, 400);
  }, [session]);

  // debounced history snapshot: one undo step per "pause" in editing, not per keystroke
  const historyTimer = useRef(null);
  const applyingHistory = useRef(false);
  const historyIndexRef = useRef(-1);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  useEffect(() => {
    if (!loaded) return;
    persist(songs);
    if (applyingHistory.current) { applyingHistory.current = false; return; }
    if (historyTimer.current) clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      setHistory((h) => {
        const trimmed = h.slice(0, historyIndexRef.current + 1);
        const next = [...trimmed, songs].slice(-50);
        historyIndexRef.current = next.length - 1;
        setHistoryIndex(historyIndexRef.current);
        return next;
      });
    }, 700);
    // eslint-disable-next-line
  }, [songs, loaded, persist]);

  const undo = () => {
    if (historyIndex <= 0) return;
    applyingHistory.current = true;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setSongs(history[idx]);
  };
  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    applyingHistory.current = true;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setSongs(history[idx]);
  };

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.key.toLowerCase() === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      else if (e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyIndex, history]);

  const activeSong = songs.find((s) => s.id === activeId) || null;

  const updateSong = (id, patch) => setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setSections = (songId, fn) =>
    setSongs((prev) => prev.map((s) => (s.id !== songId ? s : { ...s, sections: fn(s.sections) })));
  const setRhythms = (songId, fn) =>
    setSongs((prev) => prev.map((s) => (s.id !== songId ? s : { ...s, rhythms: fn(s.rhythms || []) })));

  const addSong = () => {
    const song = emptySong();
    setSongs((prev) => [song, ...prev]);
    setActiveId(song.id);
  };
  const deleteSong = (id, title) => {
    if (!window.confirm(t("confirmDeleteSong").replace("{title}", title || t("untitledSong")))) return;
    setSongs((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) setActiveId(null);
    if (BACKEND_ON && session) sbSongs.remove(session.access_token, id).catch(() => setStorageOk(false));
  };

  const exportBackup = () => {
    const payload = { app: "road-map-chart-backup", version: 1, exportedAt: new Date().toISOString(), songs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `road-map-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fileInputRef = useRef(null);
  const triggerImport = () => fileInputRef.current && fileInputRef.current.click();
  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data) ? data : Array.isArray(data.songs) ? data.songs : null;
        if (!incoming) throw new Error("bad format");
        // regenerate ids so imported songs never collide with what's already here
        const remapped = incoming.map((s) => ({
          ...s,
          id: uid(),
          sections: (s.sections || []).map((sec) => ({ ...sec, id: uid() })),
          rhythms: (s.rhythms || []).map((r) => ({ ...r, id: uid() })),
        }));
        setSongs((prev) => [...remapped, ...prev]);
        if (remapped.length) setActiveId(remapped[0].id);
        window.alert(t("importSuccess").replace("{count}", remapped.length));
      } catch (err) {
        window.alert(t("importError"));
      }
    };
    reader.readAsText(file);
  };

  const totalBars = (song) =>
    song.sections.filter((s) => s.type === "section").reduce((a, s) => a + (Number(s.bars) || 0), 0);

  const grid = activeSong ? buildGrid(activeSong.sections) : null;

  if (BACKEND_ON && !session) {
    return <AuthScreen t={t} onAuthed={handleAuthed} />;
  }

  return (
    <div className="chart-app">
      <style>{CHART_STYLES}</style>

      <div className={"sidebar-backdrop" + (mobileNavOpen ? " show" : "")} onClick={() => setMobileNavOpen(false)} />
      <aside className={"sidebar" + (mobileNavOpen ? " open" : "")}>
        <div className="sidebar-head">
          <RoadchartMark size={18} /><span className="brand">{t("brand")}</span>
          <button className="sidebar-close" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
          <div className="lang-switch">
            <button className={lang === "tr" ? "on" : ""} onClick={() => changeLang("tr")}>TR</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => changeLang("en")}>EN</button>
          </div>
        </div>
        <button className="new-btn" onClick={() => { addSong(); setMobileNavOpen(false); }}><Plus size={14} /> {t("newSong")}</button>
        <div className="song-list">
          {songs.length === 0 && <div className="empty-list">{t("emptySongList")}</div>}
          {songs.map((s) => (
            <div key={s.id} className={"song-item" + (s.id === activeId ? " active" : "")}
              onClick={() => { setActiveId(s.id); setMobileNavOpen(false); }}>
              <span className="name">{s.title || t("untitledSong")}</span>
              <button className="del" onClick={(e) => { e.stopPropagation(); deleteSong(s.id, s.title); }} title={t("deleteTooltip")}><X size={13} /></button>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportFile} />
          <button className="footer-btn" onClick={exportBackup}><Download size={12} /> {t("backup")}</button>
          <button className="footer-btn" onClick={triggerImport}><Upload size={12} /> {t("importBackup")}</button>
          {BACKEND_ON && <button className="footer-btn" onClick={signOut}>{t("authSignOut")}</button>}
        </div>
      </aside>

      <main className="main">
        <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)}>
          <Menu size={18} /> {activeSong ? (activeSong.title || t("untitledSong")) : t("brand")}
        </button>

        {!activeSong && (
          <div className="no-song"><RoadchartMark size={44} pinColor="#a7a49a" noteColor="#14130f" /><div>{t("noSongSelected")}</div></div>
        )}

        {activeSong && (
          <>
            <div className="toolbar">
              <div className="status"><Save size={13} />
                {storageOk ? (BACKEND_ON ? t("authSyncing") : t("autoSaving")) : t("saveFailed")}
              </div>
              <div className="toolbar-right">
                <button className="icon-btn" onClick={undo} disabled={historyIndex <= 0} title={t("undoTooltip")}><Undo2 size={14} /></button>
                <button className="icon-btn" onClick={redo} disabled={historyIndex >= history.length - 1} title={t("redoTooltip")}><Redo2 size={14} /></button>
                {BACKEND_ON && (
                  <button className="icon-btn" onClick={() => setShareOpen((v) => !v)} title={t("shareBtn")}><Share2 size={14} /></button>
                )}
                <button className="print-btn" onClick={() => window.print()}><Printer size={14} /> {t("printPdf")}</button>
              </div>
            </div>

            {shareOpen && BACKEND_ON && (
              <div className="share-panel">
                <label className="share-toggle">
                  <input type="checkbox" checked={!!activeSong.isPublic}
                    onChange={(e) => updateSong(activeSong.id, { isPublic: e.target.checked })} />
                  {activeSong.isPublic ? t("shareOnLabel") : t("shareOffLabel")}
                </label>
                {activeSong.isPublic && (
                  <div className="share-link-row">
                    <input readOnly className="share-link-input"
                      value={`${window.location.origin}${window.location.pathname}?share=${activeSong.id}`} />
                    <button className="share-copy-btn" onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?share=${activeSong.id}`);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 1800);
                    }}>
                      {linkCopied ? <Check size={13} /> : <Copy size={13} />} {linkCopied ? t("shareCopied") : t("shareCopy")}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="chart-card">
              <div className="chart-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input className="title-input" placeholder={t("songNamePlaceholder")} value={activeSong.title}
                    onChange={(e) => updateSong(activeSong.id, { title: e.target.value })} />
                  <input className="artist-input" placeholder={t("artistPlaceholder")} value={activeSong.artist}
                    onChange={(e) => updateSong(activeSong.id, { artist: e.target.value })} />
                </div>
                <div className="readout">
                  <input type="number" value={activeSong.bpm} onChange={(e) => updateSong(activeSong.id, { bpm: e.target.value })} />
                  <div className="lbl">{t("bpmLabel")}</div>
                </div>
                <div className="readout ts-readout">
                  <input type="text" list="ts-presets" value={activeSong.timeSignature || "4/4"}
                    onChange={(e) => updateSong(activeSong.id, { timeSignature: e.target.value })} />
                  <datalist id="ts-presets">
                    {TIME_SIG_PRESETS.map((ts) => <option key={ts} value={ts} />)}
                  </datalist>
                  <div className="lbl">{t("timeSigLabel")}</div>
                </div>
              </div>

              <div className="groove-row">
                <label>{t("grooveLabel")}</label>
                <input placeholder={t("groovePlaceholder")} value={activeSong.groove}
                  onChange={(e) => updateSong(activeSong.id, { groove: e.target.value })} />
                <div className="total mono">{totalBars(activeSong)} {t("totalBarsSuffix")}</div>
              </div>

              <div className="presets-row">
                {SECTION_PRESETS.map((p) => (
                  <button key={p} className="preset-chip"
                    onClick={() => setSections(activeSong.id, (arr) => [...arr, emptySection(p)])}>+ {p}</button>
                ))}
                <button className="preset-chip break-chip"
                  onClick={() => setSections(activeSong.id, (arr) => [...arr, emptyBreak()])}>
                  <CornerDownLeft size={11} style={{ marginRight: 3, verticalAlign: -1 }} /> {t("lineBreak")}
                </button>
              </div>
              <div className="presets-row">
                {NAV_PRESETS.map((p) => (
                  <button key={p} className="preset-chip nav-chip"
                    onClick={() => setSections(activeSong.id, (arr) => [...arr, emptyNav(p)])}>𝄋 {p}</button>
                ))}
              </div>
              <div className="hint">{t("gridHint")}</div>

              <div className="staff-grid" style={{ gridTemplateColumns: `repeat(${Math.max(grid.columns.length, 1)}, minmax(120px, 1fr))` }}>
                {grid.rows.map((row, ri) =>
                  row.type === "spacer" ? (
                    <div className="row-spacer" key={row.id} />
                  ) : row.type === "nav" ? (
                    <div className="nav-marker" key={row.id}>
                      {row.label}
                      <button className="nav-marker-del" onClick={() => setSections(activeSong.id, (arr) => arr.filter((x) => x.id !== row.id))}>
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    row.cells.map((sec, ci) =>
                      sec ? (
                        <SectionCell
                          key={sec.id}
                          sec={sec}
                          t={t}
                          beatsPerBar={parseBeatsPerBar(activeSong.timeSignature)}
                          onChange={(patch) =>
                            setSections(activeSong.id, (arr) => arr.map((x) => (x.id === sec.id ? { ...x, ...patch } : x)))
                          }
                          onDelete={() => setSections(activeSong.id, (arr) => arr.filter((x) => x.id !== sec.id))}
                        />
                      ) : (
                        <div className="cell empty-cell" key={`empty-${ri}-${ci}`} />
                      )
                    )
                  )
                )}
              </div>

              <div className="add-row">
                <button className="add-section" onClick={() => setSections(activeSong.id, (arr) => [...arr, emptySection()])}>
                  <Plus size={13} /> {t("addSection")}
                </button>
              </div>

              <div className="rhythm-block">
                <h3><Music2 size={13} /> {t("generalRhythmHeading")}</h3>
                <p className="sub">{t("generalRhythmSub")}</p>
                {(activeSong.rhythms || []).map((r) => (
                  <div className="rhythm-card" key={r.id}>
                    <div className="rhythm-top">
                      <input className="rhythm-label" placeholder={t("rhythmLabelPlaceholder")} value={r.label}
                        onChange={(e) => setRhythms(activeSong.id, (arr) => arr.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))} />
                      <div className="seg-toggle">
                        {[[1, t("quarter")], [2, t("eighth")], [4, t("sixteenth")]].map(([v, label]) => (
                          <button key={v} className={r.subdivision === v ? "on" : ""}
                            onClick={() => setRhythms(activeSong.id, (arr) => arr.map((x) => (x.id === r.id ? { ...x, subdivision: v, slots: Array(x.beats * v).fill("rest") } : x)))}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="beat-stepper">
                        <button onClick={() => setRhythms(activeSong.id, (arr) => arr.map((x) => x.id === r.id ? { ...x, beats: Math.max(1, x.beats - 1), slots: Array(Math.max(1, x.beats - 1) * x.subdivision).fill("rest") } : x))}>−</button>
                        {r.beats} {t("beatsSuffix")}
                        <button onClick={() => setRhythms(activeSong.id, (arr) => arr.map((x) => x.id === r.id ? { ...x, beats: x.beats + 1, slots: Array((x.beats + 1) * x.subdivision).fill("rest") } : x))}>+</button>
                      </div>
                      <button className="rhythm-del" onClick={() => setRhythms(activeSong.id, (arr) => arr.filter((x) => x.id !== r.id))}><Trash2 size={13} /></button>
                    </div>
                    <RhythmGrid subdivision={r.subdivision} beats={r.beats} beatsPerBar={parseBeatsPerBar(activeSong.timeSignature)} slots={r.slots}
                      onToggle={(idx, val) => setRhythms(activeSong.id, (arr) => arr.map((x) => {
                        if (x.id !== r.id) return x;
                        const slots = [...x.slots];
                        slots[idx] = val !== undefined ? val : nextRhythmVal(slots[idx]);
                        return { ...x, slots };
                      }))} />
                    <div className="rhythm-hint">{t("rhythmHint")}</div>
                  </div>
                ))}
                <button className="add-rhythm" onClick={() => setRhythms(activeSong.id, (arr) => [...arr, emptyStandaloneRhythm()])}>
                  <Plus size={13} /> {t("addRhythm2")}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function Root() {
  const shareId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("share") : null;
  const shareLang = (typeof navigator !== "undefined" && navigator.language && navigator.language.startsWith("en")) ? "en" : "tr";
  const shareT = (key) => (TRANSLATIONS[shareLang] && TRANSLATIONS[shareLang][key]) || TRANSLATIONS.en[key] || key;
  if (shareId) return <SharedView shareId={shareId} t={shareT} />;
  return <App />;
}

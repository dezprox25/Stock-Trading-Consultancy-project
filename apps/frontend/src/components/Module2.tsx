import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";

// ── ALL ORIGINAL LOGIC — UNTOUCHED ───────────────────────────────────────────

const parseStrikeSymbol = (symbol: string) => {
  const match = symbol.match(/(\d+)(CE|PE)$/);
  if (match) {
    return { strikePrice: match[1], optionType: match[2] };
  }
  return { strikePrice: symbol, optionType: "" };
};

const calculateMockTrendAndWarnings = (s: any) => {
  const grid = s.grid;
  if (!grid || grid.length === 0) return;
  const lastCell = grid[grid.length - 1];
  const ltp = lastCell.ltp;
  const previousBadge = s.trendBadge || "FLAT";
  const recentLtpList = grid.slice(-5).map((c: any) => c.ltp);
  let newBadge: "H_TO_L" | "L_TO_H" | "FLAT" | "REVERSAL" = "FLAT";
  if (recentLtpList.length >= 5) {
    let higherHighs = 0;
    let lowerLows = 0;
    for (let i = 1; i < recentLtpList.length; i++) {
      if (recentLtpList[i] > recentLtpList[i - 1]) higherHighs++;
      if (recentLtpList[i] < recentLtpList[i - 1]) lowerLows++;
    }
    if (lowerLows >= 4) newBadge = "H_TO_L";
    else if (higherHighs >= 4) newBadge = "L_TO_H";
  }
  if (previousBadge === "H_TO_L" && newBadge === "FLAT" && recentLtpList.length >= 2 && recentLtpList[recentLtpList.length - 1] > recentLtpList[recentLtpList.length - 2]) {
    newBadge = "REVERSAL";
  } else if (previousBadge === "L_TO_H" && newBadge === "FLAT" && recentLtpList.length >= 2 && recentLtpList[recentLtpList.length - 1] < recentLtpList[recentLtpList.length - 2]) {
    newBadge = "REVERSAL";
  }
  s.trendBadge = newBadge;
  const isCE = s.strike.endsWith("CE");
  if (isCE) {
    if (ltp < s.dayOpen * 0.85) s.isDeepLoss = true;
    const recent3 = grid.slice(-3).map((c: any) => c.ltp);
    if (recent3.length >= 3 && recent3[0] > recent3[1] && recent3[1] > recent3[2]) s.isDowntrendActive = true;
    if (recent3.length >= 3 && recent3[recent3.length - 1] > recent3[recent3.length - 2] && recent3[recent3.length - 2] > recent3[recent3.length - 3]) {
      s.isDowntrendActive = false;
      s.isDeepLoss = false;
    }
  } else {
    s.isDowntrendActive = false;
    s.isDeepLoss = false;
  }
};

const ensureFullStrikesData = (session: any) => {
  if (!session) return session;
  const nextSession = JSON.parse(JSON.stringify(session));
  if (!nextSession.strikes) nextSession.strikes = {};
  const defaultCeStrikes = ["NIFTY21850CE","NIFTY21900CE","NIFTY21950CE","NIFTY22000CE","NIFTY22050CE","NIFTY22100CE","NIFTY22150CE","NIFTY22200CE","NIFTY22250CE","NIFTY22300CE"];
  const defaultPeStrikes = ["NIFTY21850PE","NIFTY21900PE","NIFTY21950PE","NIFTY22000PE","NIFTY22050PE","NIFTY22100PE","NIFTY22150PE","NIFTY22200PE","NIFTY22250PE","NIFTY22300PE"];
  let currentSelected = [...nextSession.selectedStrikes];
  const ceSelected = currentSelected.filter((s) => s.endsWith("CE"));
  const peSelected = currentSelected.filter((s) => s.endsWith("PE"));
  const isTinyCustom = currentSelected.length === 1 || currentSelected.length === 2;
  if (!isTinyCustom) {
    const maxCeCount = nextSession.sessionType === "mixed" ? 5 : 10;
    if (nextSession.sessionType === "CE" || nextSession.sessionType === "mixed") {
      let ceCount = ceSelected.length;
      for (let i = 0; i < defaultCeStrikes.length && ceCount < maxCeCount; i++) {
        const defaultStrike = defaultCeStrikes[i];
        if (!currentSelected.includes(defaultStrike)) { currentSelected.push(defaultStrike); ceCount++; }
      }
    }
    const maxPeCount = nextSession.sessionType === "mixed" ? 5 : 10;
    if (nextSession.sessionType === "PE" || nextSession.sessionType === "mixed") {
      let peCount = peSelected.length;
      for (let i = 0; i < defaultPeStrikes.length && peCount < maxPeCount; i++) {
        const defaultStrike = defaultPeStrikes[i];
        if (!currentSelected.includes(defaultStrike)) { currentSelected.push(defaultStrike); peCount++; }
      }
    }
  }
  if (currentSelected.length > 10) currentSelected = currentSelected.slice(0, 10);
  nextSession.selectedStrikes = currentSelected;
  const baselines: Record<string, number> = {
    "NIFTY21850CE": 180.0,"NIFTY21900CE": 150.0,"NIFTY21950CE": 120.0,"NIFTY22000CE": 95.0,"NIFTY22050CE": 75.0,
    "NIFTY22100CE": 55.0,"NIFTY22150CE": 40.0,"NIFTY22200CE": 30.0,"NIFTY22250CE": 20.0,"NIFTY22300CE": 12.0,
    "NIFTY21850PE": 15.0,"NIFTY21900PE": 22.0,"NIFTY21950PE": 32.0,"NIFTY22000PE": 45.0,"NIFTY22050PE": 65.0,
    "NIFTY22100PE": 88.0,"NIFTY22150PE": 115.0,"NIFTY22200PE": 145.0,"NIFTY22250PE": 180.0,"NIFTY22300PE": 220.0
  };
  currentSelected.forEach((strike) => {
    if (!nextSession.strikes[strike]) {
      const base = baselines[strike] || 100.0;
      let maxMinutes = 0;
      let existingGrid: any[] = [];
      Object.values(nextSession.strikes).forEach((s: any) => {
        if (s.grid && s.grid.length > maxMinutes) { maxMinutes = s.grid.length; existingGrid = s.grid; }
      });
      let grid: any[] = [];
      if (maxMinutes > 0) {
        grid = existingGrid.map((cell) => ({ ltp: base, minute: cell.minute, timestamp: cell.timestamp, isHigh: false, isLow: false }));
      } else {
        const columnsCount = 16; const startHour = 9; const startMinute = 15; let currentLtp = base;
        for (let m = 0; m < columnsCount; m++) {
          let minVal = startMinute + m; let hrVal = startHour + Math.floor(minVal / 60);
          let minStr = (minVal % 60).toString().padStart(2, "0"); let hrStr = hrVal.toString().padStart(2, "0");
          const timestamp = `${hrStr}:${minStr}`; const change = (Math.random() - 0.5) * 4;
          currentLtp = Math.max(1, Number((currentLtp + change).toFixed(2)));
          grid.push({ ltp: currentLtp, minute: m, timestamp, isHigh: false, isLow: false });
        }
      }
      nextSession.strikes[strike] = { strike, dayOpen: base, dayHigh: base, dayLow: base, grid, trendBadge: "FLAT" as const, isDowntrendActive: false, isDeepLoss: false, pctChange: 0 };
      calculateMockTrendAndWarnings(nextSession.strikes[strike]);
    }
  });
  return nextSession;
};

const generateFallbackSession = () => {
  const selectedStrikes = ["NIFTY22000CE","NIFTY22050CE","NIFTY22100CE","NIFTY22150CE","NIFTY22200CE","NIFTY22000PE","NIFTY22050PE","NIFTY22100PE","NIFTY22150PE","NIFTY22200PE"];
  const strikes: Record<string, any> = {};
  const baselines: Record<string, number> = {
    "NIFTY21850CE": 180.0,"NIFTY21900CE": 150.0,"NIFTY21950CE": 120.0,"NIFTY22000CE": 95.0,"NIFTY22050CE": 75.0,
    "NIFTY22100CE": 55.0,"NIFTY22150CE": 40.0,"NIFTY22200CE": 30.0,"NIFTY22250CE": 20.0,"NIFTY22300CE": 12.0,
    "NIFTY21850PE": 15.0,"NIFTY21900PE": 22.0,"NIFTY21950PE": 32.0,"NIFTY22000PE": 45.0,"NIFTY22050PE": 65.0,
    "NIFTY22100PE": 88.0,"NIFTY22150PE": 115.0,"NIFTY22200PE": 145.0,"NIFTY22250PE": 180.0,"NIFTY22300PE": 220.0
  };
  const columnsCount = 16; const startHour = 9; const startMinute = 15;
  selectedStrikes.forEach((strike) => {
    const base = baselines[strike] || 100.0; const grid: any[] = [];
    let currentLtp = base; let dayHigh = base; let dayLow = base;
    for (let m = 0; m < columnsCount; m++) {
      let minVal = startMinute + m; let hrVal = startHour + Math.floor(minVal / 60);
      let minStr = (minVal % 60).toString().padStart(2, "0"); let hrStr = hrVal.toString().padStart(2, "0");
      const timestamp = `${hrStr}:${minStr}`; const change = (Math.random() - 0.5) * 4;
      currentLtp = Math.max(1, Number((currentLtp + change).toFixed(2)));
      dayHigh = Math.max(dayHigh, currentLtp); dayLow = Math.min(dayLow, currentLtp);
      grid.push({ ltp: currentLtp, minute: m, timestamp, isHigh: false, isLow: false });
    }
    strikes[strike] = { strike, dayOpen: base, dayHigh, dayLow, grid, trendBadge: "FLAT" as const, isDowntrendActive: false, isDeepLoss: false, pctChange: Number((((currentLtp - base) / base) * 100).toFixed(2)) };
    calculateMockTrendAndWarnings(strikes[strike]);
  });
  return { sessionId: "fallback-session", userId: "guest", sessionType: "mixed" as const, indexSymbol: "NIFTY50", expiryDate: "2026-06-04", selectedStrikes, dayOpenPrices: baselines, strikes, createdAt: new Date() };
};

// ── Design tokens (from Auth.tsx) ─────────────────────────────────────────────
// ── Replace the T tokens object at the top of Module2.tsx ────────────────────
const T = {
  green: "#047857",
  greenGlow: "rgba(4,120,87,0.15)",
  greenLight: "rgba(4,120,87,0.08)",
  greenBorder: "rgba(4,120,87,0.35)",
  greenBorderSoft: "rgba(4,120,87,0.18)",
  red: "var(--trading-bearish)",
  redLight: "rgba(185,28,28,0.08)",
  redBorder: "rgba(185,28,28,0.3)",
  amber: "#D97706",
  amberLight: "rgba(217,119,6,0.08)",
  // ── All these now use CSS variables ──────────────────────────────────────
  bg: "var(--trading-bg)",
  surface: "var(--trading-surface)",
  inputBg: "var(--trading-bg)",
  textPrimary: "var(--trading-text-active)",
  textSecondary: "var(--trading-text-active)",
  textMuted: "var(--trading-text-muted)",
  textFaint: "var(--trading-text-muted)",
  border: "rgba(4,120,87,0.18)",
  borderFaint: "rgba(4,120,87,0.1)",
  shadow: "0 4px 24px rgba(4,120,87,0.07)",
  shadowSm: "0 2px 12px rgba(4,120,87,0.05)",
};
// ── Scope corners from Auth.tsx ───────────────────────────────────────────────
function ScopeCorners({ color = T.green, size = 8 }: { color?: string; size?: number }) {
  const s = `${size}px`;
  return (
    <>
      <span className="absolute top-0 left-0" style={{ width: s, height: "1px", background: color }} />
      <span className="absolute top-0 left-0" style={{ width: "1px", height: s, background: color }} />
      <span className="absolute top-0 right-0" style={{ width: s, height: "1px", background: color }} />
      <span className="absolute top-0 right-0" style={{ width: "1px", height: s, background: color }} />
      <span className="absolute bottom-0 left-0" style={{ width: s, height: "1px", background: color }} />
      <span className="absolute bottom-0 left-0" style={{ width: "1px", height: s, background: color }} />
      <span className="absolute bottom-0 right-0" style={{ width: s, height: "1px", background: color }} />
      <span className="absolute bottom-0 right-0" style={{ width: "1px", height: s, background: color }} />
    </>
  );
}

// ── Trend badge ───────────────────────────────────────────────────────────────
function TrendBadge({ badge }: { badge: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string; border: string; pulse?: boolean }> = {
    L_TO_H: { label: "L→H ▲", color: T.green, bg: T.greenLight, border: T.greenBorderSoft, pulse: false },
    H_TO_L: { label: "H→L ▼", color: T.red, bg: T.redLight, border: T.redBorder, pulse: true },
    REVERSAL: { label: "REV ⚡", color: T.amber, bg: T.amberLight, border: "rgba(217,119,6,0.3)", pulse: true },
    FLAT: { label: "FLAT", color: T.textMuted, bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.2)" },
  };
  const c = cfg[badge] || cfg.FLAT;
  return (
    <span
      className={c.pulse ? "animate-pulse" : ""}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 7px", borderRadius: "2px",
        fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
        color: c.color, background: c.bg, border: `1px solid ${c.border}`,
      }}
    >
      {c.label}
    </span>
  );
}

// ── Segmented control ─────────────────────────────────────────────────────────
function SegmentedControl<T extends string>({
  options, value, onChange, size = "sm"
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div
      style={{
        display: "inline-flex", gap: 2, padding: 3,
        background: T.inputBg, border: `1px solid ${T.border}`,
        borderRadius: 2,
      }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            padding: size === "xs" ? "3px 10px" : "5px 14px",
            borderRadius: 2, border: "1px solid transparent",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: size === "xs" ? 9 : 10,
            fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            cursor: "pointer", transition: "all 0.15s",
            background: value === o.key ? T.green : "transparent",
            color: value === o.key ? "#fff" : T.textMuted,
            borderColor: value === o.key ? T.green : "transparent",
            boxShadow: value === o.key ? `0 1px 8px ${T.greenGlow}` : "none",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Premium card wrapper ──────────────────────────────────────────────────────
function Card({ children, style, className = "" }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: T.surface,
        border: `1.5px solid ${T.border}`,
        borderRadius: 2,
        boxShadow: T.shadow,
        ...style,
      }}
    >
      <ScopeCorners size={8} />
      <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: `linear-gradient(90deg, transparent, ${T.green}50, transparent)` }} />
      {children}
    </div>
  );
}

// ── Premium select ────────────────────────────────────────────────────────────
function PremiumSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase", color: T.textMuted }}>
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", padding: "9px 32px 9px 12px",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
            color: T.textPrimary, background: T.inputBg,
            border: `1px solid ${T.greenBorder}`, borderRadius: 2,
            outline: "none", cursor: "pointer", appearance: "none",
            WebkitAppearance: "none",
          }}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.green, pointerEvents: "none", fontSize: 10 }}>▾</span>
      </div>
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick, color = T.green }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px", borderRadius: 2,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
        fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
        cursor: "pointer", border: `1px solid ${active ? color : "rgba(100,116,139,0.2)"}`,
        background: active ? `${color}12` : "transparent",
        color: active ? color : T.textMuted,
        transition: "all 0.15s",
        boxShadow: active ? `0 0 8px ${color}20` : "none",
      }}
    >
      {label}
    </button>
  );
}

// ── Grid background (matches Auth.tsx) ────────────────────────────────────────
function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="m2grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(4,120,87,0.06)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#m2grid)" />
        <circle cx="70%" cy="30%" r="25%" fill="none" stroke="rgba(4,120,87,0.03)" strokeWidth="1"/>
      </svg>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const Module2 = () => {
  const activeSession = useStore((state) => state.activeSession);
  const setActiveSession = useStore((state) => state.setActiveSession);
  const [localFallbackSession, setLocalFallbackSession] = useState<any>(() => generateFallbackSession());

  const [indexSymbol, setIndexSymbol] = useState("NIFTY50");
  const [expiryDate, setExpiryDate] = useState("2026-06-04");
  const [sessionType, setSessionType] = useState<"CE" | "PE" | "mixed">("mixed");
  const [selectedStrikes, setSelectedStrikes] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<"high_value" | "low_value" | "default">("default");
  const [priceAbove, setPriceAbove] = useState<number | "">("");
  const [priceBelow, setPriceBelow] = useState<number | "">("");
  const [highlightTop3, setHighlightTop3] = useState(false);
  const [callDownCollapsedToggle, setCallDownCollapsedToggle] = useState(false);
  const [filterType, setFilterType] = useState<"CE" | "PE" | "mixed">("mixed");

  const { data: chainData } = useQuery({
    queryKey: ["option-chain", indexSymbol],
    queryFn: () => api.get(`/api/market/option-chain/${indexSymbol}`),
    enabled: true
  });

  const { data: initialSession } = useQuery({
    queryKey: ["active-session-init"],
    queryFn: () => api.get("/api/module2/session/current"),
    enabled: !activeSession
  });

  useEffect(() => {
    if (initialSession) setActiveSession(initialSession);
  }, [initialSession, setActiveSession]);

  const prices = useStore((state) => state.prices);

  useEffect(() => {
    if (activeSession) return;
    const interval = setInterval(() => {
      setLocalFallbackSession((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev));
        let updated = false;
        Object.keys(next.strikes).forEach((strike) => {
          const s = next.strikes[strike];
          const grid = s.grid;
          if (grid.length > 0) {
            const lastCell = grid[grid.length - 1];
            const livePriceObj = prices[strike];
            let newLtp = lastCell.ltp;
            if (livePriceObj && livePriceObj.ltp > 0) {
              if (lastCell.ltp !== livePriceObj.ltp) { newLtp = livePriceObj.ltp; updated = true; }
            } else {
              const change = (Math.random() - 0.5) * 1.5;
              newLtp = Math.max(1, Number((lastCell.ltp + change).toFixed(2))); updated = true;
            }
            if (newLtp !== lastCell.ltp) {
              lastCell.ltp = newLtp; s.dayHigh = Math.max(s.dayHigh, newLtp); s.dayLow = Math.min(s.dayLow, newLtp);
              s.pctChange = Number((((newLtp - s.dayOpen) / s.dayOpen) * 100).toFixed(2));
              calculateMockTrendAndWarnings(s);
            }
          }
        });
        return updated ? next : prev;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [prices, activeSession]);

  useEffect(() => {
    if (activeSession) return;
    const interval = setInterval(() => {
      setLocalFallbackSession((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev));
        const firstStrikeKey = Object.keys(next.strikes)[0];
        const lastCell = next.strikes[firstStrikeKey]?.grid[next.strikes[firstStrikeKey].grid.length - 1];
        let nextMinute = 0; let nextTimestamp = "09:31";
        if (lastCell) {
          const [h, m] = lastCell.timestamp.split(":").map(Number);
          let newM = m + 1; let newH = h;
          if (newM >= 60) { newM = 0; newH = (h + 1) % 24; }
          nextTimestamp = `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
          nextMinute = lastCell.minute + 1;
        }
        Object.keys(next.strikes).forEach((strike) => {
          const s = next.strikes[strike];
          const currentLtp = s.grid.length > 0 ? s.grid[s.grid.length - 1].ltp : s.dayOpen;
          s.grid.push({ ltp: currentLtp, minute: nextMinute, timestamp: nextTimestamp, isHigh: false, isLow: false });
          calculateMockTrendAndWarnings(s);
        });
        return next;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const startSessionMutation = useMutation({
    mutationFn: () => api.post("/api/module2/session/start", { sessionType, indexSymbol, expiryDate, selectedStrikes }),
    onSuccess: (data) => setActiveSession(data)
  });

  const handleExportCSV = async () => {
    const sessionToExport = activeSession || localFallbackSession;
    if (!sessionToExport) return;
    if (!activeSession) {
      try {
        let maxMinutes = 0;
        Object.values(sessionToExport.strikes).forEach((s: any) => { maxMinutes = Math.max(maxMinutes, s.grid.length); });
        const headers = ["Strike", "Day Open", "Day High", "Day Low", "Trend Badge", "Pct Change"];
        const firstStrikeKey = Object.keys(sessionToExport.strikes)[0];
        const firstStrike = firstStrikeKey ? sessionToExport.strikes[firstStrikeKey] : null;
        for (let m = 0; m < maxMinutes; m++) { headers.push(firstStrike?.grid[m]?.timestamp || `Min ${m}`); }
        let csvContent = headers.join(",") + "\n";
        sessionToExport.selectedStrikes.forEach((strike: string) => {
          const s = sessionToExport.strikes[strike];
          if (!s) return;
          const row = [strike, Math.round(s.dayOpen), Math.round(s.dayHigh), Math.round(s.dayLow), s.trendBadge, `${s.pctChange}%`];
          for (let m = 0; m < maxMinutes; m++) {
            const cell = s.grid[m];
            if (cell) { let val = Math.round(cell.ltp).toString(); if (cell.isHigh) val += " (H)"; if (cell.isLow) val += " (L)"; row.push(val); }
            else row.push("");
          }
          csvContent += row.join(",") + "\n";
        });
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a");
        a.href = url; a.download = "session_mock_export.csv"; document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      } catch (err) { console.error("Client-side CSV export failed:", err); }
      return;
    }
    try {
      const csvBlob = await fetch("/api/module2/export", { headers: { Authorization: `Bearer ${useStore.getState().accessToken}` } }).then(r => r.blob());
      const url = window.URL.createObjectURL(csvBlob); const a = document.createElement("a");
      a.href = url; a.download = `session_${activeSession?.sessionId}.csv`; document.body.appendChild(a); a.click();
      document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (error) { console.error("CSV Export failed:", error); }
  };

  const toggleStrikeSelection = (strike: string) => {
    setSelectedStrikes((prev) => {
      if (prev.includes(strike)) return prev.filter((s) => s !== strike);
      const maxAllowed = sessionType === "mixed" ? 20 : 10;
      if (prev.length >= maxAllowed) return prev;
      return [...prev, strike];
    });
  };

  const hasStrikes = activeSession && Object.keys(activeSession.strikes || {}).length > 0;
  const rawSession = hasStrikes ? activeSession : localFallbackSession;
  const currentSession = ensureFullStrikesData(rawSession);

  const sortedTimestamps = (() => {
    const tsSet = new Set<string>();
    Object.values(currentSession.strikes).forEach((s: any) => { s.grid.forEach((cell: any) => { if (cell.timestamp) tsSet.add(cell.timestamp); }); });
    if (tsSet.size === 0) {
      const fallback: string[] = []; const startHour = 9; const startMinute = 15;
      for (let m = 0; m < 16; m++) {
        let minVal = startMinute + m; let hrVal = startHour + Math.floor(minVal / 60);
        fallback.push(`${hrVal.toString().padStart(2, "0")}:${(minVal % 60).toString().padStart(2, "0")}`);
      }
      return fallback;
    }
    return Array.from(tsSet).sort();
  })();

  const topStrikes = Object.values(currentSession.strikes).sort((a: any, b: any) => b.pctChange - a.pctChange).slice(0, 3).map((s: any) => s.strike);

  const processedStrikes = [...currentSession.selectedStrikes]
    .filter((strike) => {
      const s = currentSession.strikes[strike];
      if (!s) return true;
      const latestLtp = s.grid.length > 0 ? s.grid[s.grid.length - 1].ltp : s.dayOpen;
      if (priceAbove !== "" && latestLtp < Number(priceAbove)) return false;
      if (priceBelow !== "" && latestLtp > Number(priceBelow)) return false;
      if (callDownCollapsedToggle && !s.isDowntrendActive && !s.isDeepLoss) return false;
      return true;
    })
    .sort((a, b) => {
      const stateA = currentSession.strikes[a]; const stateB = currentSession.strikes[b];
      if (!stateA || !stateB) return 0;
      const ltpA = stateA.grid.length > 0 ? stateA.grid[stateA.grid.length - 1].ltp : stateA.dayOpen;
      const ltpB = stateB.grid.length > 0 ? stateB.grid[stateB.grid.length - 1].ltp : stateB.dayOpen;
      if (sortOrder === "high_value") return ltpB - ltpA;
      if (sortOrder === "low_value") return ltpA - ltpB;
      return 0;
    });

  const ceStrikesList = processedStrikes.filter((s) => s.endsWith("CE"));
  const peStrikesList = processedStrikes.filter((s) => s.endsWith("PE"));

  const actualStrikesCount = currentSession.selectedStrikes.length;
  if (currentSession.sessionType === "CE" && actualStrikesCount < 10) console.error(`Validation Error: CE mode expects 10 rows, but only has ${actualStrikesCount} rows.`);
  else if (currentSession.sessionType === "PE" && actualStrikesCount < 10) console.error(`Validation Error: PE mode expects 10 rows, but only has ${actualStrikesCount} rows.`);
  else if (currentSession.sessionType === "mixed" && actualStrikesCount < 10) console.error(`Validation Error: Mixed mode expects 10 rows, but only has ${actualStrikesCount} rows.`);

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

        @keyframes m2-enter {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes m2-scan {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(2000px); opacity: 0; }
        }
        @keyframes m2-row {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes m2-pulse-green { 0%,100% { box-shadow: 0 0 0 0 rgba(4,120,87,0.3); } 50% { box-shadow: 0 0 0 4px rgba(4,120,87,0); } }

.m2-page {
  font-family: 'Inter', sans-serif;
  background: var(--trading-bg);
  min-height: 100vh; position: relative; z-index: 2;
}
        .m2-mono { font-family: 'IBM Plex Mono', monospace; }
        .m2-scan-line { position: fixed; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(4,120,87,0.35), rgba(4,120,87,0.5), rgba(4,120,87,0.35), transparent); animation: m2-scan 10s ease-in-out infinite; pointer-events: none; z-index: 1; }
        .m2-card-enter { animation: m2-enter 0.5s cubic-bezier(0.16,1,0.3,1) both; }

.m2-th {
  font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 700;
  letter-spacing: 0.25em; text-transform: uppercase;
  padding: 11px 10px; white-space: nowrap;
  color: var(--trading-text-muted);
  background: var(--trading-surface);
  border-bottom: 1px solid rgba(4,120,87,0.1);
  position: sticky; top: 0; z-index: 2;
}        
.m2-td {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px;
  padding: 9px 10px; white-space: nowrap;
  border-bottom: 1px solid rgba(4,120,87,0.05);
  color: var(--trading-text-active);
}        .m2-tr { animation: m2-row 0.25s ease both; }
        .m2-tr:hover td { background: rgba(4,120,87,0.025) !important; }

.m2-strike-chip {
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 6px; border-radius: 2px; cursor: pointer;
  transition: all 0.15s; border: 1px solid rgba(4,120,87,0.12);
  background: var(--trading-bg);
}        .m2-strike-chip:hover { border-color: rgba(4,120,87,0.35); background: rgba(4,120,87,0.04); }

        .m2-ce-btn, .m2-pe-btn { flex: 1; padding: 3px 0; border-radius: 2px; font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 800; letter-spacing: 0.1em; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
        .m2-ce-btn { color: #047857; background: rgba(4,120,87,0.06); border-color: rgba(4,120,87,0.2); }
        .m2-ce-btn:hover { background: rgba(4,120,87,0.12); }
        .m2-ce-btn.active { background: #047857; color: #fff; border-color: #047857; box-shadow: 0 1px 8px rgba(4,120,87,0.3); }
        .m2-pe-btn { color: #B91C1C; background: rgba(185,28,28,0.06); border-color: rgba(185,28,28,0.2); }
        .m2-pe-btn:hover { background: rgba(185,28,28,0.12); }
        .m2-pe-btn.active { background: #B91C1C; color: #fff; border-color: #B91C1C; box-shadow: 0 1px 8px rgba(185,28,28,0.25); }

.m2-input {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600;
  background: var(--trading-bg);
  border: 1px solid rgba(4,120,87,0.3); border-radius: 2px;
  padding: 5px 10px; outline: none;
  color: var(--trading-text-active);
  width: 80px; transition: border-color 0.15s;
}        .m2-input:focus { border-color: #047857; box-shadow: 0 0 8px rgba(4,120,87,0.15); }
        .m2-input::placeholder { color: #94a3b8; }
        input[type=number].m2-input::-webkit-inner-spin-button { -webkit-appearance: none; }

        .m2-cta { width: 100%; padding: 11px; border-radius: 2px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; cursor: pointer; border: 1px solid #047857; background: #047857; color: #fff; transition: all 0.2s; position: relative; overflow: hidden; }
        .m2-cta:hover:not(:disabled) { box-shadow: 0 4px 20px rgba(4,120,87,0.3); opacity: 0.92; }
        .m2-cta:disabled { opacity: 0.4; cursor: not-allowed; }

        .m2-export { font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; padding: 6px 16px; border-radius: 2px; cursor: pointer; border: 1px solid rgba(4,120,87,0.35); background: rgba(4,120,87,0.06); color: #047857; transition: all 0.15s; }
        .m2-export:hover { background: #047857; color: #fff; box-shadow: 0 2px 12px rgba(4,120,87,0.2); }

.m2-reset {
  font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  padding: 5px 12px; border-radius: 2px; cursor: pointer;
  border: 1px solid var(--trading-border);
  background: transparent; color: var(--trading-text-muted);
  transition: all 0.15s;
}        .m2-reset:hover { border-color: #0f172a; color: #0f172a; }

        .m2-deep-loss-row td { background: rgba(185,28,28,0.04) !important; }
        .m2-downtrend-row td { background: rgba(217,119,6,0.04) !important; }
        .m2-top3-glow { box-shadow: inset 2px 0 0 #D97706; }
      `}</style>

      <GridBackground />
      <div className="m2-scan-line" />

      <div className="m2-page">
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div
            className="relative m2-card-enter"
            style={{ background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 2, boxShadow: T.shadow, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
          >
            <ScopeCorners size={10} />
            <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: `linear-gradient(90deg, transparent, ${T.green}60, transparent)` }} />

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "m2-pulse-green 2s infinite", display: "inline-block" }} />
                <span className="m2-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.35em", textTransform: "uppercase", color: T.green }}>MODULE 02</span>
              </div>
              <div style={{ width: 1, height: 18, background: `${T.green}30` }} />
              <h1 className="m2-mono" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textPrimary }}>
                Strike Tracker
              </h1>
              <div style={{ width: 1, height: 18, background: `${T.green}30` }} />
              <span className="m2-mono" style={{ fontSize: 10, color: T.textMuted }}>
                {currentSession.indexSymbol} · {currentSession.expiryDate}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeSession ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 2, background: T.greenLight, border: `1px solid ${T.greenBorderSoft}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: T.green }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, animation: "m2-pulse-green 1.5s infinite", display: "inline-block" }} />
                  LIVE SESSION
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 2, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: T.textMuted }}>
                  DEMO MODE
                </span>
              )}
            </div>
          </div>

          {/* ── Configuration Card ────────────────────────────────────────── */}
          <div
            className="relative m2-card-enter"
            style={{ background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 2, boxShadow: T.shadow, padding: "20px 24px", animationDelay: "0.04s" }}
          >
            <ScopeCorners size={8} />
            <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: `linear-gradient(90deg, transparent, ${T.green}50, transparent)` }} />

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
              <span className="m2-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase", color: T.textMuted }}>Session Configuration</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
              <PremiumSelect
                label="Index Symbol"
                value={indexSymbol}
                onChange={setIndexSymbol}
                options={[
                  { value: "NIFTY50", label: "NIFTY 50 (Step 50)" },
                  { value: "BANKNIFTY", label: "BANK NIFTY (Step 100)" },
                  { value: "FINNIFTY", label: "FIN NIFTY (Step 50)" },
                ]}
              />
              <PremiumSelect
                label="Options Expiry"
                value={expiryDate}
                onChange={setExpiryDate}
                options={[
                  { value: "2026-06-04", label: "04-JUN-2026 (Weekly)" },
                  { value: "2026-06-11", label: "11-JUN-2026 (Weekly)" },
                  { value: "2026-06-25", label: "25-JUN-2026 (Monthly)" },
                ]}
              />
              <div className="flex flex-col gap-1.5">
                <label className="m2-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase", color: T.textMuted }}>Session Type</label>
                <SegmentedControl
                  options={[{ key: "CE" as const, label: "CE" }, { key: "PE" as const, label: "PE" }, { key: "mixed" as const, label: "Mixed" }]}
                  value={sessionType}
                  onChange={setSessionType}
                />
              </div>
            </div>

            {/* Strike selection */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="m2-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase", color: T.textMuted }}>
                  Select Strikes
                </span>
                <span className="m2-mono" style={{ fontSize: 9, color: T.textFaint }}>
                  {selectedStrikes.length}/{sessionType === "mixed" ? 20 : 10} selected
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6, maxHeight: 160, overflowY: "auto", paddingRight: 4 }}>
                {(chainData?.strikes || []).map((s: any) => {
                  const ceSelected = selectedStrikes.includes(s.CE);
                  const peSelected = selectedStrikes.includes(s.PE);
                  return (
                    <div key={s.strikePrice} className="m2-strike-chip">
                      <span className="m2-mono" style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, marginBottom: 5 }}>{s.strikePrice}</span>
                      <div style={{ display: "flex", gap: 3, width: "100%" }}>
                        {sessionType !== "PE" && (
                          <button onClick={() => toggleStrikeSelection(s.CE)} className={`m2-ce-btn${ceSelected ? " active" : ""}`}>CE</button>
                        )}
                        {sessionType !== "CE" && (
                          <button onClick={() => toggleStrikeSelection(s.PE)} className={`m2-pe-btn${peSelected ? " active" : ""}`}>PE</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              className="m2-cta"
              onClick={() => startSessionMutation.mutate()}
              disabled={selectedStrikes.length === 0 || startSessionMutation.isPending}
            >
              {startSessionMutation.isPending ? "Initialising Session…" : "Start Active Session Tracker"}
            </button>
          </div>

          {/* ── Toolbar ───────────────────────────────────────────────────── */}
          <div
            className="relative m2-card-enter"
            style={{ background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 2, boxShadow: T.shadow, padding: "14px 20px", animationDelay: "0.08s" }}
          >
            <ScopeCorners size={7} />
            <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: `linear-gradient(90deg, transparent, ${T.green}40, transparent)` }} />

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>

                {/* Filter type */}
                <SegmentedControl
                  options={[{ key: "mixed" as const, label: "All" }, { key: "CE" as const, label: "CE" }, { key: "PE" as const, label: "PE" }]}
                  value={filterType}
                  onChange={setFilterType}
                  size="xs"
                />

                <div style={{ width: 1, height: 20, background: `${T.green}20` }} />

                {/* Sort */}
                <SegmentedControl
                  options={[{ key: "default" as const, label: "Default" }, { key: "high_value" as const, label: "High ↓" }, { key: "low_value" as const, label: "Low ↑" }]}
                  value={sortOrder}
                  onChange={setSortOrder}
                  size="xs"
                />

                <div style={{ width: 1, height: 20, background: `${T.green}20` }} />

                {/* Price filters */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="m2-mono" style={{ fontSize: 9, color: T.textMuted }}>Above</span>
                  <input type="number" placeholder="Min" value={priceAbove} onChange={(e) => setPriceAbove(e.target.value === "" ? "" : Number(e.target.value))} className="m2-input" style={{ width: 64 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="m2-mono" style={{ fontSize: 9, color: T.textMuted }}>Below</span>
                  <input type="number" placeholder="Max" value={priceBelow} onChange={(e) => setPriceBelow(e.target.value === "" ? "" : Number(e.target.value))} className="m2-input" style={{ width: 64 }} />
                </div>

                <div style={{ width: 1, height: 20, background: `${T.green}20` }} />

                <FilterChip label="Call-Down" active={callDownCollapsedToggle} onClick={() => setCallDownCollapsedToggle(!callDownCollapsedToggle)} color={T.red} />
                <FilterChip label="Top 3" active={highlightTop3} onClick={() => setHighlightTop3(!highlightTop3)} color={T.amber} />

                <button className="m2-reset" onClick={() => { setSortOrder("default"); setPriceAbove(""); setPriceBelow(""); setHighlightTop3(false); setCallDownCollapsedToggle(false); setFilterType("mixed"); }}>
                  Reset
                </button>
              </div>

              <button className="m2-export" onClick={handleExportCSV}>Export CSV</button>
            </div>
          </div>

          {/* ── CE Table ──────────────────────────────────────────────────── */}
          {(filterType === "mixed" || filterType === "CE") && (
            <div className="m2-card-enter" style={{ animationDelay: "0.1s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                <span className="m2-mono" style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: T.green }}>CE Strikes</span>
              </div>
              <StrikeTrackerTable strikesList={ceStrikesList} session={currentSession} sortedTimestamps={sortedTimestamps} highlightTop3={highlightTop3} topStrikes={topStrikes} />
            </div>
          )}

          {/* ── PE Table ──────────────────────────────────────────────────── */}
          {(filterType === "mixed" || filterType === "PE") && (
            <div className="m2-card-enter" style={{ animationDelay: "0.13s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.red, display: "inline-block" }} />
                <span className="m2-mono" style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: T.red }}>PE Strikes</span>
              </div>
              <StrikeTrackerTable strikesList={peStrikesList} session={currentSession} sortedTimestamps={sortedTimestamps} highlightTop3={highlightTop3} topStrikes={topStrikes} />
            </div>
          )}

        </div>
      </div>
    </>
  );
};

// ── StrikeTrackerTable — visual redesign, logic untouched ────────────────────
function StrikeTrackerTable({ strikesList, session, sortedTimestamps, highlightTop3, topStrikes }: {
  strikesList: string[]; session: any; sortedTimestamps: string[]; highlightTop3: boolean; topStrikes: string[];
}) {
  return (
    <div
      style={{
        background: T.surface, border: `1.5px solid ${T.border}`,
        borderRadius: 2, boxShadow: T.shadow, overflow: "hidden", position: "relative",
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: `linear-gradient(90deg, transparent, ${T.green}40, transparent)` }} />
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="m2-th" style={{ minWidth: 160, position: "sticky", left: 0, top: 0, zIndex: 40, borderRight: `1px solid ${T.borderFaint}` }}>Strike</th>
              <th className="m2-th" style={{ textAlign: "center", minWidth: 72, borderRight: `1px solid ${T.borderFaint}` }}>Day Open</th>
              {sortedTimestamps.map((ts) => (
                <th key={ts} className="m2-th" style={{ textAlign: "center", minWidth: 60 }}>{ts}</th>
              ))}
              <th className="m2-th" style={{ textAlign: "center", minWidth: 68, borderLeft: `1px solid ${T.borderFaint}`, position: "sticky", right: 68, top: 0, zIndex: 40 }}>High</th>
              <th className="m2-th" style={{ textAlign: "center", minWidth: 68, position: "sticky", right: 0, top: 0, zIndex: 40 }}>Low</th>
            </tr>
          </thead>
          <tbody>
            {strikesList.length === 0 ? (
              <tr>
                <td colSpan={sortedTimestamps.length + 4} style={{ padding: "32px 16px", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.textMuted }}>
                  No strikes to display in this category.
                </td>
              </tr>
            ) : (
              strikesList.map((strike, rowIdx) => {
                const s = session.strikes[strike];
                if (!s) return null;
                const parsed = parseStrikeSymbol(strike);
                const isTop3 = highlightTop3 && topStrikes.includes(strike);

                const rowStyle: React.CSSProperties = s.isDeepLoss
                  ? { background: "rgba(185,28,28,0.03)" }
                  : s.isDowntrendActive
                  ? { background: "rgba(217,119,6,0.03)" }
                  : {};

                const stickyBg = s.isDeepLoss ? "rgba(253,242,242,0.98)" : s.isDowntrendActive ? "rgba(255,251,235,0.98)" : "rgba(255,255,255,0.98)";

                return (
                  <tr
                    key={strike}
                    className={`m2-tr${s.isDeepLoss ? " m2-deep-loss-row" : s.isDowntrendActive ? " m2-downtrend-row" : ""}${isTop3 ? " m2-top3-glow" : ""}`}
                    style={{ ...rowStyle, animationDelay: `${rowIdx * 0.02}s` }}
                  >
                    {/* Sticky strike cell */}
                    <td className="m2-td" style={{ position: "sticky", left: 0, zIndex: 20, background: stickyBg, borderRight: `1px solid ${T.borderFaint}`, minWidth: 160 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="m2-mono" style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{parsed.strikePrice}</span>
                          <span style={{
                            padding: "1px 6px", borderRadius: 2,
                            fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 800, letterSpacing: "0.1em",
                            color: parsed.optionType === "CE" ? T.green : T.red,
                            background: parsed.optionType === "CE" ? T.greenLight : T.redLight,
                            border: `1px solid ${parsed.optionType === "CE" ? T.greenBorderSoft : T.redBorder}`,
                          }}>
                            {parsed.optionType}
                          </span>
                          <TrendBadge badge={s.trendBadge} />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {isTop3 && (
                            <span style={{ padding: "1px 6px", borderRadius: 2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", color: T.amber, background: T.amberLight, border: "1px solid rgba(217,119,6,0.25)" }}>
                              TOP 3
                            </span>
                          )}
                          {s.isDeepLoss && (
                            <span className="animate-pulse" style={{ padding: "1px 6px", borderRadius: 2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", color: T.red, background: T.redLight, border: `1px solid ${T.redBorder}` }}>
                              SEVERE −15%
                            </span>
                          )}
                          {!s.isDeepLoss && s.isDowntrendActive && (
                            <span style={{ padding: "1px 6px", borderRadius: 2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", color: T.amber, background: T.amberLight, border: "1px solid rgba(217,119,6,0.25)" }}>
                              DOWN 3m
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Day open */}
                    <td className="m2-td" style={{ textAlign: "center", borderRight: `1px solid ${T.borderFaint}`, color: T.textMuted, fontWeight: 500 }}>
                      {Math.round(s.dayOpen)}
                    </td>

                    {/* Minute columns */}
                    {sortedTimestamps.map((ts) => {
                      const cell = s.grid.find((c: any) => c.timestamp === ts);
                      if (!cell) return (
                        <td key={ts} className="m2-td" style={{ textAlign: "center", color: T.textFaint }}>—</td>
                      );
                      const isCellHigh = cell.ltp === s.dayHigh && s.dayHigh > 0;
                      const isCellLow = cell.ltp === s.dayLow && s.dayLow > 0;
                      return (
                        <td
                          key={ts}
                          className="m2-td"
                          title={`${cell.timestamp} · ${cell.ltp}`}
                          style={{
                            textAlign: "center",
                            borderRight: `1px solid rgba(4,120,87,0.04)`,
                            background: isCellHigh ? "rgba(4,120,87,0.12)" : isCellLow ? "rgba(185,28,28,0.1)" : undefined,
                            color: isCellHigh ? T.green : isCellLow ? T.red : T.textSecondary,
                            fontWeight: isCellHigh || isCellLow ? 700 : 400,
                          }}
                        >
                          {cell.ltp}
                        </td>
                      );
                    })}

                    {/* Day high */}
                    <td className="m2-td" style={{ textAlign: "center", position: "sticky", right: 68, zIndex: 20, background: stickyBg, borderLeft: `1px solid ${T.borderFaint}`, color: T.green, fontWeight: 700 }}>
                      {Math.round(s.dayHigh)}
                    </td>

                    {/* Day low */}
                    <td className="m2-td" style={{ textAlign: "center", position: "sticky", right: 0, zIndex: 20, background: stickyBg, color: T.red, fontWeight: 700 }}>
                      {Math.round(s.dayLow)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Module2;
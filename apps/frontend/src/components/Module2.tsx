import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";

// ── ALL ORIGINAL LOGIC — UNTOUCHED ───────────────────────────────────────────

const parseStrikeSymbol = (symbol: string) => {
  const match = symbol.match(/(\d+)(CE|PE)$/);
  if (match) return { strikePrice: match[1], optionType: match[2] };
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
    let higherHighs = 0; let lowerLows = 0;
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
      s.isDowntrendActive = false; s.isDeepLoss = false;
    }
  } else {
    s.isDowntrendActive = false; s.isDeepLoss = false;
  }
};

const ensureFullStrikesData = (session: any) => {
  if (!session) return session;
  const nextSession = JSON.parse(JSON.stringify(session));
  if (!nextSession.strikes) nextSession.strikes = {};
  const defaultCeStrikes = ["NIFTY21850CE","NIFTY21900CE","NIFTY21950CE","NIFTY22000CE","NIFTY22050CE","NIFTY22100CE","NIFTY22150CE","NIFTY22200CE","NIFTY22250CE","NIFTY22300CE"];
  const defaultPeStrikes = ["NIFTY21850PE","NIFTY21900PE","NIFTY21950PE","NIFTY22000PE","NIFTY22050PE","NIFTY22100PE","NIFTY22150PE","NIFTY22200PE","NIFTY22250PE","NIFTY22300PE"];
  let currentSelected = [...nextSession.selectedStrikes];
  const ceSelected = currentSelected.filter((s: string) => s.endsWith("CE"));
  const peSelected = currentSelected.filter((s: string) => s.endsWith("PE"));
  const isTinyCustom = currentSelected.length === 1 || currentSelected.length === 2;
  if (!isTinyCustom) {
    const maxCeCount = nextSession.sessionType === "mixed" ? 5 : 10;
    if (nextSession.sessionType === "CE" || nextSession.sessionType === "mixed") {
      let ceCount = ceSelected.length;
      for (let i = 0; i < defaultCeStrikes.length && ceCount < maxCeCount; i++) {
        const d = defaultCeStrikes[i];
        if (!currentSelected.includes(d)) { currentSelected.push(d); ceCount++; }
      }
    }
    const maxPeCount = nextSession.sessionType === "mixed" ? 5 : 10;
    if (nextSession.sessionType === "PE" || nextSession.sessionType === "mixed") {
      let peCount = peSelected.length;
      for (let i = 0; i < defaultPeStrikes.length && peCount < maxPeCount; i++) {
        const d = defaultPeStrikes[i];
        if (!currentSelected.includes(d)) { currentSelected.push(d); peCount++; }
      }
    }
  }
  if (currentSelected.length > 10) currentSelected = currentSelected.slice(0, 10);
  nextSession.selectedStrikes = currentSelected;
  const baselines: Record<string, number> = {
    "NIFTY21850CE": 180,"NIFTY21900CE": 150,"NIFTY21950CE": 120,"NIFTY22000CE": 95,"NIFTY22050CE": 75,
    "NIFTY22100CE": 55,"NIFTY22150CE": 40,"NIFTY22200CE": 30,"NIFTY22250CE": 20,"NIFTY22300CE": 12,
    "NIFTY21850PE": 15,"NIFTY21900PE": 22,"NIFTY21950PE": 32,"NIFTY22000PE": 45,"NIFTY22050PE": 65,
    "NIFTY22100PE": 88,"NIFTY22150PE": 115,"NIFTY22200PE": 145,"NIFTY22250PE": 180,"NIFTY22300PE": 220,
  };
  currentSelected.forEach((strike: string) => {
    if (!nextSession.strikes[strike]) {
      const base = baselines[strike] || 100;
      let maxMinutes = 0; let existingGrid: any[] = [];
      Object.values(nextSession.strikes).forEach((s: any) => {
        if (s.grid && s.grid.length > maxMinutes) { maxMinutes = s.grid.length; existingGrid = s.grid; }
      });
      let grid: any[] = [];
      if (maxMinutes > 0) {
        grid = existingGrid.map((cell: any) => ({ ltp: base, minute: cell.minute, timestamp: cell.timestamp, isHigh: false, isLow: false }));
      } else {
        let currentLtp = base;
        for (let m = 0; m < 16; m++) {
          let minVal = 15 + m; let hrVal = 9 + Math.floor(minVal / 60);
          const timestamp = `${hrVal.toString().padStart(2, "0")}:${(minVal % 60).toString().padStart(2, "0")}`;
          currentLtp = Math.max(1, Number((currentLtp + (Math.random() - 0.5) * 4).toFixed(2)));
          grid.push({ ltp: currentLtp, minute: m, timestamp, isHigh: false, isLow: false });
        }
      }
      nextSession.strikes[strike] = { strike, dayOpen: base, dayHigh: base, dayLow: base, grid, trendBadge: "FLAT", isDowntrendActive: false, isDeepLoss: false, pctChange: 0 };
      calculateMockTrendAndWarnings(nextSession.strikes[strike]);
    }
  });
  return nextSession;
};

const generateFallbackSession = () => {
  const selectedStrikes = ["NIFTY22000CE","NIFTY22050CE","NIFTY22100CE","NIFTY22150CE","NIFTY22200CE","NIFTY22000PE","NIFTY22050PE","NIFTY22100PE","NIFTY22150PE","NIFTY22200PE"];
  const strikes: Record<string, any> = {};
  const baselines: Record<string, number> = {
    "NIFTY21850CE": 180,"NIFTY21900CE": 150,"NIFTY21950CE": 120,"NIFTY22000CE": 95,"NIFTY22050CE": 75,
    "NIFTY22100CE": 55,"NIFTY22150CE": 40,"NIFTY22200CE": 30,"NIFTY22250CE": 20,"NIFTY22300CE": 12,
    "NIFTY21850PE": 15,"NIFTY21900PE": 22,"NIFTY21950PE": 32,"NIFTY22000PE": 45,"NIFTY22050PE": 65,
    "NIFTY22100PE": 88,"NIFTY22150PE": 115,"NIFTY22200PE": 145,"NIFTY22250PE": 180,"NIFTY22300PE": 220,
  };
  selectedStrikes.forEach((strike) => {
    const base = baselines[strike] || 100;
    const grid: any[] = []; let currentLtp = base; let dayHigh = base; let dayLow = base;
    for (let m = 0; m < 16; m++) {
      let minVal = 15 + m; let hrVal = 9 + Math.floor(minVal / 60);
      const timestamp = `${hrVal.toString().padStart(2, "0")}:${(minVal % 60).toString().padStart(2, "0")}`;
      currentLtp = Math.max(1, Number((currentLtp + (Math.random() - 0.5) * 4).toFixed(2)));
      dayHigh = Math.max(dayHigh, currentLtp); dayLow = Math.min(dayLow, currentLtp);
      grid.push({ ltp: currentLtp, minute: m, timestamp, isHigh: false, isLow: false });
    }
    strikes[strike] = { strike, dayOpen: base, dayHigh, dayLow, grid, trendBadge: "FLAT", isDowntrendActive: false, isDeepLoss: false, pctChange: Number((((currentLtp - base) / base) * 100).toFixed(2)) };
    calculateMockTrendAndWarnings(strikes[strike]);
  });
  return { sessionId: "fallback-session", userId: "guest", sessionType: "mixed", indexSymbol: "NIFTY50", expiryDate: "2026-06-04", selectedStrikes, dayOpenPrices: baselines, strikes, createdAt: new Date() };
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN = "#047857";
const RED = "#E53935";
const AMBER = "#D97706";

// ── Shared sub-components ─────────────────────────────────────────────────────

function TrendBadge({ badge }: { badge: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string; border: string; pulse?: boolean }> = {
    L_TO_H:   { label: "L→H ▲", color: GREEN, bg: "rgba(4,120,87,0.1)",   border: "rgba(4,120,87,0.25)" },
    H_TO_L:   { label: "H→L ▼", color: RED,   bg: "rgba(229,57,53,0.1)",  border: "rgba(229,57,53,0.25)", pulse: true },
    REVERSAL: { label: "REV ⚡", color: AMBER, bg: "rgba(217,119,6,0.1)",  border: "rgba(217,119,6,0.25)", pulse: true },
    FLAT:     { label: "FLAT",   color: "#64748b", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.2)" },
  };
  const c = cfg[badge] || cfg.FLAT;
  return (
    <span
      className={c.pulse ? "animate-pulse" : ""}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px", borderRadius: 6,
        fontSize: 10, fontFamily: "'Inter', sans-serif",
        fontWeight: 700, letterSpacing: "0.03em",
        color: c.color, background: c.bg, border: `1px solid ${c.border}`,
      }}
    >
      {c.label}
    </span>
  );
}

function SegmentedControl<K extends string>({
  options, value, onChange, size = "sm",
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (v: K) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div style={{ display: "inline-flex", gap: 3, padding: 3, background: "var(--trading-bg)", border: "1.5px solid var(--trading-border)", borderRadius: 8 }}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            padding: size === "xs" ? "4px 10px" : "6px 14px",
            borderRadius: 6, border: "none",
            fontFamily: "'Inter', sans-serif",
            fontSize: size === "xs" ? 11 : 12, fontWeight: 700,
            cursor: "pointer", transition: "all 0.15s",
            background: value === o.key ? GREEN : "transparent",
            color: value === o.key ? "#fff" : "var(--trading-text-muted)",
            boxShadow: value === o.key ? "0 1px 6px rgba(4,120,87,0.25)" : "none",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", padding: "9px 32px 9px 12px",
            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
            color: "var(--trading-text-active)", background: "var(--trading-bg)",
            border: "1.5px solid var(--trading-border)", borderRadius: 8,
            outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none",
          }}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: GREEN, pointerEvents: "none", fontSize: 12 }}>▾</span>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick, color = GREEN }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 14px", borderRadius: 8,
        fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
        cursor: "pointer",
        border: `1.5px solid ${active ? color : "var(--trading-border)"}`,
        background: active ? `${color}12` : "transparent",
        color: active ? color : "var(--trading-text-muted)",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export const Module2 = ({ isSplit = false }: { isSplit?: boolean }) => {
  const activeSession = useStore((s) => s.activeSession);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const [localFallbackSession, setLocalFallbackSession] = useState<any>(() => generateFallbackSession());
  const [isConfigExpanded, setIsConfigExpanded] = useState(!isSplit);


  const [indexSymbol, setIndexSymbol] = useState("NIFTY50");
  const [expiryDate, setExpiryDate] = useState("2026-06-04");
  const [sessionType, setSessionType] = useState<"CE" | "PE" | "mixed">("mixed");
  const [selectedStrikes, setSelectedStrikes] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<"high_value" | "low_value" | "default">("default");
  const [priceAbove, setPriceAbove] = useState<number | "">("");
  const [priceBelow, setPriceBelow] = useState<number | "">("");
  const [highlightTop3, setHighlightTop3] = useState(false);
  const [callDownCollapsedToggle, setCallDownCollapsedToggle] = useState(false);
  const [filterType, setFilterType] = useState<"CE" | "PE" | "mixed">(isSplit ? "CE" : "mixed");
  const [isAdvancedFiltersExpanded, setIsAdvancedFiltersExpanded] = useState(false);

  const { data: chainData } = useQuery({
    queryKey: ["option-chain", indexSymbol],
    queryFn: () => api.get(`/api/market/option-chain/${indexSymbol}`),
    enabled: true,
  });

  const { data: initialSession } = useQuery({
    queryKey: ["active-session-init"],
    queryFn: () => api.get("/api/module2/session/current"),
    enabled: !activeSession,
  });

  useEffect(() => {
    if (initialSession) setActiveSession(initialSession);
  }, [initialSession, setActiveSession]);

  const prices = useStore((s) => s.prices);

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
              newLtp = Math.max(1, Number((lastCell.ltp + (Math.random() - 0.5) * 1.5).toFixed(2))); updated = true;
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
        const firstKey = Object.keys(next.strikes)[0];
        const lastCell = next.strikes[firstKey]?.grid[next.strikes[firstKey].grid.length - 1];
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
    onSuccess: (data) => setActiveSession(data),
  });

  const handleExportCSV = async () => {
    const sessionToExport = activeSession || localFallbackSession;
    if (!sessionToExport) return;
    if (!activeSession) {
      try {
        let maxMinutes = 0;
        Object.values(sessionToExport.strikes).forEach((s: any) => { maxMinutes = Math.max(maxMinutes, s.grid.length); });
        const firstStrikeKey = Object.keys(sessionToExport.strikes)[0];
        const firstStrike = firstStrikeKey ? sessionToExport.strikes[firstStrikeKey] : null;
        const headers = ["Strike", "Day Open", "Day High", "Day Low", "Trend Badge", "Pct Change"];
        for (let m = 0; m < maxMinutes; m++) { headers.push(firstStrike?.grid[m]?.timestamp || `Min ${m}`); }
        let csv = headers.join(",") + "\n";
        sessionToExport.selectedStrikes.forEach((strike: string) => {
          const s = sessionToExport.strikes[strike];
          if (!s) return;
          const row = [strike, Math.round(s.dayOpen), Math.round(s.dayHigh), Math.round(s.dayLow), s.trendBadge, `${s.pctChange}%`];
          for (let m = 0; m < maxMinutes; m++) {
            const cell = s.grid[m];
            if (cell) { let v = Math.round(cell.ltp).toString(); if (cell.isHigh) v += " (H)"; if (cell.isLow) v += " (L)"; row.push(v); }
            else row.push("");
          }
          csv += row.join(",") + "\n";
        });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a");
        a.href = url; a.download = "session_mock_export.csv"; document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      } catch (err) { console.error("CSV export failed:", err); }
      return;
    }
    try {
      const blob = await fetch("/api/module2/export", { headers: { Authorization: `Bearer ${useStore.getState().accessToken}` } }).then(r => r.blob());
      const url = window.URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `session_${activeSession?.sessionId}.csv`; document.body.appendChild(a); a.click();
      document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (err) { console.error("CSV Export failed:", err); }
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
    Object.values(currentSession.strikes).forEach((s: any) => { s.grid.forEach((c: any) => { if (c.timestamp) tsSet.add(c.timestamp); }); });
    if (tsSet.size === 0) {
      const fb: string[] = [];
      for (let m = 0; m < 16; m++) {
        let minVal = 15 + m; let hrVal = 9 + Math.floor(minVal / 60);
        fb.push(`${hrVal.toString().padStart(2, "0")}:${(minVal % 60).toString().padStart(2, "0")}`);
      }
      return fb;
    }
    return Array.from(tsSet).sort();
  })();

  const topStrikes = Object.values(currentSession.strikes)
    .sort((a: any, b: any) => b.pctChange - a.pctChange)
    .slice(0, 3).map((s: any) => s.strike);

  const processedStrikes = [...currentSession.selectedStrikes]
    .filter((strike) => {
      const s = currentSession.strikes[strike]; if (!s) return true;
      const latestLtp = s.grid.length > 0 ? s.grid[s.grid.length - 1].ltp : s.dayOpen;
      if (priceAbove !== "" && latestLtp < Number(priceAbove)) return false;
      if (priceBelow !== "" && latestLtp > Number(priceBelow)) return false;
      if (callDownCollapsedToggle && !s.isDowntrendActive && !s.isDeepLoss) return false;
      return true;
    })
    .sort((a, b) => {
      const sA = currentSession.strikes[a]; const sB = currentSession.strikes[b];
      if (!sA || !sB) return 0;
      const ltpA = sA.grid.length > 0 ? sA.grid[sA.grid.length - 1].ltp : sA.dayOpen;
      const ltpB = sB.grid.length > 0 ? sB.grid[sB.grid.length - 1].ltp : sB.dayOpen;
      if (sortOrder === "high_value") return ltpB - ltpA;
      if (sortOrder === "low_value") return ltpA - ltpB;
      return 0;
    });

  const ceStrikesList = processedStrikes.filter((s) => s.endsWith("CE"));
  const peStrikesList = processedStrikes.filter((s) => s.endsWith("PE"));

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        @keyframes m2-enter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .m2-section { animation: m2-enter 0.35s ease both; }

        .m2-th {
          font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 12px 16px; white-space: nowrap;
          color: var(--trading-text-muted);
          background: var(--trading-bg);
          border-bottom: 1.5px solid var(--trading-border);
          position: sticky; top: 0; z-index: 2;
        }
        .m2-td {
          font-family: 'Inter', sans-serif; font-size: 13px;
          padding: 12px 16px; white-space: nowrap;
          border-bottom: 1px solid var(--trading-border);
          color: var(--trading-text-active);
        }
        .m2-tr:hover td:not(.m2-sticky-cell) { background: rgba(4,120,87,0.03) !important; }
        .m2-tr:hover .m2-sticky-cell {
          background-image: linear-gradient(rgba(4,120,87,0.03), rgba(4,120,87,0.03)) !important;
        }

        .m2-strike-chip {
          display: flex; flex-direction: column; align-items: center;
          padding: 8px 6px; border-radius: 8px; cursor: pointer;
          transition: all 0.15s; border: 1.5px solid var(--trading-border);
          background: var(--trading-bg);
        }
        .m2-strike-chip:hover { border-color: ${GREEN}; background: rgba(4,120,87,0.04); }

        .m2-ce-btn, .m2-pe-btn {
          flex: 1; padding: 3px 0; border-radius: 5px;
          font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700;
          cursor: pointer; transition: all 0.15s; border: 1.5px solid transparent;
        }
        .m2-ce-btn { color: ${GREEN}; background: rgba(4,120,87,0.08); border-color: rgba(4,120,87,0.2); }
        .m2-ce-btn:hover { background: rgba(4,120,87,0.14); }
        .m2-ce-btn.active { background: ${GREEN}; color: #fff; border-color: ${GREEN}; }
        .m2-pe-btn { color: ${RED}; background: rgba(229,57,53,0.08); border-color: rgba(229,57,53,0.2); }
        .m2-pe-btn:hover { background: rgba(229,57,53,0.14); }
        .m2-pe-btn.active { background: ${RED}; color: #fff; border-color: ${RED}; }

        .m2-input {
          font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 500;
          background: var(--trading-bg); border: 1.5px solid var(--trading-border);
          border-radius: 8px; padding: 6px 10px; outline: none;
          color: var(--trading-text-active); width: 80px; transition: border-color 0.15s;
        }
        .m2-input:focus { border-color: ${GREEN}; box-shadow: 0 0 0 3px rgba(4,120,87,0.1); }
        .m2-input::placeholder { color: #94a3b8; }
        input[type=number].m2-input::-webkit-inner-spin-button { -webkit-appearance: none; }

        .m2-cta {
          width: 100%; padding: 13px; border-radius: 8px;
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 700;
          cursor: pointer; border: none; background: ${GREEN}; color: #fff;
          transition: all 0.2s; box-shadow: 0 4px 14px rgba(4,120,87,0.3);
        }
        .m2-cta:hover:not(:disabled) { opacity: 0.9; }
        .m2-cta:disabled { opacity: 0.45; cursor: not-allowed; }

        .m2-export {
          font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600;
          padding: 7px 16px; border-radius: 8px; cursor: pointer;
          border: 1.5px solid ${GREEN}; background: rgba(4,120,87,0.06);
          color: ${GREEN}; transition: all 0.15s;
        }
        .m2-export:hover { background: ${GREEN}; color: #fff; }

        .m2-reset {
          font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600;
          padding: 6px 14px; border-radius: 8px; cursor: pointer;
          border: 1.5px solid var(--trading-border);
          background: transparent; color: var(--trading-text-muted); transition: all 0.15s;
        }
        .m2-reset:hover { border-color: var(--trading-text-active); color: var(--trading-text-active); }
      `}</style>

      <div style={{ minHeight: isSplit ? "auto" : "100vh", background: isSplit ? "transparent" : "var(--trading-bg)", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ maxWidth: "100%", margin: "0 auto", padding: isSplit ? "12px 12px 20px" : "24px 24px 40px", display: "flex", flexDirection: "column", gap: isSplit ? 12 : 20 }}>

          {/* Header */}
          {isSplit ? (
            <div
              className="m2-section"
              style={{
                background: "var(--trading-surface)",
                border: "1.5px solid var(--trading-border)",
                borderRadius: 10,
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: "0.05em" }}>M2 · Strike Tracker</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--trading-text-active)", borderLeft: "1px solid var(--trading-border)", paddingLeft: 8 }}>
                  {currentSession.indexSymbol} · {currentSession.expiryDate}
                </span>
              </div>

              <div>
                {activeSession ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: "rgba(4,120,87,0.1)", fontSize: 11, fontWeight: 700, color: GREEN }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: GREEN }} />
                    Live
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: "rgba(100,116,139,0.08)", fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                    Demo
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              className="m2-section"
              style={{
                background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
                borderRadius: 14, padding: "18px 24px",
                display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
                boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
                    Module 02
                  </div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--trading-text-active)", letterSpacing: "-0.0em" }}>
                    Strike Tracker
                  </h1>
                </div>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--trading-text-muted)", background: "var(--trading-bg)", padding: "3px 10px", borderRadius: 6, border: "1.5px solid var(--trading-border)" }}>
                  {currentSession.indexSymbol} · {currentSession.expiryDate}
                </span>
              </div>

              <div>
                {activeSession ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "rgba(4,120,87,0.1)", border: "1.5px solid rgba(4,120,87,0.25)", fontSize: 12, fontWeight: 700, color: GREEN }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, display: "inline-block" }} className="animate-pulse" />
                    Live Session
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "rgba(100,116,139,0.08)", border: "1.5px solid rgba(100,116,139,0.2)", fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                    Demo Mode
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Configuration */}
          {isConfigExpanded ? (
            <div
              className="m2-section"
              style={{
                background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
                borderRadius: 14, padding: "20px 24px",
                boxShadow: "0 1px 8px rgba(0,0,0,0.05)", animationDelay: "0.04s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                  Session Configuration
                </span>
                {isSplit && (
                  <button
                    onClick={() => setIsConfigExpanded(false)}
                    style={{
                      background: "rgba(4,120,87,0.08)", border: "none", color: GREEN,
                      fontWeight: 700, fontSize: 11, cursor: "pointer", padding: "4px 10px", borderRadius: 5
                    }}
                  >
                    Hide Config ▲
                  </button>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
                <SelectField
                  label="Index Symbol" value={indexSymbol} onChange={setIndexSymbol}
                  options={[
                    { value: "NIFTY50",   label: "NIFTY 50 (Step 50)" },
                    { value: "BANKNIFTY", label: "BANK NIFTY (Step 100)" },
                    { value: "FINNIFTY",  label: "FIN NIFTY (Step 50)" },
                  ]}
                />
                <SelectField
                  label="Options Expiry" value={expiryDate} onChange={setExpiryDate}
                  options={[
                    { value: "2026-06-04", label: "04-JUN-2026 (Weekly)" },
                    { value: "2026-06-11", label: "11-JUN-2026 (Weekly)" },
                    { value: "2026-06-25", label: "25-JUN-2026 (Monthly)" },
                  ]}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Session Type
                  </label>
                  <SegmentedControl
                    options={[{ key: "CE" as const, label: "CE" }, { key: "PE" as const, label: "PE" }, { key: "mixed" as const, label: "Mixed" }]}
                    value={sessionType} onChange={setSessionType}
                  />
                </div>
              </div>

              {/* Strike selection */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Select Strikes
                  </span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: "var(--trading-text-muted)" }}>
                    {selectedStrikes.length}/{sessionType === "mixed" ? 20 : 10} selected
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 6, maxHeight: 120, overflowY: "auto", paddingRight: 4 }}>
                  {(chainData?.strikes || []).map((s: any) => {
                    const ceSelected = selectedStrikes.includes(s.CE);
                    const peSelected = selectedStrikes.includes(s.PE);
                    return (
                      <div key={s.strikePrice} className="m2-strike-chip">
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, color: "var(--trading-text-muted)", marginBottom: 5 }}>{s.strikePrice}</span>
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
          ) : (
            isSplit && (
              <div
                className="m2-section"
                style={{
                  background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
                  borderRadius: 10, padding: "10px 16px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)", cursor: "pointer",
                }}
                onClick={() => setIsConfigExpanded(true)}
              >
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  ⚙️ Configure Session & Strikes
                </span>
                <span style={{ color: GREEN, fontWeight: 700, fontSize: 11, background: "rgba(4,120,87,0.08)", padding: "4px 10px", borderRadius: 5 }}>
                  Show Config ▼
                </span>
              </div>
            )
          )}

          {/* Toolbar */}
          <div
            className="m2-section"
            style={{
              background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
              borderRadius: 14, padding: "12px 16px",
              boxShadow: "0 1px 8px rgba(0,0,0,0.05)", animationDelay: "0.08s",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Row 1: Primary Tab Control & Toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Strikes:</span>
                  <SegmentedControl
                    options={[{ key: "mixed" as const, label: "All" }, { key: "CE" as const, label: "CE" }, { key: "PE" as const, label: "PE" }]}
                    value={filterType} onChange={setFilterType} size="xs"
                  />
                </div>
                {isSplit && (
                  <button
                    onClick={() => setIsAdvancedFiltersExpanded(!isAdvancedFiltersExpanded)}
                    style={{
                      background: "rgba(4,120,87,0.08)", border: "none", color: GREEN,
                      fontWeight: 700, fontSize: 11, cursor: "pointer", padding: "6px 12px", borderRadius: 6,
                      transition: "all 0.15s"
                    }}
                  >
                    {isAdvancedFiltersExpanded ? "Hide Filters ▲" : "Show Filters & Export ▼"}
                  </button>
                )}
              </div>

              {/* Row 2: Advanced filters (always visible if not split, toggleable if split) */}
              {(!isSplit || isAdvancedFiltersExpanded) && (
                <div
                  style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
                    paddingTop: 10, borderTop: isSplit ? "1.5px solid var(--trading-border)" : "none",
                    animation: "m2-enter 0.2s ease both"
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.02em" }}>Sort:</span>
                      <SegmentedControl
                        options={[{ key: "default" as const, label: "Default" }, { key: "high_value" as const, label: "High ↓" }, { key: "low_value" as const, label: "Low ↑" }]}
                        value={sortOrder} onChange={setSortOrder} size="xs"
                      />
                    </div>
                    <div style={{ width: 1, height: 22, background: "var(--trading-border)" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: "var(--trading-text-muted)" }}>Above</span>
                      <input type="number" placeholder="Min" value={priceAbove} onChange={(e) => setPriceAbove(e.target.value === "" ? "" : Number(e.target.value))} className="m2-input" style={{ width: 70 }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: "var(--trading-text-muted)" }}>Below</span>
                      <input type="number" placeholder="Max" value={priceBelow} onChange={(e) => setPriceBelow(e.target.value === "" ? "" : Number(e.target.value))} className="m2-input" style={{ width: 70 }} />
                    </div>
                    <div style={{ width: 1, height: 22, background: "var(--trading-border)" }} />
                    <FilterChip label="Call-Down" active={callDownCollapsedToggle} onClick={() => setCallDownCollapsedToggle(!callDownCollapsedToggle)} color={RED} />
                    <FilterChip label="Top 3" active={highlightTop3} onClick={() => setHighlightTop3(!highlightTop3)} color={AMBER} />
                    <button className="m2-reset" onClick={() => { setSortOrder("default"); setPriceAbove(""); setPriceBelow(""); setHighlightTop3(false); setCallDownCollapsedToggle(false); setFilterType(isSplit ? "CE" : "mixed"); }}>
                      Reset
                    </button>
                  </div>
                  <button className="m2-export" onClick={handleExportCSV}>Export CSV</button>
                </div>
              )}
            </div>
          </div>

          {/* CE Table */}
          {(filterType === "mixed" || filterType === "CE") && (
            <div className="m2-section" style={{ animationDelay: "0.1s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  CE Strikes
                </span>
              </div>
              <StrikeTrackerTable strikesList={ceStrikesList} session={currentSession} sortedTimestamps={sortedTimestamps} highlightTop3={highlightTop3} topStrikes={topStrikes} isSplit={isSplit} />
            </div>
          )}

          {/* PE Table */}
          {(filterType === "mixed" || filterType === "PE") && (
            <div className="m2-section" style={{ animationDelay: "0.13s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: RED, display: "inline-block" }} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: RED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  PE Strikes
                </span>
              </div>
              <StrikeTrackerTable strikesList={peStrikesList} session={currentSession} sortedTimestamps={sortedTimestamps} highlightTop3={highlightTop3} topStrikes={topStrikes} isSplit={isSplit} />
            </div>
          )}

        </div>
      </div>
    </>
  );
};

// ── StrikeTrackerTable ────────────────────────────────────────────────────────
function StrikeTrackerTable({ strikesList, session, sortedTimestamps, highlightTop3, topStrikes, isSplit = false }: {
  strikesList: string[]; session: any; sortedTimestamps: string[];
  highlightTop3: boolean; topStrikes: string[]; isSplit?: boolean;
}) {
  const [showFullColumns, setShowFullColumns] = useState(false);
  const cellPadding = isSplit ? "12px 14px" : "12px 16px";
  const cellFontSize = isSplit ? "12px" : "13px";

  const displayedTimestamps = showFullColumns || !isSplit
    ? sortedTimestamps
    : sortedTimestamps.slice(-5);

  const displayedStrikes = showFullColumns || !isSplit
    ? strikesList
    : strikesList.slice(0, 5);

  return (
    <div
      style={{
        background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
        borderRadius: 12, overflow: "hidden",
        boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <table style={{ 
          width: "100%", 
          minWidth: isSplit && showFullColumns ? "1150px" : "100%", 
          borderCollapse: "collapse", 
          textAlign: "left" 
        }}>
          <thead>
            <tr>
              <th className="m2-th" style={{ padding: cellPadding, fontSize: "10px", minWidth: isSplit ? 130 : 180, position: isSplit ? "sticky" : undefined, left: isSplit ? 0 : undefined, top: 0, zIndex: 40, borderRight: isSplit ? "3px solid var(--trading-border)" : "1px solid var(--trading-border)" }}>Strike</th>
              {(!isSplit || showFullColumns) && (
                <th className="m2-th" style={{ padding: cellPadding, fontSize: "10px", textAlign: "center", minWidth: isSplit ? 56 : 72, borderRight: "1px solid var(--trading-border)" }}>Day Open</th>
              )}
              {displayedTimestamps.map((ts) => (
                <th key={ts} className="m2-th" style={{ padding: cellPadding, fontSize: "10px", textAlign: "center", minWidth: isSplit ? 48 : 60 }}>{ts}</th>
              ))}
              {(!isSplit || showFullColumns) && (
                <th className="m2-th" style={{ padding: cellPadding, fontSize: "10px", textAlign: "center", minWidth: 80, width: 80, borderLeft: isSplit ? "3px solid var(--trading-border)" : "1px solid var(--trading-border)", position: isSplit ? "sticky" : undefined, right: isSplit ? 80 : undefined, top: 0, zIndex: 40, background: isSplit ? "var(--trading-bg)" : undefined }}>High</th>
              )}
              {(!isSplit || showFullColumns) && (
                <th className="m2-th" style={{ padding: cellPadding, fontSize: "10px", textAlign: "center", minWidth: 80, width: 80, position: isSplit ? "sticky" : undefined, right: isSplit ? 0 : undefined, top: 0, zIndex: 40, background: isSplit ? "var(--trading-bg)" : undefined }}>Low</th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayedStrikes.length === 0 ? (
              <tr>
                <td colSpan={displayedTimestamps.length + (isSplit && !showFullColumns ? 1 : 4)} style={{ padding: "32px 16px", textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "var(--trading-text-muted)" }}>
                  No strikes to display in this category.
                </td>
              </tr>
            ) : (
              displayedStrikes.map((strike) => {
                const s = session.strikes[strike];
                if (!s) return null;
                const parsed = parseStrikeSymbol(strike);
                const isTop3 = highlightTop3 && topStrikes.includes(strike);
                const isCE = parsed.optionType === "CE";

                const rowBg = s.isDeepLoss ? "rgba(229,57,53,0.03)" : s.isDowntrendActive ? "rgba(217,119,6,0.03)" : "transparent";
                // sticky cell needs a solid background
                const stickyBg = s.isDeepLoss
                  ? "rgba(255,242,242,0.98)"
                  : s.isDowntrendActive
                  ? "rgba(255,251,235,0.98)"
                  : "var(--trading-surface)";

                const summaryBg = isSplit
                  ? (s.isDeepLoss
                      ? "linear-gradient(rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.12)), var(--trading-bg)"
                      : s.isDowntrendActive
                      ? "linear-gradient(rgba(217, 119, 6, 0.12), rgba(217, 119, 6, 0.12)), var(--trading-bg)"
                      : "var(--trading-bg)")
                  : stickyBg;

                return (
                  <tr
                    key={strike}
                    className="m2-tr"
                    style={{ background: rowBg, borderLeft: isTop3 ? `3px solid ${AMBER}` : undefined }}
                  >
                    {/* Sticky strike cell */}
                    <td className="m2-td m2-sticky-cell" style={{ 
                      padding: cellPadding, 
                      fontSize: cellFontSize, 
                      position: isSplit ? "sticky" : undefined, 
                      left: isSplit ? 0 : undefined, 
                      zIndex: isSplit ? 20 : undefined, 
                      background: isSplit ? stickyBg : undefined, 
                      borderRight: isSplit ? "3px solid var(--trading-border)" : "1px solid var(--trading-border)", 
                      minWidth: isSplit ? 130 : 180 
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: isSplit ? 2 : 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: isSplit ? 4 : 8 }}>
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: isSplit ? 12 : 14, fontWeight: 800, color: "var(--trading-text-active)" }}>{parsed.strikePrice}</span>
                          <span style={{
                            padding: isSplit ? "1px 4px" : "2px 7px", borderRadius: 4,
                            fontSize: isSplit ? 9 : 10, fontWeight: 700, fontFamily: "'Inter', sans-serif",
                            color: isCE ? GREEN : RED,
                            background: isCE ? "rgba(4,120,87,0.1)" : "rgba(229,57,53,0.1)",
                            border: `1px solid ${isCE ? "rgba(4,120,87,0.25)" : "rgba(229,57,53,0.25)"}`,
                          }}>
                            {parsed.optionType}
                          </span>
                          <TrendBadge badge={s.trendBadge} />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {isTop3 && (
                            <span style={{ padding: "1px 5px", borderRadius: 4, fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: AMBER, background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.25)" }}>
                              Top 3
                            </span>
                          )}
                          {s.isDeepLoss && (
                            <span className="animate-pulse" style={{ padding: "1px 5px", borderRadius: 4, fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: RED, background: "rgba(229,57,53,0.1)", border: "1px solid rgba(229,57,53,0.25)" }}>
                              Severe −15%
                            </span>
                          )}
                          {!s.isDeepLoss && s.isDowntrendActive && (
                            <span style={{ padding: "1px 5px", borderRadius: 4, fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: AMBER, background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.25)" }}>
                              Down 3m
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Day open */}
                    {(!isSplit || showFullColumns) && (
                      <td className="m2-td" style={{ padding: cellPadding, fontSize: cellFontSize, textAlign: "center", borderRight: "1px solid var(--trading-border)", color: "var(--trading-text-muted)", fontWeight: 500 }}>
                        {Math.round(s.dayOpen)}
                      </td>
                    )}

                    {/* Minute columns */}
                    {displayedTimestamps.map((ts) => {
                      const cell = s.grid.find((c: any) => c.timestamp === ts);
                      if (!cell) return <td key={ts} className="m2-td" style={{ padding: cellPadding, fontSize: cellFontSize, textAlign: "center", color: "var(--trading-text-muted)" }}>—</td>;
                      const isCellHigh = cell.ltp === s.dayHigh && s.dayHigh > 0;
                      const isCellLow  = cell.ltp === s.dayLow  && s.dayLow  > 0;
                      return (
                        <td
                          key={ts}
                          className="m2-td"
                          title={`${cell.timestamp} · ${cell.ltp}`}
                          style={{
                            padding: cellPadding,
                            fontSize: cellFontSize,
                            textAlign: "center",
                            background: isCellHigh ? "rgba(4,120,87,0.1)" : isCellLow ? "rgba(229,57,53,0.08)" : undefined,
                            color: isCellHigh ? GREEN : isCellLow ? RED : "var(--trading-text-active)",
                            fontWeight: isCellHigh || isCellLow ? 700 : 400,
                          }}
                        >
                          {cell.ltp}
                        </td>
                      );
                    })}

                    {/* High */}
                    {(!isSplit || showFullColumns) && (
                      <td className="m2-td m2-sticky-cell" style={{ 
                        padding: cellPadding, 
                        fontSize: cellFontSize, 
                        textAlign: "center", 
                        position: isSplit ? "sticky" : undefined, 
                        right: isSplit ? 80 : undefined, 
                        zIndex: isSplit ? 20 : undefined, 
                        background: summaryBg, 
                        borderLeft: isSplit ? "3px solid var(--trading-border)" : "1px solid var(--trading-border)", 
                        color: GREEN, 
                        fontWeight: 700, 
                        minWidth: 80, 
                        width: 80 
                      }}>
                        {Math.round(s.dayHigh)}
                      </td>
                    )}

                    {/* Low */}
                    {(!isSplit || showFullColumns) && (
                      <td className="m2-td m2-sticky-cell" style={{ 
                        padding: cellPadding, 
                        fontSize: cellFontSize, 
                        textAlign: "center", 
                        position: isSplit ? "sticky" : undefined, 
                        right: isSplit ? 0 : undefined, 
                        zIndex: isSplit ? 20 : undefined, 
                        background: summaryBg, 
                        color: RED, 
                        fontWeight: 700, 
                        minWidth: 80, 
                        width: 80 
                      }}>
                        {Math.round(s.dayLow)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {isSplit && (
        <div style={{ padding: 8, borderTop: "1.5px solid var(--trading-border)", background: "var(--trading-surface)" }}>
          <button
            onClick={() => setShowFullColumns(!showFullColumns)}
            style={{
              width: "100%",
              padding: "6px 12px",
              borderRadius: 8,
              border: "1.5px solid var(--trading-border)",
              background: "var(--trading-surface)",
              color: "var(--trading-text-muted)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            className="secondary-btn"
          >
            {showFullColumns ? "Collapse to Compact View (5 Rows, 5 Ticks) ▲" : `Show All ${strikesList.length} Rows, Full Columns & All ${sortedTimestamps.length} Ticks ▼`}
          </button>
        </div>
      )}
    </div>
  );
}

export default Module2;
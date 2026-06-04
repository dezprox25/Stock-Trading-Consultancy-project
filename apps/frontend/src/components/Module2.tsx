import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";

const parseStrikeSymbol = (symbol: string) => {
  const match = symbol.match(/(\d+)(CE|PE)$/);
  if (match) {
    return {
      strikePrice: match[1],
      optionType: match[2]
    };
  }
  return {
    strikePrice: symbol,
    optionType: ""
  };
};

const calculateMockTrendAndWarnings = (s: any) => {
  const grid = s.grid;
  if (!grid || grid.length === 0) return;
  const lastCell = grid[grid.length - 1];
  const ltp = lastCell.ltp;

  // 1. Evaluate trend badge
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

    if (lowerLows >= 4) {
      newBadge = "H_TO_L";
    } else if (higherHighs >= 4) {
      newBadge = "L_TO_H";
    }
  }

  // Reversal detection
  if (previousBadge === "H_TO_L" && newBadge === "FLAT" && recentLtpList.length >= 2 && recentLtpList[recentLtpList.length - 1] > recentLtpList[recentLtpList.length - 2]) {
    newBadge = "REVERSAL";
  } else if (previousBadge === "L_TO_H" && newBadge === "FLAT" && recentLtpList.length >= 2 && recentLtpList[recentLtpList.length - 1] < recentLtpList[recentLtpList.length - 2]) {
    newBadge = "REVERSAL";
  }

  s.trendBadge = newBadge;

  // 2. Call-Down advisory filter (CE options only)
  const isCE = s.strike.endsWith("CE");
  if (isCE) {
    // Deep loss check (>15% drop from baseline)
    if (ltp < s.dayOpen * 0.85) {
      s.isDeepLoss = true;
    }

    // Downtrend check (3 consecutive declining minutes)
    const recent3 = grid.slice(-3).map((c: any) => c.ltp);
    if (recent3.length >= 3 && recent3[0] > recent3[1] && recent3[1] > recent3[2]) {
      s.isDowntrendActive = true;
    }

    // Recovery check (2 consecutive rising minutes clears alerts)
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
  if (!nextSession.strikes) {
    nextSession.strikes = {};
  }

  const defaultCeStrikes = [
    "NIFTY21850CE",
    "NIFTY21900CE",
    "NIFTY21950CE",
    "NIFTY22000CE",
    "NIFTY22050CE",
    "NIFTY22100CE",
    "NIFTY22150CE",
    "NIFTY22200CE",
    "NIFTY22250CE",
    "NIFTY22300CE"
  ];
  const defaultPeStrikes = [
    "NIFTY21850PE",
    "NIFTY21900PE",
    "NIFTY21950PE",
    "NIFTY22000PE",
    "NIFTY22050PE",
    "NIFTY22100PE",
    "NIFTY22150PE",
    "NIFTY22200PE",
    "NIFTY22250PE",
    "NIFTY22300PE"
  ];

  let currentSelected = [...nextSession.selectedStrikes];
  const ceSelected = currentSelected.filter((s) => s.endsWith("CE"));
  const peSelected = currentSelected.filter((s) => s.endsWith("PE"));
  const isTinyCustom = currentSelected.length === 1 || currentSelected.length === 2;

  if (!isTinyCustom) {
    // Pad CE strikes up to 5 if mixed mode is active, or up to 10 if CE mode is active
    const maxCeCount = nextSession.sessionType === "mixed" ? 5 : 10;
    if (nextSession.sessionType === "CE" || nextSession.sessionType === "mixed") {
      let ceCount = ceSelected.length;
      for (let i = 0; i < defaultCeStrikes.length && ceCount < maxCeCount; i++) {
        const defaultStrike = defaultCeStrikes[i];
        if (!currentSelected.includes(defaultStrike)) {
          currentSelected.push(defaultStrike);
          ceCount++;
        }
      }
    }

    // Pad PE strikes up to 5 if mixed mode is active, or up to 10 if PE mode is active
    const maxPeCount = nextSession.sessionType === "mixed" ? 5 : 10;
    if (nextSession.sessionType === "PE" || nextSession.sessionType === "mixed") {
      let peCount = peSelected.length;
      for (let i = 0; i < defaultPeStrikes.length && peCount < maxPeCount; i++) {
        const defaultStrike = defaultPeStrikes[i];
        if (!currentSelected.includes(defaultStrike)) {
          currentSelected.push(defaultStrike);
          peCount++;
        }
      }
    }
  }

  // Slice to max 10 to guarantee backend compatibility
  if (currentSelected.length > 10) {
    currentSelected = currentSelected.slice(0, 10);
  }

  nextSession.selectedStrikes = currentSelected;

  const baselines: Record<string, number> = {
    "NIFTY21850CE": 180.0,
    "NIFTY21900CE": 150.0,
    "NIFTY21950CE": 120.0,
    "NIFTY22000CE": 95.0,
    "NIFTY22050CE": 75.0,
    "NIFTY22100CE": 55.0,
    "NIFTY22150CE": 40.0,
    "NIFTY22200CE": 30.0,
    "NIFTY22250CE": 20.0,
    "NIFTY22300CE": 12.0,
    "NIFTY21850PE": 15.0,
    "NIFTY21900PE": 22.0,
    "NIFTY21950PE": 32.0,
    "NIFTY22000PE": 45.0,
    "NIFTY22050PE": 65.0,
    "NIFTY22100PE": 88.0,
    "NIFTY22150PE": 115.0,
    "NIFTY22200PE": 145.0,
    "NIFTY22250PE": 180.0,
    "NIFTY22300PE": 220.0
  };

  currentSelected.forEach((strike) => {
    if (!nextSession.strikes[strike]) {
      const base = baselines[strike] || 100.0;

      // Find the existing timeline length from other strikes
      let maxMinutes = 0;
      let existingGrid: any[] = [];
      Object.values(nextSession.strikes).forEach((s: any) => {
        if (s.grid && s.grid.length > maxMinutes) {
          maxMinutes = s.grid.length;
          existingGrid = s.grid;
        }
      });

      let grid: any[] = [];
      if (maxMinutes > 0) {
        grid = existingGrid.map((cell) => ({
          ltp: base,
          minute: cell.minute,
          timestamp: cell.timestamp,
          isHigh: false,
          isLow: false
        }));
      } else {
        const columnsCount = 16;
        const startHour = 9;
        const startMinute = 15;
        let currentLtp = base;
        for (let m = 0; m < columnsCount; m++) {
          let minVal = startMinute + m;
          let hrVal = startHour + Math.floor(minVal / 60);
          let minStr = (minVal % 60).toString().padStart(2, "0");
          let hrStr = hrVal.toString().padStart(2, "0");
          const timestamp = `${hrStr}:${minStr}`;
          
          const change = (Math.random() - 0.5) * 4;
          currentLtp = Math.max(1, Number((currentLtp + change).toFixed(2)));
          grid.push({
            ltp: currentLtp,
            minute: m,
            timestamp,
            isHigh: false,
            isLow: false
          });
        }
      }

      nextSession.strikes[strike] = {
        strike,
        dayOpen: base,
        dayHigh: base,
        dayLow: base,
        grid,
        trendBadge: "FLAT" as const,
        isDowntrendActive: false,
        isDeepLoss: false,
        pctChange: 0
      };

      // Run dynamic calculations to generate accurate initial trend states
      calculateMockTrendAndWarnings(nextSession.strikes[strike]);
    }
  });

  return nextSession;
};


// Initial generator for fallback session data when backend session is offline
const generateFallbackSession = () => {
  const selectedStrikes = [
    "NIFTY22000CE",
    "NIFTY22050CE",
    "NIFTY22100CE",
    "NIFTY22150CE",
    "NIFTY22200CE",
    "NIFTY22000PE",
    "NIFTY22050PE",
    "NIFTY22100PE",
    "NIFTY22150PE",
    "NIFTY22200PE"
  ];
  
  const strikes: Record<string, any> = {};
  
  const baselines: Record<string, number> = {
    "NIFTY21850CE": 180.0,
    "NIFTY21900CE": 150.0,
    "NIFTY21950CE": 120.0,
    "NIFTY22000CE": 95.0,
    "NIFTY22050CE": 75.0,
    "NIFTY22100CE": 55.0,
    "NIFTY22150CE": 40.0,
    "NIFTY22200CE": 30.0,
    "NIFTY22250CE": 20.0,
    "NIFTY22300CE": 12.0,
    "NIFTY21850PE": 15.0,
    "NIFTY21900PE": 22.0,
    "NIFTY21950PE": 32.0,
    "NIFTY22000PE": 45.0,
    "NIFTY22050PE": 65.0,
    "NIFTY22100PE": 88.0,
    "NIFTY22150PE": 115.0,
    "NIFTY22200PE": 145.0,
    "NIFTY22250PE": 180.0,
    "NIFTY22300PE": 220.0
  };

  // Pre-populate columns from 09:15 to 09:30 (16 columns)
  const columnsCount = 16;
  const startHour = 9;
  const startMinute = 15;

  selectedStrikes.forEach((strike) => {
    const base = baselines[strike] || 100.0;
    const grid: any[] = [];
    let currentLtp = base;
    let dayHigh = base;
    let dayLow = base;

    for (let m = 0; m < columnsCount; m++) {
      let minVal = startMinute + m;
      let hrVal = startHour + Math.floor(minVal / 60);
      let minStr = (minVal % 60).toString().padStart(2, "0");
      let hrStr = hrVal.toString().padStart(2, "0");
      const timestamp = `${hrStr}:${minStr}`;

      // Simulate drift
      const change = (Math.random() - 0.5) * 4;
      currentLtp = Math.max(1, Number((currentLtp + change).toFixed(2)));
      dayHigh = Math.max(dayHigh, currentLtp);
      dayLow = Math.min(dayLow, currentLtp);

      grid.push({
        ltp: currentLtp,
        minute: m,
        timestamp,
        isHigh: false,
        isLow: false
      });
    }

    strikes[strike] = {
      strike,
      dayOpen: base,
      dayHigh,
      dayLow,
      grid,
      trendBadge: "FLAT" as const,
      isDowntrendActive: false,
      isDeepLoss: false,
      pctChange: Number((((currentLtp - base) / base) * 100).toFixed(2))
    };

    calculateMockTrendAndWarnings(strikes[strike]);
  });

  return {
    sessionId: "fallback-session",
    userId: "guest",
    sessionType: "mixed" as const,
    indexSymbol: "NIFTY50",
    expiryDate: "2026-06-04",
    selectedStrikes,
    dayOpenPrices: baselines,
    strikes,
    createdAt: new Date()
  };
};

export const Module2 = () => {
  const activeSession = useStore((state) => state.activeSession);
  const setActiveSession = useStore((state) => state.setActiveSession);

  // Fallback local session state to guarantee zero empty states
  const [localFallbackSession, setLocalFallbackSession] = useState<any>(() => generateFallbackSession());

  // Selector state
  const [indexSymbol, setIndexSymbol] = useState("NIFTY50");
  const [expiryDate, setExpiryDate] = useState("2026-06-04");
  const [sessionType, setSessionType] = useState<"CE" | "PE" | "mixed">("mixed");
  const [selectedStrikes, setSelectedStrikes] = useState<string[]>([]);
  
  // Dynamic filter states
  const [sortOrder, setSortOrder] = useState<"high_value" | "low_value" | "default">("default");
  const [priceAbove, setPriceAbove] = useState<number | "">("");
  const [priceBelow, setPriceBelow] = useState<number | "">("");
  const [highlightTop3, setHighlightTop3] = useState(false);
  const [callDownCollapsedToggle, setCallDownCollapsedToggle] = useState(false);
  const [filterType, setFilterType] = useState<"CE" | "PE" | "mixed">("mixed");
  


  // Query options chain strikes
  const { data: chainData } = useQuery({
    queryKey: ["option-chain", indexSymbol],
    queryFn: () => api.get(`/api/market/option-chain/${indexSymbol}`),
    enabled: true
  });

  // Query active session on mount
  const { data: initialSession } = useQuery({
    queryKey: ["active-session-init"],
    queryFn: () => api.get("/api/module2/session/current"),
    enabled: !activeSession
  });

  useEffect(() => {
    if (initialSession) {
      setActiveSession(initialSession);
    }
  }, [initialSession, setActiveSession]);

  // Feed live price ticks from store into local fallback session, or generate independent mock fluctuations if live data is offline
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
              if (lastCell.ltp !== livePriceObj.ltp) {
                newLtp = livePriceObj.ltp;
                updated = true;
              }
            } else {
              // Generate unique mock fluctuation per row
              const change = (Math.random() - 0.5) * 1.5;
              newLtp = Math.max(1, Number((lastCell.ltp + change).toFixed(2)));
              updated = true;
            }

            if (newLtp !== lastCell.ltp) {
              lastCell.ltp = newLtp;
              s.dayHigh = Math.max(s.dayHigh, newLtp);
              s.dayLow = Math.min(s.dayLow, newLtp);
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

  // Mock minute-by-minute horizontal growth
  useEffect(() => {
    if (activeSession) return;

    const interval = setInterval(() => {
      setLocalFallbackSession((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev));
        const firstStrikeKey = Object.keys(next.strikes)[0];
        const lastCell = next.strikes[firstStrikeKey]?.grid[next.strikes[firstStrikeKey].grid.length - 1];
        
        let nextMinute = 0;
        let nextTimestamp = "09:31";

        if (lastCell) {
          const [h, m] = lastCell.timestamp.split(":").map(Number);
          let newM = m + 1;
          let newH = h;
          if (newM >= 60) {
            newM = 0;
            newH = (h + 1) % 24;
          }
          nextTimestamp = `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
          nextMinute = lastCell.minute + 1;
        }

        Object.keys(next.strikes).forEach((strike) => {
          const s = next.strikes[strike];
          const currentLtp = s.grid.length > 0 ? s.grid[s.grid.length - 1].ltp : s.dayOpen;
          
          s.grid.push({
            ltp: currentLtp,
            minute: nextMinute,
            timestamp: nextTimestamp,
            isHigh: false,
            isLow: false
          });
          calculateMockTrendAndWarnings(s);
        });

        return next;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [activeSession]);

  // Mutation to start tracking session
  const startSessionMutation = useMutation({
    mutationFn: () =>
      api.post("/api/module2/session/start", {
        sessionType,
        indexSymbol,
        expiryDate,
        selectedStrikes
      }),
    onSuccess: (data) => {
      setActiveSession(data);
    }
  });



  // CSV Export handler (Fallback session exports client-side generated CSV)
  const handleExportCSV = async () => {
    const sessionToExport = activeSession || localFallbackSession;
    if (!sessionToExport) return;

    if (!activeSession) {
      try {
        let maxMinutes = 0;
        Object.values(sessionToExport.strikes).forEach((s: any) => {
          maxMinutes = Math.max(maxMinutes, s.grid.length);
        });

        const headers = ["Strike", "Day Open", "Day High", "Day Low", "Trend Badge", "Pct Change"];
        const firstStrikeKey = Object.keys(sessionToExport.strikes)[0];
        const firstStrike = firstStrikeKey ? sessionToExport.strikes[firstStrikeKey] : null;

        for (let m = 0; m < maxMinutes; m++) {
          const timeLabel = firstStrike?.grid[m]?.timestamp || `Min ${m}`;
          headers.push(timeLabel);
        }

        let csvContent = headers.join(",") + "\n";

        sessionToExport.selectedStrikes.forEach((strike: string) => {
          const s = sessionToExport.strikes[strike];
          if (!s) return;

          const row = [
            strike,
            Math.round(s.dayOpen),
            Math.round(s.dayHigh),
            Math.round(s.dayLow),
            s.trendBadge,
            `${s.pctChange}%`
          ];

          for (let m = 0; m < maxMinutes; m++) {
            const cell = s.grid[m];
            if (cell) {
              let val = Math.round(cell.ltp).toString();
              if (cell.isHigh) val += " (H)";
              if (cell.isLow) val += " (L)";
              row.push(val);
            } else {
              row.push("");
            }
          }
          csvContent += row.join(",") + "\n";
        });
        
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "session_mock_export.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Client-side CSV export failed:", err);
      }
      return;
    }

    try {
      const csvBlob = await fetch("/api/module2/export", {
        headers: {
          Authorization: `Bearer ${useStore.getState().accessToken}`
        }
      }).then(r => r.blob());

      const url = window.URL.createObjectURL(csvBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session_${activeSession?.sessionId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("CSV Export failed:", error);
    }
  };

  const toggleStrikeSelection = (strike: string) => {
    setSelectedStrikes((prev) => {
      if (prev.includes(strike)) {
        return prev.filter((s) => s !== strike);
      }
      const maxAllowed = sessionType === "mixed" ? 20 : 10;
      if (prev.length >= maxAllowed) return prev;
      return [...prev, strike];
    });
  };

  // Bind session data (use localFallbackSession as guaranteed fallback if activeSession has no strikes)
  const hasStrikes = activeSession && Object.keys(activeSession.strikes || {}).length > 0;
  const rawSession = hasStrikes ? activeSession : localFallbackSession;
  const currentSession = ensureFullStrikesData(rawSession);

  const sortedTimestamps = (() => {
    const tsSet = new Set<string>();
    Object.values(currentSession.strikes).forEach((s: any) => {
      s.grid.forEach((cell: any) => {
        if (cell.timestamp) {
          tsSet.add(cell.timestamp);
        }
      });
    });
    if (tsSet.size === 0) {
      const fallback: string[] = [];
      const startHour = 9;
      const startMinute = 15;
      for (let m = 0; m < 16; m++) {
        let minVal = startMinute + m;
        let hrVal = startHour + Math.floor(minVal / 60);
        let minStr = (minVal % 60).toString().padStart(2, "0");
        let hrStr = hrVal.toString().padStart(2, "0");
        fallback.push(`${hrStr}:${minStr}`);
      }
      return fallback;
    }
    return Array.from(tsSet).sort();
  })();

  const topStrikes = Object.values(currentSession.strikes)
    .sort((a: any, b: any) => b.pctChange - a.pctChange)
    .slice(0, 3)
    .map((s: any) => s.strike);

  // Apply sorting and filtering
  const processedStrikes = [...currentSession.selectedStrikes]
    .filter((strike) => {
      const s = currentSession.strikes[strike];
      if (!s) return true;
      const latestLtp = s.grid.length > 0 ? s.grid[s.grid.length - 1].ltp : s.dayOpen;
      
      // Price Above/Below filters
      if (priceAbove !== "" && latestLtp < Number(priceAbove)) return false;
      if (priceBelow !== "" && latestLtp > Number(priceBelow)) return false;
      
      // Call-down advisory filter (if enabled, show only strikes with active warnings)
      if (callDownCollapsedToggle && !s.isDowntrendActive && !s.isDeepLoss) return false;
      
      return true;
    })
    .sort((a, b) => {
      const stateA = currentSession.strikes[a];
      const stateB = currentSession.strikes[b];
      if (!stateA || !stateB) return 0;
      
      const ltpA = stateA.grid.length > 0 ? stateA.grid[stateA.grid.length - 1].ltp : stateA.dayOpen;
      const ltpB = stateB.grid.length > 0 ? stateB.grid[stateB.grid.length - 1].ltp : stateB.dayOpen;

      if (sortOrder === "high_value") return ltpB - ltpA;
      if (sortOrder === "low_value") return ltpA - ltpB;
      
      return 0;
    });

  // Filter strikes into CE and PE lists
  const ceStrikesList = processedStrikes.filter((s) => s.endsWith("CE"));
  const peStrikesList = processedStrikes.filter((s) => s.endsWith("PE"));

  // Before rendering, run validation check on selectedStrikes count and log errors if fewer rows exist than expected
  const actualStrikesCount = currentSession.selectedStrikes.length;
  if (currentSession.sessionType === "CE" && actualStrikesCount < 10) {
    console.error(`Validation Error: CE mode expects 10 rows, but only has ${actualStrikesCount} rows.`);
  } else if (currentSession.sessionType === "PE" && actualStrikesCount < 10) {
    console.error(`Validation Error: PE mode expects 10 rows, but only has ${actualStrikesCount} rows.`);
  } else if (currentSession.sessionType === "mixed" && actualStrikesCount < 10) {
    console.error(`Validation Error: Mixed mode expects 10 rows, but only has ${actualStrikesCount} rows.`);
  }

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Page Title */}
      <div className="flex items-center justify-between border-b border-trading-border pb-4">
        <h2 className="font-sans text-lg font-black tracking-wider text-trading-textActive uppercase">
          MODULE 2 - STRIKE TRACKER
        </h2>
      </div>

      {/* 1. Premium Configurations Card */}
      <div className="rounded-xl border border-trading-border bg-trading-surface p-6 space-y-6 shadow-xl">
        <h3 className="text-xs font-black tracking-widest text-trading-neutral uppercase select-none">
          Configure Tracker Session Settings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold text-trading-textMuted uppercase mb-2">Index symbol</label>
            <select
              value={indexSymbol}
              onChange={(e) => setIndexSymbol(e.target.value)}
              className="w-full rounded-lg border border-trading-border bg-trading-bg px-4 py-2.5 text-sm focus:outline-none focus:border-trading-neutral text-trading-textActive font-sans"
            >
              <option value="NIFTY50">NIFTY 50 (Step 50)</option>
              <option value="BANKNIFTY">BANK NIFTY (Step 100)</option>
              <option value="FINNIFTY">FIN NIFTY (Step 50)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-trading-textMuted uppercase mb-2">Options Expiry</label>
            <select
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-lg border border-trading-border bg-trading-bg px-4 py-2.5 text-sm focus:outline-none focus:border-trading-neutral text-trading-textActive font-sans"
            >
              <option value="2026-06-04">04-JUN-2026 (Weekly Expiry)</option>
              <option value="2026-06-11">11-JUN-2026 (Weekly Expiry)</option>
              <option value="2026-06-25">25-JUN-2026 (Monthly Expiry)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-trading-textMuted uppercase mb-2">Session Type</label>
            <div className="flex bg-trading-bg p-1 rounded-lg border border-trading-border">
              {(["CE", "PE", "mixed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSessionType(t)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-bold font-sans transition ${
                    sessionType === t ? "bg-trading-neutral text-trading-bg" : "text-trading-textMuted hover:text-trading-textActive"
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <span className="block text-xs font-semibold text-trading-textMuted uppercase mb-3">
            Select strikes from chain ({selectedStrikes.length}/{sessionType === "mixed" ? 20 : 10} selected)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
            {(chainData?.strikes || []).map((s: any) => {
              const ceSelected = selectedStrikes.includes(s.CE);
              const peSelected = selectedStrikes.includes(s.PE);

              return (
                <div key={s.strikePrice} className="flex flex-col rounded-lg border border-trading-border bg-trading-bg/40 p-2 text-center">
                  <span className="text-[10px] font-bold text-trading-textMuted font-mono mb-2">{s.strikePrice}</span>
                  <div className="flex space-x-1">
                    {sessionType !== "PE" && (
                      <button
                        onClick={() => toggleStrikeSelection(s.CE)}
                        className={`flex-1 rounded py-1 text-[10px] font-black font-sans transition ${
                          ceSelected ? "bg-emerald-500 text-trading-bg" : "bg-trading-surface text-trading-bullish border border-trading-border hover:bg-trading-border/50"
                        }`}
                      >
                        CE
                      </button>
                    )}
                    {sessionType !== "CE" && (
                      <button
                        onClick={() => toggleStrikeSelection(s.PE)}
                        className={`flex-1 rounded py-1 text-[10px] font-black font-sans transition ${
                          peSelected ? "bg-red-500 text-trading-bg" : "bg-trading-surface text-trading-bearish border border-trading-border hover:bg-trading-border/50"
                        }`}
                      >
                        PE
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => startSessionMutation.mutate()}
          disabled={selectedStrikes.length === 0 || startSessionMutation.isPending}
          className="rounded-lg bg-trading-neutral px-6 py-2.5 text-xs font-bold font-sans text-trading-bg transition hover:opacity-90 disabled:opacity-50 active:scale-95"
        >
          Start Active Session Tracker
        </button>
      </div>

      {/* 2. Controls Toolbar */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-xl border border-trading-border bg-trading-surface p-4">
          {/* Controls Group */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter buttons (MIXED, CE ONLY, PE ONLY) */}
            <div className="flex items-center space-x-1 bg-trading-bg p-1 rounded-lg border border-trading-border select-none">
              {[
                { key: "mixed", label: "MIXED" },
                { key: "CE", label: "CE ONLY" },
                { key: "PE", label: "PE ONLY" }
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFilterType(t.key as any)}
                  className={`rounded px-3 py-1.5 text-[10px] font-bold font-sans transition ${
                    filterType === t.key
                      ? "bg-trading-neutral text-white"
                      : "text-trading-textMuted hover:text-trading-textActive"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Sort buttons (DEFAULT, HIGH FIRST, LOW FIRST) */}
            <div className="flex items-center space-x-1 bg-trading-bg p-1 rounded-lg border border-trading-border select-none">
              {[
                { key: "default", label: "DEFAULT" },
                { key: "high_value", label: "HIGH FIRST" },
                { key: "low_value", label: "LOW FIRST" }
              ].map((o) => (
                <button
                  key={o.key}
                  onClick={() => setSortOrder(o.key as any)}
                  className={`rounded px-3 py-1.5 text-[10px] font-bold font-sans transition ${
                    sortOrder === o.key
                      ? "bg-trading-neutral text-white"
                      : "text-trading-textMuted hover:text-trading-textActive"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* Price Above Filter */}
            <div className="flex items-center space-x-2 bg-trading-bg px-3 py-1.5 rounded-lg border border-trading-border">
              <span className="text-[10px] font-bold text-trading-textMuted uppercase font-sans">Above:</span>
              <input
                type="number"
                placeholder="Min"
                value={priceAbove}
                onChange={(e) => setPriceAbove(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-12 bg-transparent text-xs font-bold text-trading-textActive outline-none font-mono"
              />
            </div>

            {/* Price Below Filter */}
            <div className="flex items-center space-x-2 bg-trading-bg px-3 py-1.5 rounded-lg border border-trading-border">
              <span className="text-[10px] font-bold text-trading-textMuted uppercase font-sans">Below:</span>
              <input
                type="number"
                placeholder="Max"
                value={priceBelow}
                onChange={(e) => setPriceBelow(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-12 bg-transparent text-xs font-bold text-trading-textActive outline-none font-mono"
              />
            </div>

            {/* Call-down Collapse Toggle */}
            <button
              onClick={() => setCallDownCollapsedToggle(!callDownCollapsedToggle)}
              className={`rounded-lg px-4 py-2 text-[10px] font-bold font-sans border transition select-none ${
                callDownCollapsedToggle
                  ? "bg-red-500/20 text-trading-bearish border-red-500/30"
                  : "bg-trading-bg text-trading-textMuted border-trading-border hover:text-trading-textActive"
              }`}
            >
              CALL-DOWN {callDownCollapsedToggle ? "ON" : "OFF"}
            </button>

            {/* Highlight Top 3 Toggle */}
            <button
              onClick={() => setHighlightTop3(!highlightTop3)}
              className={`rounded-lg px-4 py-2 text-[10px] font-bold font-sans border transition select-none ${
                highlightTop3
                  ? "bg-amber-500/20 text-yellow-500 border-amber-500/30"
                  : "bg-trading-bg text-trading-textMuted border-trading-border hover:text-trading-textActive"
              }`}
            >
              HIGHLIGHT TOP 3
            </button>

            {/* Reset Filters Button */}
            <button
              onClick={() => {
                setSortOrder("default");
                setPriceAbove("");
                setPriceBelow("");
                setHighlightTop3(false);
                setCallDownCollapsedToggle(false);
                setFilterType("mixed");
              }}
              className="rounded-lg bg-trading-border hover:bg-trading-border/80 px-4 py-2 text-[10px] font-bold font-sans text-trading-textActive transition select-none"
            >
              RESET
            </button>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            className="rounded-lg bg-trading-neutral/10 border border-trading-neutral/30 text-trading-neutral hover:bg-trading-neutral/20 px-5 py-2 text-[10px] font-bold font-sans tracking-wide transition active:scale-95 lg:ml-auto select-none"
          >
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* 2. Main Tables Layout */}
      <div className="space-y-8">
        {/* SECTION 1: CE STRIKES */}
        {(filterType === "mixed" || filterType === "CE") && (
          <div className="space-y-3">
            <h3 className="text-xs font-black tracking-widest text-trading-bullish uppercase select-none flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-trading-bullish animate-pulse"></span>
              CE STRIKES
            </h3>
            <StrikeTrackerTable
              strikesList={ceStrikesList}
              session={currentSession}
              sortedTimestamps={sortedTimestamps}
              highlightTop3={highlightTop3}
              topStrikes={topStrikes}
            />
          </div>
        )}

        {/* SECTION 2: PE STRIKES */}
        {(filterType === "mixed" || filterType === "PE") && (
          <div className="space-y-3">
            <h3 className="text-xs font-black tracking-widest text-trading-bearish uppercase select-none flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-trading-bearish animate-pulse"></span>
              PE STRIKES
            </h3>
            <StrikeTrackerTable
              strikesList={peStrikesList}
              session={currentSession}
              sortedTimestamps={sortedTimestamps}
              highlightTop3={highlightTop3}
              topStrikes={topStrikes}
            />
          </div>
        )}
      </div>

      </div>
  );
};

// Sub-Component to render individual dense strike tables
function StrikeTrackerTable({
  strikesList,
  session,
  sortedTimestamps,
  highlightTop3,
  topStrikes
}: {
  strikesList: string[];
  session: any;
  sortedTimestamps: string[];
  highlightTop3: boolean;
  topStrikes: string[];
}) {
  const theme = useStore((state) => state.theme);

  return (
    <div className="rounded-xl border border-trading-border bg-trading-surface overflow-hidden shadow-xl w-full relative">
      <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
        <table className="w-full text-left font-sans select-none border-separate border-spacing-0">
          <thead>
            <tr className="bg-trading-bg text-[10px] font-bold uppercase tracking-wider text-trading-textMuted">
              <th className="py-3 px-3 min-w-[140px] sticky left-0 top-0 bg-trading-bg z-40 border-r border-b border-trading-border">
                Strike
              </th>
              <th className="py-3 px-3 text-center border-r border-b border-trading-border min-w-[70px] bg-trading-bg top-0 sticky z-30">
                Day Open
              </th>
              {sortedTimestamps.map((ts) => (
                <th key={ts} className="py-3 px-2 text-center font-mono font-medium text-[9px] min-w-[65px] sticky top-0 bg-trading-bg z-30 border-b border-trading-border">
                  {ts}
                </th>
              ))}
              <th className="py-3 px-3 text-center border-l border-r border-b border-trading-border sticky right-[65px] top-0 bg-trading-bg z-40 w-[65px] min-w-[65px]">
                Day High
              </th>
              <th className="py-3 px-3 text-center border-b border-trading-border sticky right-0 top-0 bg-trading-bg z-40 w-[65px] min-w-[65px]">
                Day Low
              </th>
            </tr>
          </thead>
          <tbody className="text-xs font-semibold">
            {strikesList.length === 0 ? (
              <tr>
                <td colSpan={sortedTimestamps.length + 4} className="py-8 text-center text-trading-textMuted border-b border-trading-gridLine">
                  No strikes to track in this category.
                </td>
              </tr>
            ) : (
              strikesList.map((strike) => {
                const s = session.strikes[strike];
                if (!s) return null;

                const parsed = parseStrikeSymbol(strike);

                const isTop3 = highlightTop3 && topStrikes.includes(strike);
                const isDark = theme === "dark";

                // Dynamic theme-aware colors for warning modes and normal modes
                let rowBgClass = "";
                let cellBgClass = "";

                if (s.isDeepLoss) {
                  rowBgClass = isDark
                    ? "bg-[#1C1318] hover:bg-[#2A1922] text-red-200"
                    : "bg-red-50/80 hover:bg-red-100/90 text-red-950 border-red-100";
                  cellBgClass = isDark
                    ? "bg-[#1C1318] group-hover:bg-[#2A1922]"
                    : "bg-red-50 group-hover:bg-red-100";
                } else if (s.isDowntrendActive) {
                  rowBgClass = isDark
                    ? "bg-[#151114] hover:bg-[#20181C] text-orange-200"
                    : "bg-amber-50 hover:bg-amber-100/90 text-amber-950 border-amber-100";
                  cellBgClass = isDark
                    ? "bg-[#151114] group-hover:bg-[#20181C]"
                    : "bg-amber-50 group-hover:bg-amber-100";
                } else {
                  rowBgClass = "bg-trading-surface hover:bg-trading-bg/40 text-trading-textActive";
                  cellBgClass = "bg-trading-surface group-hover:bg-trading-bg/40";
                }

                return (
                  <tr
                    key={strike}
                    className={`group transition duration-300 ${rowBgClass} ${
                      s.trendBadge === "REVERSAL" ? "animate-reversal-border" : ""
                    }`}
                  >
                    {/* Sticky Strike Cell (Read-Only) */}
                    <td className={`py-2 px-3 border-r border-b border-trading-border min-w-[140px] sticky left-0 z-20 ${cellBgClass}`}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-sm font-extrabold text-trading-textActive font-mono">
                              {parsed.strikePrice}
                            </span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                              parsed.optionType === "CE"
                                ? "bg-trading-bullish/10 text-trading-bullish border border-trading-bullish/25"
                                : "bg-trading-bearish/10 text-trading-bearish border border-trading-bearish/25"
                            }`}>
                              {parsed.optionType}
                            </span>
                          </div>

                          {/* Trend Badge */}
                          <div className="flex items-center space-x-1.5">
                            {s.trendBadge === "L_TO_H" && (
                              <span className="rounded bg-trading-bullish/10 px-1.5 py-0.5 text-[9px] font-black text-trading-bullish border border-trading-bullish/20">
                                L to H ▲
                              </span>
                            )}
                            {s.trendBadge === "H_TO_L" && (
                              <span className="rounded bg-trading-bearish/10 px-1.5 py-0.5 text-[9px] font-black text-trading-bearish border border-trading-bearish/20 animate-pulse">
                                H to L ▼
                              </span>
                            )}
                            {s.trendBadge === "REVERSAL" && (
                              <span className="rounded bg-trading-neutral/20 px-1.5 py-0.5 text-[9px] font-black text-trading-neutral border border-trading-neutral/30 animate-pulse">
                                REV ⚡
                              </span>
                            )}
                            {s.trendBadge === "FLAT" && (
                              <span className="rounded bg-trading-border/50 px-1.5 py-0.5 text-[9px] font-sans font-bold text-trading-textMuted border border-trading-border">
                                FLAT
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Top 3 & Call-Down Warnings Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                          {isTop3 && (
                            <span className="rounded bg-yellow-500/25 px-1.5 py-0.5 text-[9px] font-black text-yellow-500 border border-yellow-500/30 animate-pulse">
                              ⭐ TOP 3
                            </span>
                          )}
                          {s.isDeepLoss ? (
                            <span className="rounded bg-red-500/25 px-1.5 py-0.5 text-[9px] font-black text-red-500 border border-red-500/30 animate-pulse">
                              🚨 SEVERE (-15%)
                            </span>
                          ) : s.isDowntrendActive ? (
                            <span className="rounded bg-orange-500/25 px-1.5 py-0.5 text-[9px] font-black text-orange-500 border border-orange-500/30">
                              ⚠️ DOWN 3m
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {/* Day Open Cell */}
                    <td className="py-2 px-3 text-center font-mono text-trading-neutral border-r border-b border-trading-border">
                      {Math.round(s.dayOpen)}
                    </td>

                    {/* Minute-by-Minute Columns */}
                    {sortedTimestamps.map((ts) => {
                      const cell = s.grid.find((c: any) => c.timestamp === ts);
                      if (!cell) {
                        return <td key={ts} className="py-2 px-2 text-center text-trading-border bg-trading-surface/10 border-b border-trading-gridLine">-</td>;
                      }

                      // Highlight all cells matching Day High/Low float values
                      const isCellHigh = cell.ltp === s.dayHigh && s.dayHigh > 0;
                      const isCellLow = cell.ltp === s.dayLow && s.dayLow > 0;

                      let cellClass = "bg-trading-surface/50 text-trading-textMuted";
                      if (isCellHigh) {
                        cellClass = "bg-trading-dayHigh text-white shadow-inner font-bold animate-tick-pulse";
                      } else if (isCellLow) {
                        cellClass = "bg-trading-dayLow text-white shadow-inner font-bold";
                      }

                      return (
                        <td
                          key={ts}
                          title={`Time: ${cell.timestamp} | Price: ${cell.ltp}`}
                          className={`py-2 px-2 text-center font-mono text-xs border-r border-b border-trading-gridLine transition duration-300 ${cellClass} ${
                            s.isDowntrendActive ? "bg-call-down-stripes" : ""
                          }`}
                        >
                          {cell.ltp}
                        </td>
                      );
                    })}

                    {/* Sticky right summaries */}
                    <td className={`py-2 px-3 text-center font-mono text-trading-bullish border-l border-r border-b border-trading-border sticky right-[65px] z-20 w-[65px] min-w-[65px] ${cellBgClass}`}>
                      <span className="bg-trading-bg/25 px-1.5 py-0.5 rounded border border-trading-bullish/10">
                        {Math.round(s.dayHigh)}
                      </span>
                    </td>
                    <td className={`py-2 px-3 text-center font-mono text-trading-bearish border-b border-trading-border sticky right-0 z-20 w-[65px] min-w-[65px] ${cellBgClass}`}>
                      <span className="bg-trading-bg/25 px-1.5 py-0.5 rounded border border-trading-bearish/10">
                        {Math.round(s.dayLow)}
                      </span>
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

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";


export const Module2 = () => {
  const activeSession = useStore((state) => state.activeSession);
  const setActiveSession = useStore((state) => state.setActiveSession);
  const updateSessionStrikes = useStore((state) => state.updateSessionStrikes);

  // Selector state
  const [indexSymbol, setIndexSymbol] = useState("NIFTY50");
  const [expiryDate, setExpiryDate] = useState("2026-06-04");
  const [sessionType, setSessionType] = useState<"CE" | "PE" | "mixed">("mixed");
  const [selectedStrikes, setSelectedStrikes] = useState<string[]>([]);
  
  // Dynamic filter state
  const [sortOrder, setSortOrder] = useState<"high_value" | "low_value" | "default">("default");
  const [priceAbove, setPriceAbove] = useState<number | "">("");
  const [priceBelow, setPriceBelow] = useState<number | "">("");
  const [highlightTop3, setHighlightTop3] = useState(false);
  const [callDownCollapsedToggle, setCallDownCollapsedToggle] = useState(false);
  
  // Expand override for collapsed rows
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Query options chain strikes
  const { data: chainData, isLoading: isChainLoading } = useQuery({
    queryKey: ["option-chain", indexSymbol],
    queryFn: () => api.get(`/api/market/option-chain/${indexSymbol}`),
    enabled: !activeSession
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
      setExpandedRows({});
    }
  });

  // Mutation to swap strikes during the session
  const swapStrikesMutation = useMutation({
    mutationFn: (newStrikes: string[]) =>
      api.put("/api/module2/session/strikes", {
        selectedStrikes: newStrikes
      }),
    onSuccess: (data) => {
      updateSessionStrikes(data.selectedStrikes);
    }
  });

  // CSV Export handler
  const handleExportCSV = async () => {
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
      if (prev.length >= 10) return prev; // max 10 strikes
      return [...prev, strike];
    });
  };

  // Swap strike logic while session is running
  const handleSwapStrike = (oldStrike: string, newStrike: string) => {
    if (!activeSession) return;
    const nextStrikes = activeSession.selectedStrikes.map(s => s === oldStrike ? newStrike : s);
    swapStrikesMutation.mutate(nextStrikes);
  };

  if (!activeSession) {
    // Session Setup Screen
    return (
      <div className="rounded-xl border border-trading-border bg-trading-surface p-6 space-y-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-trading-textMuted">
          Setup options tracker session
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Index Selector */}
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

          {/* Expiry Selector */}
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

          {/* Mode Selector */}
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

        {/* Strikes Chain List */}
        <div>
          <span className="block text-xs font-semibold text-trading-textMuted uppercase mb-3">
            Select strikes from chain ({selectedStrikes.length}/10 selected)
          </span>

          {isChainLoading ? (
            <div className="py-6 text-center text-sm text-trading-textMuted">Generating options chain prices...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {(chainData?.strikes || []).map((s: any) => {
                const ceSelected = selectedStrikes.includes(s.CE);
                const peSelected = selectedStrikes.includes(s.PE);

                return (
                  <div
                    key={s.strikePrice}
                    className="flex flex-col rounded-lg border border-trading-border bg-trading-bg/40 p-2 text-center"
                  >
                    <span className="text-[10px] font-bold text-trading-textMuted font-mono mb-2">{s.strikePrice}</span>
                    <div className="flex space-x-1">
                      {sessionType !== "PE" && (
                        <button
                          onClick={() => toggleStrikeSelection(s.CE)}
                          className={`flex-1 rounded py-1 text-[10px] font-black font-sans transition ${
                            ceSelected
                              ? "bg-emerald-500 text-trading-bg"
                              : "bg-trading-surface text-trading-bullish border border-trading-border hover:bg-trading-border/50"
                          }`}
                        >
                          CE
                        </button>
                      )}
                      {sessionType !== "CE" && (
                        <button
                          onClick={() => toggleStrikeSelection(s.PE)}
                          className={`flex-1 rounded py-1 text-[10px] font-black font-sans transition ${
                            peSelected
                              ? "bg-red-500 text-trading-bg"
                              : "bg-trading-surface text-trading-bearish border border-trading-border hover:bg-trading-border/50"
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
          )}
        </div>

        {/* Start button */}
        <button
          onClick={() => startSessionMutation.mutate()}
          disabled={selectedStrikes.length === 0 || startSessionMutation.isPending}
          className="rounded-lg bg-trading-neutral px-6 py-2.5 text-xs font-bold font-sans text-trading-bg transition hover:opacity-90 disabled:opacity-50"
        >
          Start Session Tracker
        </button>
      </div>
    );
  }

  // Active Tracker Screen
  const maxMinutes = Math.max(0, ...Object.values(activeSession.strikes).map((s) => s.grid.length));
  
  // Fetch available option chain strikes to support swapping
  const availableSwaps = (chainData?.strikes || []).reduce((acc: string[], curr: any) => {
    acc.push(curr.CE);
    acc.push(curr.PE);
    return acc;
  }, []) || [];

  // Determine top 3 performers
  const topStrikes = Object.values(activeSession.strikes)
    .sort((a, b) => b.pctChange - a.pctChange)
    .slice(0, 3)
    .map(s => s.strike);

  // Apply sorting and filtering
  const processedStrikes = [...activeSession.selectedStrikes]
    .filter((strike) => {
      const s = activeSession.strikes[strike];
      if (!s) return true;
      const latestLtp = s.grid.length > 0 ? s.grid[s.grid.length - 1].ltp : s.dayOpen;
      
      // Price Above check
      if (priceAbove !== "" && latestLtp < Number(priceAbove)) return false;
      // Price Below check
      if (priceBelow !== "" && latestLtp > Number(priceBelow)) return false;
      
      return true;
    })
    .sort((a, b) => {
      const stateA = activeSession.strikes[a];
      const stateB = activeSession.strikes[b];
      if (!stateA || !stateB) return 0;
      
      const ltpA = stateA.grid.length > 0 ? stateA.grid[stateA.grid.length - 1].ltp : stateA.dayOpen;
      const ltpB = stateB.grid.length > 0 ? stateB.grid[stateB.grid.length - 1].ltp : stateB.dayOpen;

      if (sortOrder === "high_value") return ltpB - ltpA;
      if (sortOrder === "low_value") return ltpA - ltpB;
      
      return 0; // Default selected order
    });

  return (
    <div className="space-y-6">
      {/* 1. Tracker Toolbar (Filters and Exports) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-xl border border-trading-border bg-trading-surface p-4">
        {/* Sort & Collapsed controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-trading-textMuted uppercase mr-2">Sort:</span>
            {(["default", "high_value", "low_value"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setSortOrder(o)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-bold font-sans transition ${
                  sortOrder === o
                    ? "bg-trading-neutral text-trading-bg"
                    : "bg-trading-bg text-trading-textMuted border border-trading-border hover:text-trading-textActive"
                }`}
              >
                {o.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => setHighlightTop3(!highlightTop3)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-bold font-sans border transition ${
              highlightTop3
                ? "bg-amber-500/20 text-yellow-500 border-amber-500/30"
                : "bg-trading-bg text-trading-textMuted border-trading-border"
            }`}
          >
            HIGHLIGHT TOP 3 (GOLD)
          </button>

          <button
            onClick={() => setCallDownCollapsedToggle(!callDownCollapsedToggle)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-bold font-sans border transition ${
              callDownCollapsedToggle
                ? "bg-red-500/20 text-trading-bearish border-red-500/30"
                : "bg-trading-bg text-trading-textMuted border-trading-border"
            }`}
          >
            COLLAPSE DOWN ROWS
          </button>
        </div>

        {/* Input price filters & CSV Download */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <span className="text-[10px] font-bold text-trading-textMuted uppercase">Above:</span>
            <input
              type="number"
              value={priceAbove}
              onChange={(e) => setPriceAbove(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Min"
              className="w-16 rounded border border-trading-border bg-trading-bg px-2 py-1 text-xs text-trading-textActive font-mono focus:outline-none"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-[10px] font-bold text-trading-textMuted uppercase">Below:</span>
            <input
              type="number"
              value={priceBelow}
              onChange={(e) => setPriceBelow(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Max"
              className="w-16 rounded border border-trading-border bg-trading-bg px-2 py-1 text-xs text-trading-textActive font-mono focus:outline-none"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="rounded-lg bg-trading-neutral/20 border border-trading-neutral/30 text-trading-neutral hover:bg-trading-neutral/30 px-4 py-1.5 text-[10px] font-bold font-sans tracking-wide transition active:scale-95 ml-2"
          >
            DOWNLOAD CSV
          </button>
        </div>
      </div>

      {/* 2. Horizontal Grid Table */}
      <div className="rounded-xl border border-trading-border bg-trading-surface overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans select-none">
            <thead>
              <tr className="border-b border-trading-border bg-trading-bg text-[10px] font-bold uppercase tracking-wider text-trading-textMuted">
                <th className="py-3 px-4 min-w-[200px]">Strike Symbol</th>
                <th className="py-3 px-3 text-right">Open</th>
                {Array.from({ length: maxMinutes }).map((_, m) => {
                  // Find timestamp for this column index
                  const firstStrikeKey = Object.keys(activeSession.strikes)[0];
                  const timeStr = activeSession.strikes[firstStrikeKey]?.grid[m]?.timestamp || `${m}`;
                  return (
                    <th key={m} className="py-3 px-2 text-center font-mono font-medium text-[9px] min-w-[50px]">
                      {timeStr}
                    </th>
                  );
                })}
                <th className="py-3 px-3 text-center border-l border-trading-border">High</th>
                <th className="py-3 px-3 text-center">Low</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trading-gridLine text-xs font-semibold">
              {processedStrikes.map((strike) => {
                const s = activeSession.strikes[strike];
                if (!s) return null;

                const isTop3 = highlightTop3 && topStrikes.includes(strike);
                const isCollapsed = callDownCollapsedToggle && s.isDowntrendActive && !expandedRows[strike];

                // Collapse row rendering
                if (isCollapsed) {
                  return (
                    <tr
                      key={strike}
                      onClick={() => setExpandedRows(prev => ({ ...prev, [strike]: true }))}
                      className="cursor-pointer bg-red-950/20 hover:bg-red-950/30 transition border-l-4 border-trading-bearish"
                    >
                      <td colSpan={maxMinutes + 4} className="py-1 px-4 text-[9px] font-bold text-trading-bearish flex items-center space-x-2">
                        <span>⚠️</span>
                        <span>[COLLAPSED] {strike} is in a sustained downtrend. Click to expand.</span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={strike}
                    className={`transition duration-300 ${
                      s.isDeepLoss
                        ? "bg-red-950/20 hover:bg-red-950/35"
                        : s.isDowntrendActive
                        ? "bg-red-950/10 hover:bg-red-950/20"
                        : "hover:bg-trading-bg/40"
                    } ${isTop3 ? "border-2 border-yellow-500/80 shadow-md" : ""}`}
                  >
                    {/* Header Item */}
                    <td className={`py-2 px-4 border-r border-trading-border min-w-[200px] flex items-center justify-between gap-2`}>
                      <div className="flex items-center space-x-2">
                        {s.isDeepLoss && <span className="text-trading-bearish">⚠️</span>}
                        {/* Swap Select Dropdown */}
                        <select
                          value={strike}
                          onChange={(e) => handleSwapStrike(strike, e.target.value)}
                          className="bg-transparent text-xs font-bold text-trading-textActive focus:outline-none cursor-pointer"
                        >
                          <option value={strike}>{strike}</option>
                          {availableSwaps
                            .filter((option: string) => !activeSession.selectedStrikes.includes(option))
                            .map((option: string) => (
                              <option key={option} value={option}>{option}</option>
                            ))
                          }
                        </select>
                      </div>

                      {/* Trend Badge */}
                      <div className="flex items-center space-x-1.5">
                        {s.trendBadge === "L_TO_H" && (
                          <span className="rounded bg-trading-bullish/10 px-2 py-0.5 text-[9px] font-black text-trading-bullish border border-trading-bullish/20">
                            L to H ▲
                          </span>
                        )}
                        {s.trendBadge === "H_TO_L" && (
                          <span className="rounded bg-trading-bearish/10 px-2 py-0.5 text-[9px] font-black text-trading-bearish border border-trading-bearish/20 animate-pulse">
                            H to L ▼
                          </span>
                        )}
                        {s.trendBadge === "REVERSAL" && (
                          <span className="rounded bg-trading-neutral/20 px-2 py-0.5 text-[9px] font-black text-trading-neutral border border-trading-neutral/30 animate-pulse">
                            REV ⚡
                          </span>
                        )}
                        {s.trendBadge === "FLAT" && (
                          <span className="rounded bg-trading-border/50 px-1.5 py-0.5 text-[9px] font-sans font-bold text-trading-textMuted border border-trading-border">
                            FLAT
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Day Open Baseline */}
                    <td className="py-2 px-3 text-right font-mono text-trading-textMuted border-r border-trading-border">
                      {s.dayOpen}
                    </td>

                    {/* Minute-by-Minute cells */}
                    {Array.from({ length: maxMinutes }).map((_, m) => {
                      const cell = s.grid[m];
                      if (!cell) {
                        return <td key={m} className="py-2 px-2 text-center text-trading-border bg-trading-surface/10">-</td>;
                      }

                      // High / Low Color coding
                      let cellClass = "bg-trading-surface/50 text-trading-textMuted";
                      if (cell.isHigh) {
                        cellClass = "bg-trading-dayHigh text-white shadow-inner font-bold animate-tick-pulse";
                      } else if (cell.isLow) {
                        cellClass = "bg-trading-dayLow text-white shadow-inner font-bold";
                      }

                      return (
                        <td
                          key={m}
                          title={`Time: ${cell.timestamp} | Price: ${cell.ltp}`}
                          className={`py-2 px-2 text-center font-mono text-xs border-r border-trading-gridLine transition duration-300 relative ${cellClass} ${
                            s.isDowntrendActive ? "bg-call-down-stripes" : ""
                          }`}
                        >
                          {cell.ltp}
                        </td>
                      );
                    })}

                    {/* Day High / Low Summaries */}
                    <td className="py-2 px-3 text-center font-mono text-trading-bullish border-l border-trading-border bg-trading-bg/10">
                      {s.dayHigh}
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-trading-bearish bg-trading-bg/10">
                      {s.dayLow}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Module2;

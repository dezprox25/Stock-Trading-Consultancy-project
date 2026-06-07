import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";
import {
  getClassicPivots,
  getCamarillaPivots,
  getFibonacciPivots,
  getCallState,
  getPutState
} from "../utils/pivots";
import { Candle } from "@stock/shared";
import { useEffect, useRef, useState } from "react";

// ── Unchanged signal maps ─────────────────────────────────────────────────────
const CALL_COLOR_MAP: Record<string, { bg: string; text: string; label: string; desc: string }> = {
  CALL_BULLISH: { bg: "bg-trading-bullish", text: "text-white", label: "CALL BULLISH", desc: "Strong bullish — conditions favourable for calls" },
  CALL_NEAR_RESISTANCE: { bg: "bg-amber-500", text: "text-white", label: "NEAR RESISTANCE", desc: "Watch closely — potential breakout or rejection" },
  CALL_POSITIVE_BIAS: { bg: "bg-emerald-500/10 border border-trading-bullish/30", text: "text-trading-bullish", label: "POSITIVE BIAS", desc: "Price above equilibrium — call-friendly territory" },
  CALL_NEUTRAL: { bg: "bg-yellow-500/10 border border-yellow-500/30", text: "text-yellow-500", label: "NEUTRAL", desc: "At pivot — indecision zone, wait for direction" },
  CALL_BEARISH_BIAS: { bg: "bg-red-500/10 border border-trading-bearish/30", text: "text-trading-bearish", label: "BEARISH BIAS", desc: "Price below equilibrium — not ideal for call view" },
  CALL_BEARISH: { bg: "bg-trading-bearish", text: "text-white", label: "CALL BEARISH", desc: "Avoid call view — price breaking down" },
  DIVERGENCE_WARNING: { bg: "bg-orange-500", text: "text-white", label: "DIVERGENCE WARNING", desc: "Data mismatch — verify prices before forming a view" }
};

const PUT_COLOR_MAP: Record<string, { bg: string; text: string; label: string; desc: string }> = {
  PUT_BULLISH: { bg: "bg-trading-bullish", text: "text-white", label: "PUT BULLISH", desc: "Conditions favourable for puts" },
  PUT_NEAR_SUPPORT: { bg: "bg-amber-500", text: "text-white", label: "NEAR SUPPORT", desc: "Watch closely — potential breakdown or bounce" },
  PUT_POSITIVE_BIAS: { bg: "bg-emerald-500/10 border border-trading-bullish/30", text: "text-trading-bullish", label: "POSITIVE BIAS", desc: "Price below equilibrium — put-friendly territory" },
  PUT_NEUTRAL: { bg: "bg-yellow-500/10 border border-yellow-500/30", text: "text-yellow-500", label: "NEUTRAL", desc: "At pivot — indecision zone, wait for direction" },
  PUT_BEARISH_BIAS: { bg: "bg-red-500/10 border border-trading-bearish/30", text: "text-trading-bearish", label: "BEARISH BIAS", desc: "Price above equilibrium — not ideal for put view" },
  PUT_BEARISH: { bg: "bg-trading-bearish", text: "text-white", label: "PUT BEARISH", desc: "Avoid put view — price breaking up" },
  SENTIMENT_ALERT: { bg: "bg-trading-sentiment", text: "text-white", label: "SENTIMENT ALERT", desc: "OI indicates extreme sentiment — review before deciding" }
};

// ── Subtle grid background (matches Auth.tsx canvas aesthetic) ────────────────
function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(4,120,87,0.07)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <circle cx="50%" cy="50%" r="35%" fill="none" stroke="rgba(4,120,87,0.04)" strokeWidth="1"/>
        <circle cx="50%" cy="50%" r="20%" fill="none" stroke="rgba(4,120,87,0.03)" strokeWidth="0.5"/>
      </svg>
    </div>
  );
}

// ── Scope corner brackets (reused from Auth.tsx) ──────────────────────────────
function ScopeCorners({ color = "#047857", size = 10 }: { color?: string; size?: number }) {
  const s = `${size}px`;
  const style = { background: color };
  return (
    <>
      <span className="absolute top-0 left-0" style={{ width: s, height: "1px", ...style }} />
      <span className="absolute top-0 left-0" style={{ width: "1px", height: s, ...style }} />
      <span className="absolute top-0 right-0" style={{ width: s, height: "1px", ...style }} />
      <span className="absolute top-0 right-0" style={{ width: "1px", height: s, ...style }} />
      <span className="absolute bottom-0 left-0" style={{ width: s, height: "1px", ...style }} />
      <span className="absolute bottom-0 left-0" style={{ width: "1px", height: s, ...style }} />
      <span className="absolute bottom-0 right-0" style={{ width: s, height: "1px", ...style }} />
      <span className="absolute bottom-0 right-0" style={{ width: "1px", height: s, ...style }} />
    </>
  );
}

// ── Live price flash badge ────────────────────────────────────────────────────
function PriceDisplay({
  label, value, flash, sub
}: { label: string; value: number; flash: "up" | "down" | null; sub?: string }) {
  const GREEN = "#047857";
  const RED = "#B91C1C";
  const flashColor = flash === "up" ? GREEN : flash === "down" ? RED : "#0f172a";

  return (
    <div
      className="relative flex flex-col gap-1 px-5 py-4 rounded-sm overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.97)",
        border: "1.5px solid rgba(4,120,87,0.18)",
        boxShadow: "0 2px 16px rgba(4,120,87,0.06)",
        minWidth: 140,
        animation: "card-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      <ScopeCorners size={7} />
      <span
        className="font-mono text-[9px] font-bold tracking-[0.3em] uppercase"
        style={{ color: "#64748b" }}
      >
        {label}
      </span>
      <span
        className="font-mono font-bold transition-colors duration-300"
        style={{ fontSize: 22, color: flashColor, letterSpacing: "-0.02em" }}
      >
        {value > 0 ? value.toFixed(1) : "—"}
        {flash && (
          <span style={{ fontSize: 12, marginLeft: 4, color: flashColor }}>
            {flash === "up" ? "▲" : "▼"}
          </span>
        )}
      </span>
      {sub && (
        <span className="font-mono text-[9px]" style={{ color: "#94a3b8" }}>{sub}</span>
      )}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{
          background: flash
            ? `linear-gradient(90deg, transparent, ${flashColor}, transparent)`
            : "linear-gradient(90deg, transparent, rgba(4,120,87,0.2), transparent)",
          transition: "background 0.3s",
        }}
      />
    </div>
  );
}

// ── Pivot level pill ──────────────────────────────────────────────────────────
function PivotPill({
  label, value, type
}: { label: string; value: number; type: "resistance" | "support" | "pivot" }) {
  const colors = {
    resistance: { border: "rgba(4,120,87,0.3)", text: "#047857", bg: "rgba(4,120,87,0.04)", dot: "#047857" },
    support:    { border: "rgba(185,28,28,0.25)", text: "#B91C1C", bg: "rgba(185,28,28,0.04)", dot: "#B91C1C" },
    pivot:      { border: "rgba(71,85,105,0.25)", text: "#334155", bg: "rgba(71,85,105,0.04)", dot: "#475569" },
  }[type];

  return (
    <div
      className="relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-sm"
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, minWidth: 70 }}
    >
      <span className="font-mono text-[8px] font-black tracking-[0.3em] uppercase" style={{ color: colors.dot }}>
        {label}
      </span>
      <span className="font-mono font-bold text-sm" style={{ color: colors.text, letterSpacing: "-0.02em" }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// ── Institutional signal card ─────────────────────────────────────────────────
function SignalCard({
  title, state, map, icon
}: { title: string; state: string; map: typeof CALL_COLOR_MAP; icon: React.ReactNode }) {
  const GREEN = "#047857";
  const defaultProps = { label: "NO SIGNAL", desc: "Awaiting market feed...", bg: "", text: "" };
  const props = map[state] || defaultProps;

  const isNull = !map[state];
  const isBullish = state.includes("BULLISH") || state.includes("POSITIVE");
  const isBearish = state.includes("BEARISH");
  const isWarning = state.includes("WARNING") || state.includes("ALERT") || state.includes("NEAR");
  const isNeutral = state.includes("NEUTRAL");

  const accentColor = isNull ? "#94a3b8"
    : isBullish ? GREEN
    : isBearish ? "#B91C1C"
    : isWarning ? "#D97706"
    : "#475569";

  const bgColor = isNull ? "rgba(148,163,184,0.06)"
    : isBullish ? "rgba(4,120,87,0.05)"
    : isBearish ? "rgba(185,28,28,0.05)"
    : isWarning ? "rgba(217,119,6,0.05)"
    : "rgba(71,85,105,0.05)";

  return (
    <div
      className="relative flex-1 rounded-sm overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.97)",
        border: `1.5px solid ${accentColor}33`,
        boxShadow: `0 2px 20px ${accentColor}0d`,
        animation: "card-enter 0.6s cubic-bezier(0.16,1,0.3,1) both",
        animationDelay: "0.1s",
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accentColor, opacity: 0.6 }} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[9px] font-bold tracking-[0.3em] uppercase" style={{ color: "#64748b" }}>
            {title}
          </span>
          <span style={{ color: accentColor, opacity: 0.7 }}>{icon}</span>
        </div>

        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm mb-3"
          style={{ background: bgColor, border: `1px solid ${accentColor}30` }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
          />
          <span className="font-mono text-[11px] font-black tracking-wider uppercase" style={{ color: accentColor }}>
            {props.label}
          </span>
        </div>

        <p className="font-mono text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
          {props.desc}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const Module1 = () => {
  // ── All original state & hooks — UNTOUCHED ────────────────────────────────
  const selectedSymbol = useStore((state) => state.selectedSymbol);
  const selectedTimeframe = useStore((state) => state.selectedTimeframe);
  const selectedMethod = useStore((state) => state.selectedMethod);
  const setSelectedTimeframe = useStore((state) => state.setSelectedTimeframe);
  const setSelectedMethod = useStore((state) => state.setSelectedMethod);

  const prices = useStore((state) => state.prices);

  const prevFutPriceRef = useRef<number>(0);
  const prevSpotPriceRef = useRef<number>(0);
  const [futFlash, setFutFlash] = useState<"up" | "down" | null>(null);
  const [spotFlash, setSpotFlash] = useState<"up" | "down" | null>(null);

  const spotPriceObj = prices["NIFTY-SPOT"];
  const futPriceObj = prices[selectedSymbol];
  const spotLtp = spotPriceObj ? spotPriceObj.ltp : 0;
  const futLtp = futPriceObj ? futPriceObj.ltp : 0;

  useEffect(() => {
    if (futLtp > 0) {
      if (prevFutPriceRef.current > 0 && futLtp !== prevFutPriceRef.current) {
        setFutFlash(futLtp > prevFutPriceRef.current ? "up" : "down");
        const t = setTimeout(() => setFutFlash(null), 300);
        return () => clearTimeout(t);
      }
      prevFutPriceRef.current = futLtp;
    }
  }, [futLtp]);

  useEffect(() => {
    if (spotLtp > 0) {
      if (prevSpotPriceRef.current > 0 && spotLtp !== prevSpotPriceRef.current) {
        setSpotFlash(spotLtp > prevSpotPriceRef.current ? "up" : "down");
        const t = setTimeout(() => setSpotFlash(null), 300);
        return () => clearTimeout(t);
      }
      prevSpotPriceRef.current = spotLtp;
    }
  }, [spotLtp]);

  const { data: ohlcBars = [], isLoading } = useQuery<Candle[]>({
    queryKey: ["ohlc", selectedSymbol, selectedTimeframe],
    queryFn: () => api.get(`/api/market/ohlc/${selectedSymbol}/${selectedTimeframe}`),
    enabled: !!selectedSymbol
  });

  const getPivotFormula = (method: string) => {
    if (method === "camarilla") return getCamarillaPivots;
    if (method === "fibonacci") return getFibonacciPivots;
    return getClassicPivots;
  };

  const getIndicatorProps = (state: string, isCall: boolean) => {
    const defaultProps = { bg: "bg-trading-surface border border-trading-border", text: "text-trading-textMuted", label: "NO SIGNAL", desc: "Awaiting market feed..." };
    const map = isCall ? CALL_COLOR_MAP : PUT_COLOR_MAP;
    return map[state] || defaultProps;
  };

  const tableRows = ohlcBars.map((bar, index, arr) => {
    const timeLabel = new Date(bar.openTime).toLocaleTimeString("en-US", {
      hour12: false, hour: "2-digit", minute: "2-digit"
    });
    const prevBar = index > 0 ? arr[index - 1] : bar;
    const calcFn = getPivotFormula(selectedMethod);
    const pivots = calcFn(prevBar.high, prevBar.low, prevBar.close);
    const callState = getCallState(bar.close, pivots.p, pivots.r1, pivots.s1, spotLtp || bar.close);
    const putState = getPutState(bar.close, pivots.p, pivots.r1, pivots.s1, spotLtp || bar.close);
    return { time: timeLabel, open: bar.open, high: bar.high, low: bar.low, close: bar.close, pivots, callState, putState };
  });

  // Latest row for overview cards and signal cards
  const latestRow = tableRows.length > 0 ? [...tableRows].reverse()[0] : null;
  const spread = futLtp > 0 && spotLtp > 0 ? (futLtp - spotLtp) : 0;

  const GREEN = "#047857";
  const GREEN_GLOW = "rgba(4,120,87,0.15)";
  const BORDER = "rgba(4,120,87,0.18)";

  const methodLabels: Record<string, string> = {
    classic: "Classic Pivot",
    camarilla: "Camarilla Pivot",
    fibonacci: "Fibonacci Pivot",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

        @keyframes card-enter {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes scan-line {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(2000px); opacity: 0; }
        }

        @keyframes row-enter {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .m1-scan {
          position: fixed;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(4,120,87,0.4), rgba(4,120,87,0.6), rgba(4,120,87,0.4), transparent);
          animation: scan-line 8s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }

        .m1-table tr { animation: row-enter 0.3s ease both; }
        .m1-table tr:nth-child(1) { animation-delay: 0.05s; }
        .m1-table tr:nth-child(2) { animation-delay: 0.08s; }
        .m1-table tr:nth-child(3) { animation-delay: 0.11s; }
        .m1-table tr:nth-child(4) { animation-delay: 0.14s; }
        .m1-table tr:nth-child(5) { animation-delay: 0.17s; }

        .m1-tr:hover { background: rgba(4,120,87,0.03) !important; }
        .m1-tr:hover td:first-child { color: ${GREEN}; }

        .m1-method-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 6px 16px;
          border-radius: 2px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .m1-method-active {
          background: ${GREEN};
          color: #fff;
          border-color: ${GREEN};
          box-shadow: 0 2px 12px ${GREEN_GLOW};
        }

        .m1-method-inactive {
          background: transparent;
          color: #64748b;
          border-color: rgba(4,120,87,0.2);
        }

        .m1-method-inactive:hover {
          color: ${GREEN};
          border-color: ${GREEN};
          background: rgba(4,120,87,0.04);
        }

        .pivot-table-wrap {
          overflow-x: auto;
          border-radius: 2px;
          border: 1.5px solid ${BORDER};
          box-shadow: 0 4px 24px rgba(4,120,87,0.06);
          background: rgba(255,255,255,0.97);
          position: relative;
        }

        .pivot-table-wrap::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, ${GREEN}80, transparent);
        }

        .m1-th {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          padding: 12px 12px;
          white-space: nowrap;
          color: #64748b;
          background: rgba(248,250,252,0.95);
          border-bottom: 1px solid rgba(4,120,87,0.12);
          position: sticky;
          top: 0;
          z-index: 2;
        }

        .m1-td {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          padding: 10px 12px;
          white-space: nowrap;
          border-bottom: 1px solid rgba(4,120,87,0.06);
          color: #334155;
        }

        .m1-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px;
          border-radius: 2px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .glow-text { text-shadow: 0 0 12px ${GREEN_GLOW}; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <GridBackground />
      <div className="m1-scan" />

      <div className="relative min-h-screen" style={{ background: "#f4f6f9", fontFamily: "'Inter', sans-serif", zIndex: 2 }}>
        <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div
            className="relative flex items-center justify-between px-6 py-5 rounded-sm overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.97)",
              border: `1.5px solid ${BORDER}`,
              boxShadow: `0 4px 24px rgba(4,120,87,0.07)`,
              animation: "card-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
            }}
          >
            <ScopeCorners size={10} />
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GREEN}60, transparent)` }} />

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
                <span className="mono text-[9px] font-bold tracking-[0.35em] uppercase glow-text" style={{ color: GREEN }}>
                  MODULE 01
                </span>
              </div>
              <div className="w-px h-5" style={{ background: `${GREEN}30` }} />
              <h1 className="mono font-black tracking-[0.12em] uppercase" style={{ fontSize: 16, color: "#0f172a" }}>
                Live Pivot Intelligence
              </h1>
              <div className="w-px h-5" style={{ background: `${GREEN}30` }} />
              <span className="mono text-[10px] font-bold tracking-wider" style={{ color: "#64748b" }}>
                {selectedSymbol}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm" style={{ background: "rgba(4,120,87,0.05)", border: "1px solid rgba(4,120,87,0.15)" }}>
                <span className="mono text-[9px] font-bold tracking-wider uppercase" style={{ color: "#94a3b8" }}>TF</span>
                <span className="mono text-[11px] font-black" style={{ color: GREEN }}>{selectedTimeframe}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm" style={{ background: "rgba(4,120,87,0.05)", border: "1px solid rgba(4,120,87,0.15)" }}>
                <span className="mono text-[9px] font-bold tracking-wider uppercase" style={{ color: "#94a3b8" }}>Formula</span>
                <span className="mono text-[11px] font-black" style={{ color: GREEN }}>{methodLabels[selectedMethod] || selectedMethod}</span>
              </div>
            </div>
          </div>

          {/* ── Market Overview Cards ─────────────────────────────────────── */}
          <div className="flex flex-wrap gap-4">
            <PriceDisplay label="Spot LTP" value={spotLtp} flash={spotFlash} sub="NIFTY-SPOT" />
            <PriceDisplay label="Futures LTP" value={futLtp} flash={futFlash} sub={selectedSymbol} />
            <PriceDisplay
              label="Spread"
              value={Math.abs(spread)}
              flash={null}
              sub={spread > 0 ? "FUT PREMIUM" : spread < 0 ? "FUT DISCOUNT" : "—"}
            />
            {latestRow && (
              <PriceDisplay label="Last Close" value={latestRow.close} flash={null} sub={`${latestRow.time} candle`} />
            )}
          </div>

          {/* ── Formula Selector ─────────────────────────────────────────── */}
          <div
            className="flex items-center gap-3 px-5 py-4 rounded-sm"
            style={{
              background: "rgba(255,255,255,0.97)",
              border: `1.5px solid ${BORDER}`,
              boxShadow: "0 2px 12px rgba(4,120,87,0.05)",
              animation: "card-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: "0.05s",
            }}
          >
            <span className="mono text-[9px] font-bold tracking-[0.3em] uppercase mr-2" style={{ color: "#94a3b8" }}>
              Pivot Formula
            </span>
            <div className="w-px h-4" style={{ background: `${GREEN}30` }} />
            {[
              { key: "classic", label: "Classic" },
              { key: "camarilla", label: "Camarilla" },
              { key: "fibonacci", label: "Fibonacci" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMethod(m.key as any)}
                className={`m1-method-btn ${selectedMethod === m.key ? "m1-method-active" : "m1-method-inactive"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* ── Pivot Levels Panel ───────────────────────────────────────── */}
          {latestRow && (
            <div
              className="relative rounded-sm overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.97)",
                border: `1.5px solid ${BORDER}`,
                boxShadow: "0 2px 16px rgba(4,120,87,0.05)",
                animation: "card-enter 0.55s cubic-bezier(0.16,1,0.3,1) both",
                animationDelay: "0.08s",
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GREEN}60, transparent)` }} />
              <div className="px-5 pt-4 pb-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
                <span className="mono text-[9px] font-black tracking-[0.3em] uppercase" style={{ color: "#64748b" }}>
                  Current Pivot Levels — {latestRow.time}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 px-5 py-4">
                {["r3", "r2", "r1"].map((k) => (
                  <PivotPill key={k} label={k.toUpperCase()} value={(latestRow.pivots as any)[k]} type="resistance" />
                ))}
                <PivotPill label="P" value={latestRow.pivots.p} type="pivot" />
                {["s1", "s2", "s3"].map((k) => (
                  <PivotPill key={k} label={k.toUpperCase()} value={(latestRow.pivots as any)[k]} type="support" />
                ))}
              </div>
            </div>
          )}

          {/* ── Signal Cards ─────────────────────────────────────────────── */}
          {latestRow && (
            <div className="flex gap-4">
              <SignalCard
                title="Call Signal — Latest"
                state={latestRow.callState}
                map={CALL_COLOR_MAP}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                  </svg>
                }
              />
              <SignalCard
                title="Put Signal — Latest"
                state={latestRow.putState}
                map={PUT_COLOR_MAP}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
                  </svg>
                }
              />
            </div>
          )}

          {/* ── Historical Data Table ─────────────────────────────────────── */}
          <div
            style={{ animation: "card-enter 0.65s cubic-bezier(0.16,1,0.3,1) both", animationDelay: "0.12s" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
              <span className="mono text-[9px] font-black tracking-[0.3em] uppercase" style={{ color: "#64748b" }}>
                Historical Pivot Data
              </span>
            </div>

            <div className="pivot-table-wrap">
              <table className="w-full text-left m1-table" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Time","Spot LTP","Fut LTP","Open","High","Close","P","R1","R2","R3","S1","S2","S3","Call Signal","Put Signal"].map((h, i) => (
                      <th
                        key={i}
                        className="m1-th"
                        style={{
                          textAlign: i >= 1 && i <= 5 ? "right" : i >= 6 && i <= 12 ? "center" : "left",
                          color: i >= 7 && i <= 9 ? GREEN : i >= 10 && i <= 12 ? "#B91C1C" : "#64748b",
                          borderLeft: i === 6 || i === 13 ? "1px solid rgba(4,120,87,0.1)" : undefined,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={15} className="m1-td text-center py-10" style={{ color: "#94a3b8" }}>
                        Loading market data…
                      </td>
                    </tr>
                  ) : tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="m1-td text-center py-10" style={{ color: "#94a3b8" }}>
                        Awaiting finalized timeframe boundaries. Spot index simulator is running.
                      </td>
                    </tr>
                  ) : (
                    [...tableRows].reverse().map((row, idx) => {
                      const isLatest = idx === 0;
                      const displaySpot = isLatest && spotLtp > 0 ? spotLtp : row.close - 35;
                      const displayFut  = isLatest && futLtp > 0  ? futLtp  : row.close;

                      const callProps = getIndicatorProps(row.callState, true);
                      const putProps  = getIndicatorProps(row.putState, false);

                      const isCallBull = row.callState.includes("BULLISH") || row.callState.includes("POSITIVE");
                      const isCallBear = row.callState.includes("BEARISH");
                      const isPutBull  = row.putState.includes("BULLISH") || row.putState.includes("POSITIVE");
                      const isPutBear  = row.putState.includes("BEARISH");

                      const callBadgeStyle = {
                        background: isCallBull ? "rgba(4,120,87,0.08)" : isCallBear ? "rgba(185,28,28,0.07)" : "rgba(71,85,105,0.07)",
                        border: `1px solid ${isCallBull ? "rgba(4,120,87,0.25)" : isCallBear ? "rgba(185,28,28,0.2)" : "rgba(71,85,105,0.15)"}`,
                        color: isCallBull ? GREEN : isCallBear ? "#B91C1C" : "#475569",
                      };
                      const putBadgeStyle = {
                        background: isPutBull ? "rgba(4,120,87,0.08)" : isPutBear ? "rgba(185,28,28,0.07)" : "rgba(71,85,105,0.07)",
                        border: `1px solid ${isPutBull ? "rgba(4,120,87,0.25)" : isPutBear ? "rgba(185,28,28,0.2)" : "rgba(71,85,105,0.15)"}`,
                        color: isPutBull ? GREEN : isPutBear ? "#B91C1C" : "#475569",
                      };

                      return (
                        <tr
                          key={idx}
                          className="m1-tr transition-colors duration-150"
                          style={{ background: isLatest ? "rgba(4,120,87,0.025)" : "transparent" }}
                        >
                          <td className="m1-td font-bold" style={{ color: isLatest ? GREEN : "#0f172a" }}>
                            {row.time}
                            {isLatest && (
                              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm mono" style={{ fontSize: 8, background: "rgba(4,120,87,0.1)", color: GREEN, fontWeight: 800, letterSpacing: "0.1em" }}>
                                LIVE
                              </span>
                            )}
                          </td>
                          <td className="m1-td text-right" style={{
                            color: isLatest && spotFlash === "up" ? GREEN : isLatest && spotFlash === "down" ? "#B91C1C" : "#334155",
                            fontWeight: isLatest ? 700 : 400,
                            transition: "color 0.3s",
                          }}>
                            {displaySpot.toFixed(1)}
                          </td>
                          <td className="m1-td text-right" style={{
                            color: isLatest && futFlash === "up" ? GREEN : isLatest && futFlash === "down" ? "#B91C1C" : "#0f172a",
                            fontWeight: isLatest ? 700 : 400,
                            transition: "color 0.3s",
                          }}>
                            {displayFut.toFixed(1)}
                          </td>
                          <td className="m1-td text-right" style={{ color: "#94a3b8" }}>{row.open.toFixed(1)}</td>
                          <td className="m1-td text-right" style={{ color: "#94a3b8" }}>{row.high.toFixed(1)}</td>
                          <td className="m1-td text-right font-semibold" style={{ color: "#0f172a" }}>{row.close.toFixed(1)}</td>

                          <td className="m1-td text-center" style={{ borderLeft: "1px solid rgba(4,120,87,0.08)", color: "#475569", fontWeight: 600 }}>{row.pivots.p.toFixed(1)}</td>
                          <td className="m1-td text-center" style={{ color: GREEN, fontWeight: 600 }}>{row.pivots.r1.toFixed(1)}</td>
                          <td className="m1-td text-center" style={{ color: GREEN }}>{row.pivots.r2.toFixed(1)}</td>
                          <td className="m1-td text-center" style={{ color: GREEN }}>{row.pivots.r3.toFixed(1)}</td>
                          <td className="m1-td text-center" style={{ color: "#B91C1C", fontWeight: 600 }}>{row.pivots.s1.toFixed(1)}</td>
                          <td className="m1-td text-center" style={{ color: "#B91C1C" }}>{row.pivots.s2.toFixed(1)}</td>
                          <td className="m1-td text-center" style={{ color: "#B91C1C" }}>{row.pivots.s3.toFixed(1)}</td>

                          <td className="m1-td text-center" style={{ borderLeft: "1px solid rgba(4,120,87,0.08)" }}>
                            <span className="m1-badge" style={callBadgeStyle}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                              {callProps.label}
                            </span>
                          </td>
                          <td className="m1-td text-center">
                            <span className="m1-badge" style={putBadgeStyle}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                              {putProps.label}
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

        </div>
      </div>
    </>
  );
};

export default Module1;
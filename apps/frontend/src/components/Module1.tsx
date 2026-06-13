import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";
import {
  getClassicPivots,
  getCamarillaPivots,
  getFibonacciPivots,
  getCallState,
  getPutState,
} from "../utils/pivots";
import { Candle } from "@stock/shared";
import { useEffect, useRef, useState } from "react";

const GREEN = "#047857";
const RED = "#E53935";

// ── Signal state maps ─────────────────────────────────────────────────────────
const CALL_COLOR_MAP: Record<string, { bg: string; text: string; label: string; desc: string }> = {
  CALL_BULLISH:          { bg: GREEN,           text: "#fff",     label: "CALL BULLISH",      desc: "Strong bullish — conditions favourable for calls" },
  CALL_NEAR_RESISTANCE:  { bg: "#F97316",        text: "#fff",     label: "NEAR RESISTANCE",   desc: "Watch closely — potential breakout or rejection" },
  CALL_POSITIVE_BIAS:    { bg: "#d1fae5",        text: GREEN,      label: "POSITIVE BIAS",     desc: "Price above equilibrium — call-friendly territory" },
  CALL_NEUTRAL:          { bg: "#fef9c3",        text: "#92400e",  label: "NEUTRAL",           desc: "At pivot — indecision zone, wait for direction" },
  CALL_BEARISH_BIAS:     { bg: "#fee2e2",        text: RED,        label: "BEARISH BIAS",      desc: "Price below equilibrium — not ideal for call view" },
  CALL_BEARISH:          { bg: RED,             text: "#fff",     label: "CALL BEARISH",      desc: "Avoid call view — price breaking down" },
  DIVERGENCE_WARNING:    { bg: "#F97316",        text: "#fff",     label: "DIVERGENCE WARNING",desc: "Data mismatch — verify prices before forming a view" },
};

const PUT_COLOR_MAP: Record<string, { bg: string; text: string; label: string; desc: string }> = {
  PUT_BULLISH:           { bg: GREEN,           text: "#fff",     label: "PUT BULLISH",       desc: "Conditions favourable for puts" },
  PUT_NEAR_SUPPORT:      { bg: "#F97316",        text: "#fff",     label: "NEAR SUPPORT",      desc: "Watch closely — potential breakdown or bounce" },
  PUT_POSITIVE_BIAS:     { bg: "#d1fae5",        text: GREEN,      label: "POSITIVE BIAS",     desc: "Price below equilibrium — put-friendly territory" },
  PUT_NEUTRAL:           { bg: "#fef9c3",        text: "#92400e",  label: "NEUTRAL",           desc: "At pivot — indecision zone, wait for direction" },
  PUT_BEARISH_BIAS:      { bg: "#fee2e2",        text: RED,        label: "BEARISH BIAS",      desc: "Price above equilibrium — not ideal for put view" },
  PUT_BEARISH:           { bg: RED,             text: "#fff",     label: "PUT BEARISH",       desc: "Avoid put view — price breaking up" },
  SENTIMENT_ALERT:       { bg: "#7c3aed",        text: "#fff",     label: "SENTIMENT ALERT",   desc: "OI indicates extreme sentiment — review before deciding" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PriceCard({ label, value, flash, sub }: { label: string; value: number; flash: "up" | "down" | null; sub?: string }) {
  const flashColor = flash === "up" ? GREEN : flash === "down" ? RED : undefined;

  return (
    <div
      style={{
        background: "var(--trading-surface)",
        border: "1.5px solid var(--trading-border)",
        borderRadius: 12,
        padding: "16px 20px",
        minWidth: 150,
        flex: "1 1 140px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: 26, fontWeight: 800,
          color: flashColor || "var(--trading-text-active)",
          letterSpacing: "-0.02em", lineHeight: 1, transition: "color 0.3s",
        }}
      >
        {value > 0 ? value.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}
        {flash && (
          <span style={{ fontSize: 13, marginLeft: 5, color: flashColor }}>
            {flash === "up" ? "▲" : "▼"}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 500, color: "var(--trading-text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function PivotPill({ label, value, type }: { label: string; value: number; type: "resistance" | "support" | "pivot" }) {
  const styles = {
    resistance: { border: "1.5px solid rgba(4,120,87,0.35)", text: GREEN,    bg: "rgba(4,120,87,0.06)" },
    support:    { border: "1.5px solid rgba(229,57,53,0.35)", text: RED,     bg: "rgba(229,57,53,0.06)" },
    pivot:      { border: "1.5px solid var(--trading-border)", text: "var(--trading-text-active)", bg: "var(--trading-surface)" },
  }[type];

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: "10px 16px", borderRadius: 10,
        background: styles.bg, border: styles.border,
        minWidth: 80,
      }}
    >
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: styles.text }}>
        {label}
      </span>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 800, color: styles.text, letterSpacing: "-0.01em" }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function SignalCard({ title, state, map, icon }: { title: string; state: string; map: typeof CALL_COLOR_MAP; icon: React.ReactNode }) {
  const props = map[state];
  const isBullish = state.includes("BULLISH") || state.includes("POSITIVE");
  const isBearish = state.includes("BEARISH");
  const isWarning = state.includes("WARNING") || state.includes("ALERT") || state.includes("NEAR");

  const accentColor = !props ? "var(--trading-text-muted)"
    : isBullish ? GREEN : isBearish ? RED : isWarning ? "#F97316" : "var(--trading-text-muted)";

  return (
    <div
      style={{
        flex: 1, borderRadius: 12, overflow: "hidden",
        background: "var(--trading-surface)",
        border: `1.5px solid ${accentColor}40`,
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, background: accentColor }} />

      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {title}
          </span>
          <span style={{ color: accentColor }}>{icon}</span>
        </div>

        {/* Badge */}
        <div
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "8px 16px", borderRadius: 8, marginBottom: 10,
            background: props?.bg || "rgba(100,116,139,0.1)",
            color: props?.text || "var(--trading-text-muted)",
          }}
        >
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em" }}>
            {props?.label || "NO SIGNAL"}
          </span>
        </div>

        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, color: "var(--trading-text-muted)", margin: 0, lineHeight: 1.5 }}>
          {props?.desc || "Awaiting market feed…"}
        </p>
      </div>
    </div>
  );
}

// ── Module 1 ──────────────────────────────────────────────────────────────────
export const Module1 = ({ isSplit = false }: { isSplit?: boolean }) => {
  const [showFullGrid, setShowFullGrid] = useState(false);
  const selectedSymbol = useStore((s) => s.selectedSymbol);
  const selectedTimeframe = useStore((s) => s.selectedTimeframe);
  const selectedMethod = useStore((s) => s.selectedMethod);
  const setSelectedMethod = useStore((s) => s.setSelectedMethod);
  const prices = useStore((s) => s.prices);

  const prevFutRef = useRef<number>(0);
  const prevSpotRef = useRef<number>(0);
  const [futFlash, setFutFlash] = useState<"up" | "down" | null>(null);
  const [spotFlash, setSpotFlash] = useState<"up" | "down" | null>(null);

  const spotLtp = prices["NIFTY-SPOT"]?.ltp ?? 0;
  const futLtp  = prices[selectedSymbol]?.ltp ?? 0;

  useEffect(() => {
    if (futLtp > 0 && prevFutRef.current > 0 && futLtp !== prevFutRef.current) {
      setFutFlash(futLtp > prevFutRef.current ? "up" : "down");
      const t = setTimeout(() => setFutFlash(null), 300);
      return () => clearTimeout(t);
    }
    if (futLtp > 0) prevFutRef.current = futLtp;
  }, [futLtp]);

  useEffect(() => {
    if (spotLtp > 0 && prevSpotRef.current > 0 && spotLtp !== prevSpotRef.current) {
      setSpotFlash(spotLtp > prevSpotRef.current ? "up" : "down");
      const t = setTimeout(() => setSpotFlash(null), 300);
      return () => clearTimeout(t);
    }
    if (spotLtp > 0) prevSpotRef.current = spotLtp;
  }, [spotLtp]);

  const { data: ohlcBars = [], isLoading } = useQuery<Candle[]>({
    queryKey: ["ohlc", selectedSymbol, selectedTimeframe],
    queryFn: () => api.get(`/api/market/ohlc/${selectedSymbol}/${selectedTimeframe}`),
    enabled: !!selectedSymbol,
  });

  const calcPivots = (method: string) => {
    if (method === "camarilla") return getCamarillaPivots;
    if (method === "fibonacci") return getFibonacciPivots;
    return getClassicPivots;
  };

  const getIndicatorProps = (state: string, isCall: boolean) => {
    const map = isCall ? CALL_COLOR_MAP : PUT_COLOR_MAP;
    return map[state] || { bg: "rgba(100,116,139,0.1)", text: "var(--trading-text-muted)", label: "NO SIGNAL", desc: "Awaiting market feed…" };
  };

  const tableRows = ohlcBars.map((bar, i, arr) => {
    const timeLabel = new Date(bar.openTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
    const prevBar = i > 0 ? arr[i - 1] : bar;
    const pivots = calcPivots(selectedMethod)(prevBar.high, prevBar.low, prevBar.close);
    const callState = getCallState(bar.close, pivots.p, pivots.r1, pivots.s1, spotLtp || bar.close);
    const putState  = getPutState(bar.close, pivots.p, pivots.r1, pivots.s1, spotLtp || bar.close);
    return { time: timeLabel, open: bar.open, high: bar.high, low: bar.low, close: bar.close, pivots, callState, putState };
  });

  const latestRow = tableRows.length > 0 ? [...tableRows].reverse()[0] : null;
  const spread    = futLtp > 0 && spotLtp > 0 ? futLtp - spotLtp : 0;

  const displayedRows = showFullGrid || !isSplit
    ? [...tableRows].reverse()
    : [...tableRows].reverse().slice(0, 12);

  const methodLabels: Record<string, string> = {
    classic: "Classic Pivot", camarilla: "Camarilla Pivot", fibonacci: "Fibonacci Pivot",
  };

  // Table cell color helpers
  const tdBase: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
    padding: "12px 16px", whiteSpace: "nowrap",
    borderBottom: "1px solid var(--trading-border)",
    color: "var(--trading-text-active)",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        @keyframes m1-enter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .m1-section {
          animation: m1-enter 0.35s ease both;
        }

        .m1-tr:hover {
          background: rgba(4,120,87,0.04) !important;
        }

        .m1-method-btn {
          font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 700;
          padding: 7px 18px; border-radius: 8px;
          cursor: pointer; transition: all 0.15s;
          border: 1.5px solid transparent;
        }
        .m1-method-active {
          background: ${GREEN}; color: #fff;
          border-color: ${GREEN};
          box-shadow: 0 2px 10px rgba(4,120,87,0.25);
        }
        .m1-method-inactive {
          background: transparent;
          color: var(--trading-text-muted);
          border-color: var(--trading-border);
        }
        .m1-method-inactive:hover {
          color: ${GREEN}; border-color: ${GREEN};
          background: rgba(4,120,87,0.05);
        }

        .m1-th {
          font-family: 'Inter', sans-serif;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 12px 16px; white-space: nowrap;
          color: var(--trading-text-muted);
          background: var(--trading-bg);
          border-bottom: 1.5px solid var(--trading-border);
          position: sticky; top: 0; z-index: 2;
        }

        .m1-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 6px;
          font-family: 'Inter', sans-serif;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase;
        }
      `}</style>

      <div
        style={{
          minHeight: isSplit ? "auto" : "100vh", background: isSplit ? "transparent" : "var(--trading-bg)",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ maxWidth: "100%", margin: "0 auto", padding: isSplit ? "12px 12px 20px" : "24px 24px 40px", display: "flex", flexDirection: "column", gap: isSplit ? 12 : 20 }}>

          {/* Page header */}
          {isSplit ? (
            <div
              className="m1-section"
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
                <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: "0.05em" }}>M1 · Pivot</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--trading-text-active)", borderLeft: "1px solid var(--trading-border)", paddingLeft: 8 }}>{selectedSymbol}</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 700 }}>
                <span style={{ background: "rgba(4,120,87,0.1)", color: GREEN, padding: "3px 8px", borderRadius: 5 }}>TF: {selectedTimeframe}</span>
                <span style={{ background: "var(--trading-bg)", border: "1px solid var(--trading-border)", color: "var(--trading-text-muted)", padding: "3px 8px", borderRadius: 5 }}>{selectedMethod.toUpperCase()}</span>
              </div>
            </div>
          ) : (
            <div
              className="m1-section"
              style={{
                background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
                borderRadius: 14, padding: "18px 24px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
                    Module 01
                  </div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--trading-text-active)", letterSpacing: "-0.02em" }}>
                    Live Pivot Intelligence
                  </h1>
                </div>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--trading-text-muted)", background: "var(--trading-bg)", padding: "3px 10px", borderRadius: 6, border: "1.5px solid var(--trading-border)" }}>
                  {selectedSymbol}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
                    background: GREEN, borderRadius: 8, color: "#fff",
                  }}
                >
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, opacity: 0.85 }}>TF</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 800 }}>{selectedTimeframe}</span>
                </div>
                <div
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "6px 14px",
                    background: "var(--trading-bg)", border: "1.5px solid var(--trading-border)",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 600, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Formula</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: GREEN }}>{methodLabels[selectedMethod] || selectedMethod}</span>
                </div>
              </div>
            </div>
          )}

          {/* Price cards */}
          {isSplit ? (
            <div
              className="m1-section"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                background: "var(--trading-surface)",
                border: "1.5px solid var(--trading-border)",
                borderRadius: 10,
                padding: "8px 16px",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              {[
                { label: "Spot LTP", value: spotLtp, sub: "NIFTY-SPOT", flash: spotFlash },
                { label: "Futures LTP", value: futLtp, sub: selectedSymbol, flash: futFlash },
                { label: "Spread", value: Math.abs(spread), sub: spread > 0 ? "Premium" : "Discount", flash: null },
                ...(latestRow ? [{ label: "Last Close", value: latestRow.close, sub: `${latestRow.time} Close`, flash: null }] : []),
              ].map((c, idx) => {
                const flashColor = c.flash === "up" ? GREEN : c.flash === "down" ? RED : "var(--trading-text-active)";
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.02em" }}>{c.label}:</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: flashColor, display: "inline-flex", alignItems: "center" }}>
                      {c.value > 0 ? c.value.toLocaleString("en-IN", { minimumFractionDigits: 1 }) : "—"}
                      {c.flash && (
                        <span style={{ fontSize: 10, marginLeft: 2 }}>
                          {c.flash === "up" ? "▲" : "▼"}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 9, color: "var(--trading-text-muted)", fontWeight: 500 }}>({c.sub})</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="m1-section" style={{ display: "flex", flexWrap: "wrap", gap: 12, animationDelay: "0.05s" }}>
              <PriceCard label="Spot LTP"     value={spotLtp}         flash={spotFlash}  sub="NIFTY-SPOT" />
              <PriceCard label="Futures LTP"  value={futLtp}          flash={futFlash}   sub={selectedSymbol} />
              <PriceCard label="Spread"       value={Math.abs(spread)} flash={null}      sub={spread > 0 ? "Fut Premium" : spread < 0 ? "Fut Discount" : "—"} />
              {latestRow && <PriceCard label="Last Close" value={latestRow.close} flash={null} sub={`${latestRow.time} candle`} />}
            </div>
          )}

          {/* Formula selector */}
          {!isSplit && (
            <div
              className="m1-section"
              style={{
                background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
                borderRadius: 12, padding: "14px 20px",
                display: "flex", alignItems: "center", gap: 12,
                animationDelay: "0.07s",
              }}
            >
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 4 }}>
                Pivot Formula
              </span>
              <div style={{ width: 1, height: 20, background: "var(--trading-border)" }} />
              {[{ key: "classic", label: "Classic" }, { key: "camarilla", label: "Camarilla" }, { key: "fibonacci", label: "Fibonacci" }].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMethod(m.key as any)}
                  className={`m1-method-btn ${selectedMethod === m.key ? "m1-method-active" : "m1-method-inactive"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Pivot levels */}
          {!isSplit && latestRow && (
            <div
              className="m1-section"
              style={{
                background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
                borderRadius: 12, padding: "16px 20px", animationDelay: "0.09s",
              }}
            >
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                Current Pivot Levels — {latestRow.time}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {(["r3", "r2", "r1"] as const).map((k) => (
                  <PivotPill key={k} label={k.toUpperCase()} value={(latestRow.pivots as any)[k]} type="resistance" />
                ))}
                <PivotPill label="P" value={latestRow.pivots.p} type="pivot" />
                {(["s1", "s2", "s3"] as const).map((k) => (
                  <PivotPill key={k} label={k.toUpperCase()} value={(latestRow.pivots as any)[k]} type="support" />
                ))}
              </div>
            </div>
          )}

          {/* Signal cards */}
          {!isSplit && latestRow && (
            <div className="m1-section" style={{ display: "flex", gap: 14, animationDelay: "0.11s" }}>
              <SignalCard
                title="Call Signal — Latest"
                state={latestRow.callState}
                map={CALL_COLOR_MAP}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    <polyline points="17 6 23 6 23 12"/>
                  </svg>
                }
              />
              <SignalCard
                title="Put Signal — Latest"
                state={latestRow.putState}
                map={PUT_COLOR_MAP}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                    <polyline points="17 18 23 18 23 12"/>
                  </svg>
                }
              />
            </div>
          )}

          {/* Historical table */}
          <div className="m1-section" style={{ animationDelay: "0.13s" }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              Historical Pivot Data
            </div>
            <div
              style={{
                overflowX: "auto", borderRadius: 12, border: "1.5px solid var(--trading-border)",
                background: "var(--trading-surface)",
                boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr>
                    {[
                      { label: "Time",        align: "left",    key: "time" },
                      { label: "Spot LTP",    align: "right",   key: "spot" },
                      { label: "Fut LTP",     align: "right",   key: "fut" },
                      { label: "Open",        align: "right",   key: "open" },
                      { label: "High",        align: "right",   key: "high" },
                      { label: "Close",       align: "right",   key: "close" },
                      { label: "P",           align: "center",  key: "p" },
                      { label: "R1",          align: "center",  key: "r1" },
                      { label: "R2",          align: "center",  key: "r2" },
                      { label: "R3",          align: "center",  key: "r3" },
                      { label: "S1",          align: "center",  key: "s1" },
                      { label: "S2",          align: "center",  key: "s2" },
                      { label: "S3",          align: "center",  key: "s3" },
                      { label: "Call Signal", align: "center",  key: "call" },
                      { label: "Put Signal",  align: "center",  key: "put" },
                    ].filter((h) => {
                      if (isSplit && !showFullGrid) {
                        return !["open", "high", "spot", "fut", "r1", "r2", "r3", "s1", "s2", "s3"].includes(h.key);
                      }
                      if (isSplit) {
                        return !["open", "high", "r2", "r3", "s2", "s3"].includes(h.key);
                      }
                      return true;
                    }).map((h) => {
                      const isP = h.key === "p";
                      const isResistance = ["r1", "r2", "r3"].includes(h.key);
                      const isSupport = ["s1", "s2", "s3"].includes(h.key);
                      const isSignalStart = h.key === "call";

                      let color = "var(--trading-text-muted)";
                      if (isResistance) color = GREEN;
                      else if (isSupport) color = RED;

                      return (
                        <th
                          key={h.key}
                          className="m1-th"
                          style={{
                            textAlign: h.align as any,
                            color,
                            borderLeft: isP || isSignalStart ? "1px solid var(--trading-border)" : undefined,
                            padding: isSplit ? "12px 14px" : "12px 16px",
                            fontSize: isSplit ? "11px" : "11px",
                          }}
                        >
                          {h.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={isSplit ? (showFullGrid ? 9 : 5) : 15} style={{ ...tdBase, textAlign: "center", padding: "32px 0", color: "var(--trading-text-muted)" }}>Loading market data…</td></tr>
                  ) : tableRows.length === 0 ? (
                    <tr><td colSpan={isSplit ? (showFullGrid ? 9 : 5) : 15} style={{ ...tdBase, textAlign: "center", padding: "32px 0", color: "var(--trading-text-muted)" }}>Awaiting finalized timeframe boundaries.</td></tr>
                  ) : (
                    displayedRows.map((row, idx) => {
                      const isLatest = idx === 0;
                      const displaySpot = isLatest && spotLtp > 0 ? spotLtp : row.close - 35;
                      const displayFut  = isLatest && futLtp > 0  ? futLtp  : row.close;
                      const callProps   = getIndicatorProps(row.callState, true);
                      const putProps    = getIndicatorProps(row.putState, false);

                      const callBadge: React.CSSProperties = {
                        background: callProps.bg,
                        color: callProps.text,
                      };
                      const putBadge: React.CSSProperties = {
                        background: putProps.bg,
                        color: putProps.text,
                      };

                      return (
                        <tr
                          key={idx}
                          className="m1-tr"
                          style={{ background: isLatest ? "rgba(4,120,87,0.04)" : "transparent", transition: "background 0.15s" }}
                        >
                          <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", fontWeight: isLatest ? 700 : 500, color: isLatest ? GREEN : "var(--trading-text-active)" }}>
                            {row.time}
                            {isLatest && !isSplit && (
                              <span style={{ marginLeft: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(4,120,87,0.12)", color: GREEN, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em" }}>
                                LIVE
                              </span>
                            )}
                          </td>
                          {(!isSplit || showFullGrid) && (
                            <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "right", fontWeight: isLatest ? 700 : 500, color: isLatest && spotFlash === "up" ? GREEN : isLatest && spotFlash === "down" ? RED : "var(--trading-text-active)", transition: "color 0.3s" }}>
                              {displaySpot.toFixed(1)}
                            </td>
                          )}
                          {(!isSplit || showFullGrid) && (
                            <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "right", fontWeight: isLatest ? 700 : 500, color: isLatest && futFlash === "up" ? GREEN : isLatest && futFlash === "down" ? RED : "var(--trading-text-active)", transition: "color 0.3s" }}>
                              {displayFut.toFixed(1)}
                            </td>
                          )}
                          {!isSplit && <td style={{ ...tdBase, padding: "12px 16px", color: "var(--trading-text-muted)" }}>{row.open.toFixed(1)}</td>}
                          {!isSplit && <td style={{ ...tdBase, padding: "12px 16px", color: "var(--trading-text-muted)" }}>{row.high.toFixed(1)}</td>}
                          <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "right", fontWeight: 600 }}>{row.close.toFixed(1)}</td>
                          <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "center", borderLeft: "1px solid var(--trading-border)", fontWeight: 600 }}>{row.pivots.p.toFixed(1)}</td>
                          {(!isSplit || showFullGrid) && (
                            <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "center", color: GREEN, fontWeight: 600 }}>{row.pivots.r1.toFixed(1)}</td>
                          )}
                          {!isSplit && <td style={{ ...tdBase, padding: "12px 16px", textAlign: "center", color: GREEN }}>{row.pivots.r2.toFixed(1)}</td>}
                          {!isSplit && <td style={{ ...tdBase, padding: "12px 16px", textAlign: "center", color: GREEN }}>{row.pivots.r3.toFixed(1)}</td>}
                          {(!isSplit || showFullGrid) && (
                            <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "center", color: RED, fontWeight: 600 }}>{row.pivots.s1.toFixed(1)}</td>
                          )}
                          {!isSplit && <td style={{ ...tdBase, padding: "12px 16px", textAlign: "center", color: RED }}>{row.pivots.s2.toFixed(1)}</td>}
                          {!isSplit && <td style={{ ...tdBase, padding: "12px 16px", textAlign: "center", color: RED }}>{row.pivots.s3.toFixed(1)}</td>}
                          <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "center", borderLeft: "1px solid var(--trading-border)" }}>
                            <span className="m1-badge" style={callBadge}>{callProps.label}</span>
                          </td>
                          <td style={{ ...tdBase, padding: isSplit ? "12px 14px" : "12px 16px", fontSize: isSplit ? "12px" : "13px", textAlign: "center" }}>
                            <span className="m1-badge" style={putBadge}>{putProps.label}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {isSplit && (
              <button
                onClick={() => setShowFullGrid(!showFullGrid)}
                style={{
                  marginTop: 8,
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
                {showFullGrid ? "Collapse to Compact Grid ▲" : `Show Full Grid (${tableRows.length} Rows, 9 Columns) ▼`}
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  );
};

export default Module1;
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api, getModule1LatestMetrics, Module1OiMetricsResponse } from "../utils/api";
import { Candle } from "@stock/shared";
import { useEffect, useRef, useState, memo } from "react";

const GREEN = "#047857";
const RED = "#E53935";
const BLUE = "#1A5FA8";

type OiSignal = "STRONG_BULL" | "MILD_BULL" | "NEUTRAL" | "MILD_BEAR" | "STRONG_BEAR" | "DIVERGENCE";

const OI_SIGNAL_MAP: Record<OiSignal, { bg: string; text: string; label: OiSignal; desc: string }> = {
  STRONG_BULL: { bg: "#22863A", text: "#fff", label: "STRONG_BULL", desc: "Call OI buildup, futures confirmation, and put unwinding align bullish." },
  MILD_BULL: { bg: "#A8E6A1", text: "#145A1A", label: "MILD_BULL", desc: "Call OI buildup with put unwinding, but without full futures confirmation." },
  NEUTRAL: { bg: "#F5F5F5", text: "#444", label: "NEUTRAL", desc: "No clear OI direction in the latest row." },
  MILD_BEAR: { bg: "#F5C4B3", text: "#993C1D", label: "MILD_BEAR", desc: "Call OI unwinding with put buildup, but without full futures confirmation." },
  STRONG_BEAR: { bg: "#C0392B", text: "#fff", label: "STRONG_BEAR", desc: "Call OI unwinding, futures short bias, and put buildup align bearish." },
  DIVERGENCE: { bg: "#E6F1FB", text: BLUE, label: "DIVERGENCE", desc: "Options and futures direction conflict. Avoid low-confidence trades." },
};

const PUT_INVERSE: Record<OiSignal, OiSignal> = {
  STRONG_BULL: "STRONG_BEAR",
  MILD_BULL: "MILD_BEAR",
  NEUTRAL: "NEUTRAL",
  MILD_BEAR: "MILD_BULL",
  STRONG_BEAR: "STRONG_BULL",
  DIVERGENCE: "DIVERGENCE",
};

// ── Sub-components ────────────────────────────────────────────────────────────

const PriceCard = memo(function PriceCard({ label, value, flash, sub }: { label: string; value: number; flash: "up" | "down" | null; sub?: string }) {
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
        {value > 0 ? value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}
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
});

type OiMetricTone = "positive" | "negative" | "neutral";
type OiMetric = { label: string; value: number | null; tone: OiMetricTone };

const formatFullOiValue = (value: number | null) =>
  value === null
    ? "-"
    : value.toLocaleString("en-US", {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
        maximumFractionDigits: 1,
      });

const formatCompactOiValue = (value: number | null) => {
  return formatFullOiValue(value);
};

const formatTableOiValue = (value: number | null) => {
  return formatFullOiValue(value);
};

const formatTimestampToHms = (timestampStr: string | undefined | null) => {
  if (!timestampStr) return "—";
  try {
    const date = new Date(timestampStr);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (e) {
    return "—";
  }
};

const getSignalShortLabel = (signal: OiSignal) => {
  const labels: Record<OiSignal, string> = {
    STRONG_BULL: "S-BULL",
    MILD_BULL: "M-BULL",
    NEUTRAL: "NEUT",
    MILD_BEAR: "M-BEAR",
    STRONG_BEAR: "S-BEAR",
    DIVERGENCE: "DIV",
  };
  return labels[signal];
};

const OiMetricCard = memo(function OiMetricCard({ label, value, tone }: { label: string; value: number | null; tone: OiMetricTone }) {
  const styles = {
    positive: { border: "1.5px solid rgba(4,120,87,0.35)", text: GREEN, bg: "rgba(4,120,87,0.06)" },
    negative: { border: "1.5px solid rgba(229,57,53,0.32)", text: RED, bg: "rgba(229,57,53,0.05)" },
    neutral: { border: "1.5px solid var(--trading-border)", text: "var(--trading-text-active)", bg: "var(--trading-surface)" },
  }[tone];

  const formattedValue = formatCompactOiValue(value);
  const fullValue = formatFullOiValue(value);

  return (
    <div
      title={`${label}: ${fullValue}`}
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        padding: "10px 12px", borderRadius: 10,
        background: styles.bg, border: styles.border,
        minWidth: 0,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      }}
    >
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: styles.text }}>
        {label}
      </span>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 800, color: styles.text, letterSpacing: "-0.01em", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {formattedValue}
      </span>
    </div>
  );
});

const SignalCard = memo(function SignalCard({ title, signal, icon }: { title: string; signal: OiSignal; icon: React.ReactNode }) {
  const props = OI_SIGNAL_MAP[signal];
  const accentColor =
    signal.includes("BULL") ? GREEN :
    signal.includes("BEAR") ? RED :
    signal === "DIVERGENCE" ? BLUE :
    "var(--trading-text-muted)";

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
            {props?.label || "NEUTRAL"}
          </span>
        </div>

        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, color: "var(--trading-text-muted)", margin: 0, lineHeight: 1.5 }}>
          {props?.desc || "Awaiting market feed..."}
        </p>
      </div>
    </div>
  );
});

const getTimeframeMins = (tf: string): number => {
  if (tf === "1m") return 1;
  if (tf === "3m") return 3;
  if (tf === "5m") return 5;
  if (tf.endsWith("m")) {
    const m = parseInt(tf);
    return isNaN(m) ? 5 : m;
  }
  return 5;
};

// ── Module 1 ──────────────────────────────────────────────────────────────────
export const Module1 = ({ isSplit = false }: { isSplit?: boolean }) => {
  const [showFullGrid, setShowFullGrid] = useState(false);
  const selectedSymbol = useStore((s) => s.selectedSymbol);
  const selectedTimeframe = useStore((s) => s.selectedTimeframe);
  const spotLtp = useStore((s) => s.prices["NIFTY-SPOT"]?.ltp ?? 0);
  const futLtp  = useStore((s) => s.prices[selectedSymbol]?.ltp ?? 0);

  const prevFutRef = useRef<number>(0);
  const prevSpotRef = useRef<number>(0);
  const [futFlash, setFutFlash] = useState<"up" | "down" | null>(null);
  const [spotFlash, setSpotFlash] = useState<"up" | "down" | null>(null);

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

  const latestOiMetrics = useStore((s) => s.latestOiMetrics);

  // Fetch initial spot and futures prices on mount
  useQuery({
    queryKey: ["initial-spot-price"],
    queryFn: async () => {
      try {
        const res = await api.get("/api/market/spot/NIFTY-SPOT");
        if (res && res.ltp) {
          useStore.getState().updatePrice("NIFTY-SPOT", res.ltp);
        }
      } catch (err) {
        console.warn("Failed to fetch initial spot price:", err);
      }
      return null;
    },
  });

  useQuery({
    queryKey: ["initial-futures-price", selectedSymbol],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/market/futures/${selectedSymbol}`);
        if (res && res.ltp) {
          useStore.getState().updatePrice(selectedSymbol, res.ltp);
        }
      } catch (err) {
        console.warn("Failed to fetch initial futures price:", err);
      }
      return null;
    },
    enabled: !!selectedSymbol,
  });

  // Pull initial latest-oi metrics on mount to populate Zustand store
  useQuery({
    queryKey: ["module1-initial-latest-oi"],
    queryFn: async () => {
      try {
        const data = await getModule1LatestMetrics();
        if (data && !useStore.getState().latestOiMetrics) {
          useStore.getState().setLatestOiMetrics(data);
        }
        return data;
      } catch (err) {
        console.warn("Failed to fetch initial latest-oi:", err);
        return null;
      }
    },
    retry: false,
  });



  const stepMs = getTimeframeMins(selectedTimeframe) * 60 * 1000;
  const continuousBars: Candle[] = [];

  if (ohlcBars.length > 0) {
    const nowMs = latestOiMetrics ? new Date(latestOiMetrics.timestamp).getTime() : Date.now();
    const activeBoundary = Math.floor(nowMs / stepMs) * stepMs;
    const latestCompletedBoundary = activeBoundary - stepMs;

    for (let i = 15; i >= 0; i--) {
      const targetTime = latestCompletedBoundary - i * stepMs;
      let bar = ohlcBars.find((b) => b.openTime === targetTime);
      if (!bar) {
        // Carry forward values from the closest preceding candle
        const candidates = ohlcBars.filter((b) => b.openTime < targetTime);
        if (candidates.length > 0) {
          bar = {
            ...candidates[candidates.length - 1],
            openTime: targetTime,
          };
        } else {
          bar = {
            ...ohlcBars[0],
            openTime: targetTime,
          };
        }
      }
      continuousBars.push(bar);
    }
  }

  const tableRows = continuousBars.map((bar) => {
    const timeLabel = new Date(bar.openTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return { time: timeLabel, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
  });

  const latestRow = tableRows.length > 0 ? [...tableRows].reverse()[0] : null;
  const spread    = futLtp > 0 && spotLtp > 0 ? futLtp - spotLtp : 0;

  const metricsFromApiPayload = (payload: Module1OiMetricsResponse): OiMetric[] => [
    { label: "C_TL", value: payload.c_tl, tone: "neutral" },
    { label: "C_MN", value: payload.c_mn, tone: "neutral" },
    { label: "C_Hig", value: payload.c_hig, tone: "neutral" },
    { label: "C_Low", value: payload.c_low, tone: "neutral" },
    { label: "C_Buy", value: payload.c_buy, tone: "positive" },
    { label: "C_Sell", value: payload.c_sell, tone: "negative" },
    { label: "F_Buy", value: payload.f_buy, tone: "positive" },
    { label: "F_Sell", value: payload.f_sell, tone: "negative" },
    { label: "P_TL", value: payload.p_tl, tone: "neutral" },
    { label: "P_MN", value: payload.p_mn, tone: "neutral" },
    { label: "P_Hig", value: payload.p_hig, tone: "neutral" },
    { label: "P_Low", value: payload.p_low, tone: "neutral" },
    { label: "P_Buy", value: payload.p_buy, tone: "positive" },
    { label: "P_Sell", value: payload.p_sell, tone: "negative" },
  ];

  // MARKET DATA API will eventually provide real option-chain C_TL/P_TL and futures OI values.
  // Until that backend endpoint is available, Module1 keeps these proxy calculations so the UI
  // remains functional without Interactive Data API or any order/trading actions.
  const buildFallbackOiMetrics = (rowIndex: number, useLiveValues = false): OiMetric[] => {
    const row = tableRows[rowIndex];
    if (!row) return [];

    const previous = tableRows[rowIndex - 1] || row;
    const rowsToDate = tableRows.slice(0, rowIndex + 1);

    const baseClose = latestRow ? latestRow.close : 1;
    const baseLow = latestRow ? latestRow.low : 1;

    // Use live Open Interest totals as the scaling base if available
    const liveCallBase = latestOiMetrics ? latestOiMetrics.c_tl : null;
    const livePutBase = latestOiMetrics ? latestOiMetrics.p_tl : null;

    const callTotal = liveCallBase !== null && baseClose > 0 
      ? Math.round(liveCallBase * (row.close / baseClose)) 
      : row.close;

    const prevCallTotal = liveCallBase !== null && baseClose > 0
      ? Math.round(liveCallBase * (previous.close / baseClose))
      : previous.close;

    const putTotal = livePutBase !== null && baseLow > 0 
      ? Math.round(livePutBase * (row.low / baseLow)) 
      : row.low;

    const prevPutTotal = livePutBase !== null && baseLow > 0
      ? Math.round(livePutBase * (previous.low / baseLow))
      : previous.low;

    const futuresTotal = useLiveValues && futLtp > 0 ? futLtp : row.close;
    const callDelta = callTotal - prevCallTotal;
    const putDelta = putTotal - prevPutTotal;
    const futuresDelta = futuresTotal - previous.close;

    // Scale means and high/low values for consistency
    const callMean = rowsToDate.reduce((sum, item) => {
      const val = liveCallBase !== null && baseClose > 0 
        ? Math.round(liveCallBase * (item.close / baseClose))
        : item.close;
      return sum + val;
    }, 0) / rowsToDate.length;

    const putMean = rowsToDate.reduce((sum, item) => {
      const val = livePutBase !== null && baseLow > 0 
        ? Math.round(livePutBase * (item.low / baseLow))
        : item.low;
      return sum + val;
    }, 0) / rowsToDate.length;

    const sessionHigh = liveCallBase !== null && baseClose > 0 
      ? Math.max(...rowsToDate.map(item => Math.round(liveCallBase * (item.high / baseClose))))
      : Math.max(...rowsToDate.map(item => item.high));

    const sessionLow = liveCallBase !== null && baseClose > 0 
      ? Math.min(...rowsToDate.map(item => Math.round(liveCallBase * (item.low / baseClose))))
      : Math.min(...rowsToDate.map(item => item.low));

    return [
      { label: "C_TL", value: callTotal, tone: "neutral" },
      { label: "C_MN", value: Math.round(callMean), tone: "neutral" },
      { label: "C_Hig", value: sessionHigh, tone: "neutral" },
      { label: "C_Low", value: sessionLow, tone: "neutral" },
      { label: "C_Buy", value: Math.max(callDelta, 0), tone: "positive" },
      { label: "C_Sell", value: Math.min(callDelta, 0), tone: "negative" },
      { label: "F_Buy", value: Math.max(futuresDelta, 0), tone: "positive" },
      { label: "F_Sell", value: Math.min(futuresDelta, 0), tone: "negative" },
      { label: "P_TL", value: putTotal, tone: "neutral" },
      { label: "P_MN", value: Math.round(putMean), tone: "neutral" },
      { label: "P_Hig", value: livePutBase !== null && baseLow > 0 
          ? Math.max(...rowsToDate.map(item => Math.round(livePutBase * (item.high / baseLow))))
          : Math.max(...rowsToDate.map(item => item.high)), tone: "neutral" },
      { label: "P_Low", value: livePutBase !== null && baseLow > 0 
          ? Math.min(...rowsToDate.map(item => Math.round(livePutBase * (item.low / baseLow))))
          : Math.min(...rowsToDate.map(item => item.low)), tone: "neutral" },
      { label: "P_Buy", value: Math.max(putDelta, 0), tone: "positive" },
      { label: "P_Sell", value: Math.min(putDelta, 0), tone: "negative" },
    ];
  };

  const getMetricValue = (metrics: Array<{ label: string; value: number | null }>, label: string) =>
    metrics.find((metric) => metric.label === label)?.value ?? 0;

  const getCallOiSignal = (metrics: Array<{ label: string; value: number | null }>): OiSignal => {
    const threshold = selectedSymbol.includes("BANK") ? 300 : 500;
    const cBuy = getMetricValue(metrics, "C_Buy");
    const cSell = getMetricValue(metrics, "C_Sell");
    const pBuy = getMetricValue(metrics, "P_Buy");
    const pSell = getMetricValue(metrics, "P_Sell");
    const fBuy = getMetricValue(metrics, "F_Buy");
    const fSell = getMetricValue(metrics, "F_Sell");

    if (cBuy > threshold && fBuy > 0 && pSell < 0) return "STRONG_BULL";
    if (cBuy > 0 && pSell < 0) return "MILD_BULL";
    if (cSell < -threshold && fSell < 0 && pBuy > 0) return "STRONG_BEAR";
    if (cSell < 0 && pBuy > 0) return "MILD_BEAR";
    if ((cBuy > 0 && fSell < 0) || (cSell < 0 && fBuy > 0)) return "DIVERGENCE";
    return "NEUTRAL";
  };

  const latestIndex = tableRows.length - 1;
  const fallbackLatestMetrics = latestIndex >= 0 ? buildFallbackOiMetrics(latestIndex, true) : [];
  const oiMetrics = latestOiMetrics ? metricsFromApiPayload(latestOiMetrics) : fallbackLatestMetrics;
  const latestCallSignal = latestOiMetrics?.callSignal || (oiMetrics.length > 0 ? getCallOiSignal(oiMetrics) : "NEUTRAL");
  const latestPutSignal = latestOiMetrics?.putSignal || PUT_INVERSE[latestCallSignal];

  const allRowsReversed = [...tableRows].reverse();
  const displayedRows = showFullGrid || !isSplit
    ? allRowsReversed.slice(0, 15) // Limit to exactly 15 records
    : allRowsReversed.slice(0, 12);

  // Table cell color helpers
  const tdBase: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: isSplit ? 8 : 10, fontWeight: 600,
    padding: isSplit ? "4px 1.5px" : "5px 2.5px", whiteSpace: "nowrap",
    borderBottom: "1px solid var(--trading-border)",
    borderRight: "1px solid var(--trading-border)",
    color: "var(--trading-text-active)",
    lineHeight: 1.15,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const historicalHeaders = [
    { label: "Time", align: "left", key: "time" },
    { label: "Tin", align: "center", key: "tin" },
    ...[
      "C_TL",
      "C_MN",
      "C_Hig",
      "C_Low",
      "C_Buy",
      "C_Sell",
      "F_Buy",
      "F_Sell",
      "P_TL",
      "P_MN",
      "P_Hig",
      "P_Low",
      "P_Buy",
      "P_Sell",
    ].map((label) => ({ label, align: "right", key: label })),
    { label: "Call Signal", align: "center", key: "call" },
    { label: "Put Signal", align: "center", key: "put" },
  ].filter((h) => {
    if (isSplit && !showFullGrid) {
      return !["C_MN", "C_Hig", "C_Low", "P_MN", "P_Hig", "P_Low"].includes(h.key);
    }
    return true;
  });

  const visibleOiMetricKeys = new Set(historicalHeaders.map((h) => h.key));
  const countVisible = (keys: string[]) => historicalHeaders.filter((h) => keys.includes(h.key)).length;
  const marketColumnCount = countVisible(["time", "tin"]);
  const callColumnCount = countVisible(["C_TL", "C_MN", "C_Hig", "C_Low", "C_Buy", "C_Sell"]);
  const futuresColumnCount = countVisible(["F_Buy", "F_Sell"]);
  const putColumnCount = countVisible(["P_TL", "P_MN", "P_Hig", "P_Low", "P_Buy", "P_Sell"]);
  const signalColumnCount = countVisible(["call", "put"]);
  const tableColumnWidths: Record<string, string> = {
    time: "5.5%",
    tin: "3.5%",
    C_TL: "5.8%",
    C_MN: "5.8%",
    C_Hig: "5.8%",
    C_Low: "5.8%",
    C_Buy: "5.4%",
    C_Sell: "5.4%",
    F_Buy: "5.2%",
    F_Sell: "5.2%",
    P_TL: "5.8%",
    P_MN: "5.8%",
    P_Hig: "5.8%",
    P_Low: "5.8%",
    P_Buy: "5.4%",
    P_Sell: "5.4%",
    call: "5.4%",
    put: "5.4%",
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
          font-size: 9px; font-weight: 800;
          letter-spacing: 0.02em; text-transform: uppercase;
          padding: 5px 4px; white-space: nowrap;
          color: var(--trading-text-muted);
          background: var(--trading-bg);
          border-bottom: 1.5px solid var(--trading-border);
          position: sticky; top: 0; z-index: 2;
          line-height: 1.1;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .m1-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 5px; border-radius: 4px;
          font-family: 'Inter', sans-serif;
          font-size: 9px; font-weight: 800;
          letter-spacing: 0; text-transform: uppercase;
          line-height: 1;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .m1-oi-table-wrap {
          overflow: hidden;
          border-radius: 8px;
          border: 1.5px solid var(--trading-border);
          background: var(--trading-surface);
          box-shadow: 0 1px 8px rgba(0,0,0,0.04);
        }

        .m1-oi-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          text-align: left;
          border: 1px solid var(--trading-border);
        }

        @keyframes m1-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.03); opacity: 0.95; }
        }

        @media (max-width: 1180px) {
          .m1-th { font-size: 8px; padding: 4px 2px; }
          .m1-badge { font-size: 8px; padding: 2px 3px; }
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
                <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: "0.05em" }}>M1 · OI</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--trading-text-active)", borderLeft: "1px solid var(--trading-border)", paddingLeft: 8 }}>{selectedSymbol}</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 700 }}>
                <span style={{ background: "rgba(4,120,87,0.1)", color: GREEN, padding: "3px 8px", borderRadius: 5 }}>TF: {selectedTimeframe}</span>
                <span style={{ background: "var(--trading-bg)", border: "1px solid var(--trading-border)", color: "var(--trading-text-muted)", padding: "3px 8px", borderRadius: 5 }}>TIN 18+</span>
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
                    Live OI Change Tracker
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
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 600, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Signal Engine</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: GREEN }}>{selectedSymbol.includes("BANK") ? "Threshold 300" : "Threshold 500"}</span>
                </div>
              </div>
            </div>
          )}

            <>
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
                          {c.value > 0 ? c.value.toLocaleString("en-US", { minimumFractionDigits: 1 }) : "—"}
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

              {/* OI reference */}
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
                    OI Signal Reference
                  </span>
                  <div style={{ width: 1, height: 20, background: "var(--trading-border)" }} />
                  <span className="m1-method-btn m1-method-active">10m Spec</span>
                  <span className="m1-method-btn m1-method-inactive">Tin starts 18</span>
                  <span className="m1-method-btn m1-method-inactive">{selectedSymbol.includes("BANK") ? "BANKNIFTY 300-700" : "NIFTY 500-1000"}</span>
                </div>
              )}

              {/* OI dashboard metrics */}
              {!isSplit && latestRow && (
                <div
                  className="m1-section"
                  style={{
                    background: "var(--trading-surface)", border: "1.5px solid var(--trading-border)",
                    borderRadius: 12, padding: "16px 20px", animationDelay: "0.09s",
                  }}
                >
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                    OI Dashboard Metrics - {latestOiMetrics ? formatTimestampToHms(latestOiMetrics.timestamp) : (latestRow ? latestRow.time : "—")}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {oiMetrics.map((metric) => (
                      <OiMetricCard key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
                    ))}
                  </div>
                </div>
              )}

              {/* Signal cards */}
              {!isSplit && latestRow && (
                <div className="m1-section" style={{ display: "flex", gap: 14, animationDelay: "0.11s" }}>
                  <SignalCard
                    title="Call Signal - Latest"
                    signal={latestCallSignal}
                    icon={
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                        <polyline points="17 6 23 6 23 12"/>
                      </svg>
                    }
                  />
                  <SignalCard
                    title="Put Signal - Latest"
                    signal={latestPutSignal}
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
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  Historical OI Dashboard Data
                </div>
                <div className="m1-oi-table-wrap">
                  <table className="m1-oi-table" style={{ width: "100%" }}>
                    <colgroup>
                      {historicalHeaders.map((h) => (
                        <col key={h.key} style={{ width: tableColumnWidths[h.key] || "5%" }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {marketColumnCount > 0 && (
                          <th className="m1-th" colSpan={marketColumnCount} style={{ textAlign: "center", borderRight: "1px solid var(--trading-border)", color: "var(--trading-text-muted)" }}>TIME</th>
                        )}
                        {callColumnCount > 0 && (
                          <th className="m1-th" colSpan={callColumnCount} style={{ textAlign: "center", borderRight: "1px solid var(--trading-border)", color: GREEN, background: "rgba(4,120,87,0.08)" }}>CALL SIDE</th>
                        )}
                        {futuresColumnCount > 0 && (
                          <th className="m1-th" colSpan={futuresColumnCount} style={{ textAlign: "center", borderRight: "1px solid var(--trading-border)", color: BLUE, background: "rgba(26,95,168,0.08)" }}>FUTURES</th>
                        )}
                        {putColumnCount > 0 && (
                          <th className="m1-th" colSpan={putColumnCount} style={{ textAlign: "center", borderRight: "1px solid var(--trading-border)", color: RED, background: "rgba(229,57,53,0.08)" }}>PUT SIDE</th>
                        )}
                        {signalColumnCount > 0 && (
                          <th className="m1-th" colSpan={signalColumnCount} style={{ textAlign: "center", color: "var(--trading-text-muted)", background: "rgba(100,116,139,0.08)" }}>SIGNALS</th>
                        )}
                      </tr>
                      <tr>
                        {historicalHeaders.map((h) => {
                          const isOiStart = h.key === "C_TL";
                          const isPositive = ["C_Buy", "F_Buy", "P_Buy"].includes(h.key);
                          const isNegative = ["C_Sell", "F_Sell", "P_Sell"].includes(h.key);
                          const isSignalStart = h.key === "call";

                          let color = "var(--trading-text-muted)";
                          if (isPositive) color = GREEN;
                          else if (isNegative) color = RED;

                          return (
                            <th
                              key={h.key}
                              className="m1-th"
                              style={{
                                textAlign: h.align as any,
                                color,
                                borderLeft: isOiStart || isSignalStart ? "1px solid var(--trading-border)" : undefined,
                                borderRight: "1px solid var(--trading-border)",
                                padding: isSplit ? "4px 1px" : "5px 2px",
                                fontSize: isSplit ? "8px" : "9px",
                              }}
                              title={h.label}
                            >
                              {h.label}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={historicalHeaders.length} style={{ ...tdBase, textAlign: "center", padding: "32px 0", color: "var(--trading-text-muted)" }}>Loading market data…</td></tr>
                      ) : tableRows.length === 0 ? (
                        <tr><td colSpan={historicalHeaders.length} style={{ ...tdBase, textAlign: "center", padding: "32px 0", color: "var(--trading-text-muted)" }}>Awaiting finalized timeframe boundaries.</td></tr>
                      ) : (
                        displayedRows.map((_, idx) => {
                          const hasLiveRow = !!latestOiMetrics;
                          const isLatest = hasLiveRow ? idx === 0 : false;
                          const candleIdx = hasLiveRow ? idx - 1 : idx;

                          const targetBar = displayedRows[candleIdx] || null;
                          const displayTime = isLatest && latestOiMetrics
                            ? formatTimestampToHms(latestOiMetrics.timestamp)
                            : (targetBar ? targetBar.time : "—");

                          const latestTin = latestOiMetrics ? latestOiMetrics.tin : (tableRows.length > 0 ? 18 + (tableRows.length - 1) : 18);
                          const tin = latestTin - idx;
                          const rowIndex = tableRows.length - 1 - (isLatest ? 0 : candleIdx);
                          const rowOiMetrics = isLatest && latestOiMetrics ? metricsFromApiPayload(latestOiMetrics) : buildFallbackOiMetrics(rowIndex, isLatest);
                          const callSignal = isLatest && latestOiMetrics ? latestOiMetrics.callSignal : getCallOiSignal(rowOiMetrics);
                          const putSignal = isLatest && latestOiMetrics ? latestOiMetrics.putSignal : PUT_INVERSE[callSignal];
                          const callProps = OI_SIGNAL_MAP[callSignal];
                          const putProps = OI_SIGNAL_MAP[putSignal];

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
                              <td
                                title={displayTime}
                                style={{ ...tdBase, textAlign: "center", fontWeight: isLatest ? 800 : 600, color: isLatest ? GREEN : "var(--trading-text-active)" }}
                              >
                                {displayTime}
                                {isLatest && !isSplit && (
                                  <span title="Latest row" style={{ marginLeft: 3, display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: GREEN }} />
                                )}
                              </td>
                              <td style={{ ...tdBase, textAlign: "center", color: "var(--trading-text-muted)", fontWeight: 800 }}>
                                {tin}
                              </td>
                              {rowOiMetrics.filter((metric) => visibleOiMetricKeys.has(metric.label)).map((metric, metricIdx) => {
                                const color = metric.tone === "positive" ? GREEN : metric.tone === "negative" ? RED : "var(--trading-text-active)";
                                return (
                                  <td
                                    key={metric.label}
                                    title={`${metric.label}: ${formatFullOiValue(metric.value)}`}
                                    style={{
                                      ...tdBase,
                                      textAlign: "right",
                                      borderLeft: metricIdx === 0 ? "1px solid var(--trading-border)" : undefined,
                                      color,
                                      fontWeight: metric.tone === "neutral" ? 600 : 800,
                                    }}
                                  >
                                    {formatTableOiValue(metric.value)}
                                  </td>
                                );
                              })}
                              <td style={{ ...tdBase, textAlign: "center", borderLeft: "1px solid var(--trading-border)" }}>
                                <span className="m1-badge" title={callProps.label} style={callBadge}>{getSignalShortLabel(callSignal)}</span>
                              </td>
                              <td style={{ ...tdBase, textAlign: "center" }}>
                                <span className="m1-badge" title={putProps.label} style={putBadge}>{getSignalShortLabel(putSignal)}</span>
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
                    {showFullGrid ? "Collapse to Compact Grid ▲" : `Show Full Grid (${tableRows.length} Rows, ${historicalHeaders.length} Columns) ▼`}
                  </button>
                )}
              </div>
            </>

        </div>
      </div>
    </>
  );
};

export default Module1;

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

// Mapping indicator status to HSL custom styling configurations
const CALL_COLOR_MAP: Record<string, { bg: string; text: string; label: string; desc: string }> = {
  CALL_BULLISH: { bg: "bg-trading-bullish", text: "text-trading-bg", label: "CALL BULLISH", desc: "Strong bullish — conditions favourable for calls" },
  CALL_NEAR_RESISTANCE: { bg: "bg-amber-500", text: "text-trading-bg", label: "NEAR RESISTANCE", desc: "Watch closely — potential breakout or rejection" },
  CALL_POSITIVE_BIAS: { bg: "bg-emerald-500/20 text-trading-bullish border border-trading-bullish/30", text: "text-trading-bullish", label: "POSITIVE BIAS", desc: "Price above equilibrium — call-friendly territory" },
  CALL_NEUTRAL: { bg: "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30", text: "text-yellow-500", label: "NEUTRAL", desc: "At pivot — indecision zone, wait for direction" },
  CALL_BEARISH_BIAS: { bg: "bg-red-500/20 text-trading-bearish border border-trading-bearish/30", text: "text-trading-bearish", label: "BEARISH BIAS", desc: "Price below equilibrium — not ideal for call view" },
  CALL_BEARISH: { bg: "bg-trading-bearish", text: "text-trading-bg", label: "CALL BEARISH", desc: "Avoid call view — price breaking down" },
  DIVERGENCE_WARNING: { bg: "bg-orange-500", text: "text-trading-bg", label: "DIVERGENCE WARNING", desc: "Data mismatch — verify prices before forming a view" }
};

const PUT_COLOR_MAP: Record<string, { bg: string; text: string; label: string; desc: string }> = {
  PUT_BULLISH: { bg: "bg-trading-bullish", text: "text-trading-bg", label: "PUT BULLISH", desc: "Conditions favourable for puts" },
  PUT_NEAR_SUPPORT: { bg: "bg-amber-500", text: "text-trading-bg", label: "NEAR SUPPORT", desc: "Watch closely — potential breakdown or bounce" },
  PUT_POSITIVE_BIAS: { bg: "bg-emerald-500/20 text-trading-bullish border border-trading-bullish/30", text: "text-trading-bullish", label: "POSITIVE BIAS", desc: "Price below equilibrium — put-friendly territory" },
  PUT_NEUTRAL: { bg: "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30", text: "text-yellow-500", label: "NEUTRAL", desc: "At pivot — indecision zone, wait for direction" },
  PUT_BEARISH_BIAS: { bg: "bg-red-500/20 text-trading-bearish border border-trading-bearish/30", text: "text-trading-bearish", label: "BEARISH BIAS", desc: "Price above equilibrium — not ideal for put view" },
  PUT_BEARISH: { bg: "bg-trading-bearish", text: "text-trading-bg", label: "PUT BEARISH", desc: "Avoid put view — price breaking up" },
  SENTIMENT_ALERT: { bg: "bg-trading-sentiment", text: "text-trading-bg", label: "SENTIMENT ALERT", desc: "OI indicates extreme sentiment — review before deciding" }
};

export const Module1 = () => {
  const selectedSymbol = useStore((state) => state.selectedSymbol);
  const selectedTimeframe = useStore((state) => state.selectedTimeframe);
  const selectedMethod = useStore((state) => state.selectedMethod);
  const setSelectedTimeframe = useStore((state) => state.setSelectedTimeframe);
  const setSelectedMethod = useStore((state) => state.setSelectedMethod);

  // Live prices and cached socket signals
  const prices = useStore((state) => state.prices);
  const activeIndicators = useStore((state) => state.indicators[selectedSymbol]?.[selectedTimeframe]?.[selectedMethod]);

  // Keep track of previous prices to show green/red flash arrows
  const prevFutPriceRef = useRef<number>(0);
  const prevSpotPriceRef = useRef<number>(0);
  const [futFlash, setFutFlash] = useState<"up" | "down" | null>(null);
  const [spotFlash, setSpotFlash] = useState<"up" | "down" | null>(null);

  const spotPriceObj = prices["NIFTY-SPOT"];
  const futPriceObj = prices[selectedSymbol];

  const spotLtp = spotPriceObj ? spotPriceObj.ltp : 0;
  const futLtp = futPriceObj ? futPriceObj.ltp : 0;

  // Visual green/red price flash effect triggers
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

  // Fetch completed candles from DB
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

  // Reconstruct row-by-row signal values
  const tableRows = ohlcBars.map((bar, index, arr) => {
    const timeLabel = new Date(bar.openTime).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    });

    // Pivots are calculated using the PREVIOUS candle
    const prevBar = index > 0 ? arr[index - 1] : bar;
    const calcFn = getPivotFormula(selectedMethod);
    const pivots = calcFn(prevBar.high, prevBar.low, prevBar.close);

    const callState = getCallState(bar.close, pivots.p, pivots.r1, pivots.s1, spotLtp || bar.close);
    const putState = getPutState(bar.close, pivots.p, pivots.r1, pivots.s1, spotLtp || bar.close);

    return {
      time: timeLabel,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      pivots,
      callState,
      putState
    };
  });

  return (
    <div className="space-y-6">
      {/* 1. Header Toggles */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-xl border border-trading-border bg-trading-surface p-4">
        {/* Timeframe Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold uppercase tracking-wider text-trading-textMuted mr-2">Timeframe:</span>
          {["1m", "3m", "5m"].map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold font-sans transition ${
                selectedTimeframe === tf
                  ? "bg-trading-neutral text-trading-bg"
                  : "bg-trading-bg text-trading-textMuted border border-trading-border hover:text-trading-textActive"
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Pivot Method Toggles */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold uppercase tracking-wider text-trading-textMuted mr-2">Pivot Model:</span>
          {(["classic", "camarilla", "fibonacci"] as const).map((method) => (
            <button
              key={method}
              onClick={() => setSelectedMethod(method)}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold font-sans transition capitalize ${
                selectedMethod === method
                  ? "bg-trading-neutral text-trading-bg"
                  : "bg-trading-bg text-trading-textMuted border border-trading-border hover:text-trading-textActive"
              }`}
            >
              {method}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Real-Time Indicator Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Spot Price Card */}
        <div className="rounded-xl border border-trading-border bg-trading-surface p-5 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-trading-textMuted">
            <span>NIFTY SPOT INDEX</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span
              className={`font-mono text-3xl font-extrabold tracking-tight transition duration-300 ${
                spotFlash === "up"
                  ? "text-trading-bullish scale-105"
                  : spotFlash === "down"
                  ? "text-trading-bearish scale-105"
                  : "text-trading-textActive"
              }`}
            >
              {spotLtp > 0 ? spotLtp.toFixed(2) : "Loading..."}
            </span>
            {spotFlash && (
              <span className={`text-xs font-bold ${spotFlash === "up" ? "text-trading-bullish" : "text-trading-bearish"}`}>
                {spotFlash === "up" ? "▲" : "▼"}
              </span>
            )}
          </div>
        </div>

        {/* Futures Price Card */}
        <div className="rounded-xl border border-trading-border bg-trading-surface p-5 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-trading-textMuted">
            <span>{selectedSymbol}</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span
              className={`font-mono text-3xl font-extrabold tracking-tight transition duration-300 ${
                futFlash === "up"
                  ? "text-trading-bullish scale-105"
                  : futFlash === "down"
                  ? "text-trading-bearish scale-105"
                  : "text-trading-textActive"
              }`}
            >
              {futLtp > 0 ? futLtp.toFixed(2) : "Loading..."}
            </span>
            {futFlash && (
              <span className={`text-xs font-bold ${futFlash === "up" ? "text-trading-bullish" : "text-trading-bearish"}`}>
                {futFlash === "up" ? "▲" : "▼"}
              </span>
            )}
          </div>
        </div>

        {/* Call Panel Signal Card */}
        {(() => {
          const callState = activeIndicators?.callState || "CALL_NEUTRAL";
          const props = getIndicatorProps(callState, true);
          return (
            <div className={`rounded-xl p-5 flex flex-col justify-between shadow-lg transition duration-500 ${props.bg}`}>
              <span className={`text-xs font-extrabold uppercase tracking-widest ${props.text}`}>
                CALL ACTION SIGNAL (CE)
              </span>
              <div className="mt-2">
                <span className={`text-2xl font-black tracking-tight ${props.text}`}>
                  {props.label}
                </span>
                <p className={`mt-1 text-[11px] leading-tight font-medium ${props.text} opacity-90`}>
                  {props.desc}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Put Panel Signal Card */}
        {(() => {
          const putState = activeIndicators?.putState || "PUT_NEUTRAL";
          const props = getIndicatorProps(putState, false);
          return (
            <div className={`rounded-xl p-5 flex flex-col justify-between shadow-lg transition duration-500 ${props.bg}`}>
              <span className={`text-xs font-extrabold uppercase tracking-widest ${props.text}`}>
                PUT ACTION SIGNAL (PE)
              </span>
              <div className="mt-2">
                <span className={`text-2xl font-black tracking-tight ${props.text}`}>
                  {props.label}
                </span>
                <p className={`mt-1 text-[11px] leading-tight font-medium ${props.text} opacity-90`}>
                  {props.desc}
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 3. Divergence Alert Banner */}
      {activeIndicators?.hasDivergenceWarning && (
        <div className="flex items-center space-x-3 rounded-lg bg-trading-divergence/10 border border-trading-divergence/30 p-4 text-trading-divergence animate-pulse shadow-md">
          <span className="text-xl">⚠️</span>
          <div className="text-sm font-sans">
            <span className="font-bold">Divergence Warning Alert:</span> Spot Index and Futures Price divergence is currently{" "}
            <span className="font-mono font-extrabold">{activeIndicators.divergencePct.toFixed(2)}%</span> (exceeds 0.5% threshold). Intraday market feeds are widely separate, verify prices.
          </div>
        </div>
      )}

      {/* 4. Pivot Grid Table */}
      <div className="rounded-xl border border-trading-border bg-trading-surface overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-trading-border flex items-center justify-between">
          <h3 className="font-sans text-sm font-bold tracking-wider text-trading-textActive uppercase">
            Historical Pivot Levels & Signal Log
          </h3>
          <span className="font-mono text-xs text-trading-textMuted">
            Rows: {tableRows.length} completed intervals
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans select-none">
            <thead>
              <tr className="border-b border-trading-border bg-trading-bg text-[10px] font-bold uppercase tracking-wider text-trading-textMuted">
                <th className="py-3 px-4">Interval</th>
                <th className="py-3 px-2 text-right">Open</th>
                <th className="py-3 px-2 text-right">High</th>
                <th className="py-3 px-2 text-right">Low</th>
                <th className="py-3 px-2 text-right">Close</th>
                <th className="py-3 px-3 text-center border-l border-trading-border bg-trading-surface/30">P</th>
                <th className="py-3 px-2 text-center text-trading-bullish bg-trading-surface/30">R1</th>
                <th className="py-3 px-2 text-center text-trading-bullish bg-trading-surface/30">R2</th>
                <th className="py-3 px-2 text-center text-trading-bullish bg-trading-surface/30">R3</th>
                <th className="py-3 px-2 text-center text-trading-bearish bg-trading-surface/30">S1</th>
                <th className="py-3 px-2 text-center text-trading-bearish bg-trading-surface/30">S2</th>
                <th className="py-3 px-2 text-center text-trading-bearish bg-trading-surface/30">S3</th>
                <th className="py-3 px-4 text-center border-l border-trading-border">Call Signal</th>
                <th className="py-3 px-4 text-center">Put Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trading-gridLine text-xs font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-trading-textMuted">
                    Loading completed bars and recalculating levels...
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-trading-textMuted">
                    Awaiting finalized timeframe boundaries. Spot index simulator is running.
                  </td>
                </tr>
              ) : (
                tableRows.reverse().map((row, idx) => (
                  <tr key={idx} className="hover:bg-trading-bg/40 transition">
                    <td className="py-2.5 px-4 font-mono font-bold text-trading-textActive">{row.time}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-trading-textMuted">{row.open.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-trading-textMuted">{row.high.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-trading-textMuted">{row.low.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-trading-textActive">{row.close.toFixed(1)}</td>
                    
                    {/* Pivot Levels */}
                    <td className="py-2.5 px-3 text-center font-mono border-l border-trading-border bg-trading-bg/10">{row.pivots.p.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-trading-bullish bg-trading-bg/10">{row.pivots.r1.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-trading-bullish bg-trading-bg/10">{row.pivots.r2.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-trading-bullish bg-trading-bg/10">{row.pivots.r3.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-trading-bearish bg-trading-bg/10">{row.pivots.s1.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-trading-bearish bg-trading-bg/10">{row.pivots.s2.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-trading-bearish bg-trading-bg/10">{row.pivots.s3.toFixed(1)}</td>

                    {/* Dynamic historical Signals */}
                    <td className="py-2.5 px-3 border-l border-trading-border">
                      {(() => {
                        const props = getIndicatorProps(row.callState, true);
                        return (
                          <div className={`mx-auto rounded px-2.5 py-0.5 text-center text-[10px] font-black tracking-wide max-w-[120px] ${props.bg}`}>
                            {props.label}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 px-3">
                      {(() => {
                        const props = getIndicatorProps(row.putState, false);
                        return (
                          <div className={`mx-auto rounded px-2.5 py-0.5 text-center text-[10px] font-black tracking-wide max-w-[120px] ${props.bg}`}>
                            {props.label}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Module1;

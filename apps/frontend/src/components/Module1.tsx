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

  // Force selectedMethod to classic on mount/load
  useEffect(() => {
    setSelectedMethod("classic");
  }, [setSelectedMethod]);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between border-b border-trading-border pb-4">
        <h2 className="font-sans text-lg font-black tracking-wider text-trading-textActive uppercase">
          MODULE 1 - LIVE PIVOT TABLE
        </h2>
      </div>

      {/* 1. Timeframe Controls ONLY */}
      <div className="flex items-center space-x-2 rounded-xl border border-trading-border bg-trading-surface p-4">
        <span className="text-xs font-bold uppercase tracking-wider text-trading-textMuted mr-2">Timeframe:</span>
        {[
          { key: "1m", label: "1 Min" },
          { key: "3m", label: "3 Min" },
          { key: "5m", label: "5 Min" }
        ].map((tf) => (
          <button
            key={tf.key}
            onClick={() => setSelectedTimeframe(tf.key)}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold font-sans transition ${
              selectedTimeframe === tf.key
                ? "bg-trading-neutral text-trading-bg"
                : "bg-trading-bg text-trading-textMuted border border-trading-border hover:text-trading-textActive"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* 2. Live Pivot Table */}
      <div className="rounded-xl border border-trading-border bg-trading-surface overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans select-none">
            <thead>
              <tr className="border-b border-trading-border bg-trading-bg text-[10px] font-bold uppercase tracking-wider text-trading-textMuted">
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-2 text-right">Spot LTP</th>
                <th className="py-3 px-2 text-right">Futures LTP</th>
                <th className="py-3 px-2 text-right">Open</th>
                <th className="py-3 px-2 text-right">High</th>
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
                  <td colSpan={15} className="py-8 text-center text-trading-textMuted">
                    Loading completed bars and recalculating levels...
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-trading-textMuted">
                    Awaiting finalized timeframe boundaries. Spot index simulator is running.
                  </td>
                </tr>
              ) : (
                tableRows.reverse().map((row, idx) => {
                  const isLatestRow = idx === 0;
                  const displaySpotLtp = isLatestRow && spotLtp > 0 ? spotLtp : (row.close - 35);
                  const displayFutLtp = isLatestRow && futLtp > 0 ? futLtp : row.close;

                  return (
                    <tr key={idx} className="hover:bg-trading-bg/40 transition">
                      <td className="py-2.5 px-4 font-mono font-bold text-trading-textActive">{row.time}</td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono font-bold transition duration-300 ${
                          isLatestRow && spotFlash === "up"
                            ? "text-trading-bullish"
                            : isLatestRow && spotFlash === "down"
                            ? "text-trading-bearish"
                            : "text-trading-neutral"
                        }`}
                      >
                        {displaySpotLtp.toFixed(1)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono font-bold transition duration-300 ${
                          isLatestRow && futFlash === "up"
                            ? "text-trading-bullish"
                            : isLatestRow && futFlash === "down"
                            ? "text-trading-bearish"
                            : "text-trading-textActive"
                        }`}
                      >
                        {displayFutLtp.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-trading-textMuted">{row.open.toFixed(1)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-trading-textMuted">{row.high.toFixed(1)}</td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Module1;

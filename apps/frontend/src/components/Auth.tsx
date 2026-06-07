import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";
import { LoginSchema } from "@stock/shared";

const TICKERS = [
  "AAPL +1.24%","MSFT +0.87%","NVDA +3.12%","TSLA -1.45%","AMZN +0.63%",
  "GOOG +0.91%","META +2.18%","NFLX -0.74%","SPX +0.12%","NDX +0.34%",
  "NIFTY +0.84%","BANKNIFTY -0.32%","DXY -0.15%","GOLD +0.42%","BTC +1.87%",
  "ES1! +0.21%","NQ1! +0.38%","VIX -4.21%","EUR/USD -0.11%","GBP/USD +0.09%",
  "RELIANCE +1.02%","TCS +0.67%","HDFC -0.34%","INFY +1.15%","WIPRO +0.88%",
  "QQQ +0.41%","SPY +0.18%","IWM -0.29%","GLD +0.37%","TLT -0.52%",
  "102,450.00","98,312.50","4,521.75","18,432.10","22,847.30",
  "BID 102,448","ASK 102,452","LAST 102,450","VOL 1.2M","OI 284,310",
  "CALL 4500","PUT 4450","IV 18.4%","DELTA 0.52","GAMMA 0.04",
];

const ORDER_BOOK_ROWS = [
  "102,452.00  ████░░░░  284","102,451.50  ██████░░  512","102,451.00  ████████  891",
  "102,450.50  ██░░░░░░  143","102,450.00  ██████████ 1,204",
  "102,449.50  ████████  876","102,449.00  ██████░░  634","102,448.50  ████░░░░  321","102,448.00  ██░░░░░░  178",
];

interface FloatingElement {
  id: number;
  text: string;
  x: number;
  y: number;
  speed: number;
  opacity: number;
  direction: number;
  size: number;
  color: string;
  type: "ticker" | "order" | "number";
  angle: number;
}

function useFloatingElements(count: number, isDark: boolean): FloatingElement[] {
  const [elements, setElements] = useState<FloatingElement[]>([]);

  useEffect(() => {
    const pool = [...TICKERS, ...ORDER_BOOK_ROWS];
    // High-contrast, deeply saturated forest hues for light theme visibility
    const colors = isDark 
      ? ["#00FF88", "#FF3B5C", "#10B981", "#059669", "#94a3b8", "#64748b"]
      : ["#03543e", "#B91C1C", "#064e3b", "#047857", "#334155", "#475569"];
    const items: FloatingElement[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      text: pool[Math.floor(Math.random() * pool.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
      speed: 0.008 + Math.random() * 0.025,
      // Aggressively bumped up light theme opacities so they don't wash out
      opacity: isDark ? (0.04 + Math.random() * 0.04) : (0.06 + Math.random() * 0.04),
      direction: Math.random() > 0.5 ? 1 : -1,
      size: 10 + Math.floor(Math.random() * 5),
      color: colors[Math.floor(Math.random() * colors.length)],
      type: i % 3 === 0 ? "order" : i % 5 === 0 ? "number" : "ticker",
      angle: (Math.random() - 0.5) * 20,
    }));
    setElements(items);
  }, [count, isDark]);

  return elements;
}

function Background({ theme }: { theme: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const isDark = theme === "dark";
  const elements = useFloatingElements(55, isDark);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 35;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 35;
    };
    window.addEventListener("mousemove", handleMouseMove);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const drawAdvancedGrid = (t: number) => {
      const gridSize = 60;
      ctx.strokeStyle = isDark ? "rgba(0,255,136,0.035)" : "rgba(4,120,87,0.09)";
      ctx.lineWidth = 0.5;
      
      const offsetX = (t * 0.3 + mouseX) % gridSize;
      const offsetY = (t * 0.15 + mouseY) % gridSize;
      
      for (let x = -gridSize + offsetX; x < canvas.width + gridSize; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = -gridSize + offsetY; y < canvas.height + gridSize; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      ctx.strokeStyle = isDark ? "rgba(0,255,136,0.015)" : "rgba(4,120,87,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(canvas.width / 2 + mouseX, canvas.height / 2 + mouseY, Math.min(canvas.width, canvas.height) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    };

    const drawTrendLine = (t: number, startX: number, baseY: number, color: string, alpha: number) => {
      ctx.strokeStyle = color.replace(")", `,${alpha})`).replace("rgb(", "rgba(");
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let lastY = baseY;
      for (let x = startX; x < canvas.width + 100; x += 8) {
        const noise = Math.sin((x + t) * 0.02) * 18 + Math.sin((x + t * 1.3) * 0.05) * 9 + Math.sin((x + t * 0.7) * 0.1) * 5;
        const y = lastY + noise * 0.15 + (mouseY * 0.1);
        lastY = y;
        if (x === startX) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const drawCandlestick = (x: number, y: number, open: number, close: number, high: number, low: number, alpha: number) => {
      const isGreen = close > open;
      const col = isGreen 
        ? (isDark ? `rgba(0,255,136,${alpha})` : `rgba(4,120,87,${alpha + 0.06})`)
        : `rgba(255,59,92,${alpha + 0.04})`;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, y - high); ctx.lineTo(x, y - low); ctx.stroke();
      const bodyTop = Math.min(open, close);
      const bodyH = Math.abs(close - open) || 1;
      ctx.fillRect(x - 3, y - bodyTop - bodyH, 6, bodyH);
    };

    const animate = (ts: number) => {
      const t = ts * 0.04;
      timeRef.current = t;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawAdvancedGrid(t);

      [0.15, 0.38, 0.62, 0.82].forEach((frac, i) => {
        const upTrendColor = isDark ? "rgb(0,255,136)" : "rgb(4,120,87)";
        drawTrendLine(t + i * 40, 0, canvas.height * frac,
          i % 2 === 0 ? upTrendColor : "rgb(255,59,92)", isDark ? (0.05 + i * 0.01) : (0.11 + i * 0.01));
      });

      for (let i = 0; i < 12; i++) {
        const cx = ((i * 97 + t * 0.6) % canvas.width) - 20;
        const cy = 80 + (i * 73) % (canvas.height - 160) + (mouseY * 0.2);
        const o = 10 + Math.sin(t * 0.1 + i) * 8;
        const c = o + (Math.sin(t * 0.08 + i * 1.3) > 0 ? 1 : -1) * (4 + Math.random() * 10);
        drawCandlestick(cx, cy, o, c, o + 14, o - 14, 0.07);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => { 
      cancelAnimationFrame(animRef.current); 
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [theme, isDark]);

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
        {elementsRef.current.map((el) => (
          <div
            key={el.id}
            className="absolute select-none whitespace-nowrap font-semibold"
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              fontSize: `${el.size}px`,
              color: el.color,
              opacity: el.opacity,
              fontFamily: "'IBM Plex Mono', monospace",
              transform: `rotate(${el.angle}deg)`,
              animation: `float-${el.id % 8} ${12 + (el.id % 18)}s linear infinite`,
              animationDelay: `${-(el.id * 1.3)}s`,
            }}
          >
            {el.text}
          </div>
        ))}
      </div>
    </>
  );
}

function SuccessAnimation({ themeColor }: { themeColor: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-6">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-full h-full" style={{ animation: "spin-slow 3s linear infinite" }}>
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(4,120,87,0.15)" strokeWidth="1" />
          <circle cx="40" cy="40" r="36" fill="none" stroke={themeColor} strokeWidth="2"
            strokeDasharray="60 166" strokeLinecap="round" style={{ animation: "dash-rotate 1.5s ease-in-out infinite" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 40 24" width="40" height="24">
            <polyline points="0,18 10,8 18,16 30,4 40,4" fill="none" stroke={themeColor} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 70, animation: "draw-line 0.8s ease forwards" }} />
          </svg>
        </div>
      </div>
      <p className="font-mono text-xs tracking-[0.25em] uppercase glow-text" style={{ color: themeColor }}>
        ACCESS AUTHORIZED
      </p>
    </div>
  );
}

function LoadingAnimation({ themeColor }: { themeColor: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-4">
      <div className="flex items-end gap-1.5 h-10">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-1.5 rounded-sm"
            style={{
              background: i % 2 === 0 ? themeColor : "#FF3B5C",
              animation: `candle-${i} ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.08}s`,
              height: "40%",
            }}
          />
        ))}
      </div>
      <p className="font-mono text-[11px] tracking-[0.25em] uppercase opacity-90 animate-pulse glow-text" style={{ color: themeColor }}>
        CONNECTING SECURE PIPELINE
      </p>
    </div>
  );
}

export const Auth: React.FC = () => {
  const setAuth = useStore((state) => state.setAuth);
  const theme = useStore((state) => state.theme) || "light";
  const toggleTheme = useStore((state) => state.toggleTheme);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; speed: number; opacity: number }[]>([]);

  // Enforce Light Theme deploy priority on mount sequence
  useEffect(() => {
    if (theme !== "light" && toggleTheme) {
      toggleTheme();
    }
  }, []);

  useEffect(() => {
    setParticles(Array.from({ length: 25 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: 1 + Math.random() * 2, speed: 4 + Math.random() * 8, opacity: 0.15 + Math.random() * 0.25,
    })));
  }, []);

  const isDark = theme === "dark";

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError("");

    const result = LoginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as "email" | "password";
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/auth/login", { email, password }, { skipAuth: true });
      setIsSuccess(true);
      setTimeout(() => setAuth(response.user, response.accessToken), 1400);
    } catch (err: any) {
      setIsLoading(false);
      const msg = err?.response?.data?.message || "SECURITY BREAKER: Operator rejected or credentials dropped out-of-bounds.";
      setServerError(msg);
      setShake(true);
      setTimeout(() => setShake(false), 700);
    }
  }, [email, password, setAuth]);

  const greenPrimary = isDark ? "#00FF88" : "#047857"; 
  const greenGlow = isDark ? "rgba(0,255,136,0.45)" : "rgba(4,120,87,0.15)";

  const bg = isDark ? "#040406" : "#f4f6f9";
  const surface = isDark ? "rgba(10,10,15,0.82)" : "rgba(255,255,255,0.97)";
  
  // Heavily darkened the border for Light theme to create clear contrast cut lines
  const border = isDark ? "rgba(0,255,136,0.16)" : "rgba(4,120,87,0.5)";
  
  const textPrimary = isDark ? "#f8fafc" : "#0f172a";
  const textSecondary = isDark ? "#64748b" : "#334155";
  const inputBg = isDark ? "rgba(16,16,24,0.75)" : "rgba(241,245,249,0.95)";
  const inputBorder = isDark ? "rgba(0,255,136,0.18)" : "rgba(4,120,87,0.35)";
  const inputFocusBorder = greenPrimary;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        @keyframes float-0 { from { transform: translateY(0) rotate(-3deg); } to { transform: translateY(-120px) rotate(2deg); } }
        @keyframes float-1 { from { transform: translate(0,0) rotate(5deg); } to { transform: translate(80px,-100px) rotate(-4deg); } }
        @keyframes float-2 { from { transform: translate(0,0) rotate(-8deg); } to { transform: translate(-60px,-140px) rotate(6deg); } }
        @keyframes float-3 { from { transform: translateX(0) rotate(2deg); } to { transform: translateX(200px) rotate(-3deg); } }
        @keyframes float-4 { from { transform: translate(0,0) rotate(-5deg); } to { transform: translate(-100px,80px) rotate(8deg); } }
        @keyframes float-5 { from { transform: translateY(0) rotate(10deg); } to { transform: translateY(160px) rotate(-6deg); } }
        @keyframes float-6 { from { transform: translate(0,0) rotate(3deg); } to { transform: translate(120px,-80px) rotate(-2deg); } }
        @keyframes float-7 { from { transform: translate(0,0) rotate(-4deg); } to { transform: translate(-80px,120px) rotate(7deg); } }

        @keyframes scan-line {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.6; }
          100% { transform: translateY(620px); opacity: 0; }
        }

        @keyframes border-glow {
          0%, 100% { box-shadow: 0 0 25px rgba(4,120,87,0.02), inset 0 0 20px rgba(4,120,87,0.01); }
          50% { box-shadow: 0 0 35px rgba(4,120,87,0.08), inset 0 0 30px rgba(4,120,87,0.02); }
        }

        @keyframes input-energy {
          0% { left: -100%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-8px); filter: drop-shadow(0 0 10px rgba(255,59,92,0.4)); }
          20% { transform: translateX(8px); }
          30% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          50% { transform: translateX(-4px); }
          60% { transform: translateX(4px); }
          80% { transform: translateX(-2px); }
          90% { transform: translateX(2px); }
        }

        @keyframes red-flash {
          0%, 100% { box-shadow: 0 0 20px rgba(255,59,92,0.08); border-color: rgba(255,59,92,0.4); }
          50% { box-shadow: 0 0 40px rgba(255,59,92,0.25); border-color: rgba(255,59,92,0.8); }
        }

        @keyframes success-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(4,120,87,0.1); }
          50% { box-shadow: 0 0 60px rgba(4,120,87,0.3), border-color: #047857; }
        }

        @keyframes btn-hover-streak {
          0% { left: -60%; opacity: 0; }
          50% { opacity: 1; }
          100% { left: 120%; opacity: 0; }
        }

        @keyframes candle-0 { to { height: 75%; } }
        @keyframes candle-1 { to { height: 50%; } }
        @keyframes candle-2 { to { height: 95%; } }
        @keyframes candle-3 { to { height: 60%; } }
        @keyframes candle-4 { to { height: 85%; } }
        @keyframes candle-5 { to { height: 40%; } }
        @keyframes candle-6 { to { height: 70%; } }

        @keyframes spin-slow { to { transform: rotate(360deg); } }
        @keyframes dash-rotate {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -226; }
        }
        @keyframes draw-line {
          from { stroke-dashoffset: 70; }
          to { stroke-dashoffset: 0; }
        }

        @keyframes particle-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: var(--op); }
          50% { transform: translateY(-16px) scale(1.25); opacity: calc(var(--op) * 0.4); }
        }

        @keyframes market-open {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .auth-card {
          animation: market-open 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .card-shaking { animation: shake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
        .card-error-glow { animation: red-flash 0.8s ease-in-out infinite; }
        .card-success-glow { animation: success-glow 0.6s ease-in-out infinite; }

        .scan-line {
          position: absolute;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(4,120,87,0.1), ${isDark ? "rgba(0,255,136,0.5)" : "rgba(4,120,87,0.5)"}, rgba(4,120,87,0.1), transparent);
          animation: scan-line 4.5s ease-in-out infinite;
          pointer-events: none;
          z-index: 10;
        }

        .input-energy-line {
          position: absolute;
          bottom: 0; left: 0;
          height: 1.5px;
          width: 100%;
          background: linear-gradient(90deg, transparent, ${greenPrimary}, #059669, transparent);
          animation: input-energy 1.4s ease-in-out infinite;
          pointer-events: none;
        }

        .btn-streak {
          position: absolute;
          top: 0; bottom: 0;
          width: 60%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          pointer-events: none;
          transform: skewX(-15deg);
          display: ${isDark ? "block" : "none"};
        }

        .btn-streak-light {
          position: absolute;
          top: 0; bottom: 0;
          width: 60%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
          pointer-events: none;
          transform: skewX(-15deg);
          display: ${isDark ? "none" : "block"};
        }

        .btn-streak-animate {
          animation: btn-hover-streak 0.75s ease forwards;
        }

        .glow-text { text-shadow: 0 0 12px ${greenGlow}; }

        .mono { font-family: 'IBM Plex Mono', monospace; }
        .sans { font-family: 'Inter', sans-serif; }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: inherit;
          -webkit-box-shadow: 0 0 0px 1000px transparent inset;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      <div
        className="fixed inset-0 flex items-center justify-center sans px-4 sm:px-6 lg:px-8"
        style={{ background: bg, minHeight: "100vh" }}
      >
        <Background theme={theme} />

        {/* Ambient Particles */}
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: `${p.x}%`, top: `${p.y}%`,
                width: `${p.size}px`, height: `${p.size}px`,
                background: p.id % 2 === 0 ? greenPrimary : "#059669",
                "--op": p.opacity,
                opacity: p.opacity,
                animation: `particle-float ${p.speed}s ease-in-out infinite`,
                animationDelay: `${p.id * 0.4}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Theme Switch Action Override */}
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 w-9 h-9 flex items-center justify-center rounded-sm transition-all duration-200 opacity-60 hover:opacity-100"
          style={{
            background: isDark ? "rgba(12,12,18,0.7)" : "rgba(255,255,255,0.9)",
            border: `1px solid ${border}`,
            color: greenPrimary,
            backdropFilter: "blur(8px)",
          }}
          title="Toggle System Environment UI"
        >
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {/* Interactive Viewport Terminal Gate */}
        <div
          className={`auth-card relative w-full overflow-hidden ${shake ? "card-shaking" : ""} ${serverError ? "card-error-glow" : ""} ${isSuccess ? "card-success-glow" : ""}`}
          style={{
            maxWidth: "440px",
            background: surface,
            backdropFilter: "blur(20px) saturate(1.6)",
            border: `2px solid ${serverError ? "rgba(255,59,92,0.6)" : isSuccess ? greenPrimary : border}`,
            borderRadius: "4px",
            animation: shake || isDark ? "" : "border-glow 4.5s ease-in-out infinite",
            boxShadow: isDark
              ? "0 25px 80px -15px rgba(0,0,0,0.85), inset 0 1px 1px rgba(255,255,255,0.03)"
              : "0 30px 70px -10px rgba(4,120,87,0.12), 0 10px 30px -5px rgba(0,0,0,0.04)",
            zIndex: 10,
          }}
        >
          <div className="scan-line" />

          <div className="p-6 sm:p-9">
            
            {/* Context Analytical Header Area */}
            <div className="mb-8 text-center relative">
              <div className="flex items-center justify-center gap-2 mb-2.5">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: greenPrimary }} />
                <span className="mono text-[9px] tracking-[0.3em] font-bold uppercase opacity-95 glow-text" style={{ color: greenPrimary }}>
                 secure market analytics
                </span>
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: greenPrimary }} />
              </div>

              {/* Scope Frame Element */}
              <div className="relative inline-block px-6 py-1">
                <div className="absolute top-0 left-0 w-3 h-[1px]" style={{ background: greenPrimary }} />
                <div className="absolute top-0 left-0 w-[1px] h-3" style={{ background: greenPrimary }} />
                <div className="absolute top-0 right-0 w-3 h-[1px]" style={{ background: greenPrimary }} />
                <div className="absolute top-0 right-0 w-[1px] h-3" style={{ background: greenPrimary }} />
                <div className="absolute bottom-0 left-0 w-3 h-[1px]" style={{ background: greenPrimary }} />
                <div className="absolute bottom-0 left-0 w-[1px] h-3" style={{ background: greenPrimary }} />
                <div className="absolute bottom-0 right-0 w-3 h-[1px]" style={{ background: greenPrimary }} />
                <div className="absolute bottom-0 right-0 w-[1px] h-3" style={{ background: greenPrimary }} />

                <h1 className="font-extrabold tracking-[0.18em] uppercase text-center py-1 glow-text" style={{ fontSize: "24px", color: textPrimary }}>
                  TRADE PRO
                </h1>
              </div>

              <div className="flex items-center justify-center gap-3 mt-4">
                <div className="h-[1px] w-12 bg-slate-400 opacity-30" />
                <p className="text-[11px] font-mono font-semibold tracking-wider" style={{ color: textSecondary }}>
                  Analytical Ledger Environment
                </p>
                <div className="h-[1px] w-12 bg-slate-400 opacity-30" />
              </div>
            </div>

            {/* Application Dynamic States Engine */}
            {isSuccess ? (
              <SuccessAnimation themeColor={greenPrimary} />
            ) : isLoading ? (
              <LoadingAnimation themeColor={greenPrimary} />
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                
                {/* Email Operator Parameter block */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block mono text-[10px] uppercase font-bold tracking-wider" style={{ color: textSecondary }}>
                      Operator Email
                    </label>
                  </div>
                  <div className="relative">
                    <div
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: emailFocused ? greenPrimary : textSecondary, opacity: 0.9, transition: "color 0.2s" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
                      </svg>
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="operator@mail.com"
                      autoComplete="email"
                      className="w-full pl-9 pr-3 py-3 text-xs outline-none mono transition-all duration-200 font-medium"
                      style={{
                        background: inputBg,
                        border: `1px solid ${emailFocused ? inputFocusBorder : errors.email ? "#D92D20" : inputBorder}`,
                        borderRadius: "2px",
                        color: textPrimary,
                        boxShadow: emailFocused ? `0 0 14px ${greenGlow}` : "none",
                        caretColor: greenPrimary,
                      }}
                    />
                    {emailFocused && <div className="input-energy-line" />}
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 mono text-[10px] font-semibold" style={{ color: "#D92D20" }}>
                      ⚠ {errors.email}
                    </p>
                  )}
                </div>

                {/* Account Cryptographic Key sequence cipher block */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block mono text-[10px] uppercase font-bold tracking-wider" style={{ color: textSecondary }}>
                      Access Cipher Sequence
                    </label>
                  </div>
                  <div className="relative">
                    <div
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: passFocused ? greenPrimary : textSecondary, opacity: 0.9, transition: "color 0.2s" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setPassFocused(true)}
                      onBlur={() => setPassFocused(false)}
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      className="w-full pl-9 pr-3 py-3 text-xs outline-none mono transition-all duration-200 font-medium"
                      style={{
                        background: inputBg,
                        border: `1px solid ${passFocused ? inputFocusBorder : errors.password ? "#D92D20" : inputBorder}`,
                        borderRadius: "2px",
                        color: textPrimary,
                        boxShadow: passFocused ? `0 0 14px ${greenGlow}` : "none",
                        caretColor: greenPrimary,
                      }}
                    />
                    {passFocused && <div className="input-energy-line" />}
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 mono text-[10px] font-semibold" style={{ color: "#D92D20" }}>
                      ⚠ {errors.password}
                    </p>
                  )}
                </div>

                {/* Rejection Notification System */}
                {serverError && (
                  <div
                    className="p-3.5 rounded-sm font-mono text-[11px]"
                    style={{
                      background: "rgba(217,45,32,0.06)",
                      border: "1px solid rgba(217,45,32,0.3)",
                      color: "#B91C1C",
                    }}
                  >
                    <div className="font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <span>⚠️ SECURITY REJECTION ALERT</span>
                    </div>
                    <div className="opacity-95 font-medium leading-relaxed">{serverError}</div>
                  </div>
                )}

                {/* Primary Connection Trigger Mechanism */}
                <div className="pt-2">
                  <button
                    type="submit"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className="relative w-full rounded-sm py-3.5 font-mono text-xs font-bold tracking-[0.2em] uppercase transition-all duration-300 border overflow-hidden"
                    style={{
                      background: greenPrimary,
                      borderColor: greenPrimary,
                      color: "#ffffff",
                      boxShadow: isHovered ? `0 4px 20px ${greenGlow}` : "none",
                    }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span>LOGIN</span>
                      <span className="text-[10px] opacity-70 font-normal">↵</span>
                    </div>
                    <div className={`btn-streak ${isHovered ? "btn-streak-animate" : ""}`} />
                    <div className={`btn-streak-light ${isHovered ? "btn-streak-animate" : ""}`} />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Auth;
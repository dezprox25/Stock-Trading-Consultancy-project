import { useState, useCallback } from "react";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";
import { LoginSchema } from "@stock/shared";

function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="auth-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(4,120,87,0.07)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#auth-grid)" />
        <circle cx="50%" cy="50%" r="35%" fill="none" stroke="rgba(4,120,87,0.04)" strokeWidth="1"/>
        <circle cx="50%" cy="50%" r="20%" fill="none" stroke="rgba(4,120,87,0.03)" strokeWidth="0.5"/>
      </svg>
    </div>
  );
}

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

// ── Auth ──────────────────────────────────────────────────────────────────────
export const Auth: React.FC = () => {
  const setAuth = useStore((state) => state.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
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
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.post("/auth/login", { email, password }, { skipAuth: true });
        setIsSuccess(true);
        setTimeout(() => setAuth(response.user, response.accessToken), 800);
      } catch (err: any) {
        setIsLoading(false);
        setServerError(err?.message || "Login failed. Please check your credentials.");
      }
    },
    [email, password, setAuth]
  );

  const GREEN = "#047857";
  const BORDER = "rgba(4,120,87,0.18)";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');

        @keyframes auth-card-enter {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes auth-scan {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(2000px); opacity: 0; }
        }

        @keyframes auth-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }

        .auth-scan-line {
          position: fixed;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(4,120,87,0.4), rgba(4,120,87,0.6), rgba(4,120,87,0.4), transparent);
          animation: auth-scan 8s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }

        .auth-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(248,250,252,0.9);
          border: 1.5px solid rgba(4,120,87,0.15);
          border-radius: 2px;
          padding: 10px 14px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          color: #0f172a;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .auth-input:focus {
          border-color: rgba(4,120,87,0.5);
          box-shadow: 0 0 0 3px rgba(4,120,87,0.08);
        }
        .auth-input::placeholder { color: #94a3b8; }
        .auth-input-error { border-color: rgba(185,28,28,0.4) !important; }

        .auth-input-error:focus {
          border-color: rgba(185,28,28,0.5) !important;
          box-shadow: 0 0 0 3px rgba(185,28,28,0.07) !important;
        }

        .auth-btn {
          width: 100%;
          background: ${GREEN};
          color: #fff;
          border: none;
          border-radius: 2px;
          padding: 12px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
          box-shadow: 0 2px 12px rgba(4,120,87,0.25);
        }
        .auth-btn:hover:not(:disabled) { opacity: 0.9; }
        .auth-btn:active:not(:disabled) { transform: scale(0.99); }
        .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <GridBackground />
      <div className="auth-scan-line" />

      <div
        className="relative min-h-screen flex items-center justify-center px-4"
        style={{ background: "#f4f6f9", fontFamily: "'Inter', sans-serif", zIndex: 2 }}
      >
        <div
          className="relative w-full max-w-sm overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.97)",
            border: `1.5px solid ${BORDER}`,
            borderRadius: 2,
            boxShadow: "0 4px 32px rgba(4,120,87,0.08)",
            padding: "36px 32px 32px",
            animation: "auth-card-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Top accent bar */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{ height: 2, background: `linear-gradient(90deg, transparent, ${GREEN}70, transparent)` }}
          />

          <ScopeCorners size={10} />

          {/* Header */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="rounded-full"
                style={{ width: 7, height: 7, background: GREEN, display: "inline-block", animation: "auth-pulse 2s ease-in-out infinite" }}
              />
              <span className="mono text-[9px] font-bold tracking-[0.32em] uppercase" style={{ color: GREEN }}>
                Secure Market Analytics
              </span>
            </div>

            <h1
              className="mono font-black tracking-[0.14em] uppercase"
              style={{ fontSize: 20, color: "#0f172a", marginBottom: 4 }}
            >
              TradePro
            </h1>
            <p className="mono text-[9px] font-bold tracking-[0.28em] uppercase" style={{ color: "#94a3b8" }}>
              Trading Analytics Suite
            </p>
          </div>

          <div style={{ height: 1, background: "rgba(4,120,87,0.12)", marginBottom: 24 }} />

          {/* Success state */}
          {isSuccess ? (
            <div
              className="relative rounded-sm px-5 py-6 text-center overflow-hidden"
              style={{ background: "rgba(4,120,87,0.04)", border: "1px solid rgba(4,120,87,0.2)" }}
            >
              <div
                className="absolute top-0 left-0 right-0"
                style={{ height: 2, background: `linear-gradient(90deg, transparent, ${GREEN}60, transparent)` }}
              />
              <span
                className="inline-flex items-center justify-center mb-3"
                style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(4,120,87,0.1)", color: GREEN }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
              <p className="mono text-[11px] font-black tracking-[0.25em] uppercase" style={{ color: GREEN }}>
                Access Authorized
              </p>
              <p className="mono text-[9px] font-bold tracking-[0.2em] uppercase mt-2" style={{ color: "#94a3b8" }}>
                Opening dashboard
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* Email */}
              <div>
                <label className="mono block text-[9px] font-bold tracking-[0.28em] uppercase mb-2" style={{ color: "#64748b" }}>
                  Operator Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@mail.com"
                  autoComplete="email"
                  className={`auth-input ${errors.email ? "auth-input-error" : ""}`}
                />
                {errors.email && (
                  <p className="mono mt-1.5 text-[10px] font-semibold" style={{ color: "#B91C1C" }}>
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="mono block text-[9px] font-bold tracking-[0.28em] uppercase mb-2" style={{ color: "#64748b" }}>
                  Access Cipher
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className={`auth-input ${errors.password ? "auth-input-error" : ""}`}
                />
                {errors.password && (
                  <p className="mono mt-1.5 text-[10px] font-semibold" style={{ color: "#B91C1C" }}>
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Server error */}
              {serverError && (
                <div
                  className="relative rounded-sm px-4 py-3 text-[11px] font-semibold overflow-hidden"
                  style={{
                    background: "rgba(185,28,28,0.05)",
                    border: "1px solid rgba(185,28,28,0.2)",
                    color: "#B91C1C",
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  <div className="absolute top-0 left-0 right-0" style={{ height: 2, background: "linear-gradient(90deg, transparent, rgba(185,28,28,0.4), transparent)" }} />
                  {serverError}
                </div>
              )}

              <button type="submit" disabled={isLoading} className="auth-btn">
                {isLoading ? "Authenticating…" : "Login"}
              </button>
            </form>
          )}

          {/* Footer */}
          <p
            className="mono text-center mt-5 text-[8px] font-bold tracking-[0.2em] uppercase"
            style={{ color: "#cbd5e1" }}
          >
            System secured · Pivot Intelligence v1.0
          </p>
        </div>
      </div>
    </>
  );
};

export default Auth;
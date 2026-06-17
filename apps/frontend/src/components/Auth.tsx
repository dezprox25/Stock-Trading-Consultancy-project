import { useState, useCallback } from "react";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";
import { LoginSchema, RegisterSchema } from "@stock/shared";

const GREEN = "#047857";

type Mode = "login" | "register" | "verify-otp";

export const Auth: React.FC = () => {
  const setAuth = useStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [serverInfo, setServerInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const reset = () => {
    setErrors({});
    setServerError("");
    setServerInfo("");
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      reset();

      const result = LoginSchema.safeParse({ email, password });
      if (!result.success) {
        const fe: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          const f = err.path[0] as string;
          if (!fe[f]) fe[f] = err.message;
        });
        setErrors(fe);
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.post("/auth/login", { email, password }, { skipAuth: true });
        setIsSuccess(true);
        setTimeout(() => setAuth(response.user, response.accessToken), 800);
      } catch (err: any) {
        setIsLoading(false);
        if (err?.requiresVerification) {
          setPendingEmail(err.email || email);
          setMode("verify-otp");
          setServerInfo("OTP sent to your email. Please verify to continue.");
        } else {
          setServerError(err?.message || "Login failed. Please check your credentials.");
        }
      }
    },
    [email, password, setAuth]
  );

  // ── Register ────────────────────────────────────────────────────────────────
  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      reset();

      const result = RegisterSchema.safeParse({ email, password, name });
      if (!result.success) {
        const fe: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          const f = err.path[0] as string;
          if (!fe[f]) fe[f] = err.message;
        });
        setErrors(fe);
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.post("/auth/register", { email, password, name }, { skipAuth: true });
        setPendingEmail(email);
        setMode("verify-otp");
        setServerInfo(response.message || "OTP sent! Check your inbox.");
      } catch (err: any) {
        setServerError(err?.message || "Registration failed.");
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, name]
  );

  // ── Verify OTP ──────────────────────────────────────────────────────────────
  const handleVerifyOtp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      reset();

      if (!otp || otp.trim().length !== 6) {
        setErrors({ otp: "Please enter the 6-digit code." });
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.post("/auth/verify-otp", { email: pendingEmail, otp }, { skipAuth: true });
        setIsSuccess(true);
        setTimeout(() => setAuth(response.user, response.accessToken), 800);
      } catch (err: any) {
        setIsLoading(false);
        setServerError(err?.message || "Invalid OTP. Please try again.");
      }
    },
    [otp, pendingEmail, setAuth]
  );

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    @keyframes auth-enter {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes otp-enter {
      from { opacity: 0; transform: scale(0.96); }
      to   { opacity: 1; transform: scale(1); }
    }

    .auth-card { animation: auth-enter 0.5s cubic-bezier(0.16,1,0.3,1) both; font-family: 'Inter', sans-serif; }

    .auth-field-label {
      display: block; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
      color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;
    }

    .auth-input {
      width: 100%; box-sizing: border-box; background: #f8fafc;
      border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 11px 14px;
      font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500;
      color: #0f172a; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
    }
    .auth-input:focus { border-color: ${GREEN}; box-shadow: 0 0 0 3px rgba(4,120,87,0.12); background: #fff; }
    .auth-input::placeholder { color: #94a3b8; }
    .auth-input-error { border-color: #ef4444 !important; }
    .auth-input-error:focus { border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.1) !important; }

    .otp-input {
      width: 100%; box-sizing: border-box; background: #f8fafc;
      border: 2px solid #e2e8f0; border-radius: 10px; padding: 16px 14px;
      font-family: 'Courier New', monospace; font-size: 28px; font-weight: 900;
      color: ${GREEN}; outline: none; text-align: center; letter-spacing: 0.3em;
      transition: border-color 0.2s, box-shadow 0.2s;
      animation: otp-enter 0.3s ease both;
    }
    .otp-input:focus { border-color: ${GREEN}; box-shadow: 0 0 0 3px rgba(4,120,87,0.15); background: #fff; }
    .otp-input::placeholder { color: #cbd5e1; letter-spacing: 0.2em; font-size: 22px; }

    .auth-btn {
      width: 100%; background: ${GREEN}; color: #fff; border: none; border-radius: 8px;
      padding: 13px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 700;
      letter-spacing: 0.03em; cursor: pointer; transition: opacity 0.2s, transform 0.1s;
      box-shadow: 0 4px 14px rgba(4,120,87,0.3);
    }
    .auth-btn:hover:not(:disabled) { opacity: 0.9; }
    .auth-btn:active:not(:disabled) { transform: scale(0.99); }
    .auth-btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .auth-tab { background: none; border: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 6px; transition: all 0.15s; }
    .auth-tab-active { background: ${GREEN}; color: #fff; }
    .auth-tab-inactive { color: #64748b; }
    .auth-tab-inactive:hover { background: #f1f5f9; color: #0f172a; }

    .auth-link { background: none; border: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; color: ${GREEN}; text-decoration: underline; padding: 0; }
  `;

  return (
    <>
      <style>{styles}</style>

      <div style={{ width: "100%", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)", padding: 16, fontFamily: "'Inter', sans-serif" }}>
        <div className="auth-card" style={{ width: "100%", maxWidth: 480, background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, boxShadow: "0 10px 30px -5px rgba(0,0,0,0.06), 0 5px 15px -5px rgba(0,0,0,0.02)", overflow: "hidden" }}>
          <div style={{ height: 4, background: `linear-gradient(90deg, ${GREEN}, #10b981)` }} />

          <div style={{ padding: "40px 40px 32px" }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(4,120,87,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em" }}>TradePro</h1>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Trading Analytics Suite</p>
                </div>
              </div>

              {/* Tab switcher — only on login/register */}
              {mode !== "verify-otp" && !isSuccess && (
                <div style={{ display: "flex", gap: 4, background: "#f8fafc", borderRadius: 8, padding: 4 }}>
                  <button className={`auth-tab ${mode === "login" ? "auth-tab-active" : "auth-tab-inactive"}`} style={{ flex: 1 }} onClick={() => { setMode("login"); reset(); }}>Sign In</button>
                  <button className={`auth-tab ${mode === "register" ? "auth-tab-active" : "auth-tab-inactive"}`} style={{ flex: 1 }} onClick={() => { setMode("register"); reset(); }}>Create Account</button>
                </div>
              )}
            </div>

            {/* ── SUCCESS ── */}
            {isSuccess ? (
              <div style={{ background: "rgba(4,120,87,0.06)", border: "1.5px solid rgba(4,120,87,0.2)", borderRadius: 10, padding: "24px", textAlign: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: GREEN, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: GREEN }}>Access Authorized</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "#64748b" }}>Opening dashboard…</p>
              </div>

            ) : mode === "verify-otp" ? (
              /* ── OTP STEP ── */
              <div>
                <div style={{ background: "rgba(4,120,87,0.06)", border: "1.5px solid rgba(4,120,87,0.15)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: GREEN }}>📧 Check your inbox</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569" }}>We sent a 6-digit code to <strong>{pendingEmail}</strong></p>
                </div>

                {serverInfo && (
                  <div style={{ background: "rgba(4,120,87,0.06)", border: "1.5px solid rgba(4,120,87,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: GREEN, fontWeight: 500 }}>
                    {serverInfo}
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div>
                    <label className="auth-field-label">Verification Code</label>
                    <input
                      className={`otp-input ${errors.otp ? "auth-input-error" : ""}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      autoFocus
                    />
                    {errors.otp && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 500, color: "#ef4444" }}>{errors.otp}</p>}
                  </div>

                  {serverError && (
                    <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.2)", fontSize: 13, fontWeight: 500, color: "#dc2626" }}>
                      {serverError}
                    </div>
                  )}

                  <button type="submit" disabled={isLoading || otp.length !== 6} className="auth-btn">
                    {isLoading ? "Verifying…" : "Verify & Continue →"}
                  </button>

                  <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
                    Wrong email?{" "}
                    <button className="auth-link" type="button" onClick={() => { setMode("register"); setOtp(""); reset(); }}>
                      Go back
                    </button>
                  </p>
                </form>
              </div>

            ) : mode === "login" ? (
              /* ── LOGIN ── */
              <form onSubmit={handleLogin} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label className="auth-field-label">Email address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={`auth-input ${errors.email ? "auth-input-error" : ""}`} />
                  {errors.email && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 500, color: "#ef4444" }}>{errors.email}</p>}
                </div>
                <div>
                  <label className="auth-field-label">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" autoComplete="current-password" className={`auth-input ${errors.password ? "auth-input-error" : ""}`} />
                  {errors.password && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 500, color: "#ef4444" }}>{errors.password}</p>}
                </div>
                {serverError && (
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.2)", fontSize: 13, fontWeight: 500, color: "#dc2626" }}>
                    {serverError}
                  </div>
                )}
                <button type="submit" disabled={isLoading} className="auth-btn">
                  {isLoading ? "Signing in…" : "Sign In"}
                </button>
              </form>

            ) : (
              /* ── REGISTER ── */
              <form onSubmit={handleRegister} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label className="auth-field-label">Full Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" autoComplete="name" className={`auth-input ${errors.name ? "auth-input-error" : ""}`} />
                  {errors.name && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 500, color: "#ef4444" }}>{errors.name}</p>}
                </div>
                <div>
                  <label className="auth-field-label">Email address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={`auth-input ${errors.email ? "auth-input-error" : ""}`} />
                  {errors.email && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 500, color: "#ef4444" }}>{errors.email}</p>}
                </div>
                <div>
                  <label className="auth-field-label">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" className={`auth-input ${errors.password ? "auth-input-error" : ""}`} />
                  {errors.password && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 500, color: "#ef4444" }}>{errors.password}</p>}
                </div>
                {serverError && (
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.2)", fontSize: 13, fontWeight: 500, color: "#dc2626" }}>
                    {serverError}
                  </div>
                )}
                <button type="submit" disabled={isLoading} className="auth-btn">
                  {isLoading ? "Creating account…" : "Create Account & Send OTP"}
                </button>
              </form>
            )}

            <p style={{ textAlign: "center", marginTop: 24, fontSize: 11, fontWeight: 500, color: "#94a3b8" }}>
              Pivot Intelligence v1.0 · Secure
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Auth;
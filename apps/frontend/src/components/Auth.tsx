import { useState } from "react";
import { useStore } from "../store/useStore";
import { api } from "../utils/api";
import { RegisterSchema, LoginSchema } from "@stock/shared";

export const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const setAuth = useStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isLogin) {
        // Validate Inputs with Shared Schema
        const validate = LoginSchema.safeParse({ email, password });
        if (!validate.success) {
          setError(validate.error.errors[0].message);
          setLoading(false);
          return;
        }

        const data = await api.post("/auth/login", { email, password }, { skipAuth: true });
        setAuth(data.user, data.accessToken);
      } else {
        // Validate Inputs with Shared Schema
        const validate = RegisterSchema.safeParse({ email, password, name });
        if (!validate.success) {
          setError(validate.error.errors[0].message);
          setLoading(false);
          return;
        }

        await api.post("/auth/register", { email, password, name }, { skipAuth: true });
        setSuccess("Account created successfully! Please log in.");
        setIsLogin(true);
        setPassword("");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-trading-border bg-trading-surface p-8 shadow-2xl backdrop-blur-md">
      <div className="text-center">
        <span className="inline-block text-5xl mb-3">📈</span>
        <h2 className="font-sans text-3xl font-extrabold text-trading-textActive tracking-tight">
          {isLogin ? "Welcome Back" : "Create Account"}
        </h2>
        <p className="mt-2 text-sm text-trading-textMuted font-sans">
          {isLogin ? "Sign in to access your trading display" : "Sign up for intraday analytics access"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {/* Success Alert */}
        {success && (
          <div className="rounded-lg bg-trading-bullish/10 border border-trading-bullish/30 p-3 text-sm text-trading-bullish font-sans">
            {success}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="rounded-lg bg-trading-bearish/10 border border-trading-bearish/30 p-3 text-sm text-trading-bearish font-sans">
            {error}
          </div>
        )}

        {/* Name Field (Register Mode Only) */}
        {!isLogin && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-trading-textMuted mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
              className="w-full rounded-lg border border-trading-border bg-trading-bg px-4 py-2.5 text-sm text-trading-textActive placeholder-trading-textMuted/40 focus:border-trading-neutral focus:outline-none transition"
            />
          </div>
        )}

        {/* Email Field */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-trading-textMuted mb-2">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="trader@company.com"
            required
            className="w-full rounded-lg border border-trading-border bg-trading-bg px-4 py-2.5 text-sm text-trading-textActive placeholder-trading-textMuted/40 focus:border-trading-neutral focus:outline-none transition"
          />
        </div>

        {/* Password Field */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-trading-textMuted mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-lg border border-trading-border bg-trading-bg px-4 py-2.5 text-sm text-trading-textActive placeholder-trading-textMuted/40 focus:border-trading-neutral focus:outline-none transition"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-trading-neutral py-3 text-sm font-bold text-trading-bg hover:opacity-90 active:scale-95 transition disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5 text-trading-bg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <span>{isLogin ? "Sign In" : "Register"}</span>
          )}
        </button>
      </form>

      {/* Switch Toggle */}
      <div className="mt-6 text-center text-xs text-trading-textMuted font-sans">
        {isLogin ? (
          <p>
            Don't have an account?{" "}
            <button
              onClick={() => {
                setIsLogin(false);
                setError(null);
              }}
              className="font-bold text-trading-neutral hover:underline"
            >
              Sign Up
            </button>
          </p>
        ) : (
          <p>
            Already have an account?{" "}
            <button
              onClick={() => {
                setIsLogin(true);
                setError(null);
              }}
              className="font-bold text-trading-neutral hover:underline"
            >
              Sign In
            </button>
          </p>
        )}
      </div>
    </div>
  );
};
export default Auth;

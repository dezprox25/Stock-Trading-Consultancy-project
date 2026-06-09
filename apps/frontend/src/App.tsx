import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useSocket } from "./hooks/useSocket";
import { useStore } from "./store/useStore";
import { Auth } from "./components/Auth";
import { api } from "./utils/api";
import { Module1 } from "./components/Module1";
import { Module2 } from "./components/Module2";

const GREEN = "#047857";
const GREEN_GLOW = "rgba(4,120,87,0.15)";

function ScopeCorners({ size = 8 }: { size?: number }) {
  const s = `${size}px`;
  const style = { background: GREEN };
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

function NavigationLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className="relative flex items-center gap-3 px-4 py-3 transition-all overflow-hidden"
      style={{
        borderRadius: 2,
        background: isActive ? "rgba(4,120,87,0.1)" : "transparent",
        borderLeft: isActive ? `2px solid ${GREEN}` : "2px solid transparent",
        textDecoration: "none",
      }}
    >
      {isActive && (
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,120,87,0.08), transparent)" }} />
      )}
      <span
        className="relative font-mono text-[10px] font-black tracking-[0.15em] px-1.5 py-0.5"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          borderRadius: 2,
          background: isActive ? GREEN : "rgba(4,120,87,0.08)",
          color: isActive ? "#fff" : "var(--trading-text-muted)",
          border: `1px solid ${isActive ? GREEN : "rgba(4,120,87,0.2)"}`,
        }}
      >
        {icon}
      </span>
      <span
        className="relative font-mono text-[11px] font-bold tracking-wider"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          color: isActive ? GREEN : "var(--trading-text-muted)",
        }}
      >
        {label}
      </span>
      {isActive && (
        <span className="absolute right-3 w-1 h-1 rounded-full" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
      )}
    </Link>
  );
}

function TopBar({ user, handleLogout }: { user: any; handleLogout: () => void }) {
  const [time, setTime] = useState(new Date());
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const selectedTimeframe = useStore((state) => state.selectedTimeframe);
  const setSelectedTimeframe = useStore((state) => state.setSelectedTimeframe);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const handleCustomTimeframeClick = async () => {
    const value = window.prompt("Enter custom timeframe in minutes (e.g. 10, 15, 30):", "10");
    if (value) {
      const minutes = parseInt(value);
      if (isNaN(minutes) || minutes <= 0) { alert("Please enter a valid positive number."); return; }
      const customTf = `${minutes}m`;
      try {
        await api.post("/api/market/custom-timeframe", { timeframe: customTf });
        setSelectedTimeframe(customTf);
      } catch (err: any) {
        alert("Failed to configure custom timeframe: " + err.message);
      }
    }
  };

  const isCustomTf = !["1m", "3m", "5m"].includes(selectedTimeframe);

  const tfBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.12em",
    padding: "5px 12px",
    borderRadius: 2,
    border: `1px solid ${active ? GREEN : "var(--trading-border)"}`,
    background: active ? GREEN : "transparent",
    color: active ? "#fff" : "var(--trading-text-muted)",
    cursor: "pointer",
    transition: "all 0.15s",
    boxShadow: active ? `0 2px 8px ${GREEN_GLOW}` : "none",
  });

  const actionBtnStyle = (danger = false): React.CSSProperties => ({
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    padding: "5px 12px",
    borderRadius: 2,
    border: `1px solid ${danger ? "rgba(185,28,28,0.35)" : "var(--trading-border)"}`,
    background: "transparent",
    color: danger ? "var(--trading-bearish)" : "var(--trading-text-muted)",
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 overflow-hidden"
      style={{
        height: 56,
        background: "var(--trading-surface)",
        borderBottom: `1.5px solid var(--trading-border)`,
        boxShadow: "0 2px 16px rgba(4,120,87,0.06)",
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GREEN}50, transparent)` }} />

      {/* Left */}
      <div className="flex items-center gap-5">
        {/* Clock */}
        <div className="flex items-center gap-2 pr-5" style={{ borderRight: `1px solid var(--trading-border)` }}>
          <span className="font-mono text-[9px] font-bold tracking-[0.3em] uppercase" style={{ color: "var(--trading-text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
            TIME
          </span>
          <span className="font-mono font-black" style={{ fontSize: 15, color: GREEN, fontFamily: "'IBM Plex Mono', monospace" }}>
            {timeString}
          </span>
        </div>

        {/* Timeframe */}
        <div className="flex items-center gap-2 pr-5" style={{ borderRight: `1px solid var(--trading-border)` }}>
          <span className="font-mono text-[9px] font-bold tracking-[0.3em] uppercase mr-1" style={{ color: "var(--trading-text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
            TF
          </span>
          {[{ key: "1m", label: "1M" }, { key: "3m", label: "3M" }, { key: "5m", label: "5M" }].map((tf) => (
            <button key={tf.key} onClick={() => setSelectedTimeframe(tf.key)} style={tfBtnStyle(selectedTimeframe === tf.key)}>
              {tf.label}
            </button>
          ))}
          <button onClick={handleCustomTimeframeClick} style={tfBtnStyle(isCustomTf)}>
            {isCustomTf ? selectedTimeframe.toUpperCase() : "Custom"}
          </button>
        </div>

        {/* Feed */}
        <div className="flex items-center gap-2">
          <span className="rounded-full animate-pulse" style={{ width: 6, height: 6, background: GREEN, display: "inline-block", boxShadow: `0 0 6px ${GREEN}` }} />
          <span className="font-mono text-[9px] font-bold tracking-[0.25em] uppercase" style={{ color: "var(--trading-text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
            Market Feed: <span style={{ color: GREEN }}>Live</span>
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <button onClick={toggleTheme} style={actionBtnStyle()}>
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderLeft: `1px solid var(--trading-border)`, borderRight: `1px solid var(--trading-border)` }}>
          <span className="font-mono text-[9px] font-bold tracking-[0.25em] uppercase" style={{ color: "var(--trading-text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
            User
          </span>
          <span className="font-mono text-[11px] font-black" style={{ color: "var(--trading-text-active)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {user.name}
          </span>
        </div>
        <button onClick={handleLogout} style={actionBtnStyle(true)}>
          Logout
        </button>
      </div>
    </header>
  );
}

function MobileTabs() {
  const location = useLocation();

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    textAlign: "center",
    padding: "8px 0",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textDecoration: "none",
    borderRadius: 2,
    border: `1px solid ${active ? GREEN : "var(--trading-border)"}`,
    background: active ? "rgba(4,120,87,0.07)" : "transparent",
    color: active ? GREEN : "var(--trading-text-muted)",
    transition: "all 0.15s",
  });

  return (
    <div
      className="flex md:hidden sticky z-20 gap-2 px-3 py-2"
      style={{ top: 56, background: "var(--trading-surface)", borderBottom: `1.5px solid var(--trading-border)` }}
    >
      <Link to="/dashboard/module-1" style={tabStyle(location.pathname === "/dashboard/module-1")}>
        M1 · Pivot Table
      </Link>
      <Link to="/dashboard/module-2" style={tabStyle(location.pathname === "/dashboard/module-2")}>
        M2 · Strike Tracker
      </Link>
    </div>
  );
}

function App() {
  const user = useStore((state) => state.user);
  const clearAuth = useStore((state) => state.clearAuth);
  const theme = useStore((state) => state.theme);

  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  useSocket();

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); }
    catch (err) { console.error("Logout request failed:", err); }
    finally { clearAuth(); }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-trading-bg p-4 select-none">
        <Auth />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700;800&display=swap');
      `}</style>

      <div className="flex min-h-screen bg-trading-bg text-trading-textActive antialiased">

        {/* Sidebar */}
        <aside
          className="hidden md:flex fixed inset-y-0 left-0 z-30 flex-col overflow-hidden"
          style={{
            width: 260,
            background: "var(--trading-surface)",
            borderRight: `1.5px solid var(--trading-border)`,
            boxShadow: "2px 0 24px rgba(4,120,87,0.05)",
          }}
        >
          <div className="absolute top-0 bottom-0 right-0 w-[2px]" style={{ background: `linear-gradient(180deg, transparent, ${GREEN}40, transparent)` }} />

          {/* Logo */}
          <div
            className="relative flex flex-col justify-center px-6 overflow-hidden"
            style={{ height: 72, borderBottom: `1.5px solid var(--trading-border)` }}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GREEN}50, transparent)` }} />
            <ScopeCorners size={8} />

            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full animate-pulse" style={{ width: 6, height: 6, background: GREEN, display: "inline-block" }} />
              <span className="font-mono text-[9px] font-bold tracking-[0.3em] uppercase" style={{ color: GREEN, fontFamily: "'IBM Plex Mono', monospace" }}>
                Analytics Suite
              </span>
            </div>
            <h1 className="font-mono font-black tracking-[0.18em] uppercase" style={{ fontSize: 18, color: "var(--trading-text-active)", fontFamily: "'IBM Plex Mono', monospace" }}>
              TradePro
            </h1>
            <p className="font-mono text-[8px] font-bold tracking-[0.28em] uppercase mt-0.5" style={{ color: "var(--trading-text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
              Trading Analytics Suite
            </p>
          </div>

          {/* Section label */}
          <div className="px-4 pt-5 pb-2">
            <span className="font-mono text-[8px] font-bold tracking-[0.35em] uppercase" style={{ color: "var(--trading-border)", fontFamily: "'IBM Plex Mono', monospace" }}>
              Modules
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 space-y-1">
            <NavigationLink to="/dashboard/module-1" label="Module 1 – Pivot Table" icon="M1" />
            <NavigationLink to="/dashboard/module-2" label="Module 2 – Strike Tracker" icon="M2" />
          </nav>

          {/* Footer */}
          <div className="px-5 py-4" style={{ borderTop: `1px solid var(--trading-border)` }}>
            <span className="font-mono text-[8px] font-bold tracking-[0.2em] uppercase" style={{ color: "var(--trading-border)", fontFamily: "'IBM Plex Mono', monospace" }}>
              Pivot Intelligence v1.0
            </span>
          </div>
        </aside>

        {/* Main */}
        <div className="md:pl-[260px] flex flex-col flex-1 min-h-screen min-w-0 overflow-x-hidden">
          <TopBar user={user} handleLogout={handleLogout} />
          <MobileTabs />
          <main className="flex-1 overflow-y-auto min-w-0 max-w-full overflow-x-hidden">
            <Routes>
              <Route path="/dashboard/module-1" element={<Module1 />} />
              <Route path="/dashboard/module-2" element={<Module2 />} />
              <Route path="*" element={<Navigate to="/dashboard/module-1" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
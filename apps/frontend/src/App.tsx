import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useSocket } from "./hooks/useSocket";
import { useStore } from "./store/useStore";
import { Auth } from "./components/Auth";
import { api } from "./utils/api";
import { Module1 } from "./components/Module1";
import { Module2 } from "./components/Module2";

function NavigationLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-sans font-bold transition-all ${
        isActive
          ? "bg-trading-neutral/15 text-trading-neutral border-l-4 border-trading-neutral"
          : "text-trading-textMuted hover:bg-trading-surface hover:text-trading-textActive"
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function TopBar({ user, handleLogout }: { user: any; handleLogout: () => void }) {
  const [time, setTime] = useState(new Date());
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return (
    <header className="flex h-16 items-center justify-between border-b border-trading-border bg-trading-surface px-6 sticky top-0 z-30 select-none">
      <div className="flex items-center space-x-6">
        {/* Dynamic Clock */}
        <div className="flex items-center space-x-2 border-r border-trading-border pr-6">
          <span className="text-xs font-bold text-trading-textMuted uppercase tracking-wider">Time:</span>
          <span className="font-mono text-sm font-extrabold text-trading-neutral">{timeString}</span>
        </div>

        {/* Connection Status */}
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-trading-bullish animate-pulse"></div>
          <span className="text-xs font-sans font-bold text-trading-textMuted uppercase tracking-wider">
            Market Feed: Live
          </span>
        </div>
      </div>

      {/* User profile & Logout */}
      <div className="flex items-center space-x-4">
        {/* Light/Dark Toggle */}
        <button
          onClick={toggleTheme}
          className="rounded border border-trading-border bg-trading-bg hover:bg-trading-border/80 px-3 py-1.5 text-xs font-sans font-bold text-trading-textActive transition active:scale-95 flex items-center gap-1.5"
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-sans text-trading-textMuted uppercase tracking-wider">User:</span>
          <span className="text-sm font-sans font-extrabold text-trading-textActive">
            {user.name}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="rounded border border-trading-border bg-trading-bg hover:bg-trading-border/80 px-3 py-1.5 text-xs font-sans font-bold text-trading-bearish transition active:scale-95"
        >
          Logout
        </button>
      </div>
    </header>
  );
}

function MobileTabs() {
  const location = useLocation();

  return (
    <div className="flex border-b border-trading-border bg-trading-surface p-1 select-none md:hidden gap-1.5 sticky top-16 z-20 shadow-sm">
      <Link
        to="/dashboard/module-1"
        className={`flex-1 text-center py-2.5 text-xs font-bold transition-all rounded-lg ${
          location.pathname === "/dashboard/module-1"
            ? "bg-trading-neutral/10 text-trading-neutral border border-trading-neutral/25"
            : "text-trading-textMuted hover:text-trading-textActive"
        }`}
      >
        📊 Pivot Table
      </Link>
      <Link
        to="/dashboard/module-2"
        className={`flex-1 text-center py-2.5 text-xs font-bold transition-all rounded-lg ${
          location.pathname === "/dashboard/module-2"
            ? "bg-trading-neutral/10 text-trading-neutral border border-trading-neutral/25"
            : "text-trading-textMuted hover:text-trading-textActive"
        }`}
      >
        ⚡ Strike Tracker
      </Link>
    </div>
  );
}

function App() {
  const user = useStore((state) => state.user);
  const clearAuth = useStore((state) => state.clearAuth);
  const theme = useStore((state) => state.theme);

  // Synchronize document element class with store theme state
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Hook establishes a persistent connection to Socket.io whenever user is authenticated
  useSocket();

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      clearAuth();
    }
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
      <div className="flex min-h-screen bg-trading-bg text-trading-textActive antialiased selection:bg-trading-neutral selection:text-trading-bg">
        {/* Left Sidebar (Hidden on mobile/tablet) */}
        <aside className="hidden md:flex fixed inset-y-0 left-0 z-20 w-64 flex-col border-r border-trading-border bg-trading-surface select-none">
          {/* Logo */}
          <div className="flex h-16 items-center px-6 border-b border-trading-border gap-3">
            <span className="text-2xl">📈</span>
            <span className="font-sans text-lg font-black tracking-widest text-trading-textActive uppercase">
              TRADEPRO
            </span>
          </div>
          
          {/* Navigation Links */}
          <nav className="flex-1 space-y-1.5 p-4">
            <NavigationLink to="/dashboard/module-1" label="Module 1 - Pivot Table" icon="📊" />
            <NavigationLink to="/dashboard/module-2" label="Module 2 - Strike Tracker" icon="⚡" />
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="md:pl-64 flex flex-col flex-1 min-h-screen min-w-0 overflow-x-hidden">
          {/* Top Bar */}
          <TopBar user={user} handleLogout={handleLogout} />

          {/* Mobile responsive navigation tabs */}
          <MobileTabs />

          {/* Page Content */}
          <main className="flex-1 p-6 overflow-y-auto min-w-0 max-w-full overflow-x-hidden">
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

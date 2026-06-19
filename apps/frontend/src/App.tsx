import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useSocket } from "./hooks/useSocket";
import { useStore } from "./store/useStore";
import { Auth } from "./components/Auth";
import { api } from "./utils/api";
import { Module1 } from "./components/Module1";
import { Module2 } from "./components/Module2";
import { PanelLeftClose, PanelLeftOpen, Columns } from "lucide-react";



const GREEN = "#047857";

// ── Sidebar nav link ──────────────────────────────────────────────────────────
function NavigationLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: isActive ? GREEN : "transparent",
        textDecoration: "none",
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 800,
          padding: "3px 7px",
          borderRadius: 5,
          background: isActive ? "rgba(255,255,255,0.2)" : "rgba(4,120,87,0.1)",
          color: isActive ? "#fff" : GREEN,
          letterSpacing: "0.05em",
        }}
      >
        {icon}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: isActive ? "#fff" : "var(--trading-text-active)",
            letterSpacing: "0.01em",
          }}
        >
          {label.split(" – ")[0]}
        </span>
        {label.includes(" – ") && (
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 500,
              color: isActive ? "rgba(255,255,255,0.75)" : "var(--trading-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {label.split(" – ")[1]}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({
  user,
  handleLogout,
  isSidebarCollapsed,
  toggleSidebar,
  isSplitActive,
  handleSplitToggle,
}: {
  user: any;
  handleLogout: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isSplitActive: boolean;
  handleSplitToggle: () => void;
}) {
  const [time, setTime] = useState(new Date());
  const selectedTimeframe = useStore((s) => s.selectedTimeframe);
  const setSelectedTimeframe = useStore((s) => s.setSelectedTimeframe);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString("en-US", {
    hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const handleCustomTf = async () => {
    const val = window.prompt("Enter custom timeframe in minutes (e.g. 10, 15, 30):", "10");
    if (val) {
      const mins = parseInt(val);
      if (isNaN(mins) || mins <= 0) { alert("Please enter a valid positive number."); return; }
      const customTf = `${mins}m`;
      try {
        await api.post("/api/market/custom-timeframe", { timeframe: customTf });
        setSelectedTimeframe(customTf);
      } catch (err: any) {
        alert("Failed to configure custom timeframe: " + err.message);
      }
    }
  };

  const isCustomTf = !["1m", "3m", "5m"].includes(selectedTimeframe);

  const tfBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    padding: "5px 14px",
    borderRadius: 6,
    border: `1.5px solid ${active ? GREEN : "var(--trading-border)"}`,
    background: active ? GREEN : "transparent",
    color: active ? "#fff" : "var(--trading-text-muted)",
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <header
      style={{
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "var(--trading-surface)",
        borderBottom: "1.5px solid var(--trading-border)",
        position: "sticky",
        top: 0,
        zIndex: 30,
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* Hamburger (mobile) */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <button
          className="md:hidden"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          aria-label="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--trading-text-muted)" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {/* Sidebar Collapse/Expand Toggle (Desktop only) */}
        <button
          onClick={toggleSidebar}
          className="hidden md:flex sidebar-toggle-btn"
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>

        {/* Clock */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 20, borderRight: "1.5px solid var(--trading-border)" }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: "var(--trading-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Time</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 800, color: "var(--trading-text-active)" }}>{timeStr}</span>
        </div>

        {/* Timeframe */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 20, borderRight: "1.5px solid var(--trading-border)" }}>
          {[{ key: "1m", label: "1M" }, { key: "3m", label: "3M" }, { key: "5m", label: "5M" }].map((tf) => (
            <button key={tf.key} onClick={() => setSelectedTimeframe(tf.key)} style={tfBtn(selectedTimeframe === tf.key)}>
              {tf.label}
            </button>
          ))}
          <button onClick={handleCustomTf} style={tfBtn(isCustomTf)}>
            {isCustomTf ? selectedTimeframe.toUpperCase() : "Custom"}
          </button>
        </div>

        {/* Market feed */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, display: "inline-block", boxShadow: `0 0 0 2px rgba(4,120,87,0.25)` }} className="animate-pulse" />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--trading-text-muted)" }}>
            Market Feed: <span style={{ color: GREEN }}>Live</span>
          </span>
        </div>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Split Screen Button */}
        <button
          onClick={handleSplitToggle}
          style={{
            fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
            padding: "5px 14px", borderRadius: 6,
            border: `1.5px solid ${isSplitActive ? "var(--trading-bearish)" : "var(--trading-border)"}`,
            background: isSplitActive ? "rgba(239, 68, 68, 0.08)" : "transparent",
            color: isSplitActive ? "var(--trading-bearish)" : "var(--trading-text-muted)",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            transition: "all 0.15s ease",
          }}
          className="hidden md:flex"
          title={isSplitActive ? "Exit Split Screen" : "Toggle Split Screen"}
        >
          {isSplitActive ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 800 }}>✕</span>
              <span>Exit Split Screen</span>
            </>
          ) : (
            <>
              <Columns size={14} />
              <span>Split Screen</span>
            </>
          )}
        </button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingLeft: 12, borderLeft: "1.5px solid var(--trading-border)" }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 600, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>User</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: "var(--trading-text-active)" }}>{user.name}</span>
        </div>

        <button
          onClick={handleLogout}
          style={{
            fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
            padding: "5px 14px", borderRadius: 6,
            border: "1.5px solid rgba(229,57,53,0.4)", background: "transparent",
            color: "var(--trading-bearish)", cursor: "pointer", letterSpacing: "0.05em",
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}

// ── Mobile bottom tabs ────────────────────────────────────────────────────────
function MobileTabs() {
  const location = useLocation();
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, textAlign: "center", padding: "8px 0",
    fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.05em", textTransform: "uppercase", textDecoration: "none",
    borderRadius: 6,
    border: `1.5px solid ${active ? GREEN : "var(--trading-border)"}`,
    background: active ? GREEN : "transparent",
    color: active ? "#fff" : "var(--trading-text-muted)",
    transition: "all 0.15s",
  });
  return (
    <div
      className="flex md:hidden sticky z-20 gap-2 px-3 py-2"
      style={{ top: 60, background: "var(--trading-surface)", borderBottom: "1.5px solid var(--trading-border)" }}
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

// ── Root app ──────────────────────────────────────────────────────────────────
function App() {
  const user = useStore((s) => s.user);
  const setAuth = useStore((s) => s.setAuth);
  const clearAuth = useStore((s) => s.clearAuth);

  const [isInitializing, setIsInitializing] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const isSplitActive = location.pathname.includes("split");
  const handleSplitToggle = () => {
    if (isSplitActive) {
      navigate("/dashboard/module-1");
    } else {
      navigate("/dashboard/split-view");
    }
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/auth/refresh", { method: "POST" });
        if (response.ok) {
          const data = await response.json();
          if (data.accessToken && data.user) {
            setAuth(data.user, data.accessToken);
          }
        }
      } catch (err) {
        console.warn("[App] Silent auth refresh failed:", err);
      } finally {
        setIsInitializing(false);
      }
    };
    checkAuth();
  }, [setAuth]);

  useSocket();

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); }
    catch (err) { console.error("Logout request failed:", err); }
    finally { clearAuth(); }
  };

  if (isInitializing) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--trading-bg)", color: "var(--trading-text-muted)", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", border: `3.5px solid ${GREEN}`, borderTopColor: "transparent", display: "inline-block" }} className="animate-spin" />
          Synchronising session…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--trading-bg)", padding: 16 }}>
        <Auth />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh", background: "var(--trading-bg)" }}>

        {/* Sidebar */}
        <aside
          className={`hidden md:flex sidebar-aside ${isSidebarCollapsed || isSplitActive ? "collapsed" : ""}`}
        >
          <div style={{ width: 240, display: "flex", flexDirection: "column", height: "100%", flexShrink: 0 }}>
            {/* Logo */}
            <div
              style={{
                height: 80, display: "flex", flexDirection: "column",
                justifyContent: "center", padding: "0 20px",
                borderBottom: "1.5px solid var(--trading-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>  
              </div>
              <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 30, fontWeight: 900, color: "var(--trading-text-active)", letterSpacing: "0.05em", margin: 0 }}>
                TradePro
              </h1>
      
            </div>

            {/* Section label */}
            <div style={{ padding: "18px 20px 8px" }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: "var(--trading-text-muted)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Modules
              </span>
            </div>

            {/* Nav */}
            <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              <NavigationLink to="/dashboard/module-1" label="Module 1 – Pivot Table" icon="M1" />
              <NavigationLink to="/dashboard/module-2" label="Module 2 – Strike Tracker" icon="M2" />
              <NavigationLink to="/dashboard/split-view" label="Split View – Multi-Panel" icon="🖥️" />
            </nav>
          </div>
        </aside>

        {/* Main */}
        <div className={`main-layout ${isSidebarCollapsed || isSplitActive ? "collapsed" : ""}`}>
          <TopBar
            user={user}
            handleLogout={handleLogout}
            isSidebarCollapsed={isSidebarCollapsed}
            toggleSidebar={toggleSidebar}
            isSplitActive={isSplitActive}
            handleSplitToggle={handleSplitToggle}
          />
          <MobileTabs />
          <main style={{ flex: 1, overflowY: "auto" }}>
            <Routes>
              <Route path="/dashboard/module-1" element={<Module1 />} />
              <Route path="/dashboard/module-2" element={<Module2 />} />
              <Route
                path="/dashboard/split-view"
                element={
                  <div className="split-view-container">
                    <div className="split-panel">
                      <Module1 isSplit={true} />
                    </div>
                    <div className="split-panel">
                      <Module2 isSplit={true} />
                    </div>
                  </div>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard/module-1" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </>
  );
}


export default App;

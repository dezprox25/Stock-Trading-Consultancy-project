import { useSocket } from "./hooks/useSocket";
import { useStore } from "./store/useStore";
import { Auth } from "./components/Auth";
import { api } from "./utils/api";
import { Module1 } from "./components/Module1";
import { Module2 } from "./components/Module2";

function App() {
  const user = useStore((state) => state.user);
  const clearAuth = useStore((state) => state.clearAuth);

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
    <div className="flex min-h-screen flex-col bg-trading-bg text-trading-textActive antialiased selection:bg-trading-neutral selection:text-trading-bg">
      <header className="flex h-16 items-center justify-between border-b border-trading-border bg-trading-surface px-6">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">📈</span>
          <h1 className="font-sans text-xl font-extrabold tracking-wider text-trading-textActive uppercase">
            Dezprox <span className="text-trading-neutral">Intraday</span>
          </h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="h-2.5 w-2.5 rounded-full bg-trading-bullish animate-pulse"></div>
            <span className="text-sm font-sans font-medium text-trading-textMuted">
              Market Feed: Live
            </span>
          </div>
          <div className="flex items-center space-x-3 border-l border-trading-border pl-6">
            <span className="text-sm font-sans text-trading-textActive font-medium">
              {user.name}
            </span>
            <button
              onClick={handleLogout}
              className="rounded bg-trading-border hover:bg-trading-border/80 px-3 py-1.5 text-xs font-sans font-bold text-trading-bearish transition active:scale-95"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Module 1: Strike Price Indicator & Pivot Trading Engine */}
        <section className="space-y-4">
          <div className="border-b border-trading-border pb-2">
            <h2 className="font-sans text-sm font-black tracking-widest text-trading-neutral uppercase">
              Module 1: Strike Price Indicator & Pivot Trading Engine
            </h2>
          </div>
          <Module1 />
        </section>

        {/* Module 2: Option strike monitor session */}
        <section className="space-y-4">
          <div className="border-b border-trading-border pb-2">
            <h2 className="font-sans text-sm font-black tracking-widest text-trading-neutral uppercase">
              Module 2: 10-Strike Options Horizontal Tracker
            </h2>
          </div>
          <Module2 />
        </section>
      </main>
    </div>
  );
}

export default App;
//

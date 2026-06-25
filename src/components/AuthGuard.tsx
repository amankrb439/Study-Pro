import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("examship_guest_user");
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (e) {
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  const login = () => {
    const mockUser = {
      uid: "elite-guest-user",
      displayName: "Elite Scholar",
      email: "guest@examship.elite",
    };
    localStorage.setItem("examship_guest_user", JSON.stringify(mockUser));
    setUser(mockUser);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <Loader2 className="animate-spin h-8 w-8 text-brand-500 mx-auto mb-4" />
          <p>Loading session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/10 via-transparent to-purple-900/10 pointer-events-none" />
        <div className="text-center z-10 max-w-md w-full glass-card p-8 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <h1 className="text-4xl font-extrabold mb-3 tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">
            ExamShip Elite
          </h1>
          <p className="text-slate-300 text-sm mb-8">
            Access your permanent exam knowledge library. Generate source-grounded exam questions, track your streaks, and prepare with elite mock assessments.
          </p>
          <button
            onClick={login}
            className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold py-3 px-8 rounded-full transition-all duration-200 shadow-lg shadow-blue-600/20"
          >
            Enter ExamShip Elite
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


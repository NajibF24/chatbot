import React, { useState } from 'react';
import axios from 'axios';

const Login = ({ setUser }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // STATE BARU: Untuk mengontrol visibilitas Avatar
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/api/auth/login', 
        { username, password },
        { withCredentials: true } 
      );
      
      console.log('✅ Login successful');
      setUser(response.data.user);
      
    } catch (err) {
      console.error('❌ Login failed', err);
      
      let errorMessage = 'Login failed';
      if (err.response) {
        if (err.response.status === 401) {
          errorMessage = 'Invalid username or password';
        } else if (err.response.status === 500) {
          errorMessage = 'Server error - please try again';
        } else {
          errorMessage = err.response.data?.error || 'An error occurred';
        }
      } else if (err.request) {
        errorMessage = 'Cannot connect to server. Check your connection.';
      } else {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#0a0f1c] font-sans overflow-hidden relative">
      
      {/* =========================================
          BAGIAN KIRI: FORMULIR LOGIN
         ========================================= */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 sm:p-12 z-20 relative bg-[#0a0f1c]">
        
        {/* Background Effects (Subtle) */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
           <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-900 opacity-10 blur-[100px]"></div>
           <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[30%] rounded-full bg-blue-900 opacity-10 blur-[80px]"></div>
           <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5"></div>
        </div>

        <div className="w-full max-w-md z-10">
          
          {/* Logo & Header */}
          <div className="text-center mb-10">
             <div className="flex flex-col items-center justify-center gap-3 mb-4">
                <img 
                    src="/assets/favicon_gys.ico" 
                    alt="GYS Logo" 
                    className="w-14 h-14 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                />
                <div className="flex items-center gap-2 mt-2">
                   <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                   <span className="text-cyan-400 text-[0.65rem] tracking-[0.2em] font-bold uppercase">System Operational</span>
                </div>
             </div>
             <h1 className="text-3xl font-bold text-white tracking-widest">PORTAL AI</h1>
          </div>

          {/* Login Card */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-md shadow-2xl relative">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-2">Welcome Back</h2>
              <p className="text-gray-400 text-sm">Enter credentials to access the system.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              {/* Username Input */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-cyan-400 font-semibold ml-1">Enterprise ID / Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-500 group-focus-within:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all duration-300"
                    placeholder="Enter your AD Username"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-cyan-400 font-semibold ml-1">Access Key</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-500 group-focus-within:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all duration-300"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center animate-pulse">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Checkbox */}
              <div className="flex items-center text-sm justify-center">
                <label className="flex items-center text-gray-400 cursor-pointer hover:text-white transition-colors">
                  <input type="checkbox" className="form-checkbox h-4 w-4 text-cyan-500 rounded border-gray-600 bg-gray-800 focus:ring-offset-gray-900" />
                  <span className="ml-2">Remember device</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full relative overflow-hidden group bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-bold py-4 rounded-lg transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>AUTHENTICATING...</span>
                    </>
                  ) : (
                    <>
                      <span>INITIALIZE SESSION</span>
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </div>
              </button>
            </form>
          </div>

          <div className="mt-8 text-center">
            <p className="text-gray-500 text-xs">
              Restricted Access. Authorized Personnel Only.<br/>
              &copy; 2026 PT Garuda Yamato Steel.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================
          BAGIAN KANAN: GAMBAR DENGAN GRADASI HALUS
         ========================================= */}
      <div className="hidden lg:block lg:w-1/2 relative h-screen">
        <img 
            src="/assets/login.jpeg" 
            alt="Garuda Yamato Steel Building"
            className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute top-0 left-0 w-64 h-full bg-gradient-to-r from-[#0a0f1c] via-[#0a0f1c]/70 to-transparent z-10 pointer-events-none"></div>
      </div>

      {/* =========================================
          FLOATING AVATAR WIDGET (ADDITION)
         ========================================= */}
      
      {/* 1. Iframe Container (Popup) */}
      {isAvatarOpen && (
        <div className="fixed bottom-24 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-[#0a0f1c]/90 border border-cyan-500/30 p-2 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.2)] backdrop-blur-xl w-[350px] sm:w-[400px] h-[500px] flex flex-col relative overflow-hidden">
             
             {/* Header kecil di dalam popup */}
             <div className="flex justify-between items-center px-3 py-2 border-b border-white/10 mb-1">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                   <span className="text-cyan-400 text-xs font-bold tracking-widest uppercase">Live Assistant</span>
                </div>
                {/* Tombol Close Kecil (Opsional, user bisa klik tombol bulat besar juga) */}
                <button 
                  onClick={() => setIsAvatarOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
             </div>

             {/* The Iframe */}
             <iframe 
                src="https://chat.unith.ai/none-1579/assistit-24328?api_key=abab404e3143433e923c0b016f302081"
                width="100%" 
                height="100%" 
                allow="microphone"
                title="Digital Receptionist"
                className="flex-1 rounded-xl border-none bg-white/5"
             ></iframe>
          </div>
        </div>
      )}

      {/* 2. Floating Toggle Button */}
      <button
        onClick={() => setIsAvatarOpen(!isAvatarOpen)}
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.6)] border-2 border-cyan-400/50 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isAvatarOpen ? 'bg-red-500/80 hover:bg-red-600' : 'bg-cyan-600/80 hover:bg-cyan-500'}`}
      >
        {isAvatarOpen ? (
           // Icon X (Close) saat terbuka
           <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
           </svg>
        ) : (
           // Icon Chat/Avatar saat tertutup
           <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
           </svg>
        )}
        
        {/* Notification Dot (Hiasan) */}
        {!isAvatarOpen && (
          <span className="absolute top-0 right-0 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
          </span>
        )}
      </button>

    </div>
  );
};

export default Login;
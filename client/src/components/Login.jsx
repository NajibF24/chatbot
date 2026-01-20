import React, { useState } from 'react';
import axios from 'axios';

const Login = ({ setUser }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex w-full bg-[#0a0f1c] text-white font-sans overflow-hidden relative">
      
      {/* LEFT SIDE - Cyber Form (Sekarang di Kiri) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 z-20 relative border-r border-white/5 bg-[#0a0f1c]/90 backdrop-blur-sm">
        
        {/* Background Effects untuk sisi Form */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
           <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-gys-navy opacity-10 blur-[120px]"></div>
           <div className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-cyan-900 opacity-10 blur-[100px]"></div>
           <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
        </div>

        <div className="w-full max-w-md mx-auto z-10">
          
          {/* Mobile Header (Hanya muncul di HP) */}
          <div className="lg:hidden mb-8 text-center">
            <img src="/assets/favicon_gys.ico" alt="Logo" className="w-12 h-12 mx-auto mb-4"/>
            <h2 className="text-xl font-bold tracking-widest text-white">PORTAL AI</h2>
          </div>

          {/* Desktop Logo & Status Badge */}
          <div className="hidden lg:block mb-10">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-cyan-400 text-xs tracking-[0.2em] font-bold uppercase">System Operational</span>
             </div>
             <img 
                src="/assets/favicon_gys.ico" 
                alt="GYS Logo" 
                className="w-12 h-12 drop-shadow-[0_0_15px_rgba(0,180,255,0.5)]"
             />
          </div>

          {/* Login Card */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-xl shadow-2xl">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
              <p className="text-gray-400 text-sm">Enter your Enterprise credentials to access the neural network.</p>
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
              <div className="flex items-center text-sm">
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
            <p className="text-gray-600 text-xs">
              Restricted Access. Authorized Personnel Only.<br/>
              &copy; 2026 PT Garuda Yamato Steel. All systems operational.
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE - Image & Tech Visual (Sekarang di Kanan) */}
      <div className="hidden lg:flex w-1/2 relative h-full">
        {/* Gambar Gedung sebagai Background */}
        <img 
            src="/assets/login.jpeg" 
            alt="Garuda Yamato Steel Building"
            className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Overlay Gelap/Biru agar teks terbaca dan nuansa Cyber terjaga */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1c] via-cyan-900/40 to-[#0a0f1c]/60 mix-blend-multiply"></div>
        <div className="absolute inset-0 bg-black/20"></div>

        {/* Konten Overlay (Teks Future Intelligence dipindah ke sini) */}
        <div className="relative z-10 flex flex-col justify-end w-full h-full p-16 pb-24">
            <h1 className="text-6xl font-bold mb-6 leading-tight text-white drop-shadow-2xl">
              Future <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500">Intelligence.</span>
            </h1>
            <p className="text-gray-200 text-lg max-w-md border-l-4 border-cyan-500 pl-6 bg-black/30 backdrop-blur-sm py-2 pr-4 rounded-r-lg">
              Integrated AI Portal for Garuda Yamato Steel. <br/>
              Optimizing operations through advanced machine learning & real-time analytics.
            </p>
            
            <div className="flex gap-4 text-xs text-gray-300 font-mono mt-8">
              <span className="bg-black/50 px-2 py-1 rounded border border-white/20">ID: GYS-AI-2026</span>
              <span className="bg-black/50 px-2 py-1 rounded border border-white/20">Ver: 2.4.0 (Stable)</span>
            </div>
        </div>
      </div>

    </div>
  );
};

export default Login;
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    // Simulasi login (ganti dengan logic API Anda nanti)
    setTimeout(() => {
      setLoading(false);
      navigate('/dashboard'); // Sesuaikan dengan route dashboard Anda
    }, 1500);
  };

  return (
    <div className="min-h-screen flex w-full bg-gys-light">
      
      {/* BAGIAN KIRI - Visual & Branding GYS */}
      <div className="hidden lg:flex w-1/2 bg-gys-navy relative overflow-hidden items-center justify-center">
        {/* Background Pattern / Overlay */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-gys-navy via-gys-navy to-black opacity-90"></div>

        <div className="relative z-10 text-white px-12 text-center">
          <img 
            src="/assets/favicon_gys.ico" 
            alt="GYS Logo" 
            className="w-24 h-24 mx-auto mb-8 drop-shadow-lg"
          />
          <h1 className="text-4xl font-bold mb-4 tracking-wide">Garuda Yamato Steel</h1>
          <p className="text-gys-steel text-lg font-light max-w-md mx-auto leading-relaxed">
            Portal AI & Manajemen Terintegrasi. <br/>
            Membangun masa depan dengan inovasi baja berkualitas.
          </p>
        </div>
        
        {/* Dekorasi Artistik (Garis Baja) */}
        <div className="absolute bottom-0 left-0 w-full h-2 bg-gys-red"></div>
      </div>

      {/* BAGIAN KANAN - Form Login Modern */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-16 relative">
        <div className="w-full max-w-md">
          
          {/* Header Mobile (Hanya muncul di HP) */}
          <div className="lg:hidden text-center mb-10">
            <img src="/assets/favicon_gys.ico" alt="Logo" className="w-16 h-16 mx-auto mb-4"/>
            <h2 className="text-2xl font-bold text-gys-navy">Garuda Yamato Steel</h2>
          </div>

          <div className="mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Selamat Datang</h2>
            <p className="text-gray-500">Silakan masuk ke akun Portal AI Anda.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            
            {/* Input Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Perusahaan</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-4 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gys-navy/20 focus:border-gys-navy transition-all duration-200"
                  placeholder="nama@garudayamatosteel.com"
                  required
                />
              </div>
            </div>

            {/* Input Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <a href="#" className="text-sm text-gys-red hover:underline font-medium">Lupa password?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gys-navy/20 focus:border-gys-navy transition-all duration-200"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Tombol Login */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gys-navy hover:bg-[#001b4d] text-white font-semibold py-3.5 rounded-xl transition-all duration-300 transform hover:scale-[1.01] shadow-lg shadow-gys-navy/30 flex justify-center items-center"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                "Masuk ke Portal"
              )}
            </button>
          </form>

          {/* Footer Kecil */}
          <div className="mt-10 text-center text-xs text-gray-400">
            &copy; 2026 PT Garuda Yamato Steel. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
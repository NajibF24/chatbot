import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const Chat = ({ user, handleLogout }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  
  // State Data
  const [bots, setBots] = useState([]);       
  const [threads, setThreads] = useState([]); 
  
  // State Selection
  const [selectedBot, setSelectedBot] = useState(null); 
  const [currentThreadId, setCurrentThreadId] = useState(null); 
  
  // State UI
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const messagesEndRef = useRef(null);

  // --- 1. INITIAL LOAD ---
  useEffect(() => {
    fetchBots();
    fetchThreads();
  }, []);

  // Auto-scroll ke bawah saat ada pesan baru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- API CALLS ---
  const fetchBots = async () => {
    try {
      const res = await axios.get('/api/chat/bots'); 
      // Handle format data yang mungkin berbeda (array langsung atau objek {bots: []})
      const botList = Array.isArray(res.data) ? res.data : (res.data.bots || []);
      setBots(botList);
      
      // Auto-select bot pertama jika belum ada yang dipilih
      if (botList.length > 0 && !selectedBot) {
        setSelectedBot(botList[0]); 
      }
    } catch (error) {
      console.error("Error fetching bots:", error);
    }
  };

  const fetchThreads = async () => {
    try {
      const res = await axios.get('/api/chat/threads');
      setThreads(res.data);
    } catch (error) {
      console.error("Error fetching threads:", error);
    }
  };

  // --- ACTIONS ---

  // Ganti Bot (Mulai Chat Baru dengan Bot Terpilih)
  const handleBotSelect = (bot) => {
    setSelectedBot(bot);
    setMessages([]); // Reset layar chat
    setCurrentThreadId(null); // Reset ID thread (jadi mode new chat)
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  // Buka History Chat Lama
  const loadThread = async (threadId) => {
    try {
      setLoading(true);
      setCurrentThreadId(threadId);

      const res = await axios.get(`/api/chat/thread/${threadId}`);
      
      // Format pesan dari DB agar sesuai UI
      const formattedMessages = res.data.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      setMessages(formattedMessages);
      
      // Sinkronisasi: Cari bot yang dipakai di thread ini dan aktifkan di sidebar
      // Kita cari di list threads untuk mendapatkan botId-nya
      const threadInfo = threads.find(t => t._id === threadId);
      if (threadInfo && threadInfo.botId) {
          const threadBotId = typeof threadInfo.botId === 'object' ? threadInfo.botId._id : threadInfo.botId;
          const foundBot = bots.find(b => b._id === threadBotId);
          if (foundBot) setSelectedBot(foundBot);
      }

      if (window.innerWidth < 1024) setIsSidebarOpen(false);
    } catch (error) {
      console.error("Error loading thread:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentThreadId(null);
    // Kita biarkan selectedBot tetap yang terakhir dipilih
  };

  // --- KIRIM PESAN (LOGIC FIXED) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedBot) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Payload sesuai dengan server/services/ai-core.service.js
      const payload = {
        message: userMessage.content,
        botId: selectedBot._id,
        threadId: currentThreadId, // Kirim null jika chat baru
        history: messages.map(m => ({ role: m.role, content: m.content })) // Kirim history untuk konteks
      };

      console.log("📤 Sending:", payload);

      const res = await axios.post('/api/chat/message', payload);
      console.log("📥 Received:", res.data);

      // ✅ FIX UTAMA: Backend mengirim key 'response', bukan 'reply'
      const replyText = res.data.response; 

      if (!replyText) {
         throw new Error("Server response empty (check 'response' field)");
      }

      const botMessage = { role: 'assistant', content: replyText };
      setMessages(prev => [...prev, botMessage]);

      // Jika ini chat baru, server akan mengembalikan threadId baru
      if (res.data.threadId) {
        setCurrentThreadId(res.data.threadId);
        fetchThreads(); // Refresh sidebar history agar muncul judul baru
      } else {
        fetchThreads(); // Refresh timestamp history
      }

    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Maaf, terjadi kesalahan koneksi ke server AI." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white font-sans overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside 
        className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-30 w-72 h-full bg-slate-800 border-r border-slate-700 flex flex-col transition-transform duration-300 shadow-xl`}
      >
        {/* Header Sidebar */}
        <div className="p-5 border-b border-slate-700 flex items-center justify-between bg-slate-800">
          <div className="flex items-center gap-3">
             <img src="/assets/favicon_gys.ico" alt="Logo" className="w-8 h-8"/>
             <div>
               <h1 className="font-bold text-lg text-white tracking-wide">PORTAL AI</h1>
               <div className="flex items-center gap-1.5">
                 <div className="w-2 h-2 rounded-full bg-green-500"></div>
                 <span className="text-[11px] text-green-400 font-medium">System Online</span>
               </div>
             </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* List Bot & History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-600">
          
          {/* Section 1: AGENTS (BOTS) */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Select Assistant</h3>
            <div className="space-y-1">
              {bots.map((bot) => (
                <button
                  key={bot._id}
                  onClick={() => handleBotSelect(bot)}
                  className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 transition-all duration-200 ${
                    selectedBot?._id === bot._id 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'hover:bg-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                     selectedBot?._id === bot._id ? 'bg-white text-blue-700' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {bot.name ? bot.name.substring(0, 2).toUpperCase() : 'AI'}
                  </div>
                  <div className="flex-1 truncate">
                    <div className="font-semibold text-sm truncate">{bot.name}</div>
                    <div className="text-[11px] opacity-70 truncate">{bot.description || "AI Assistant"}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: HISTORY */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-2 mt-4">History</h3>
            <button 
                 onClick={handleNewChat}
                 className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-colors border border-dashed border-blue-500/30 mb-3"
              >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                 <span className="text-sm font-medium">New Conversation</span>
            </button>

            <div className="space-y-1">
              {threads.length === 0 && <p className="text-xs text-slate-500 px-3 italic">No history found.</p>}
              
              {threads.map((t) => (
                <button
                  key={t._id}
                  onClick={() => loadThread(t._id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors flex items-center gap-2 ${
                    currentThreadId === t._id 
                    ? 'bg-slate-700 text-white font-medium border-l-2 border-blue-500' 
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate flex-1">{t.title || "Untitled Chat"}</span>
                  <span className="text-[10px] opacity-40">{new Date(t.lastMessageAt).getDate()}/{new Date(t.lastMessageAt).getMonth()+1}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-800">
           <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                {user?.username?.substring(0,2).toUpperCase() || 'US'}
             </div>
             <div className="flex-1 overflow-hidden">
               <p className="text-sm font-semibold text-white truncate">{user?.username || 'User'}</p>
               <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-0.5">
                 Sign Out
               </button>
             </div>
           </div>
        </div>
      </aside>

      {/* --- MAIN CHAT AREA --- */}
      <main className="flex-1 flex flex-col h-full relative bg-slate-900">
        
        {/* Mobile Header */}
        <div className="lg:hidden h-14 border-b border-slate-700 flex items-center justify-between px-4 bg-slate-800">
           <span className="font-bold text-white">Portal AI</span>
           <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-blue-400">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
           </button>
        </div>

        {/* MESSAGE LIST */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          {messages.length === 0 ? (
            // EMPTY STATE (WELCOME)
            <div className="h-full flex flex-col items-center justify-center text-center opacity-90 pb-20">
              <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-slate-700">
                 <span className="text-4xl font-bold text-blue-500">{selectedBot?.name?.substring(0,1) || "A"}</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {selectedBot ? `Hello, I'm ${selectedBot.name}` : "Select an Agent"}
              </h2>
              <p className="text-slate-400 max-w-md mx-auto mb-8">
                {selectedBot?.description || "Ready to assist you with operations, data, and analysis."}
              </p>
              
              {/* Quick Suggestions (Starter Questions) */}
              {selectedBot && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                   {(selectedBot.starterQuestions?.length > 0 
                      ? selectedBot.starterQuestions 
                      : ["Apa status project saat ini?", "Buatkan draft laporan", "Cari data produksi", "Jelaskan error log"]
                   ).map((txt, i) => (
                     <button 
                       key={i} 
                       onClick={() => { setInput(txt); }}
                       className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-blue-400 transition-colors text-left"
                     >
                       {txt}
                     </button>
                   ))}
                </div>
              )}
            </div>
          ) : (
            // CHAT BUBBLES
            messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                
                {/* Bot Icon */}
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center mr-3 mt-1 shadow-sm">
                    <span className="text-xs font-bold text-blue-400">{selectedBot?.name?.substring(0,1) || "A"}</span>
                  </div>
                )}

                {/* Message Box */}
                <div className={`max-w-[85%] lg:max-w-[70%] rounded-2xl p-4 shadow-md ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-slate-700 text-slate-100 rounded-tl-sm border border-slate-600'
                }`}>
                  <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {/* Loading Indicator */}
          {loading && (
             <div className="flex justify-start ml-11">
               <div className="bg-slate-700 rounded-xl px-4 py-3 flex items-center gap-2 border border-slate-600">
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="p-4 bg-slate-800 border-t border-slate-700 z-20">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative flex items-center gap-2">
            <div className="flex-1 relative">
               <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedBot ? `Message ${selectedBot.name}...` : "Select a bot first..."}
                disabled={!selectedBot || loading}
                className="w-full bg-slate-900 border border-slate-600 text-white px-5 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500 shadow-inner transition-all"
              />
            </div>
            <button
                type="submit"
                disabled={!input.trim() || !selectedBot || loading}
                className="p-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
              >
                <svg className="w-5 h-5 -rotate-90 translate-x-[1px]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
          </form>
          <p className="text-center text-[10px] text-slate-500 mt-2 font-mono">
             GYS Enterprise AI • Internal Use Only
          </p>
        </div>
      </main>
    </div>
  );
};

export default Chat;
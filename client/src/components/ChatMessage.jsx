import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  
  // Debugging: Cek di Console Browser apakah attachment masuk?
  if (message.attachedFiles && message.attachedFiles.length > 0) {
    console.log('📎 Attachment detected:', message.attachedFiles);
  }

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[95%] md:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
          isUser ? 'bg-primary-600 ml-3' : 'bg-white border border-steel-200 mr-3'
        }`}>
          {isUser ? (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          ) : (
            <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          )}
        </div>

        {/* Message Bubble */}
        <div className={`px-5 py-4 shadow-sm relative group overflow-hidden ${
          isUser 
            ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm' 
            : 'bg-white text-gray-800 border border-gray-200 rounded-2xl rounded-tl-sm'
        }`}>
          
          {/* 1. RENDER TEKS & TABEL */}
          <div className={`prose text-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]} // ✅ WAJIB: Plugin untuk Tabel
              components={{
                // Styling Tabel Khusus (Excel Look)
                table: ({node, ...props}) => (
                  <div className="overflow-x-auto my-4 rounded-lg border border-gray-300 shadow-sm">
                    <table className="min-w-full divide-y divide-gray-300 text-sm" {...props} />
                  </div>
                ),
                thead: ({node, ...props}) => <thead className="bg-gray-100 text-gray-700" {...props} />,
                th: ({node, ...props}) => <th className="px-3 py-3 text-left font-bold uppercase tracking-wider border-b border-gray-300 bg-gray-50" {...props} />,
                tbody: ({node, ...props}) => <tbody className="bg-white divide-y divide-gray-200" {...props} />,
                tr: ({node, ...props}) => <tr className="even:bg-gray-50 hover:bg-blue-50 transition-colors" {...props} />,
                td: ({node, ...props}) => <td className="px-3 py-2 whitespace-pre-wrap border-r border-gray-100 last:border-r-0" {...props} />,
                a: ({node, ...props}) => <a className="text-blue-600 underline" target="_blank" rel="noreferrer" {...props} />,
                p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
              }}
            >
              {message.content || ''}
            </ReactMarkdown>
          </div>

          {/* 2. RENDER ATTACHMENT (GAMBAR / FILE) */}
          {message.attachedFiles && message.attachedFiles.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 mb-2 uppercase">Lampiran ({message.attachedFiles.length}):</p>
              
              <div className="grid grid-cols-1 gap-2">
                {message.attachedFiles.map((file, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    
                    {/* A. Jika Tipe Gambar: Tampilkan Preview Besar */}
                    {file.type === 'image' ? (
                      <div className="relative">
                        <img 
                          src={file.path} 
                          alt={file.name}
                          className="w-full h-auto object-contain max-h-[300px] bg-gray-200"
                          onError={(e) => {
                            console.error('Image Load Error:', file.path);
                            e.target.style.display = 'none'; // Sembunyikan jika error
                          }}
                        />
                        <div className="p-2 bg-white/90 backdrop-blur-sm border-t border-gray-200 flex justify-between items-center">
                           <span className="text-xs font-medium truncate max-w-[70%]">{file.name}</span>
                           <a href={file.path} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                             Download
                           </a>
                        </div>
                      </div>
                    ) : (
                      // B. Jika Dokumen (PDF dll): Tampilkan Link
                      <a href={file.path} target="_blank" rel="noreferrer" className="flex items-center p-3 hover:bg-gray-100 transition-colors">
                        <div className="mr-3 p-2 bg-white rounded border border-gray-200 text-2xl">
                          📄
                        </div>
                        <div className="flex-1 overflow-hidden">
                           <div className="font-medium text-sm text-blue-700 truncate">{file.name}</div>
                           <div className="text-xs text-gray-500">{file.size} KB</div>
                        </div>
                        <div className="text-gray-400">⬇️</div>
                      </a>
                    )}
                    
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className={`text-[10px] mt-1 text-right ${isUser ? 'text-blue-100' : 'text-gray-400'}`}>
            {new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>

        </div>
      </div>
    </div>
  );
}

export default ChatMessage;

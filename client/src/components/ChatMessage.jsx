// client/src/components/ChatMessage.jsx - UPDATED: Grid Layout for Multiple Images
import React, { useState } from 'react';

function ChatMessage({ message }) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const isUser = message.role === 'user';

  // ✅ Simple relative URL (nginx will proxy)
  const getFileUrl = (relativePath) => {
    console.log(`📎 Loading file: ${relativePath}`);
    return relativePath; 
  };

  // ✅ Check if message has attached files
  const hasAttachedFiles = message.attachedFiles && message.attachedFiles.length > 0;

  // Function to parse and render formatted text
  const renderFormattedText = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let currentList = [];
    let inList = false;

    lines.forEach((line, idx) => {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        if (inList && currentList.length > 0) {
          elements.push(
            <ul key={`list-${idx}`} className="list-disc list-inside ml-2 my-2 space-y-1">
              {currentList.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed">
                  {renderInlineFormatting(item)}
                </li>
              ))}
            </ul>
          );
          currentList = [];
          inList = false;
        }
        elements.push(<br key={`br-${idx}`} />);
        return;
      }

      if (trimmedLine.startsWith('•') || trimmedLine.startsWith('*') || trimmedLine.startsWith('-')) {
        const content = trimmedLine.substring(1).trim();
        currentList.push(content);
        inList = true;
      } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
        if (inList && currentList.length > 0) {
          elements.push(
            <ul key={`list-${idx}`} className="list-disc list-inside ml-2 my-2 space-y-1">
              {currentList.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed">
                  {renderInlineFormatting(item)}
                </li>
              ))}
            </ul>
          );
          currentList = [];
          inList = false;
        }
        const headerText = trimmedLine.replace(/\*\*/g, '');
        elements.push(
          <div key={`header-${idx}`} className="font-semibold text-base mt-3 mb-2">
            {headerText}
          </div>
        );
      } else {
        if (inList && currentList.length > 0) {
          elements.push(
            <ul key={`list-${idx}`} className="list-disc list-inside ml-2 my-2 space-y-1">
              {currentList.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed">
                  {renderInlineFormatting(item)}
                </li>
              ))}
            </ul>
          );
          currentList = [];
          inList = false;
        }
        elements.push(
          <div key={`text-${idx}`} className="text-sm leading-relaxed mb-1">
            {renderInlineFormatting(line)}
          </div>
        );
      }
    });

    if (inList && currentList.length > 0) {
      elements.push(
        <ul key="list-final" className="list-disc list-inside ml-2 my-2 space-y-1">
          {currentList.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
    }

    return <div className="space-y-1">{elements}</div>;
  };

  const renderInlineFormatting = (text) => {
    if (!text) return null;

    const parts = [];
    let key = 0;

    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++}>{text.substring(lastIndex, match.index)}</span>
        );
      }
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(<span key={key++}>{text.substring(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : text;
  };

  // ✅ NEW: Render attached file with grid layout support
  const renderAttachedFile = (file, index, totalFiles) => {
    console.log(`📎 Rendering file [${index}/${totalFiles}]:`, file);
    const fileUrl = getFileUrl(file.path);
    
    if (file.type === 'image') {
      // ✅ Determine grid class based on total files
      let gridClass = 'w-full'; // Single image = full width
      
      if (totalFiles === 2) {
        gridClass = 'w-full md:w-[calc(50%-0.5rem)]'; // 2 images = 50% each
      } else if (totalFiles >= 3) {
        gridClass = 'w-full md:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.67rem)]'; // 3+ images = responsive grid
      }
      
      return (
        <div key={index} className={`${gridClass}`}>
          {/* Image Header */}
          <div className="bg-primary-50 px-3 py-2 rounded-t-lg border border-primary-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <svg className="w-4 h-4 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-semibold text-steel-800 text-sm truncate">{file.name}</span>
              </div>
              <span className="text-xs text-steel-600 flex-shrink-0 ml-2">{file.size} KB</span>
            </div>
          </div>

          {/* Image Display */}
          {!imageError ? (
            <div 
              className="relative cursor-pointer group bg-steel-50 border-x border-b border-steel-200 rounded-b-lg overflow-hidden"
              onClick={() => setImageExpanded(!imageExpanded)}
            >
              <img 
                src={fileUrl}
                alt={file.name}
                className={`w-full transition-all duration-300 ${
                  imageExpanded ? 'max-h-none' : 'h-64 object-cover'
                }`}
                onError={(e) => {
                  console.error(`❌ Image load error: ${fileUrl}`);
                  console.error(`   File:`, file);
                  setImageError(true);
                  e.target.style.display = 'none';
                }}
                onLoad={() => {
                  console.log(`✅ Image loaded: ${fileUrl}`);
                }}
              />
              
              {/* Expand hint */}
              {!imageExpanded && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  Klik untuk memperbesar
                </div>
              )}
            </div>
          ) : (
            <div className="border-x border-b border-red-200 rounded-b-lg bg-red-50 p-4">
              <div className="flex items-center space-x-2 text-red-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="min-w-0">
                  <div className="font-semibold">Gagal memuat gambar</div>
                  <div className="text-sm truncate">Path: {fileUrl}</div>
                  <a 
                    href={fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Coba buka di tab baru →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    } else if (file.type === 'pdf') {
      return (
        <div key={index} className="w-full mb-4">
          {/* PDF Header */}
          <div className="bg-red-50 px-3 py-2 rounded-t-lg border border-red-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold text-steel-800 text-sm">{file.name}</span>
              </div>
              <span className="text-xs text-steel-600">{file.size} KB</span>
            </div>
          </div>

          {/* PDF Viewer */}
          <div className="border-x border-b border-steel-200 rounded-b-lg overflow-hidden bg-steel-50">
            <iframe
              src={fileUrl}
              className="w-full h-[600px]"
              title={file.name}
              frameBorder="0"
            />
          </div>
        </div>
      );
    } else {
      // Other document types
      return (
        <div key={index} className="w-full mb-4">
          <div className="bg-steel-100 rounded-lg border border-steel-200 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-steel-200 rounded flex items-center justify-center">
                  <svg className="w-5 h-5 text-steel-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-steel-800 text-sm">{file.name}</div>
                  <div className="text-xs text-steel-600">{file.extension.toUpperCase()} • {file.size} KB</div>
                </div>
              </div>
              <a 
                href={fileUrl} 
                download={file.name}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex items-start space-x-3 max-w-5xl w-full ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-primary-600'
            : 'bg-steel-200'
        }`}>
          {isUser ? (
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-steel-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          )}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col flex-1 ${isUser ? 'items-end' : 'items-start'}`}>
          {/* ✅ NEW: Attached Files with Grid Layout */}
          {hasAttachedFiles && !isUser && (
            <div className="w-full mb-3">
              <div className="flex flex-wrap gap-4">
                {console.log(`📎 Rendering ${message.attachedFiles.length} file(s) in grid layout`)}
                {message.attachedFiles.map((file, idx) => {
                  console.log(`   File ${idx + 1}:`, file);
                  return renderAttachedFile(file, idx, message.attachedFiles.length);
                })}
              </div>
            </div>
          )}

          {/* Text Message */}
          <div className={`px-5 py-3 rounded-2xl shadow-sm ${
            isUser
              ? 'bg-primary-600 text-white rounded-tr-sm'
              : 'bg-white text-steel-800 border border-steel-200 rounded-tl-sm'
          }`}>
            <div className="leading-relaxed">
              {renderFormattedText(message.content)}
            </div>
          </div>

          {/* Timestamp */}
          {message.timestamp && (
            <div className={`text-xs text-steel-500 mt-1 px-2 ${isUser ? 'text-right' : 'text-left'}`}>
              {new Date(message.timestamp).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;

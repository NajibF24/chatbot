import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import officeParser from 'officeparser';

import Chat from '../models/Chat.js';
import Thread from '../models/Thread.js';
import Bot from '../models/Bot.js';
import SmartsheetJSONService from './smartsheet-json.service.js';
import FileManagerService from './file-manager.service.js';
import KouventaService from './kouventa.service.js';

class AICoreService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.fileManager = new FileManagerService();
  }

  // ===========================================================================
  // 1. UTILS: DETEKSI JENIS QUERY
  // ===========================================================================
  isDataQuery(message) {
    const lowerMsg = (message || '').toLowerCase();
    
    const visualKeywords = ['dashboard', 'gambar', 'image', 'foto', 'screenshot', 'show', 'tampilkan', 'lihat', 'visual'];
    if (visualKeywords.some(k => lowerMsg.includes(k)) && lowerMsg.includes('dashboard')) return false;

    // Trigger Keywords (Indo & English)
    const dataKeywords = [
        'berikan', 'cari', 'list', 'daftar', 'semua', 'project', 'status', 'progress', 
        'summary', 'analisa', 'data', 'total', 'berapa', 'mana', 'versi', 'latest', 
        'terbaru', 'revisi', 'dokumen', 'file', 'tracking', 'update', 'history', 'riwayat',
        'give', 'show', 'find', 'search', 'document', 'documents', 'version', 'excel', 'sheet', 
        'another', 'other', 'what', 'where'
    ];
    
    // Jika ada keyword ATAU ada pola nama file (underscore/titik)
    return dataKeywords.some(k => lowerMsg.includes(k)) || message.includes('_') || message.includes('.'); 
  }

  // ===========================================================================
  // 2. UTILS: EKSTRAKSI FILE (TETAP)
  // ===========================================================================
  async extractFileContent(attachedFile) {
      if (!attachedFile || !attachedFile.path) return null;
      
      const mime = attachedFile.mimetype || '';
      const originalName = attachedFile.originalname || '';
      const ext = path.extname(originalName).toLowerCase();
      let content = null;
      const CHAR_LIMIT = 200000; 

      try {
          if (mime === 'application/pdf' || ext === '.pdf') {
              const dataBuffer = fs.readFileSync(attachedFile.path);
              const data = await pdf(dataBuffer);
              content = data.text.replace(/\n\s*\n/g, '\n');
          }
          else if (ext === '.docx' || mime.includes('word')) {
              try {
                  const result = await mammoth.extractRawText({ path: attachedFile.path });
                  content = result.value;
              } catch (err) {
                  try { content = await officeParser.parseOfficeAsync(attachedFile.path); } catch (e) {}
              }
          }
          else if (ext === '.xlsx' || ext === '.xls') {
              const workbook = XLSX.readFile(attachedFile.path);
              let allSheetsData = [];
              workbook.SheetNames.forEach(sheetName => {
                  const sheet = workbook.Sheets[sheetName];
                  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' }); 
                  if (csv.trim()) allSheetsData.push(`[SHEET: ${sheetName}]\n${csv}`);
              });
              if (allSheetsData.length > 0) content = allSheetsData.join('\n\n');
          }
          else {
               content = fs.readFileSync(attachedFile.path, 'utf8');
          }

          if (content && content.trim().length > 0) {
              return `\n\n[FILE: ${originalName}]\n${content.substring(0, CHAR_LIMIT)}\n[END FILE]\n`;
          }
          return `\n[SYSTEM INFO: File ${originalName} kosong.]\n`;

      } catch (e) {
          console.error(`❌ File Error:`, e);
          return `\n[SYSTEM ERROR reading file]\n`;
      }
  }

  // ===========================================================================
  // 3. CORE: NORMALIZED SMART FILTERING (The Fix)
  // ===========================================================================
  
  // Helper: Hapus semua simbol, sisakan hanya huruf & angka untuk perbandingan
  normalizeText(text) {
      if (!text) return "";
      // Ubah ke lowercase, ganti %20 jadi spasi, hapus simbol selain alfanumerik
      return text.toLowerCase()
                 .replace(/%20/g, ' ') 
                 .replace(/[^a-z0-9]/g, ''); 
  }

  filterRelevantData(sheetData, userMessage) {
    let items = [];
    let dataContainer = null; 

    // Handle berbagai struktur data (Array langsung atau Object Wrapper)
    if (Array.isArray(sheetData)) {
        items = sheetData;
    } else if (sheetData?.projects && Array.isArray(sheetData.projects)) {
        items = sheetData.projects;
        dataContainer = 'projects';
    } else if (sheetData?.rows && Array.isArray(sheetData.rows)) {
        items = sheetData.rows;
        dataContainer = 'rows';
    } else {
        return sheetData;
    }

    const query = userMessage.toLowerCase().trim();
    const normalizedQuery = this.normalizeText(query); // Query tanpa simbol (misal: "garubeka01bdmain")

    // --- LOGIC 1: GENERAL REQUEST ---
    const generalKeywords = ['semua', 'all', 'list', 'another', 'other', 'lain', 'lagi', 'show me'];
    // Jika query pendek DAN mengandung kata general, kembalikan 50 baris terbaru
    if (generalKeywords.some(k => query.includes(k)) && query.length < 20) {
        console.log("🔍 Filter: General Request.");
        const slicedItems = items.slice(0, 50); 
        return Array.isArray(sheetData) ? slicedItems : { ...sheetData, [dataContainer]: slicedItems };
    }
    
    // --- LOGIC 2: NORMALIZED "DEEP" SEARCH ---
    // Cari query user (yang sudah dinormalisasi) di dalam setiap baris data (yang juga dinormalisasi).
    // Ini akan menembus link, underscore, spasi, atau simbol aneh.
    const deepMatches = items.filter(item => {
        const itemString = JSON.stringify(item); // Ambil seluruh baris
        const normalizedItem = this.normalizeText(itemString); // Bersihkan simbol
        
        // Cek apakah "garubeka01bdmain" ada di dalam baris tersebut
        return normalizedItem.includes(normalizedQuery);
    });

    if (deepMatches.length > 0) {
        console.log(`🔍 Deep Match: Found ${deepMatches.length} rows.`);
        // Kita ambil BANYAK (200) agar semua history revisi masuk
        const resultItems = deepMatches.slice(0, 200); 
        return Array.isArray(sheetData) ? resultItems : { ...sheetData, [dataContainer]: resultItems };
    }

    // --- LOGIC 3: PARTIAL KEYWORD MATCH (Fallback) ---
    // Jika deep match gagal, coba cari per kata (keyword)
    const keywords = query.split(/[\s\_\-\.]+/).filter(w => w.length > 3 && !['cari', 'give', 'show', 'data', 'file'].includes(w));
    
    if (keywords.length === 0) {
        // Fallback total
        const fallback = items.slice(0, 30);
        return Array.isArray(sheetData) ? fallback : { ...sheetData, [dataContainer]: fallback };
    }

    const keywordMatches = items.filter(item => {
        const itemString = JSON.stringify(item).toLowerCase();
        return keywords.some(k => itemString.includes(k));
    });

    console.log(`🔍 Keyword Match: ${keywordMatches.length} rows.`);
    const finalItems = keywordMatches.slice(0, 50);
    return Array.isArray(sheetData) ? finalItems : { ...sheetData, [dataContainer]: finalItems };
  }

  // ===========================================================================
  // 4. MAIN PROCESS
  // ===========================================================================
  async processMessage({ userId, botId, message, attachedFile, threadId, history = [] }) {
    // A. Validasi Bot & Thread (Standard)
    const bot = await Bot.findById(botId);
    if (!bot) throw new Error('Bot not found');

    let currentThreadTitle;
    if (!threadId) {
        const title = message ? (message.length > 30 ? message.substring(0, 30) + '...' : message) : `Chat with ${bot.name}`;
        const newThread = new Thread({ userId, botId, title, lastMessageAt: new Date() });
        await newThread.save();
        threadId = newThread._id;
        currentThreadTitle = title;
    } else {
        await Thread.findByIdAndUpdate(threadId, { lastMessageAt: new Date() });
    }

    // B. User Content
    let userContent = [];
    if (message) userContent.push({ type: "text", text: message });
    if (attachedFile) {
        if (attachedFile.mimetype?.startsWith('image/')) {
             const imgBuffer = fs.readFileSync(attachedFile.path);
             userContent.push({ type: "image_url", image_url: { url: `data:${attachedFile.mimetype};base64,${imgBuffer.toString('base64')}` } });
        } else {
             const fileText = await this.extractFileContent(attachedFile);
             if (fileText) userContent.push({ type: "text", text: fileText });
        }
    }

    // C. File Manager (Dashboard Images)
    if (this.fileManager.isFileRequest(message || '')) {
        const query = this.fileManager.extractFileQuery(message || '');
        const foundFiles = await this.fileManager.searchFiles(query);
        if (foundFiles.length > 0) {
            const reply = this.fileManager.generateSmartDescription(foundFiles, query);
            const attachments = foundFiles.map(f => ({ name: f.name, path: f.relativePath, type: f.type, size: f.sizeKB }));
            await new Chat({ userId, botId, threadId, role: 'user', content: message, attachedFiles: [] }).save();
            await new Chat({ userId, botId, threadId, role: 'assistant', content: reply, attachedFiles: attachments }).save();
            return { response: reply, threadId, attachedFiles: attachments };
        }
    }

    // D. SMARTSHEET DATA (FILTERED)
    let contextData = "";
    const targetSheetId = bot.smartsheetConfig?.sheetId || bot.smartsheetConfig?.primarySheetId;
    
    if (this.isDataQuery(message) && bot.smartsheetConfig?.enabled && targetSheetId) {
        try {
            const service = new SmartsheetJSONService();
            if (bot.smartsheetConfig.apiKey) service.apiKey = bot.smartsheetConfig.apiKey;
            
            // 1. Fetch Full Data
            const fullSheetData = await service.getData(targetSheetId, message.includes('refresh'));
            
            // 2. Filter using Normalized Logic
            const filteredData = this.filterRelevantData(fullSheetData, message);

            // 3. Format
            const rawContext = service.formatForAI(filteredData);
            
            contextData = `\n\n=== FILTERED DATA (RELEVANT ROWS) ===\n${rawContext}\n=== END DATA ===\n`;
            
        } catch (e) { 
            console.error("Smartsheet Error:", e); 
            contextData = "\n[SISTEM: Gagal mengambil data.]\n";
        }
    }

    // E. SYSTEM PROMPT (ANTI-TABRAKAN)
    let finalSystemPrompt = "";
    const userPrompt = bot.prompt || bot.systemPrompt;
    const isCustomPrompt = userPrompt && userPrompt.length > 20 && !userPrompt.includes("Anda adalah asisten AI profesional");

    if (isCustomPrompt) {
        finalSystemPrompt = userPrompt;
        if (contextData) {
            if (finalSystemPrompt.includes('{{CONTEXT}}')) {
                finalSystemPrompt = finalSystemPrompt.replace('{{CONTEXT}}', contextData);
            } else {
                finalSystemPrompt += `\n\n${contextData}\n(Gunakan data di atas sebagai referensi utama.)`;
            }
        }
    } else {
        // Fallback Default Prompt
        finalSystemPrompt = `Anda adalah ${bot.name}, Project Analyst & Document Controller.
${contextData}
**INSTRUKSI:**
1. Tampilkan SEMUA data yang ditemukan di context, jangan disembunyikan.
2. Jika ada banyak history file (nama sama), tampilkan sebagai tabel.
3. Ikuti bahasa user.`;
    }

    // F. EXECUTE AI
    let aiResponse = "";
    const messagesPayload = [
        { role: 'system', content: finalSystemPrompt },
        ...history,
        { role: 'user', content: userContent }
    ];

    // Gunakan OpenAI (Kouventa opsional di-disable dulu untuk kestabilan)
    const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messagesPayload,
        temperature: 0.1 // Sangat rendah untuk akurasi data
    });
    aiResponse = completion.choices[0].message.content;

    // G. Save & Return
    let savedAttachments = [];
    if (attachedFile) {
        savedAttachments.push({
            name: attachedFile.originalname || attachedFile.filename,
            path: attachedFile.path,
            type: attachedFile.mimetype?.includes('image') ? 'image' : 'file',
            size: (attachedFile.size / 1024).toFixed(1)
        });
    }

    await new Chat({ userId, botId, threadId, role: 'user', content: message || '', attachedFiles: savedAttachments }).save();
    await new Chat({ userId, botId, threadId, role: 'assistant', content: aiResponse }).save();

    return { response: aiResponse, threadId, title: currentThreadTitle, attachedFiles: savedAttachments };
  }
}

export default new AICoreService();
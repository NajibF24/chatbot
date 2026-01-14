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
    
    // Cek request visual
    const visualKeywords = ['dashboard', 'gambar', 'image', 'foto', 'screenshot', 'show', 'tampilkan', 'lihat', 'visual'];
    if (visualKeywords.some(k => lowerMsg.includes(k)) && lowerMsg.includes('dashboard')) return false;

    // Cek request data
    const dataKeywords = [
        'berikan', 'cari', 'list', 'daftar', 'semua', 'project', 'status', 'progress', 
        'summary', 'analisa', 'data', 'total', 'berapa', 'mana', 'versi', 'latest', 
        'terbaru', 'revisi', 'dokumen', 'file', 'tracking', 'update', 'history', 'riwayat', 'log'
    ];
    return dataKeywords.some(k => lowerMsg.includes(k)) || message.includes('_'); // Jika ada underscore, kemungkinan nama file
  }

  // ===========================================================================
  // 2. UTILS: EKSTRAKSI FILE
  // ===========================================================================
  async extractFileContent(attachedFile) {
      if (!attachedFile || !attachedFile.path) return null;
      
      const mime = attachedFile.mimetype || '';
      const originalName = attachedFile.originalname || '';
      const ext = path.extname(originalName).toLowerCase();
      let content = null;
      let displayType = 'FILE';
      const CHAR_LIMIT = 200000; 

      console.log(`📂 [FILE START] Processing: ${originalName} (${mime})`);

      try {
          if (mime === 'application/pdf' || ext === '.pdf') {
              const dataBuffer = fs.readFileSync(attachedFile.path);
              const data = await pdf(dataBuffer);
              content = data.text.replace(/\n\s*\n/g, '\n');
              displayType = 'PDF';
          }
          else if (ext === '.docx' || mime.includes('word')) {
              try {
                  const result = await mammoth.extractRawText({ path: attachedFile.path });
                  content = result.value;
                  displayType = 'DOCX (Mammoth)';
              } catch (err) {
                  try {
                        content = await officeParser.parseOfficeAsync(attachedFile.path);
                        displayType = 'DOCX (OfficeParser)';
                  } catch (e) { console.error(e); }
              }
          }
          else if (ext === '.xlsx' || ext === '.xls' || mime.includes('spreadsheet')) {
              console.log("📊 Reading Excel file...");
              const workbook = XLSX.readFile(attachedFile.path);
              let allSheetsData = [];
              workbook.SheetNames.forEach(sheetName => {
                  const sheet = workbook.Sheets[sheetName];
                  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' }); 
                  if (csv && csv.trim().length > 0) allSheetsData.push(`[SHEET: ${sheetName}]\n${csv}`);
              });
              if (allSheetsData.length > 0) {
                  content = allSheetsData.join('\n\n====================\n\n');
                  displayType = `EXCEL (${workbook.SheetNames.length} Sheets)`;
              }
          }
          else {
               content = fs.readFileSync(attachedFile.path, 'utf8');
               displayType = 'CODE/TEXT';
          }

          if (content && content.trim().length > 0) {
              if (typeof content === 'object') content = JSON.stringify(content, null, 2);
              const trimmedContent = content.substring(0, CHAR_LIMIT);
              return `\n\n[FILE START: ${originalName} (${displayType})]\n${trimmedContent}\n[FILE END]\n`;
          } else {
              return `\n[SYSTEM INFO: File ${originalName} kosong atau tidak terbaca.]\n`;
          }

      } catch (e) {
          console.error(`❌ [FILE ERROR] ${originalName}:`, e);
          return `\n[SYSTEM ERROR: Gagal membaca file. ${e.message}]`;
      }
  }

  // ===========================================================================
  // 3. CORE: SMART FILTERING (FIXED LOGIC)
  // ===========================================================================
  filterRelevantData(sheetData, userMessage) {
    // 1. Normalisasi Container Data
    let items = [];
    let dataContainer = null; 

    if (Array.isArray(sheetData)) {
        items = sheetData;
    } else if (sheetData && Array.isArray(sheetData.projects)) {
        items = sheetData.projects;
        dataContainer = 'projects';
    } else if (sheetData && Array.isArray(sheetData.rows)) {
        items = sheetData.rows;
        dataContainer = 'rows';
    } else {
        return sheetData;
    }

    const query = userMessage.toLowerCase().trim();
    
    // --- LOGIKA BARU ---
    
    // A. EXACT PHRASE MATCH (Prioritas Tertinggi)
    // Mencari string utuh yang user berikan (misal: "Garubeka01...20260103")
    // Ini memastikan jika ada nama file spesifik, SEMUA kemunculannya diambil.
    const phraseMatches = items.filter(item => {
        const itemString = JSON.stringify(item).toLowerCase();
        return itemString.includes(query);
    });

    // Jika ditemukan hasil yang persis (exact match), kembalikan itu saja.
    // Kita set limit lebih tinggi (150) agar semua history masuk.
    if (phraseMatches.length > 0) {
        console.log(`🔍 Exact Filter: Ditemukan ${phraseMatches.length} baris yang mengandung "${query}".`);
        const resultItems = phraseMatches.slice(0, 150); 
        return Array.isArray(sheetData) ? resultItems : { ...sheetData, [dataContainer]: resultItems };
    }

    // B. KEYWORD MATCH (Fallback jika tidak ada Exact Match)
    // Pecah query jadi keyword, tapi abaikan karakter aneh
    const cleanQuery = query.replace(/[^\w\s\-\.]/gi, ' '); 
    const keywords = cleanQuery.split(/\s+/).filter(w => w.length > 2 && !['cari', 'tolong', 'minta', 'data', 'file', 'versi', 'semua'].includes(w));

    if (keywords.length === 0) {
        // Query terlalu umum, kembalikan data terbaru saja
        const fallback = items.slice(0, 50);
        return Array.isArray(sheetData) ? fallback : { ...sheetData, [dataContainer]: fallback };
    }

    const keywordMatches = items.filter(item => {
        const itemString = JSON.stringify(item).toLowerCase();
        // Cek apakah ada keyword yang match
        return keywords.some(k => itemString.includes(k));
    });

    console.log(`🔍 Fuzzy Filter: Keyword [${keywords}] -> ${keywordMatches.length} hasil.`);
    
    const finalItems = keywordMatches.slice(0, 70);
    return Array.isArray(sheetData) ? finalItems : { ...sheetData, [dataContainer]: finalItems };
  }

  // ===========================================================================
  // 4. MAIN PROCESS
  // ===========================================================================
  async processMessage({ userId, botId, message, attachedFile, threadId, history = [] }) {
    // A. Validasi Bot
    const bot = await Bot.findById(botId);
    if (!bot) throw new Error('Bot not found');

    // B. Thread
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

    // C. User Content
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

    // D. FILE MANAGER
    const isFileReq = this.fileManager.isFileRequest(message || '');
    if (isFileReq) {
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

    // E. SMARTSHEET DATA (WITH FIXED FILTERING)
    let contextData = "";
    const targetSheetId = bot.smartsheetConfig?.sheetId || bot.smartsheetConfig?.primarySheetId;
    
    if (this.isDataQuery(message) && bot.smartsheetConfig?.enabled && targetSheetId) {
        try {
            const service = new SmartsheetJSONService();
            if (bot.smartsheetConfig.apiKey) service.apiKey = bot.smartsheetConfig.apiKey;
            
            // 1. Ambil Data
            const fullSheetData = await service.getData(targetSheetId, message.includes('refresh'));
            
            // 2. Filter dengan Logika Baru (Exact Phrase Match)
            const filteredData = this.filterRelevantData(fullSheetData, message);

            // 3. Format Data
            const rawContext = service.formatForAI(filteredData);
            
            contextData = `\n\n=== DATA TERFILTER (HASIL PENCARIAN) ===\n${rawContext}\n=== END DATA ===\n`;
            
        } catch (e) { 
            console.error("Smartsheet Error:", e); 
            contextData = "\n[SISTEM: Gagal mengambil data.]\n";
        }
    }

    // F. SYSTEM PROMPT
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
        // Mode Default Smart
        finalSystemPrompt = `Anda adalah ${bot.name}, Project Analyst & Document Controller.

${contextData ? `DATA SUMBER TERFILTER (Relevan dengan pertanyaan):\n${contextData}` : ''}

**PERAN ANDA:**
1. **Document Controller:** Melacak riwayat file.
2. **Detail Oriented:** Perhatikan setiap baris data yang diberikan.

**INSTRUKSI UTAMA:**
1. **JANGAN ABAIKAN DATA:** Jika data yang terfilter mengandung banyak baris dengan nama file yang sama (history Add/Edit), TAMPILKAN SEMUANYA sebagai riwayat.
2. **Exact Match:** Jika user mencari nama file spesifik (misal ada tanggal di nama filenya), itu berarti user ingin melihat riwayat file tersebut. JANGAN cari file lain.
3. **Format:** Buat tabel untuk menampilkan riwayat versi/aktivitas file tersebut (Siapa, Kapan, Aktivitas).

**BAHASA:** Ikuti bahasa user (Indo/Inggris).`;
    }

    // G. AI EXECUTION
    let aiResponse = "";
    
    if (bot.kouventaConfig?.enabled) {
        const kvService = new KouventaService(bot.kouventaConfig.apiKey, bot.kouventaConfig.endpoint);
        let finalMessage = `[SYSTEM]\n${finalSystemPrompt}\n\n[USER]\n${message || ""}`;
        if (userContent.length > 1) { 
             const fileTexts = userContent.filter(c => c.type === 'text' && c.text !== message).map(c => c.text).join("\n");
             finalMessage += `\n\n[USER ATTACHMENT]\n${fileTexts}`;
        }
        aiResponse = await kvService.generateResponse(finalMessage);
    } else {
        const messagesPayload = [
            { role: 'system', content: finalSystemPrompt },
            ...history,
            { role: 'user', content: userContent }
        ];

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messagesPayload,
            temperature: 0.1 // Sangat rendah agar strict pada data
        });
        aiResponse = completion.choices[0].message.content;
    }

    // H. SAVE
    let savedAttachments = [];
    if (attachedFile) {
        savedAttachments.push({
            name: attachedFile.originalname || attachedFile.filename,
            path: attachedFile.url || attachedFile.path,
            type: attachedFile.mimetype?.includes('image') ? 'image' : 'file',
            size: (attachedFile.size / 1024).toFixed(1)
        });
    }

    await new Chat({ userId, botId, threadId, role: 'user', content: message || '', attachedFiles: savedAttachments }).save();
    await new Chat({ userId, botId, threadId, role: 'assistant', content: aiResponse, attachedFiles: [] }).save();

    return { response: aiResponse, threadId, title: currentThreadTitle, attachedFiles: savedAttachments };
  }
}

export default new AICoreService();
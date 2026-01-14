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
    
    // Jika user minta gambar dashboard/screenshot -> Masuk ke File Manager
    const visualKeywords = ['dashboard', 'gambar', 'image', 'foto', 'screenshot', 'show', 'tampilkan', 'lihat', 'visual'];
    if (visualKeywords.some(k => lowerMsg.includes(k)) && lowerMsg.includes('dashboard')) return false;

    // Keyword untuk memicu pembacaan data Smartsheet
    const dataKeywords = [
        'berikan', 'cari', 'list', 'daftar', 'semua', 'project', 'status', 'progress', 
        'summary', 'analisa', 'data', 'total', 'berapa', 'mana', 'versi', 'latest', 
        'terbaru', 'revisi', 'dokumen', 'file', 'tracking', 'update'
    ];
    return dataKeywords.some(k => lowerMsg.includes(k));
  }

  // ===========================================================================
  // 2. UTILS: EKSTRAKSI FILE (PDF, WORD, EXCEL)
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
          // A. PDF
          if (mime === 'application/pdf' || ext === '.pdf') {
              const dataBuffer = fs.readFileSync(attachedFile.path);
              const data = await pdf(dataBuffer);
              content = data.text.replace(/\n\s*\n/g, '\n');
              displayType = 'PDF';
          }
          // B. WORD (.docx)
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
          // C. EXCEL (.xlsx)
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
          // D. TEXT / CODE
          else {
               content = fs.readFileSync(attachedFile.path, 'utf8');
               displayType = 'CODE/TEXT';
          }

          if (content && content.trim().length > 0) {
              if (typeof content === 'object') content = JSON.stringify(content, null, 2);
              const trimmedContent = content.substring(0, CHAR_LIMIT);
              console.log(`✅ [FILE SUCCESS] Length: ${trimmedContent.length}`);
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
  // 3. CORE: SMART FILTERING (SOLUSI MASALAH "GARUBEKA")
  // ===========================================================================
  filterRelevantData(sheetData, userMessage) {
    // Cek struktur data
    let items = [];
    let dataContainer = null; // Menyimpan apakah data ada di dalam properti 'projects', 'rows', atau array langsung

    if (Array.isArray(sheetData)) {
        items = sheetData;
    } else if (sheetData && Array.isArray(sheetData.projects)) {
        items = sheetData.projects;
        dataContainer = 'projects';
    } else if (sheetData && Array.isArray(sheetData.rows)) {
        items = sheetData.rows;
        dataContainer = 'rows';
    } else {
        // Jika struktur tidak dikenali, kembalikan apa adanya (biar tidak error)
        return sheetData;
    }

    const query = userMessage.toLowerCase();
    // Ambil keyword penting (abaikan kata umum)
    const keywords = query.split(' ').filter(w => w.length > 3 && !['cari', 'tolong', 'minta', 'data', 'file', 'dokumen', 'yang', 'mana', 'adalah', 'untuk', 'pada'].includes(w));

    // KASUS 1: Query terlalu umum ("list semua", "tampilkan data")
    // Kembalikan 50 baris terbaru saja agar memori AI tidak penuh
    if (keywords.length === 0 || query.includes('semua') || query.includes('all') || query.includes('list')) {
        const slicedItems = items.slice(0, 50);
        return Array.isArray(sheetData) ? slicedItems : { ...sheetData, [dataContainer]: slicedItems };
    }

    // KASUS 2: Query Spesifik (misal: "Garubeka", "Proposal", "MEC")
    // Lakukan filtering ketat
    const filteredItems = items.filter(item => {
        const itemString = JSON.stringify(item).toLowerCase();
        // Cek apakah SALAH SATU keyword ada di dalam baris data ini
        return keywords.some(keyword => itemString.includes(keyword));
    });

    console.log(`🔍 Smart Filter: Ditemukan ${filteredItems.length} baris relevan untuk keyword "${keywords.join(' ')}"`);

    // Jika hasil filter kosong (mungkin typo), kembalikan fallback (20 data teratas)
    if (filteredItems.length === 0) {
        const fallbackItems = items.slice(0, 20);
        return Array.isArray(sheetData) ? fallbackItems : { ...sheetData, [dataContainer]: fallbackItems };
    }

    // Jika hasil filter terlalu banyak, batasi 50 teratas agar AI tidak overload
    const finalItems = filteredItems.slice(0, 50);
    
    return Array.isArray(sheetData) ? finalItems : { ...sheetData, [dataContainer]: finalItems };
  }

  // ===========================================================================
  // 4. MAIN PROCESS (MESSAGE CONTROLLER)
  // ===========================================================================
  async processMessage({ userId, botId, message, attachedFile, threadId, history = [] }) {
    // A. Validasi Bot
    const bot = await Bot.findById(botId);
    if (!bot) throw new Error('Bot not found');

    // B. Kelola Thread
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

    // C. Siapkan Konten User (Text + Attachment)
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

    // D. LOGIC 1: FILE MANAGER (Dashboard Images)
    // Cek apakah user minta file dashboard lokal
    const isFileReq = this.fileManager.isFileRequest(message || '');
    if (isFileReq) {
        const query = this.fileManager.extractFileQuery(message || '');
        console.log(`🔎 Searching dashboard files: "${query}"`);
        
        const foundFiles = await this.fileManager.searchFiles(query);
        
        if (foundFiles.length > 0) {
            const reply = this.fileManager.generateSmartDescription(foundFiles, query);
            const attachments = foundFiles.map(f => ({ 
                name: f.name, 
                path: f.relativePath, 
                type: f.type, 
                size: f.sizeKB 
            }));

            // Save & Return langsung (Skip OpenAI)
            await new Chat({ userId, botId, threadId, role: 'user', content: message, attachedFiles: [] }).save();
            await new Chat({ userId, botId, threadId, role: 'assistant', content: reply, attachedFiles: attachments }).save();
            
            return { response: reply, threadId, attachedFiles: attachments };
        }
    }

    // E. LOGIC 2: SMARTSHEET DATA (DENGAN FILTERING "GARUBEKA")
    let contextData = "";
    // Support nama field baru (sheetId) dan lama (primarySheetId)
    const targetSheetId = bot.smartsheetConfig?.sheetId || bot.smartsheetConfig?.primarySheetId;
    
    if (this.isDataQuery(message) && bot.smartsheetConfig?.enabled && targetSheetId) {
        try {
            const service = new SmartsheetJSONService();
            // Use Custom API Key if available
            if (bot.smartsheetConfig.apiKey) service.apiKey = bot.smartsheetConfig.apiKey;
            
            // 1. Ambil SEMUA data (Ribuan baris)
            const fullSheetData = await service.getData(targetSheetId, message.includes('refresh'));
            
            // 2. FILTER DATA (CRITICAL STEP)
            // Hanya ambil baris yang mengandung keyword user (misal "Garubeka")
            const filteredData = this.filterRelevantData(fullSheetData, message);

            // 3. Format data yang sudah disaring untuk AI
            const rawContext = service.formatForAI(filteredData);
            
            contextData = `\n\n=== DATA TERFILTER DARI SMARTSHEET (Relevansi Tinggi) ===\n${rawContext}\n=== END DATA ===\n`;
            
        } catch (e) { 
            console.error("⚠️ Smartsheet Error:", e); 
            contextData = "\n[SISTEM: Gagal mengambil data Smartsheet. Jawab berdasarkan pengetahuan umum.]\n";
        }
    }

    // F. LOGIC 3: SYSTEM PROMPT (ANTI-TABRAKAN)
    let finalSystemPrompt = "";
    
    // Cek apakah User mengisi Prompt di Dashboard Admin?
    const userPrompt = bot.prompt || bot.systemPrompt;
    // Anggap custom jika panjang > 20 dan bukan default text
    const isCustomPrompt = userPrompt && userPrompt.length > 20 && !userPrompt.includes("Anda adalah asisten AI profesional");

    if (isCustomPrompt) {
        // ✅ OPSI A: GUNAKAN PROMPT DARI DASHBOARD ADMIN (Prioritas Utama)
        // Gunakan prompt user mentah-mentah
        finalSystemPrompt = userPrompt;

        // Inject Data Smartsheet (jika ada)
        if (contextData) {
            // Jika user menulis {{CONTEXT}} di prompt, ganti disitu. Jika tidak, tempel di bawah.
            if (finalSystemPrompt.includes('{{CONTEXT}}')) {
                finalSystemPrompt = finalSystemPrompt.replace('{{CONTEXT}}', contextData);
            } else {
                finalSystemPrompt += `\n\n${contextData}\n(Gunakan data di atas sebagai referensi utama jawaban Anda.)`;
            }
        }

    } else {
        // ✅ OPSI B: GUNAKAN DEFAULT SMART BOT (Jika Dashboard Kosong)
        finalSystemPrompt = `Anda adalah ${bot.name}, Asisten Project Management & Document Control Profesional.

${contextData ? `DATA SUMBER TERFILTER (Relevan dengan pertanyaan):\n${contextData}` : ''}

**PERAN ANDA:**
1. **Analisis Proyek:** Monitoring status, health, dan progress.
2. **Document Controller (Cerdas):** Melacak versi dokumen & revisi.

**INSTRUKSI UTAMA:**
1. **BAHASA:** Ikuti bahasa user. Jika tanya Inggris, jawab Inggris. Jika Indo, jawab Indo.
2. **PENCARIAN DOKUMEN:** - Data di atas sudah difilter berdasarkan kata kunci user (misal "Garubeka").
   - Lakukan Fuzzy Search pada nama file.
   - **Logika Versioning:** Urutan Draft < v1 < Rev1 < Rev2 < Final.
   - Jika tidak ada label, file dengan **TANGGAL TERBARU** adalah **LATEST**.
3. **OUTPUT:** Selalu sarankan file versi TERBARU (Latest). Tandai file lama sebagai "Outdated".

**FORMAT:** Gunakan Markdown Table/List yang rapi.`;
    }

    // G. EKSEKUSI AI (OPENAI / KOUVENTA)
    let aiResponse = "";
    
    // 1. KOUVENTA
    if (bot.kouventaConfig?.enabled) {
        console.log(`🤖 Using KOUVENTA for bot: ${bot.name}`);
        const kvService = new KouventaService(bot.kouventaConfig.apiKey, bot.kouventaConfig.endpoint);
        
        let finalMessage = `[SYSTEM]\n${finalSystemPrompt}\n\n[USER]\n${message || ""}`;
        if (userContent.length > 1) { // Jika ada file attachment dari user
             const fileTexts = userContent.filter(c => c.type === 'text' && c.text !== message).map(c => c.text).join("\n");
             finalMessage += `\n\n[USER ATTACHMENT CONTENT]\n${fileTexts}`;
        }
        aiResponse = await kvService.generateResponse(finalMessage);
    } 
    // 2. OPENAI (Default)
    else {
        console.log(`🧠 Using OPENAI for bot: ${bot.name}`);
        const messagesPayload = [
            { role: 'system', content: finalSystemPrompt },
            ...history,
            { role: 'user', content: userContent }
        ];

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messagesPayload,
            temperature: 0.3 // Temperature rendah agar lebih akurat membaca data
        });
        aiResponse = completion.choices[0].message.content;
    }

    // H. SAVE & RETURN
    let savedAttachments = [];
    if (attachedFile) {
        savedAttachments.push({
            name: attachedFile.originalname || attachedFile.filename,
            path: attachedFile.url || attachedFile.path,
            type: attachedFile.mimetype?.includes('image') ? 'image' : 'file',
            size: (attachedFile.size / 1024).toFixed(1)
        });
    }

    // Simpan Chat User
    await new Chat({ userId, botId, threadId, role: 'user', content: message || '', attachedFiles: savedAttachments }).save();
    // Simpan Chat Assistant
    await new Chat({ userId, botId, threadId, role: 'assistant', content: aiResponse, attachedFiles: [] }).save();

    return { response: aiResponse, threadId, title: currentThreadTitle, attachedFiles: savedAttachments };
  }
}

export default new AICoreService();
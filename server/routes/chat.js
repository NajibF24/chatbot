import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
// Library pembaca dokumen
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

import User from '../models/User.js';
import Bot from '../models/Bot.js';
import Chat from '../models/Chat.js';
import { requireAuth } from '../middleware/auth.js';
import SmartsheetJSONService from '../services/smartsheet-json.service.js';
import FileManagerService from '../services/file-manager.service.js';
import { getBotConfig } from '../config/bot_prompts.js';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const fileManager = new FileManagerService();

// ============================================================================
// 📂 1. CONFIG UPLOAD
// ============================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'data/files';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // Limit 10MB
});

// ============================================================================
// 🧠 2. HELPER FUNCTIONS
// ============================================================================
function isDataQuery(message) {
  const lowerMsg = (message || '').toLowerCase();
  // Keyword Visual (Skip data fetch jika user minta gambar dashboard)
  const visualKeywords = ['dashboard', 'gambar', 'image', 'foto', 'screenshot'];
  if (visualKeywords.some(k => lowerMsg.includes(k))) return false;

  // Keyword Data
  const dataKeywords = ['berikan', 'tampilkan', 'cari', 'list', 'daftar', 'semua', 'project', 'status', 'progress', 'overdue', 'summary', 'health', 'analisa', 'resume'];
  return dataKeywords.some(k => lowerMsg.includes(k));
}

async function getSmartsheetData(bot, forceRefresh = false) {
  const apiKey = bot.smartsheetConfig?.customApiKey || process.env.SMARTSHEET_API_KEY;
  const sheetId = bot.smartsheetConfig?.primarySheetId || process.env.SMARTSHEET_PRIMARY_SHEET_ID;

  if (!apiKey || !sheetId) return null;

  try {
    const service = new SmartsheetJSONService();
    service.apiKey = apiKey;
    return await service.getData(sheetId, forceRefresh);
  } catch (error) {
    console.error('❌ Error getting Smartsheet data:', error.message);
    return null;
  }
}

// ============================================================================
// 🚀 3. ROUTES
// ============================================================================

// Upload Endpoint
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: req.file.path,
    mimetype: req.file.mimetype,
    url: `/api/files/${req.file.filename}`, // URL untuk Frontend
    size: req.file.size
  });
});

// Get Bots
router.get('/bots', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate('assignedBots');
    if (user.isAdmin && (!user.assignedBots || user.assignedBots.length === 0)) {
      const allBots = await Bot.find({});
      return res.json(allBots);
    }
    res.json(user.assignedBots);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================================================
// 💬 4. MAIN CHAT LOGIC (THE BRAIN)
// ============================================================================
router.post('/message', requireAuth, async (req, res) => {
  try {
    const { message, botId, history, attachedFile } = req.body;
    const user = await User.findById(req.session.userId);
    const bot = await Bot.findById(botId);

    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (!user.assignedBots.some(b => b.toString() === botId) && !user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // --- STEP A: PERSIAPKAN PESAN USER ---
    let userContent = [];
    
    // 1. Masukkan Teks (Jika ada)
    if (message) {
      userContent.push({ type: "text", text: message });
    }

    // 2. Masukkan File Attachment (Logic Ekstraksi)
    if (attachedFile && attachedFile.path) {
      const mime = attachedFile.mimetype || '';
      console.log(`📎 Processing file: ${attachedFile.filename || attachedFile.originalname} (${mime})`);

      try {
        // A. IMAGE (Vision API)
        if (mime.startsWith('image/')) {
          const imgBuffer = fs.readFileSync(attachedFile.path);
          userContent.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${imgBuffer.toString('base64')}` }
          });
        }
        
        // B. PDF (Extract Text)
        else if (mime === 'application/pdf') {
          const dataBuffer = fs.readFileSync(attachedFile.path);
          const data = await pdf(dataBuffer);
          // Ambil 30k karakter pertama saja agar token tidak jebol
          const text = data.text.replace(/\n\s*\n/g, '\n').substring(0, 30000); 
          userContent.push({ 
            type: "text", 
            text: `\n\n[FILE PDF START: ${attachedFile.filename || attachedFile.originalname}]\n${text}\n[FILE PDF END]\n` 
          });
        }

        // C. WORD / DOCX (Extract Text)
        else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ path: attachedFile.path });
          const text = result.value.substring(0, 30000);
          userContent.push({ 
            type: "text", 
            text: `\n\n[FILE DOCX START: ${attachedFile.filename || attachedFile.originalname}]\n${text}\n[FILE DOCX END]\n` 
          });
        }

        // D. PLAIN TEXT / CODE
        else if (mime.match(/(text|json|javascript|xml)/) || (attachedFile.filename || attachedFile.originalname).match(/\.(txt|md|csv|js|json|env|sh)$/)) {
          const content = fs.readFileSync(attachedFile.path, 'utf8').substring(0, 20000);
          userContent.push({ 
            type: "text", 
            text: `\n\n[FILE CONTENT: ${attachedFile.filename || attachedFile.originalname}]\n${content}\n` 
          });
        }

      } catch (err) {
        console.error("❌ Error reading file content:", err);
        userContent.push({ 
          type: "text", 
          text: `\n[SYSTEM ERROR: Gagal membaca isi file ${attachedFile.filename || attachedFile.originalname}]` 
        });
      }
    }

    // --- STEP B: LOGIC SMARTSHEET / BOT KHUSUS ---
    const botConfig = getBotConfig(bot.name);
    const isSmartsheetBot = bot.smartsheetEnabled || (botConfig && bot.name.toLowerCase().includes('smartsheet'));
    
    let systemPrompt = "";
    let contextData = null;

    if (isSmartsheetBot) {
        // ============================================================================
        // 1. CEK REQUEST DASHBOARD (VISUAL)
        // ============================================================================
        const isFileReq = fileManager.isFileRequest(message || '');
        if (isFileReq) {
            const query = fileManager.extractFileQuery(message || '');
            const foundFiles = await fileManager.searchFiles(query);
            
            if (foundFiles.length > 0) {
                const reply = fileManager.generateSmartDescription(foundFiles, query);
                const attachments = foundFiles.map(f => ({ 
                    name: f.name, 
                    path: f.relativePath, 
                    type: f.type, 
                    size: f.sizeKB 
                }));
                
                const chat = new Chat({ 
                    userId: user._id, 
                    botId: bot._id, 
                    role: 'assistant', 
                    content: reply, 
                    attachedFiles: attachments 
                });
                await chat.save();
                return res.json({ response: reply, attachedFiles: attachments });
            }
        }

        // ============================================================================
        // 2. CEK PERTANYAAN KONTRAK / ToP (ENHANCED)
        // ============================================================================
        const lowerMsg = (message || '').toLowerCase();
        
        // ✅ COMPREHENSIVE CONTRACT KEYWORDS
        const contractKeywords = [
            // ToP/Payment related
            'top', 'term', 'payment', 'termin', 'pembayaran', 'bayar', 'invoice', 'tagih',
            // Contract related
            'kontrak', 'klausul', 'perjanjian', 'agreement',
            // Schedule related
            'jadwal', 'schedule', 'kapan', 'when', 'waktu', 'time', 'tanggal', 'date',
            // Value related
            'nilai', 'value', 'harga', 'price', 'biaya', 'cost', 'budget',
            // Status related
            'lunas', 'paid', 'outstanding', 'pending', 'due'
        ];
        
        const isContractQuery = contractKeywords.some(k => lowerMsg.includes(k));
        
        console.log('');
        console.log('='.repeat(70));
        console.log('🔍 CONTRACT QUERY DETECTION');
        console.log('='.repeat(70));
        console.log(`Message: "${message}"`);
        console.log(`Is Contract Query: ${isContractQuery}`);
        
        let contractContent = "";
        
        if (isContractQuery) {
            console.log('💰 Contract query detected! Searching for contract file...');
            
            // ✅ USE NEW METHOD: extractProjectName (better for contract queries)
            const projectName = fileManager.extractProjectName(message || '');
            console.log(`📝 Extracted project name: "${projectName}"`);
            
            if (projectName && projectName.length >= 3) {
                const contractFile = fileManager.findContractFile(projectName);
                
                if (contractFile) {
                    console.log(`📄 Reading contract: ${contractFile.filename}`);
                    try {
                        const dataBuffer = fs.readFileSync(contractFile.path);
                        const pdfData = await pdf(dataBuffer);
                        
                        // Ambil 30k karakter (cukup untuk ToP + context)
                        const text = pdfData.text.replace(/\n\s*\n/g, '\n').substring(0, 30000);
                        
                        contractContent = `\n\n=== 📄 DATA DARI FILE KONTRAK (${contractFile.filename}) ===\n${text}\n=== END KONTRAK ===\n`;
                        
                        console.log(`✅ Contract loaded successfully:`);
                        console.log(`   - Filename: ${contractFile.filename}`);
                        console.log(`   - Characters: ${text.length}`);
                        console.log(`   - Preview: ${text.substring(0, 200)}...`);
                    } catch (err) {
                        console.error("❌ Failed to read contract PDF:", err);
                    }
                } else {
                    console.log('⚠️  No contract file found for this project');
                    console.log('   Suggestions:');
                    console.log(`   1. Check if file exists with name containing: "${projectName}"`);
                    console.log(`   2. Verify file location: server/data/files/contracts/`);
                    console.log(`   3. Ensure file has .pdf extension`);
                }
            } else {
                console.log('⚠️  Could not extract valid project name from query');
                console.log(`   Extracted: "${projectName}" (too short or empty)`);
            }
            
            console.log('='.repeat(70));
        }

        // ============================================================================
        // 3. FETCH DATA SMARTSHEET
        // ============================================================================
        const isData = isDataQuery(message || '');
        
        console.log('📊 Data fetch decision:');
        console.log(`   - Is data query: ${isData}`);
        console.log(`   - Is contract query: ${isContractQuery}`);
        console.log(`   - Has attachment: ${!!attachedFile}`);
        
        // Fetch Smartsheet if:
        // 1. User asks for data (list, status, progress, etc)
        // 2. User asks about contract (need project data for cross-reference)
        // 3. User uploads non-image file (might want comparison)
        if (isData || isContractQuery || (attachedFile && !attachedFile.mimetype.startsWith('image/'))) {
            console.log('→ Fetching Smartsheet data...');
            
            const shouldRefresh = lowerMsg.includes('refresh');
            const sheetData = await getSmartsheetData(bot, shouldRefresh);
            
            if (sheetData) {
                const service = new SmartsheetJSONService();
                const rawContext = service.formatForAI(sheetData);
                
                // GABUNGKAN: Smartsheet + Kontrak
                contextData = `Total Proyek: ${sheetData.projects.length}\n${rawContext}`;
                console.log(`✅ Smartsheet data loaded: ${sheetData.projects.length} projects`);
                
                if (contractContent) {
                    contextData += contractContent;
                    console.log('✅ Contract data appended to context');
                }
            } else {
                console.log('⚠️  Failed to fetch Smartsheet data');
            }
        } else {
            console.log('→ Skipping Smartsheet fetch (not needed for this query)');
        }
    }

    // --- STEP C: GENERATE SYSTEM PROMPT ---
    if (botConfig) {
      // Ambil prompt dari bot_prompts.js (Logic Tabel & Overdue ada disana)
      systemPrompt = botConfig.getPrompt(bot.name, contextData);
    } else {
      systemPrompt = `Anda adalah ${bot.name}. Asisten AI General. Jawablah dengan format yang rapi (Markdown).`;
    }

    // --- STEP D: OPENAI CALL ---
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map(msg => ({ 
        role: msg.role === 'user' ? 'user' : 'assistant', 
        content: msg.content 
      })),
      { role: 'user', content: userContent } // Pesan + File
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.5,
      max_tokens: 4096
    });

    const aiResponse = completion.choices[0].message.content;

    // --- STEP E: SAVE TO DB (✅ FIXED VERSION) ---
    
    // ✅ 1. Siapkan attachedFiles array dengan benar
    let userAttachedFiles = [];
    if (attachedFile) {
      // Pastikan kita punya semua field yang diperlukan
      const fileName = attachedFile.filename || attachedFile.originalname || 'unknown';
      const fileUrl = attachedFile.url || `/api/files/${fileName}`;
      const fileMime = attachedFile.mimetype || 'application/octet-stream';
      const fileSize = attachedFile.size || 0;
      
      // Tentukan tipe file
      let fileType = 'other';
      if (fileMime.startsWith('image/')) {
        fileType = 'image';
      } else if (fileMime === 'application/pdf') {
        fileType = 'pdf';
      } else if (fileMime.includes('word') || fileMime.includes('document')) {
        fileType = 'document';
      }
      
      // ✅ Buat object yang sesuai dengan schema
      userAttachedFiles = [{
        name: fileName,
        path: fileUrl,
        type: fileType,
        size: (fileSize / 1024).toFixed(1) // Convert to KB string
      }];
      
      // 🔍 DEBUG: Cek tipe data
      console.log('📦 Prepared attachedFiles:', JSON.stringify(userAttachedFiles, null, 2));
      console.log('📦 Type check:', {
        isArray: Array.isArray(userAttachedFiles),
        length: userAttachedFiles.length,
        firstElementType: typeof userAttachedFiles[0],
        firstElement: userAttachedFiles[0]
      });
    }
    
    // ✅ 2. Simpan Chat User dengan struktur yang benar
    const userChatData = { 
      userId: user._id, 
      botId: bot._id, 
      role: 'user', 
      content: message || '', // Kosongkan jika tidak ada pesan teks
      
      // Legacy field (optional, bisa dihapus jika tidak digunakan)
      attachment: attachedFile ? { 
        filename: attachedFile.filename || attachedFile.originalname,
        url: attachedFile.url || `/api/files/${attachedFile.filename || attachedFile.originalname}`,
        mimetype: attachedFile.mimetype
      } : undefined
    };

    // ✅ CRITICAL: Set attachedFiles AFTER object creation to prevent transformation
    if (userAttachedFiles.length > 0) {
      userChatData.attachedFiles = userAttachedFiles;
    }

    console.log('💾 About to save:', {
      userId: userChatData.userId,
      botId: userChatData.botId,
      role: userChatData.role,
      hasAttachment: !!userChatData.attachment,
      attachedFilesType: typeof userChatData.attachedFiles,
      attachedFilesIsArray: Array.isArray(userChatData.attachedFiles),
      attachedFilesContent: userChatData.attachedFiles
    });
    
    const userChat = new Chat(userChatData);
    
    // 🔍 DEBUG: Check what Mongoose actually stored
    console.log('🔍 After new Chat():', {
      attachedFilesType: typeof userChat.attachedFiles,
      attachedFilesIsArray: Array.isArray(userChat.attachedFiles),
      attachedFilesValue: userChat.attachedFiles
    });
    
    await userChat.save();
    console.log('✅ User chat saved successfully');

    // ✅ 3. Simpan Chat Bot
    const botChat = new Chat({ 
      userId: user._id, 
      botId: bot._id, 
      role: 'assistant', 
      content: aiResponse,
      attachedFiles: [] // Bot biasanya tidak punya attachment
    });
    await botChat.save();
    console.log('✅ Bot chat saved successfully');

    // ✅ 4. Return response dengan attachedFiles jika ada
    res.json({ 
      response: aiResponse,
      attachedFiles: userAttachedFiles.length > 0 ? userAttachedFiles : undefined
    });

  } catch (error) {
    console.error('❌ Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- HISTORY ROUTES ---
router.get('/history/:botId', requireAuth, async (req, res) => {
  try {
    const chats = await Chat.find({ 
      userId: req.session.userId, 
      botId: req.params.botId 
    }).sort({ createdAt: 1 });
    res.json(chats);
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

router.delete('/history/:botId', requireAuth, async (req, res) => {
  try {
    await Chat.deleteMany({ 
      userId: req.session.userId, 
      botId: req.params.botId 
    });
    res.json({ message: 'History cleared' });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

export default router;

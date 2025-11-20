import express from 'express';
import OpenAI from 'openai';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import Bot from '../models/Bot.js';
import SmartsheetJSONService from '../services/smartsheet-json.service.js';
import FileManagerService from '../services/file-manager.service.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize services
const fileManager = new FileManagerService();

// Get user's accessible bots
router.get('/bots', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate('assignedBots');
    res.json({ bots: user.assignedBots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat history
router.get('/history/:botId', requireAuth, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      userId: req.session.userId,
      botId: req.params.botId
    });

    res.json({ messages: chat ? chat.messages : [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Get Smartsheet data from JSON cache
async function getSmartsheetData(bot, forceRefresh = false) {
  if (!bot.smartsheetEnabled || !bot.smartsheetConfig?.primarySheetId) {
    return null;
  }

  try {
    const apiKey = bot.smartsheetConfig?.customApiKey || process.env.SMARTSHEET_API_KEY;

    if (!apiKey) {
      console.warn('⚠️  Smartsheet API key not configured');
      return null;
    }

    const service = new SmartsheetJSONService();
    service.apiKey = apiKey;

    const sheetId = bot.smartsheetConfig.primarySheetId;

    console.log(`📊 Getting Smartsheet data (Sheet ID: ${sheetId})`);
    console.log(`   Force refresh: ${forceRefresh}`);

    const data = await service.getData(sheetId, forceRefresh);
    return data;
  } catch (error) {
    console.error('❌ Error getting Smartsheet data:', error.message);
    return null;
  }
}

// Send message
router.post('/message', requireAuth, async (req, res) => {
  try {
    const { botId, message } = req.body;

    console.log('');
    console.log('💬 CHAT MESSAGE');
    console.log(`   Bot ID: ${botId}`);
    console.log(`   Message: ${message.substring(0, 100)}...`);

    // Verify user has access to this bot
    const user = await User.findById(req.session.userId);
    if (!user.assignedBots.includes(botId)) {
      return res.status(403).json({ error: 'Access denied to this bot' });
    }

    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    console.log(`🤖 Bot: ${bot.name}`);
    console.log(`   Smartsheet enabled: ${bot.smartsheetEnabled}`);

    // Get or create chat
    let chat = await Chat.findOne({
      userId: req.session.userId,
      botId: botId
    });

    if (!chat) {
      chat = new Chat({
        userId: req.session.userId,
        botId: botId,
        messages: []
      });
    }

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message
    });

    // Build conversation history
    const conversationHistory = chat.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    let assistantMessage = '';
    let systemPrompt = '';
    let attachedFiles = [];

    // Check if this is Smartsheet bot
    if (bot.smartsheetEnabled && bot.smartsheetConfig?.primarySheetId) {
      console.log('📊 Smartsheet Bot detected');

      // ✅ PRIORITY 1: Check if user is requesting a file/dashboard
      const isFileReq = fileManager.isFileRequest(message);

      if (isFileReq) {
        console.log('📁 Dashboard/File request detected');

        // Extract query from message
        const fileQuery = fileManager.extractFileQuery(message);
        console.log(`   Query: "${fileQuery}"`);

        // ✅ CHECK: Is query too generic? (no specific dashboard mentioned)
        const isGenericRequest = !fileQuery ||
                                 fileQuery.trim().length < 2 ||
                                 ['saya', 'aku', 'my', 'semua', 'all'].includes(fileQuery.trim().toLowerCase());

        if (isGenericRequest) {
          console.log('⚠️  Generic dashboard request - asking for clarification');

          // Get all available dashboards
          const allFiles = await fileManager.listFiles();
          const folders = [...new Set(allFiles.filter(f => f.folder).map(f => f.folder))];

          if (folders.length === 0) {
            assistantMessage = 'Maaf, saat ini belum ada dashboard yang tersedia.';
          } else {
            assistantMessage = 'Dashboard mana yang ingin Anda lihat? Saat ini ada beberapa dashboard yang tersedia:\n\n';

            folders.forEach(folder => {
              const dashboardName = folder.replace('dashboard-', '');
              let readableName = '';

              if (dashboardName.includes('iot-caliper') || (dashboardName.includes('iot') && dashboardName.includes('caliper'))) {
                readableName = 'Dashboard IoT Caliper';
              } else if (dashboardName === 'iot') {
                readableName = 'Dashboard IoT';
              } else if (dashboardName.includes('caliper')) {
                readableName = 'Dashboard Caliper';
              } else if (dashboardName === 'b') {
                readableName = 'Dashboard Project B';
              } else {
                readableName = 'Dashboard ' + dashboardName
                  .split('-')
                  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
              }

              const filesCount = allFiles.filter(f => f.folder === folder);
              const imagesCount = filesCount.filter(f => f.type === 'image').length;
              const pdfsCount = filesCount.filter(f => f.type === 'pdf').length;

              assistantMessage += `• ${readableName}`;
              if (imagesCount > 0) assistantMessage += ` (${imagesCount} gambar`;
              if (pdfsCount > 0) assistantMessage += `, ${pdfsCount} dokumen`;
              if (imagesCount > 0 || pdfsCount > 0) assistantMessage += ')';
              assistantMessage += '\n';
            });

            assistantMessage += '\nSilakan sebutkan dashboard yang ingin ditampilkan, misalnya:\n';
            assistantMessage += '"Tampilkan Dashboard IoT Caliper"';
          }

          chat.messages.push({
            role: 'assistant',
            content: assistantMessage
          });

          await chat.save();

          return res.json({
            message: assistantMessage,
            chatId: chat._id,
            smartsheetEnabled: bot.smartsheetEnabled
          });
        }

        // ✅ Search for ALL matching files
        const foundFiles = await fileManager.searchFiles(fileQuery);

        if (foundFiles.length > 0) {
          console.log(`✅ Found ${foundFiles.length} file(s)`);

          // ✅ Attach ALL found files
          attachedFiles = foundFiles;

          // ✅ IMPROVED: Generate smart, natural description (as if from Smartsheet)
          assistantMessage = fileManager.generateSmartDescription(foundFiles, fileQuery);

          // ✅ Prepare attached files properly
          const fileAttachments = attachedFiles.map(f => ({
            name: String(f.name),
            path: String(f.relativePath),
            type: String(f.type),
            extension: String(f.extension),
            size: String(f.sizeKB)
          }));

          console.log('📎 Attaching files:', fileAttachments.length);
          fileAttachments.forEach(f => {
            console.log(`   - ${f.name} (${f.type}) → ${f.path}`);
          });

          // ✅ CRITICAL: Save to chat WITH attachedFiles
          chat.messages.push({
            role: 'assistant',
            content: assistantMessage,
            attachedFiles: fileAttachments
          });

          await chat.save();
          console.log(`✅ Chat saved with ${fileAttachments.length} file attachment(s)`);

          // ✅ CRITICAL: Return with attachedFiles in response
          return res.json({
            message: assistantMessage,
            chatId: chat._id,
            smartsheetEnabled: bot.smartsheetEnabled,
            attachedFiles: fileAttachments  // ← MUST be in response
          });
        } else {
          // ✅ No files found - Natural response
          console.log('⚠️  No matching files found');

          const allFiles = await fileManager.listFiles();

          if (allFiles.length === 0) {
            assistantMessage = 'Maaf, saat ini belum ada dashboard visual yang tersedia untuk project ini.\n\n';
            assistantMessage += 'Dashboard akan tersedia setelah ada update terbaru dari tim project.';
          } else {
            assistantMessage = `Maaf, dashboard untuk "${fileQuery}" belum tersedia atau nama project tidak cocok.\n\n`;
            assistantMessage += 'DASHBOARD YANG TERSEDIA:\n\n';

            // Group files by folder
            const byFolder = {};
            allFiles.forEach(f => {
              const folder = f.folder || 'root';
              if (!byFolder[folder]) byFolder[folder] = [];
              byFolder[folder].push(f);
            });

            // List available dashboards
            for (const [folder, folderFiles] of Object.entries(byFolder)) {
              if (folder !== 'root') {
                const dashboardName = folder.replace('dashboard-', '').replace(/-/g, ' ').toUpperCase();
                assistantMessage += `• ${dashboardName}\n`;

                const images = folderFiles.filter(f => f.type === 'image');
                const pdfs = folderFiles.filter(f => f.type === 'pdf');

                if (images.length > 0) {
                  assistantMessage += `  - ${images.length} gambar dashboard\n`;
                }
                if (pdfs.length > 0) {
                  assistantMessage += `  - ${pdfs.length} dokumen PDF\n`;
                }
                assistantMessage += `\n`;
              }
            }

            assistantMessage += `Sebutkan nama project yang lebih spesifik, misalnya:\n`;
            assistantMessage += `"Tampilkan dashboard IoT" atau "Tampilkan dashboard Caliper"`;
          }

          chat.messages.push({
            role: 'assistant',
            content: assistantMessage
          });

          await chat.save();

          return res.json({
            message: assistantMessage,
            chatId: chat._id,
            smartsheetEnabled: bot.smartsheetEnabled
          });
        }
      }

      // ✅ PRIORITY 2: Normal Smartsheet analysis (not file request)
      const shouldRefresh = message.toLowerCase().includes('refresh') ||
                           message.toLowerCase().includes('update') ||
                           message.toLowerCase().includes('terbaru');

      const sheetData = await getSmartsheetData(bot, shouldRefresh);

      if (sheetData) {
        console.log('✅ Smartsheet data loaded from cache');
        console.log(`   Projects: ${sheetData.projects.length}`);
        console.log(`   Last fetched: ${new Date(sheetData.metadata.fetchedAt).toLocaleString('id-ID')}`);

        const service = new SmartsheetJSONService();
        const formattedContext = service.formatForAI(sheetData);

        // Get available files context
        const fileContext = await fileManager.generateFileContext();

        // ✅ SYSTEM PROMPT: Smartsheet Analysis + File Management + Natural Response
        systemPrompt = `Anda adalah ${bot.name}, seorang Project Management Analyst profesional untuk Garuda Yamato Steel.

Anda memiliki akses ke:
1. Data proyek REAL-TIME dari Smartsheet
2. Dashboard visual dan dokumen project

${formattedContext}

${fileContext}

**KEMAMPUAN ANDA:**

1. ANALISIS PROYEK (dari Smartsheet data)
   - Menganalisis status, progress, risiko proyek
   - Memberikan insight dan rekomendasi
   - Membuat laporan dan summary
   - Menjawab pertanyaan tentang project metrics, timeline, budget

2. DASHBOARD VISUAL (dari Smartsheet)
   - Menampilkan dashboard gambar project (langsung tampil di chat)
   - Menampilkan dokumen PDF report (langsung tampil di chat)
   - Mencari dan menampilkan semua dashboard yang cocok

**PENTING - DESKRIPSI FILE:**

Saat menampilkan file, JANGAN gunakan template generic seperti:
❌ "Dashboard ini menampilkan status progress dan milestone"
❌ "Dashboard mencakup timeline dan task breakdown"

Sebaliknya, deskripsikan berdasarkan KONTEKS FILE:
✅ Jika file terkait "UI-UX-Discussion.png" → "Berikut dokumentasi diskusi UI/UX"
✅ Jika file terkait "Setup-Configuration.png" → "Berikut dokumentasi setup & konfigurasi"
✅ Jika file terkait "Progress-Report.pdf" → "Berikut laporan progress project"

File akan otomatis ditampilkan dalam layout yang rapi (grid untuk multiple files).
TIDAK PERLU menjelaskan bahwa "file ditampilkan di atas" - user sudah bisa lihat sendiri.

**RESPONS UNTUK DASHBOARD REQUEST:**

Jika user meminta dashboard/gambar/visual:
• Jelaskan bahwa ini adalah update dari Smartsheet Dashboard
• Dashboard akan otomatis tampil di chat
• JANGAN suruh user klik tombol apapun
• Berikan konteks singkat tentang isi dashboard

**ATURAN FORMATTING:**

1. JANGAN gunakan markdown syntax (**bold**, *italic*, \`code\`, #header)
2. Gunakan format plain text yang bersih dan terstruktur
3. Untuk header/judul: Gunakan huruf kapital dan baris kosong
4. Untuk daftar: Gunakan bullet point sederhana (•)
5. Untuk penekanan: Gunakan huruf KAPITAL, bukan **bold**

**KONTEKS DATA:**
- Terakhir Diperbarui: ${new Date(sheetData.metadata.fetchedAt).toLocaleString('id-ID')}
- Total Proyek: ${sheetData.projects.length}
- Completion Rate: ${sheetData.statistics.completionRate}

Jawab dalam Bahasa Indonesia profesional.

INGAT:
- Untuk analisis proyek, gunakan data Smartsheet
- Untuk dashboard/visual, sistem otomatis menampilkan file dengan deskripsi smart
- Dashboard adalah update langsung dari Smartsheet
- JANGAN gunakan markdown syntax (**, *, \`)`;

        if (shouldRefresh) {
          console.log('🔄 User requested data refresh');
        }

      } else {
        console.warn('⚠️  Failed to load Smartsheet data');

        // Even without Smartsheet, still support file requests
        const fileContext = await fileManager.generateFileContext();

        systemPrompt = `Anda adalah ${bot.name} untuk Garuda Yamato Steel.

Maaf, saat ini data Smartsheet tidak dapat diakses. Namun Anda masih dapat:

1. Menampilkan dashboard visual yang tersedia
2. Mencari dokumen project
3. Membuka file PDF report

${fileContext}

Silakan sebutkan dashboard yang ingin Anda lihat.`;
      }

    } else {
      // General bot - Standard ChatGPT
      console.log('🤖 General Bot - Standard ChatGPT mode');

      systemPrompt = `Anda adalah ${bot.name}. ${bot.description || 'Asisten AI yang membantu.'}

Anda adalah asisten AI general-purpose yang dibuat untuk membantu pengguna dengan berbagai tugas.
Anda dapat:
- Menjawab pertanyaan tentang berbagai topik
- Membantu dengan analisis dan problem-solving
- Memberikan penjelasan dan klarifikasi
- Membantu dengan pertanyaan umum

Bersikaplah membantu, akurat, dan profesional dalam respons Anda.
Berikan jawaban yang jelas dan ringkas.

PENTING: Jangan gunakan markdown syntax (**bold**, *italic*). Gunakan plain text yang bersih.`;
    }

    // Call OpenAI Chat Completions
    console.log('🤖 Calling OpenAI...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...conversationHistory
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    if (completion.choices && completion.choices[0]?.message?.content) {
      assistantMessage = completion.choices[0].message.content;
      console.log('✅ OpenAI response received');
    } else {
      throw new Error('No response from OpenAI');
    }

    // Add assistant message
    chat.messages.push({
      role: 'assistant',
      content: assistantMessage
    });

    await chat.save();
    console.log('✅ Chat saved');
    console.log('');

    res.json({
      message: assistantMessage,
      chatId: chat._id,
      smartsheetEnabled: bot.smartsheetEnabled
    });

  } catch (error) {
    console.error('');
    console.error('❌ CHAT ERROR');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(70));
    console.error('');
    res.status(500).json({ error: error.message });
  }
});

// Clear chat history
router.delete('/history/:botId', requireAuth, async (req, res) => {
  try {
    await Chat.findOneAndDelete({
      userId: req.session.userId,
      botId: req.params.botId
    });

    res.json({ message: 'Chat history cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to manually refresh Smartsheet cache
router.post('/refresh-smartsheet/:botId', requireAuth, async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.botId);

    if (!bot || !bot.smartsheetEnabled) {
      return res.status(400).json({ error: 'Smartsheet not enabled for this bot' });
    }

    console.log('🔄 Manual cache refresh requested');
    const data = await getSmartsheetData(bot, true);

    if (!data) {
      return res.status(500).json({ error: 'Failed to refresh Smartsheet data' });
    }

    res.json({
      success: true,
      message: 'Smartsheet data refreshed successfully',
      data: {
        sheetName: data.metadata.name,
        totalProjects: data.projects.length,
        fetchedAt: data.metadata.fetchedAt,
        statistics: data.statistics
      }
    });

  } catch (error) {
    console.error('Error refreshing Smartsheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get cache status
router.get('/smartsheet-cache-status/:botId', requireAuth, async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.botId);

    if (!bot || !bot.smartsheetEnabled) {
      return res.json({
        enabled: false,
        message: 'Smartsheet not enabled for this bot'
      });
    }

    const service = new SmartsheetJSONService();
    const cacheInfo = await service.getCacheInfo();

    res.json({
      enabled: true,
      sheetId: bot.smartsheetConfig.primarySheetId,
      cache: cacheInfo
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

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

// ✅ NEW: Check if query is asking for DATA (not dashboard/visual)
function isDataQuery(message) {
  const lowerMsg = message.toLowerCase();
  
  // Data query keywords
  const dataKeywords = [
    'berikan', 'tampilkan', 'show', 'cari', 'search',
    'siapa', 'who', 'berapa', 'how many', 'what',
    'list', 'daftar', 'semua', 'all',
    'project manager', 'pm', 'owner',
    'status', 'progress', 'completion',
    'budget', 'timeline', 'deadline',
    'yang', 'dengan', 'where'
  ];
  
  // Dashboard/visual keywords (should NOT trigger data query)
  const visualKeywords = [
    'dashboard', 'gambar', 'image', 'foto', 'picture',
    'visual', 'grafik', 'chart', 'screenshot'
  ];
  
  // If message contains visual keywords, it's NOT a data query
  const hasVisualKeyword = visualKeywords.some(keyword => lowerMsg.includes(keyword));
  if (hasVisualKeyword) {
    return false;
  }
  
  // If message contains data keywords, it IS a data query
  const hasDataKeyword = dataKeywords.some(keyword => lowerMsg.includes(keyword));
  return hasDataKeyword;
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

      // ✅ PRIORITY 1: Check if user is requesting FILES/DASHBOARDS (visual)
      const isFileReq = fileManager.isFileRequest(message);
      const isData = isDataQuery(message);

      console.log(`   📊 Is data query: ${isData}`);
      console.log(`   📁 Is file request: ${isFileReq}`);

      // ✅ CASE 1: User wants DATA (not dashboard/visual)
      if (isData && !isFileReq) {
        console.log('📊 DATA QUERY detected - Processing with Smartsheet data');

        const shouldRefresh = message.toLowerCase().includes('refresh') ||
                             message.toLowerCase().includes('update') ||
                             message.toLowerCase().includes('terbaru');

        const sheetData = await getSmartsheetData(bot, shouldRefresh);

        if (sheetData) {
          console.log('✅ Smartsheet data loaded from cache');
          console.log(`   Projects: ${sheetData.projects.length}`);

          const service = new SmartsheetJSONService();
          const formattedContext = service.formatForAI(sheetData);

          // ✅ SYSTEM PROMPT: Focus on DATA analysis (no dashboard/visual)
          systemPrompt = `Anda adalah ${bot.name}, seorang Project Management Analyst profesional untuk Garuda Yamato Steel.

**SCOPE ANDA - PENTING:**
Anda HANYA dapat membantu dengan:
1. Analisis data proyek dari Smartsheet
2. Memberikan laporan dan insight tentang project status, progress, timeline, budget
3. Menjawab pertanyaan seputar project management DATA

Anda TIDAK DAPAT membantu dengan:
- Pertanyaan umum di luar project management
- Topik personal (kesehatan, hubungan, dll)
- Informasi umum (cuaca, berita, dll)
- Coding/programming yang tidak terkait project
- Topik entertainment
- Pertanyaan filosofis atau diskusi umum

Jika user bertanya di luar scope Anda, jawab dengan sopan:
"Maaf, saya adalah Smartsheet Bot yang khusus membantu analisis project management. Untuk pertanyaan tersebut, silakan gunakan bot lain atau hubungi administrator."

**DATA YANG ANDA MILIKI:**

${formattedContext}

**KEMAMPUAN ANDA:**

1. ANALISIS DATA PROYEK (dari Smartsheet)
   - Mencari project berdasarkan kriteria (project manager, status, dll)
   - Menghitung statistik (total project, completion rate, dll)
   - Memberikan insight dan rekomendasi
   - Membuat laporan dan summary

**ATURAN PENTING:**

1. VALIDASI TOPIK PERTANYAAN:
   - Sebelum menjawab, cek apakah pertanyaan terkait project management
   - Jika tidak relevan, tolak dengan sopan
   - Fokus HANYA pada data Smartsheet

2. MENJAWAB PERTANYAAN DATA:
   - Jika user bertanya tentang project manager tertentu, BERIKAN SEMUA project yang cocok
   - Jika user bertanya "berikan semua", jangan batasi hasilnya
   - Gunakan data lengkap dari Smartsheet
   - Format jawaban dengan jelas dan terstruktur

3. FORMATTING:
   - JANGAN gunakan markdown syntax (**bold**, *italic*, \`code\`, #header)
   - Gunakan format plain text yang bersih dan terstruktur
   - Untuk header/judul: Gunakan huruf kapital dan baris kosong
   - Untuk daftar: Gunakan bullet point sederhana (•)
   - Untuk penekanan: Gunakan huruf KAPITAL

**KONTEKS DATA:**
- Terakhir Diperbarui: ${new Date(sheetData.metadata.fetchedAt).toLocaleString('id-ID')}
- Total Proyek: ${sheetData.projects.length}
- Completion Rate: ${sheetData.statistics.completionRate}

Jawab dalam Bahasa Indonesia profesional.

PENTING: 
- Tolak pertanyaan yang tidak terkait project management dengan sopan
- Jangan menampilkan dashboard/gambar jika user bertanya tentang DATA
- Berikan SEMUA hasil yang cocok, jangan dibatasi`;

        } else {
          console.warn('⚠️  Failed to load Smartsheet data');

          systemPrompt = `Anda adalah ${bot.name} untuk Garuda Yamato Steel.

**SCOPE ANDA - PENTING:**
Anda HANYA dapat membantu dengan pertanyaan seputar project management.

Maaf, saat ini data Smartsheet tidak dapat diakses.

Jika user bertanya di luar topik project management, tolak dengan sopan:
"Maaf, saya adalah Smartsheet Bot yang khusus untuk project management. Silakan gunakan bot lain untuk pertanyaan tersebut."`;
        }

        // Call OpenAI for DATA analysis
        console.log('🤖 Calling OpenAI for data analysis...');
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

        return res.json({
          message: assistantMessage,
          chatId: chat._id,
          smartsheetEnabled: bot.smartsheetEnabled
        });
      }

      // ✅ CASE 2: User wants DASHBOARD/VISUAL (files/images)
      if (isFileReq) {
        console.log('📁 DASHBOARD/FILE request detected');

        // Extract query from message
        const fileQuery = fileManager.extractFileQuery(message);
        console.log(`   Query: "${fileQuery}"`);

        // ✅ CHECK: Is query too generic?
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

          // ✅ Generate smart description
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

          // ✅ Save to chat WITH attachedFiles
          chat.messages.push({
            role: 'assistant',
            content: assistantMessage,
            attachedFiles: fileAttachments
          });

          await chat.save();
          console.log(`✅ Chat saved with ${fileAttachments.length} file attachment(s)`);

          // ✅ Return with attachedFiles in response
          return res.json({
            message: assistantMessage,
            chatId: chat._id,
            smartsheetEnabled: bot.smartsheetEnabled,
            attachedFiles: fileAttachments
          });
        } else {
          // ✅ No files found
          console.log('⚠️  No matching files found');

          assistantMessage = `Maaf, dashboard untuk "${fileQuery}" belum tersedia atau nama project tidak cocok.\n\n`;
          assistantMessage += 'Silakan coba dengan nama dashboard yang lebih spesifik.';

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

      // ✅ CASE 3: Normal Smartsheet conversation (with scope restriction)
      const shouldRefresh = message.toLowerCase().includes('refresh') ||
                           message.toLowerCase().includes('update') ||
                           message.toLowerCase().includes('terbaru');

      const sheetData = await getSmartsheetData(bot, shouldRefresh);

      if (sheetData) {
        console.log('✅ Smartsheet data loaded from cache');

        const service = new SmartsheetJSONService();
        const formattedContext = service.formatForAI(sheetData);
        const fileContext = await fileManager.generateFileContext();

        systemPrompt = `Anda adalah ${bot.name}, seorang Project Management Analyst profesional untuk Garuda Yamato Steel.

**SCOPE ANDA - PENTING:**
Anda HANYA dapat membantu dengan:
1. Analisis data proyek dari Smartsheet
2. Menampilkan dashboard visual project (jika diminta)
3. Memberikan laporan dan insight tentang project management

Anda TIDAK DAPAT membantu dengan:
- Pertanyaan umum di luar project management
- Topik personal (kesehatan, hubungan, dll)
- Informasi umum (cuaca, berita, dll)
- Coding/programming yang tidak terkait project
- Topik entertainment
- Pertanyaan filosofis atau diskusi umum

Jika user bertanya di luar scope Anda, jawab dengan sopan:
"Maaf, saya adalah Smartsheet Bot yang khusus membantu analisis project management. Untuk pertanyaan tersebut, silakan gunakan bot lain atau hubungi administrator."

${formattedContext}

${fileContext}

**ATURAN FORMATTING:**
- JANGAN gunakan markdown syntax (**bold**, *italic*, \`code\`, #header)
- Gunakan format plain text yang bersih dan terstruktur

**KONTEKS DATA:**
- Terakhir Diperbarui: ${new Date(sheetData.metadata.fetchedAt).toLocaleString('id-ID')}
- Total Proyek: ${sheetData.projects.length}

Jawab dalam Bahasa Indonesia profesional.
PENTING: Tolak pertanyaan yang tidak terkait project management.`;
      }

    } else {
      // General bot - Standard ChatGPT
      console.log('🤖 General Bot - Standard ChatGPT mode');

      systemPrompt = `Anda adalah ${bot.name}. ${bot.description || 'Asisten AI yang membantu.'}

Anda adalah asisten AI general-purpose yang membantu pengguna dengan berbagai tugas.
Bersikaplah membantu, akurat, dan profesional.

PENTING: Jangan gunakan markdown syntax (**bold**, *italic*). Gunakan plain text.`;
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

    res.json({
      message: assistantMessage,
      chatId: chat._id,
      smartsheetEnabled: bot.smartsheetEnabled
    });

  } catch (error) {
    console.error('❌ CHAT ERROR:', error);
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

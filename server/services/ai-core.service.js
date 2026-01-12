import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import XLSX from 'xlsx'; // ✅ FIX: Ganti import agar readFile terbaca
import fs from 'fs';
import path from 'path';
import officeParser from 'officeparser'; // ✅ FIX: Import langsung (karena sudah di package.json)

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

  // --- 1. UNIVERSAL FILE EXTRACTOR ---
  async extractFileContent(attachedFile) {
      if (!attachedFile || !attachedFile.path) return null;
      
      const mime = attachedFile.mimetype || '';
      const originalName = attachedFile.originalname || '';
      const ext = path.extname(originalName).toLowerCase();
      let content = null;
      let displayType = 'FILE';
      const CHAR_LIMIT = 200000; 

      console.log(`📂 [FILE START] Reading: ${originalName} (${mime}) Size: ${attachedFile.size} bytes`);

      try {
          // A. PDF HANDLING
          if (mime === 'application/pdf' || ext === '.pdf') {
              const dataBuffer = fs.readFileSync(attachedFile.path);
              const data = await pdf(dataBuffer);
              content = data.text.replace(/\n\s*\n/g, '\n');
              displayType = 'PDF';
          }
          // B. WORD HANDLING (.docx)
          else if (mime.includes('wordprocessingml') || ext === '.docx') {
              try {
                  const result = await mammoth.extractRawText({ path: attachedFile.path });
                  content = result.value;
                  displayType = 'DOCX (Mammoth)';
              } catch (err) {
                  console.log("Mammoth error, trying fallback...", err.message);
                  try {
                      content = await officeParser.parseOfficeAsync(attachedFile.path);
                      displayType = 'DOCX (OfficeParser)';
                  } catch (opErr) {
                      console.error("OfficeParser failed:", opErr);
                  }
              }
          }
          // C. EXCEL HANDLING (.xlsx) - ✅ SUDAH DIPERBAIKI
          else if (ext === '.xlsx' || ext === '.xls' || mime.includes('spreadsheet')) {
              console.log("📊 Reading Excel file...");
              // Menggunakan XLSX.readFile (sekarang sudah terbaca karena import diperbaiki)
              const workbook = XLSX.readFile(attachedFile.path);
              let allSheetsData = [];
              
              workbook.SheetNames.forEach(sheetName => {
                  const sheet = workbook.Sheets[sheetName];
                  // Gunakan options { FS: '\t' } agar format lebih rapi
                  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' }); 
                  if (csv && csv.trim().length > 0) {
                      allSheetsData.push(`[SHEET: ${sheetName}]\n${csv}`);
                  }
              });
              
              if (allSheetsData.length > 0) {
                  content = allSheetsData.join('\n\n====================\n\n');
                  displayType = `EXCEL (${workbook.SheetNames.length} Sheets)`;
              } else {
                  console.warn("⚠️ Excel file terbaca tapi kosong.");
              }
          }
          // D. POWERPOINT (.pptx)
          else if (ext === '.pptx' || ext === '.ppt' || mime.includes('presentation')) {
              console.log("📽️ Reading PowerPoint file...");
              try {
                  content = await officeParser.parseOfficeAsync(attachedFile.path);
                  displayType = 'POWERPOINT';
              } catch (err) {
                  console.error("PPT Parse Error:", err);
                  content = `[SYSTEM ERROR: Gagal membaca PPT. ${err.message}]`;
              }
          }
          // E. TEXT/CODE
          else {
              const textExts = ['.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.html', '.css', '.js', '.jsx', '.ts', '.py', '.java', '.c', '.cpp', '.sql', '.log', '.env'];
              if (textExts.includes(ext) || mime.startsWith('text/') || mime.includes('json')) {
                  content = fs.readFileSync(attachedFile.path, 'utf8');
                  displayType = 'CODE/TEXT';
              }
          }

          if (content) {
              if (typeof content === 'object') content = JSON.stringify(content, null, 2);
              const trimmedContent = content.substring(0, CHAR_LIMIT);
              console.log(`✅ [FILE SUCCESS] ${displayType} - Length: ${trimmedContent.length}`);
              return `\n\n[FILE START: ${originalName} (${displayType})]\n${trimmedContent}\n[FILE END]\n`;
          } else {
              return null;
          }

      } catch (e) {
          console.error(`❌ [FILE ERROR] Gagal membaca ${originalName}:`, e);
          return `\n[SYSTEM ERROR: Gagal membaca file ${originalName}. ${e.message}]`;
      }
  }

  // --- 2. MAIN PROCESS ---
  async processMessage({ userId, botId, message, attachedFile, threadId, history = [] }) {
    const bot = await Bot.findById(botId);
    if (!bot) throw new Error('Bot not found');

    // Manage Thread
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

    // Prepare User Content
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

    // Smartsheet Logic
    let contextData = "";
    if (bot.smartsheetConfig?.enabled) {
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

        if (this.isDataQuery(message)) {
            const apiKey = (bot.smartsheetConfig.apiKey && bot.smartsheetConfig.apiKey.trim() !== '') ? bot.smartsheetConfig.apiKey : process.env.SMARTSHEET_API_KEY;
            const sheetId = (bot.smartsheetConfig.sheetId && bot.smartsheetConfig.sheetId.trim() !== '') ? bot.smartsheetConfig.sheetId : process.env.SMARTSHEET_PRIMARY_SHEET_ID;
            
            if (apiKey && sheetId) {
                try {
                    const service = new SmartsheetJSONService();
                    service.apiKey = apiKey;
                    const sheetData = await service.getData(sheetId, message.includes('refresh'));
                    const rawContext = service.formatForAI(sheetData);
                    contextData = `\n\n=== SMARTSHEET DATA ===\n${rawContext}\n=== END DATA ===\n`;
                } catch (e) { console.error("Smartsheet fetch error", e); }
            }
        }
    }

    // System Prompt
    let systemPrompt = bot.systemPrompt || "Anda adalah asisten AI.";
    if (contextData) {
        if (systemPrompt.includes('{{CONTEXT}}')) systemPrompt = systemPrompt.replace('{{CONTEXT}}', contextData);
        else systemPrompt += `\n\n${contextData}`;
    }

    // AI Execution
    let aiResponse = "";
    
    // KOUVENTA
    if (bot.kouventaConfig?.enabled) {
        console.log(`🤖 Using KOUVENTA for bot: ${bot.name}`);
        const kvService = new KouventaService(bot.kouventaConfig.apiKey, bot.kouventaConfig.endpoint);
        let finalMessage = message || "";
        
        if (Array.isArray(userContent)) {
            const fileTexts = userContent
                .filter(c => c.type === 'text' && c.text !== message) 
                .map(c => c.text)
                .join("\n");
            if (fileTexts) finalMessage += `\n\n${fileTexts}`;
        }
        aiResponse = await kvService.generateResponse(finalMessage);
    } 
    // OPENAI
    else {
        console.log(`🧠 Using OPENAI for bot: ${bot.name}`);
        const messagesPayload = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userContent }
        ];

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messagesPayload,
            temperature: 0.5
        });
        aiResponse = completion.choices[0].message.content;
    }

    // Save & Return
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
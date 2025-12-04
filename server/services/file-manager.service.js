import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileManagerService {
  constructor() {
    this.baseDir = path.join(__dirname, '../data/files');

    // ✅ MAPPING FOLDER DASHBOARD
    this.dashboardFolders = {
      'iot': 'dashboard-iot-caliper',
      'caliper': 'dashboard-iot-caliper',
      'calipers': 'dashboard-iot-caliper',
      'iot caliper': 'dashboard-iot-caliper',
      
      'web-application-firewall-xdr': 'dashboard-web-application-firewall-xdr',
      'firewall': 'dashboard-web-application-firewall-xdr',
      'waf': 'dashboard-web-application-firewall-xdr',
      'xdr': 'dashboard-web-application-firewall-xdr',
      'wafxdr': 'dashboard-web-application-firewall-xdr'
    };
  }

  /**
   * Check if message is requesting dashboard/files
   */
  isFileRequest(message) {
    const lowerMsg = message.toLowerCase();
    
    // Keywords untuk request dashboard/gambar
    const dashboardKeywords = ['dashboard', 'gambar', 'screenshot', 'visualisasi', 'tampilan', 'file', 'foto'];
    const actionKeywords = ['lihat', 'tampilkan', 'berikan', 'minta', 'ambil', 'show', 'get', 'carikan', 'cari'];
    
    // Jika ada kombinasi action + dashboard keywords
    const hasDashboard = dashboardKeywords.some(k => lowerMsg.includes(k));
    const hasAction = actionKeywords.some(k => lowerMsg.includes(k));
    
    return hasDashboard || (hasAction && (lowerMsg.includes('file') || lowerMsg.includes('foto')));
  }

  /**
   * Extract project name/query from message
   * IMPROVED: Keep important keywords for matching
   */
  extractFileQuery(message) {
    const lowerMsg = message.toLowerCase();
    
    // Remove ONLY action words, keep content words
    const cleaned = lowerMsg
      .replace(/tampilkan|lihat|berikan|minta|tolong|dong|untuk|saya|yang|ada|semua|all/g, '')
      .trim();
    
    console.log('🔍 Query extraction:', {
      original: message,
      cleaned: cleaned
    });
    
    // If nothing left or message contains 'semua'/'all', return 'all'
    if (!cleaned || lowerMsg.includes('semua') || lowerMsg.includes('all')) {
      return 'all';
    }
    
    return cleaned;
  }

  /**
   * ✅ MAIN SEARCH FUNCTION - IMPROVED
   */
  async searchFiles(query) {
    console.log('');
    console.log('='.repeat(70));
    console.log('🔍 FILE SEARCH');
    console.log('='.repeat(70));
    console.log(`Query: "${query}"`);
    console.log(`Base Dir: ${this.baseDir}`);
    
    const lowerQuery = query.toLowerCase();
    
    // ✅ CASE 1: Request semua dashboard
    if (lowerQuery === 'all' || lowerQuery === 'semua' || !query) {
      console.log('→ Mode: ALL DASHBOARDS');
      return await this.getAllDashboards();
    }

    // ✅ CASE 2: Request dashboard spesifik berdasarkan folder
    let targetDashboard = null;
    
    // Cari mapping yang paling cocok
    for (const [key, folderName] of Object.entries(this.dashboardFolders)) {
      if (lowerQuery.includes(key) || key.includes(lowerQuery)) {
        targetDashboard = folderName;
        console.log(`→ Matched folder mapping: "${key}" → ${folderName}`);
        break;
      }
    }

    if (targetDashboard) {
      const targetPath = path.join(this.baseDir, targetDashboard);
      const allFiles = await this.getFilesFromFolder(targetPath, targetDashboard);
      
      // ✅ CASE 2a: Filter files by specific keyword (e.g., "cutting room")
      if (query !== 'iot' && query !== 'caliper' && query !== 'firewall' && query !== 'waf') {
        // Extract specific keywords from query
        const keywords = this.extractKeywords(query);
        
        if (keywords.length > 0) {
          console.log(`→ Filtering by keywords: ${keywords.join(', ')}`);
          const filtered = allFiles.filter(file => {
            const fileName = file.name.toLowerCase();
            return keywords.some(keyword => fileName.includes(keyword));
          });
          
          if (filtered.length > 0) {
            console.log(`✅ Found ${filtered.length} matching files`);
            console.log('='.repeat(70));
            return filtered;
          } else {
            console.log(`⚠️  No files match keywords, returning all from folder`);
          }
        }
      }
      
      console.log(`✅ Found ${allFiles.length} files in ${targetDashboard}`);
      console.log('='.repeat(70));
      return allFiles;
    }

    // ✅ CASE 3: Search across all dashboards by filename
    console.log('→ Mode: SEARCH ALL FOLDERS');
    const allResults = await this.getAllDashboards();
    
    // Extract keywords from query
    const keywords = this.extractKeywords(query);
    
    if (keywords.length > 0) {
      console.log(`→ Searching by keywords: ${keywords.join(', ')}`);
      const filtered = allResults.filter(file => {
        const fileName = file.name.toLowerCase();
        return keywords.some(keyword => fileName.includes(keyword));
      });
      
      if (filtered.length > 0) {
        console.log(`✅ Found ${filtered.length} matching files across all folders`);
        console.log('='.repeat(70));
        return filtered;
      }
    }
    
    // ✅ CASE 4: No match, return all
    console.log('⚠️  No specific match, returning all dashboards');
    console.log('='.repeat(70));
    return allResults;
  }

  /**
   * Extract meaningful keywords from query
   */
  extractKeywords(query) {
    // Remove common words but keep content words
    const stopWords = ['dashboard', 'gambar', 'saya', 'terkait', 'untuk', 'di', 'pada', 'yang', 'dari'];
    
    const words = query.toLowerCase()
      .split(/[\s-_]+/)  // Split by space, dash, underscore
      .filter(word => word.length > 2)  // Keep words with 3+ chars
      .filter(word => !stopWords.includes(word));
    
    return words;
  }

  /**
   * Get all files from a specific folder
   */
  async getFilesFromFolder(folderPath, folderName) {
    if (!fs.existsSync(folderPath)) {
      console.log(`⚠️  Folder not found: ${folderPath}`);
      return [];
    }

    try {
      const files = fs.readdirSync(folderPath);
      console.log(`   Files in ${folderName}: ${files.length}`);
      
      return files
        .filter(file => {
          // Only return image and PDF files
          const ext = path.extname(file).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext);
        })
        .map(file => {
          const filePath = path.join(folderPath, file);
          const stat = fs.statSync(filePath);
          return {
            name: file,
            folder: folderName,
            relativePath: `/api/files/${folderName}/${file}`,
            type: this.getFileType(file),
            sizeKB: (stat.size / 1024).toFixed(1),
            modifiedAt: stat.mtime
          };
        })
        .sort((a, b) => b.modifiedAt - a.modifiedAt); // Sort by newest first
    } catch (err) {
      console.error('❌ Error reading folder:', err);
      return [];
    }
  }

  /**
   * Get all dashboards from all folders
   */
  async getAllDashboards() {
    const allFiles = [];
    const uniqueFolders = [...new Set(Object.values(this.dashboardFolders))];

    console.log(`   Scanning ${uniqueFolders.length} dashboard folders...`);

    for (const folderName of uniqueFolders) {
      const folderPath = path.join(this.baseDir, folderName);
      const files = await this.getFilesFromFolder(folderPath, folderName);
      allFiles.push(...files);
    }

    return allFiles;
  }

  /**
   * Determine file type from extension
   */
  getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
    if (['.pdf'].includes(ext)) return 'pdf';
    return 'other';
  }

  /**
   * Generate smart description for dashboard results
   */
  generateSmartDescription(files, query) {
    if (files.length === 0) {
      return `Maaf, tidak ada dashboard yang ditemukan${query && query !== 'all' ? ` untuk "${query}"` : ''}.`;
    }

    // Group files by folder
    const grouped = files.reduce((acc, file) => {
      if (!acc[file.folder]) acc[file.folder] = [];
      acc[file.folder].push(file);
      return acc;
    }, {});

    let description = '';

    // ✅ CASE 1: Single dashboard
    if (Object.keys(grouped).length === 1) {
      const folderName = Object.keys(grouped)[0];
      const title = folderName
        .replace('dashboard-', '')
        .replace(/-/g, ' ')
        .toUpperCase();

      description = `📊 **${title}**\n\n`;
      description += `Berikut adalah visualisasi dashboard terbaru (${files.length} file):`;
    }
    // ✅ CASE 2: Multiple dashboards or filtered results
    else {
      description = `📊 **Dashboard Smartsheet**\n\n`;
      description += `Ditemukan ${files.length} file`;
      
      if (Object.keys(grouped).length > 1) {
        description += ` dari ${Object.keys(grouped).length} dashboard:\n\n`;
        
        Object.entries(grouped).forEach(([folderName, folderFiles]) => {
          const name = folderName
            .replace('dashboard-', '')
            .replace(/-/g, ' ')
            .toUpperCase();
          
          description += `• **${name}**: ${folderFiles.length} file\n`;
        });
      } else {
        description += `\n\n`;
      }

      description += `\nSemua visualisasi dashboard ditampilkan di bawah ini:`;
    }

    return description;
  }

  /**
   * List all available dashboards
   */
  listAvailableDashboards() {
    const uniqueDashboards = [...new Set(Object.values(this.dashboardFolders))];
    return uniqueDashboards.map(folder => ({
      folder: folder,
      name: folder.replace('dashboard-', '').replace(/-/g, ' ').toUpperCase()
    }));
  }
}

export default FileManagerService;

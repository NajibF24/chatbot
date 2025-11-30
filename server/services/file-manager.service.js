import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileManagerService {
  constructor() {
    // ✅ Base directory for files
    this.filesDir = path.join(__dirname, '..', 'data', 'files');

    // ✅ Dashboard folder mapping (untuk smart search)
    this.dashboardFolders = {
      // IoT Caliper
      'iot': 'dashboard-iot-caliper',
      'caliper': 'dashboard-iot-caliper',
      'calipers': 'dashboard-iot-caliper',
      'iot caliper': 'dashboard-iot-caliper',
      'iotcaliper': 'dashboard-iot-caliper',
      
      // Web Application Firewall XDR
      'web-application-firewall-xdr': 'dashboard-web-application-firewall-xdr',
      'webapplicationfirewallxdr': 'dashboard-web-application-firewall-xdr',
      'firewall': 'dashboard-web-application-firewall-xdr',
      'web application': 'dashboard-web-application-firewall-xdr',
      'firewall xdr': 'dashboard-web-application-firewall-xdr',
      'xdr': 'dashboard-web-application-firewall-xdr',
      'waf': 'dashboard-web-application-firewall-xdr',
      'wafxdr': 'dashboard-web-application-firewall-xdr'
    };

    // Supported file types
    this.supportedTypes = {
      images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
      documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
      all: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
    };
  }

  async ensureFilesDir() {
    try {
      await fs.mkdir(this.filesDir, { recursive: true });
    } catch (error) {
      console.error('Error creating files directory:', error);
    }
  }

  /**
   * ✅ List files from specific folder
   */
  async listFilesFromFolder(folderName) {
    try {
      const folderPath = path.join(this.filesDir, folderName);

      console.log(`   📂 Checking folder: ${folderPath}`);

      // Check if folder exists
      try {
        await fs.access(folderPath);
        console.log(`   ✅ Folder exists`);
      } catch {
        console.log(`   ❌ Folder NOT found: ${folderName}`);
        return [];
      }

      const files = await fs.readdir(folderPath);
      console.log(`   📄 Files in directory: ${files.length}`);
      
      const fileList = [];

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();

          if (this.supportedTypes.all.includes(ext)) {
            const relativePath = `/api/files/${folderName}/${file}`;

            fileList.push({
              name: file,
              path: filePath,
              relativePath: relativePath,
              folder: folderName,
              extension: ext,
              type: this.getFileType(ext),
              size: stats.size,
              sizeKB: (stats.size / 1024).toFixed(2),
              sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
              modifiedAt: stats.mtime,
              createdAt: stats.birthtime
            });
            
            console.log(`   ✅ Added: ${file} (${ext})`);
          } else {
            console.log(`   ⚠️  Skipped (unsupported type): ${file} (${ext})`);
          }
        }
      }

      console.log(`   📊 Total supported files: ${fileList.length}`);
      return fileList;
    } catch (error) {
      console.error(`   ❌ Error listing files from folder ${folderName}:`, error);
      return [];
    }
  }

  /**
   * ✅ List all files (scan all folders)
   */
  async listFiles() {
    try {
      await this.ensureFilesDir();
      const items = await fs.readdir(this.filesDir);

      console.log('📂 Items in files directory:', items);

      const fileList = [];

      for (const item of items) {
        const itemPath = path.join(this.filesDir, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          // ✅ Scan folder
          console.log(`📁 Scanning folder: ${item}`);
          const folderFiles = await this.listFilesFromFolder(item);
          console.log(`   Found ${folderFiles.length} files in ${item}`);
          fileList.push(...folderFiles);
        } else if (stats.isFile()) {
          // ✅ Legacy: Files in root directory
          const ext = path.extname(item).toLowerCase();

          if (this.supportedTypes.all.includes(ext)) {
            const relativePath = `/api/files/${item}`;

            fileList.push({
              name: item,
              path: itemPath,
              relativePath: relativePath,
              folder: null, // Root directory
              extension: ext,
              type: this.getFileType(ext),
              size: stats.size,
              sizeKB: (stats.size / 1024).toFixed(2),
              sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
              modifiedAt: stats.mtime,
              createdAt: stats.birthtime
            });
          }
        }
      }

      console.log(`📊 Total files indexed: ${fileList.length}`);
      return fileList;
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  }

  /**
   * Get file type category
   */
  getFileType(ext) {
    if (this.supportedTypes.images.includes(ext)) {
      return 'image';
    } else if (ext === '.pdf') {
      return 'pdf';
    } else {
      return 'document';
    }
  }

  /**
   * ✅ IMPROVED: Flexible search with folder support + DEBUG LOGGING
   */
  async searchFiles(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    console.log('');
    console.log('🔍 ===== SEARCH FILES DEBUG =====');
    console.log(`   Query: "${query}"`);
    console.log(`   Lower query: "${lowerQuery}"`);

    // ✅ Step 1: Check if query matches a dashboard folder
    let targetFolder = null;
    console.log('   Checking dashboard folder mappings:');
    
    for (const [keyword, folder] of Object.entries(this.dashboardFolders)) {
      const matched = lowerQuery.includes(keyword);
      console.log(`      "${keyword}" → ${matched ? '✅ MATCH' : '❌ no match'}`);
      
      if (matched) {
        targetFolder = folder;
        console.log(`   🎯 MATCHED FOLDER: ${folder}`);
        break;
      }
    }

    if (!targetFolder) {
      console.log('   ⚠️  No dashboard folder mapping matched');
    }

    // ✅ Step 2: Get files (from specific folder or all)
    let files = [];
    if (targetFolder) {
      console.log(`   📁 Getting files from folder: ${targetFolder}`);
      files = await this.listFilesFromFolder(targetFolder);
      console.log(`   📊 Files found in folder: ${files.length}`);
      
      if (files.length > 0) {
        console.log('   Files:');
        files.forEach(f => console.log(`      - ${f.name}`));
      }
    } else {
      console.log(`   📁 Getting all files`);
      files = await this.listFiles();
      console.log(`   📊 Total files available: ${files.length}`);
    }

    // ✅ If we found a folder and it has files, return them all
    if (targetFolder && files.length > 0) {
      console.log(`   ✅ Returning all ${files.length} file(s) from ${targetFolder}`);
      console.log('🔍 ===== END SEARCH DEBUG =====');
      console.log('');
      return files;
    }

    // ✅ Step 3: Flexible keyword matching (fallback)
    const keywords = lowerQuery
      .replace(/[^\w\s-]/g, '')
      .split(/[\s-]+/)
      .filter(w => w.length > 0)
      .filter(w => !['the', 'and', 'atau', 'dan', 'file', 'gambar', 'dashboard', 'tampilkan'].includes(w));

    console.log(`   🔑 Keywords for matching: [${keywords.join(', ')}]`);

    // ✅ Score-based matching
    const scored = files.map(f => {
      const fileName = f.name.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[-_]/g, ' ');

      let score = 0;

      if (fileName === lowerQuery) score += 100;
      if (fileName.includes(lowerQuery.replace(/\s+/g, ''))) score += 50;

      keywords.forEach(keyword => {
        const keywordNorm = keyword.replace(/\s+/g, '');

        if (fileName.split(/\s+/).includes(keyword)) {
          score += 30;
        } else if (fileName.includes(keyword)) {
          score += 20;
        } else if (fileName.includes(keywordNorm)) {
          score += 15;
        }

        const fileWords = fileName.split(/[\s-]+/);
        fileWords.forEach(word => {
          if (word.includes(keyword) || keyword.includes(word)) {
            score += 10;
          }
        });
      });

      if (score > 0) {
        console.log(`   ✓ ${f.name}: score ${score}`);
      }

      return { file: f, score };
    });

    const results = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.file);

    console.log(`   ✅ Final results: ${results.length} file(s)`);
    console.log('🔍 ===== END SEARCH DEBUG =====');
    console.log('');

    return results;
  }

  /**
   * Get file by exact name
   */
  async getFileByName(fileName) {
    const files = await this.listFiles();
    return files.find(f => f.name === fileName);
  }

  /**
   * Check if message is requesting a file
   */
  isFileRequest(message) {
    const lowerMsg = message.toLowerCase();
    const keywords = [
      'tampilkan',
      'show',
      'lihat',
      'buka',
      'open',
      'view',
      'dashboard',
      'gambar',
      'image',
      'foto',
      'picture',
      'file',
      'dokumen',
      'document',
      'pdf',
      'cari',
      'search',
      'ada',
      'punya'
    ];

    return keywords.some(keyword => lowerMsg.includes(keyword));
  }

  /**
   * Extract file name/keywords from message
   */
  extractFileQuery(message) {
    // Remove common words
    const stopWords = ['tampilkan', 'show', 'lihat', 'buka', 'open', 'view',
                       'gambar', 'image', 'foto', 'picture', 'file',
                       'dokumen', 'document', 'saya', 'my', 'dashboard',
                       'ada', 'punya', 'cari', 'untuk', 'dari', 'yang', 'terkait'];

    let query = message.toLowerCase();

    stopWords.forEach(word => {
      query = query.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
    });

    // Clean up
    query = query.trim().replace(/\s+/g, ' ');

    return query;
  }

  /**
   * ✅ Generate AI context with folder info
   */
  async generateFileContext() {
    const files = await this.listFiles();

    if (files.length === 0) {
      return 'Tidak ada file yang tersedia saat ini.';
    }

    let context = '**FILE YANG TERSEDIA:**\n\n';

    // Group by folder
    const byFolder = {};
    files.forEach(f => {
      const folder = f.folder || 'root';
      if (!byFolder[folder]) byFolder[folder] = [];
      byFolder[folder].push(f);
    });

    // List by folder
    for (const [folder, folderFiles] of Object.entries(byFolder)) {
      if (folder !== 'root') {
        context += `FOLDER: ${folder}\n`;
      }

      // Group by type
      const byType = {
        image: folderFiles.filter(f => f.type === 'image'),
        pdf: folderFiles.filter(f => f.type === 'pdf'),
        document: folderFiles.filter(f => f.type === 'document')
      };

      if (byType.image.length > 0) {
        context += '  Images:\n';
        byType.image.forEach((f, idx) => {
          context += `  - ${f.name}\n`;
        });
      }

      if (byType.pdf.length > 0) {
        context += '  PDFs:\n';
        byType.pdf.forEach((f, idx) => {
          context += `  - ${f.name}\n`;
        });
      }

      if (byType.document.length > 0) {
        context += '  Documents:\n';
        byType.document.forEach((f, idx) => {
          context += `  - ${f.name}\n`;
        });
      }

      context += '\n';
    }

    context += `Gunakan pencarian flexible: "ui ux" akan menemukan "UI-UX", "setup" akan menemukan "Setup-Configuration", dll.\n`;

    return context;
  }

  /**
   * Format file info - Multiple files support
   */
  formatFileInfo(files) {
    // Handle single file
    if (!Array.isArray(files)) {
      files = [files];
    }

    if (files.length === 0) {
      return 'Tidak ada file yang ditemukan.';
    }

    let text = '';

    if (files.length === 1) {
      const file = files[0];
      text += `Menampilkan file: ${file.name}\n\n`;
      text += `INFORMASI:\n`;
      text += `• Tipe: ${file.type.toUpperCase()}\n`;
      text += `• Ukuran: ${file.sizeKB} KB\n`;
      if (file.folder) {
        text += `• Folder: ${file.folder}\n`;
      }
      text += `• Terakhir Diubah: ${new Date(file.modifiedAt).toLocaleString('id-ID')}\n\n`;

      if (file.type === 'image') {
        text += 'Gambar ditampilkan di atas.';
      } else if (file.type === 'pdf') {
        text += 'Dokumen PDF ditampilkan di atas.';
      } else {
        text += 'File tersedia untuk di-download.';
      }
    } else {
      // Multiple files
      text += `Ditemukan ${files.length} file:\n\n`;

      files.forEach((file, idx) => {
        text += `${idx + 1}. ${file.name}\n`;
        text += `   Tipe: ${file.type.toUpperCase()} • Ukuran: ${file.sizeKB} KB`;
        if (file.folder) {
          text += ` • Folder: ${file.folder}`;
        }
        text += `\n`;
      });

      text += `\nSemua file ditampilkan di atas.`;
    }

    return text;
  }

  /**
   * ✅ Generate smart description based on filename and folder
   */
  generateSmartDescription(files, query = '') {
    if (!Array.isArray(files)) files = [files];
    if (files.length === 0) return 'File tidak ditemukan.';

    // Detect dashboard name from folder
    let dashboardName = 'Project';
    if (files[0].folder) {
      const folderName = files[0].folder.replace('dashboard-', '');

      if (folderName.includes('iot-caliper') || (folderName.includes('iot') && folderName.includes('caliper'))) {
        dashboardName = 'IoT Caliper';
      } else if (folderName === 'iot') {
        dashboardName = 'IoT';
      } else if (folderName.includes('caliper')) {
        dashboardName = 'Caliper';
      } else if (folderName.includes('web-application-firewall-xdr') || folderName.includes('firewall') || folderName.includes('xdr')) {
        dashboardName = 'Web Application Firewall XDR';
      } else if (folderName === 'b') {
        dashboardName = 'Project B';
      } else {
        dashboardName = folderName
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
    }

    // Build natural description
    let desc = '';

    if (files.length === 1) {
      desc = `Berikut adalah update visual dari Dashboard ${dashboardName}:`;
    } else {
      desc = `Berikut adalah ${files.length} gambar update dari Dashboard ${dashboardName}:`;
    }

    return desc;
  }
}

export default FileManagerService;

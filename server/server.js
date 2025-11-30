// server/server.js - FIXED FOR HTTPS WITH PROPER SESSION & CORS
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import chatRoutes from './routes/chat.js';
import smartsheetRoutes from './routes/smartsheet.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// ✅ CRITICAL: Trust proxy FIRST (before any middleware)
app.set('trust proxy', 1);

// ==================== CORS Configuration for HTTPS ====================
const allowedOrigins = [
  'https://portalai.gyssteel.com',
  'http://portalai.gyssteel.com',
  'http://localhost',
  'http://localhost:80',
  'http://localhost:3000',
  'http://16.79.23.146',
  'http://16.79.23.146:80'
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach(origin => {
    const trimmed = origin.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

console.log('🌐 Allowed CORS origins:', allowedOrigins);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc)
    if (!origin) {
      console.log('✅ CORS: No origin (allowed)');
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS allowed:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked:', origin);
      console.log('   Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // ✅ CRITICAL for cookies/session
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
  exposedHeaders: ['set-cookie'],
  maxAge: 86400 // 24 hours
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== Session Configuration for HTTPS ====================
const isProduction = process.env.NODE_ENV === 'production';
const sessionDomain = process.env.SESSION_DOMAIN || undefined;

console.log('🍪 Session Configuration:');
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   Secure: ${isProduction}`);
console.log(`   Domain: ${sessionDomain || 'none (default)'}`);
console.log(`   SameSite: ${isProduction ? 'none' : 'lax'}`);

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-to-a-secure-random-string',
  resave: false,
  saveUninitialized: false,
  proxy: true, // ✅ CRITICAL for reverse proxy
  cookie: {
    secure: isProduction, // ✅ TRUE for HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: isProduction ? 'none' : 'lax', // ✅ 'none' required for cross-site HTTPS
    domain: sessionDomain, // ✅ Set to .gyssteel.com for subdomain sharing
    path: '/'
  }
}));

// ==================== Request Logging ====================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const origin = req.get('origin') || 'none';
  const method = req.method;
  const reqPath = req.path;
  
  console.log(`[${timestamp}] ${method} ${reqPath} - Origin: ${origin}`);
  
  if (reqPath.startsWith('/api/auth')) {
    console.log(`   Session ID: ${req.sessionID || 'none'}`);
    console.log(`   User ID: ${req.session?.userId || 'none'}`);
    console.log(`   Cookies: ${req.headers.cookie ? 'present' : 'none'}`);
  }
  
  next();
});

// ==================== FILE SERVING ====================
const filesPath = path.join(__dirname, 'data', 'files');

try {
  await fs.mkdir(filesPath, { recursive: true });
  console.log('✅ Files directory ready:', filesPath);
} catch (error) {
  console.error('⚠️  Could not create files directory:', error.message);
}

app.use('/api/files', async (req, res, next) => {
  console.log(`📁 File request: ${req.path}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const ext = path.extname(req.path).toLowerCase();
  
  if (['.jpg', '.jpeg'].includes(ext)) {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (ext === '.png') {
    res.setHeader('Content-Type', 'image/png');
  } else if (ext === '.gif') {
    res.setHeader('Content-Type', 'image/gif');
  } else if (ext === '.webp') {
    res.setHeader('Content-Type', 'image/webp');
  } else if (ext === '.pdf') {
    res.setHeader('Content-Type', 'application/pdf');
  } else if (ext === '.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
  }
  
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Security-Policy');
  
  console.log(`   Extension: ${ext}`);
  console.log(`   Content-Type: ${res.getHeader('Content-Type')}`);
  
  next();
}, express.static(filesPath, {
  dotfiles: 'ignore',
  index: false,
  setHeaders: (res, filepath) => {
    const filename = path.basename(filepath);
    console.log(`   ✅ Serving: ${filename}`);
  }
}));

// ==================== API ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/smartsheet', smartsheetRoutes);

// ==================== UTILITY ENDPOINTS ====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: 'connected',
    smartsheet: process.env.SMARTSHEET_API_KEY ? 'configured' : 'not configured',
    openai: process.env.OPENAI_API_KEY ? 'configured' : 'not configured',
    ldap: process.env.LDAP_ENABLED === 'true' ? 'enabled' : 'disabled',
    session: {
      secure: isProduction,
      domain: sessionDomain || 'default',
      sameSite: isProduction ? 'none' : 'lax'
    },
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Internal Chat API Server - GYS Portal AI',
    version: '2.1.0',
    environment: process.env.NODE_ENV || 'development',
    features: [
      'LDAP/Active Directory Authentication',
      'Smartsheet Integration',
      'File Management',
      'AI Chat Assistant',
      'HTTPS Support',
      'Session Management'
    ],
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      admin: '/api/admin/*',
      chat: '/api/chat/*',
      smartsheet: '/api/smartsheet/*',
      files: '/api/files/*'
    },
    status: 'running'
  });
});

// CORS preflight
app.options('*', cors());

// ==================== ERROR HANDLERS ====================
app.use((req, res) => {
  console.log('❌ 404 Not Found:', req.method, req.path);
  
  if (req.path.startsWith('/api/files/')) {
    const filename = path.basename(req.path);
    return res.status(404).json({
      error: 'File Not Found',
      path: req.path,
      filename: filename,
      message: `File "${filename}" does not exist`
    });
  }
  
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path,
    method: req.method,
    message: 'The requested resource does not exist'
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.get('origin'),
      allowedOrigins: process.env.NODE_ENV === 'development' ? allowedOrigins : undefined
    });
  }
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('='.repeat(70));
  console.log(`🚀 GYS PORTAL AI - INTERNAL CHAT SERVER`);
  console.log('='.repeat(70));
  console.log(`📍 Environment:       ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Server Port:       ${PORT}`);
  console.log(`📍 Binding:           0.0.0.0`);
  console.log('');
  console.log(`🗄️  MongoDB:           ${process.env.MONGODB_URI ? 'Connected ✓' : 'Missing ✗'}`);
  console.log(`🤖 OpenAI API:        ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Not configured ⚠️'}`);
  console.log(`📊 Smartsheet API:    ${process.env.SMARTSHEET_API_KEY ? 'Configured ✓' : 'Not configured ⚠️'}`);
  console.log(`🔐 LDAP:              ${process.env.LDAP_ENABLED === 'true' ? 'Enabled ✓' : 'Disabled'}`);
  if (process.env.LDAP_ENABLED === 'true') {
    console.log(`   URL:               ${process.env.LDAP_URL}`);
    console.log(`   Search Base:       ${process.env.LDAP_SEARCH_BASE}`);
    console.log(`   Admin Groups:      ${process.env.LDAP_ADMIN_GROUPS || 'Not set'}`);
  }
  console.log('');
  console.log(`🍪 Session Configuration:`);
  console.log(`   Secure:            ${isProduction}`);
  console.log(`   Domain:            ${sessionDomain || 'default'}`);
  console.log(`   SameSite:          ${isProduction ? 'none' : 'lax'}`);
  console.log('');
  console.log(`🌐 CORS Allowed Origins: ${allowedOrigins.length}`);
  allowedOrigins.forEach(origin => console.log(`   - ${origin}`));
  console.log('');
  console.log(`⏱️  Started at:        ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  console.log('');
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

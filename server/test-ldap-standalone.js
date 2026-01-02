// Lokasi File: server/test-ldap-standalone.js
// Cara Jalankan: cd server && node test-ldap-standalone.js username_anda

import ldap from 'ldapjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ==================== CONFIGURATION ====================

// 1. Setup Path untuk membaca .env dari root folder (satu level di atas folder server)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env'); 

// Load konfigurasi
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('\n❌ Gagal membaca file .env!');
  console.error(`   Mencari di: ${envPath}`);
  console.error('   Pastikan file .env ada di folder root project.\n');
  process.exit(1);
}

// 2. Ambil Variable dari .env
const LDAP_URL = process.env.LDAP_URL;
const BIND_DN = process.env.LDAP_BIND_DN;
const BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD;
const SEARCH_BASE = process.env.LDAP_SEARCH_BASE;
// Filter default jika tidak ada di .env
const SEARCH_FILTER_TEMPLATE = process.env.LDAP_SEARCH_FILTER || '(sAMAccountName={{username}})';

// 3. Ambil username dari argument terminal
const TEST_USERNAME = process.argv[2];

console.log('');
console.log('='.repeat(70));
console.log('🧪 STANDALONE LDAP CONNECTION TEST');
console.log('='.repeat(70));

// --- SAFETY CHECK ---
if (!LDAP_URL || !BIND_PASSWORD || !SEARCH_BASE) {
  console.error('\n❌ ERROR: Variable LDAP belum lengkap di .env!');
  console.error('   Pastikan LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PASSWORD, LDAP_SEARCH_BASE terisi.');
  process.exit(1);
}

if (!TEST_USERNAME) {
  console.error('\n⚠️  PERINGATAN: Username belum dimasukkan.');
  console.error('   Cara pakai: node test-ldap-standalone.js <username>');
  console.error('   Contoh:     node test-ldap-standalone.js najib.fauzan\n');
  process.exit(1);
}

console.log('');
console.log('📋 Configuration loaded:');
console.log(`   URL: ${LDAP_URL}`);
console.log(`   Search Base: ${SEARCH_BASE}`);
console.log(`   Target User: ${TEST_USERNAME}`);
console.log(`   Config File: ${envPath}`);
console.log('');

// ==================== TEST LOGIC ====================

// Test 1: Connection
console.log('1️⃣  Testing connection & Bind...');
const client = ldap.createClient({
  url: LDAP_URL,
  timeout: 5000,
  connectTimeout: 10000,
  tlsOptions: { rejectUnauthorized: false } // Abaikan error sertifikat jika pakai LDAPS
});

client.on('error', (err) => {
  console.error('   ❌ Client Error:', err.message);
  process.exit(1);
});

client.bind(BIND_DN, BIND_PASSWORD, (bindErr) => {
  if (bindErr) {
    console.log('   ❌ Bind failed:', bindErr.message);
    console.log('');
    console.log('   Possible issues:');
    console.log('   - Salah password atau Bind DN di .env');
    console.log('   - Tidak bisa connect ke server (Cek VPN/Jaringan)');
    process.exit(1);
  }
  
  console.log('   ✅ Bind successful!');
  console.log('');
  
  // Test 2: Search user
  console.log(`2️⃣  Searching for user: "${TEST_USERNAME}"...`);
  
  // Ganti placeholder {{username}} dengan username asli
  const searchFilter = SEARCH_FILTER_TEMPLATE.replace(/\{\{username\}\}/g, TEST_USERNAME);
  
  const opts = {
    filter: searchFilter,
    scope: 'sub',
    attributes: [
      'sAMAccountName', // Username
      'dn',             // Distinguished Name
      'cn',             // Common Name
      'displayName',    // Nama Lengkap
      'mail',           // Email
      'memberOf',       // Group/Role
      'department',
      'title'
    ]
  };
  
  client.search(SEARCH_BASE, opts, (searchErr, res) => {
    if (searchErr) {
      console.log('   ❌ Search failed:', searchErr.message);
      client.unbind();
      process.exit(1);
    }
    
    let found = false;
    
    res.on('searchEntry', (entry) => {
      found = true;
      console.log('   ✅ User FOUND!');
      console.log('');
      console.log('   User Details:');
      console.log(`      Username: ${entry.object.sAMAccountName}`);
      console.log(`      DN:       ${entry.object.dn}`);
      console.log(`      Name:     ${entry.object.cn || entry.object.displayName}`);
      console.log(`      Email:    ${entry.object.mail || 'N/A'}`);
      console.log(`      Dept:     ${entry.object.department || 'N/A'}`);
      
      // Menampilkan Groups dengan rapi
      if (entry.object.memberOf) {
        const groups = Array.isArray(entry.object.memberOf) 
          ? entry.object.memberOf 
          : [entry.object.memberOf];
        
        console.log(`      Groups (${groups.length}):`);
        groups.slice(0, 5).forEach(g => {
          // Ambil nama group-nya saja (CN=Developers,...) -> Developers
          const match = g.match(/^CN=([^,]+)/i);
          const groupName = match ? match[1] : g;
          console.log(`        - ${groupName}`);
        });
        
        if (groups.length > 5) {
          console.log(`        ... dan ${groups.length - 5} group lainnya`);
        }
      }
    });
    
    res.on('error', (err) => {
      console.log('   ❌ Search error:', err.message);
      client.unbind();
      process.exit(1);
    });
    
    res.on('end', () => {
      client.unbind();
      
      if (!found) {
        console.log('   ⚠️  User NOT found.');
        console.log(`       Filter used: ${searchFilter}`);
        console.log('       Pastikan username benar dan ada di dalam Search Base.');
      } else {
        console.log('');
        console.log('='.repeat(70));
        console.log('✅ LDAP TEST COMPLETE');
        console.log('='.repeat(70));
      }
      
      process.exit(found ? 0 : 1);
    });
  });
});
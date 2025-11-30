// server/routes/auth.js - DUAL LOGIN: LDAP FIRST, THEN LOCAL
import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Bot from '../models/Bot.js';
import LDAPService from '../services/ldap.service.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const ldapService = new LDAPService();

// ==================== DUAL LOGIN: LDAP → LOCAL ====================
router.post('/login', async (req, res) => {
  try {
    console.log('');
    console.log('='.repeat(70));
    console.log('🔐 LOGIN ATTEMPT');
    console.log('='.repeat(70));
    console.log(`Username: ${req.body.username}`);
    console.log(`Time: ${new Date().toISOString()}`);

    const { username, password } = req.body;

    if (!username || !password) {
      console.log('❌ Missing credentials');
      return res.status(400).json({ error: 'Username and password required' });
    }

    // ==================== STEP 1: TRY LDAP AUTHENTICATION ====================
    if (ldapService.isEnabled()) {
      console.log('');
      console.log('🔐 STEP 1: Checking LDAP/Active Directory');
      console.log('-'.repeat(70));

      try {
        const ldapResult = await ldapService.authenticate(username, password);

        if (ldapResult.success) {
          console.log('✅ LDAP Authentication SUCCESSFUL');
          console.log(`   Display Name: ${ldapResult.user.displayName}`);
          console.log(`   Email: ${ldapResult.user.email}`);
          console.log(`   Groups: ${ldapResult.user.groups.length}`);

          // Check if user is admin based on AD groups
          const isAdmin = ldapService.isAdmin(ldapResult.user.groups);
          console.log(`   Is Admin: ${isAdmin ? 'YES ✅' : 'NO'}`);

          // Find or create user in database
          let user = await User.findOne({ username: ldapResult.user.username }).populate('assignedBots');

          if (!user) {
            console.log('');
            console.log('🆕 Creating new user from LDAP data');
            
            // Get all bots for new user
            const allBots = await Bot.find();
            
            // Create user with LDAP info
            user = new User({
              username: ldapResult.user.username,
              password: await bcrypt.hash(Math.random().toString(36), 10), // Random password (not used)
              isAdmin: isAdmin,
              assignedBots: allBots.map(bot => bot._id),
              email: ldapResult.user.email,
              displayName: ldapResult.user.displayName,
              firstName: ldapResult.user.firstName,
              lastName: ldapResult.user.lastName,
              department: ldapResult.user.department,
              title: ldapResult.user.title,
              authMethod: 'ldap',
              lastLogin: new Date()
            });
            
            await user.save();
            await user.populate('assignedBots');
            
            console.log('✅ New user created from LDAP');
          } else {
            console.log('✅ Existing user found in database');
            
            // Update admin status and last login
            let updated = false;
            
            if (user.isAdmin !== isAdmin) {
              console.log(`🔄 Updating admin status: ${user.isAdmin} → ${isAdmin}`);
              user.isAdmin = isAdmin;
              updated = true;
            }
            
            // Update user info from LDAP
            if (ldapResult.user.email && user.email !== ldapResult.user.email) {
              user.email = ldapResult.user.email;
              updated = true;
            }
            if (ldapResult.user.displayName && user.displayName !== ldapResult.user.displayName) {
              user.displayName = ldapResult.user.displayName;
              updated = true;
            }
            if (ldapResult.user.department && user.department !== ldapResult.user.department) {
              user.department = ldapResult.user.department;
              updated = true;
            }
            
            user.lastLogin = new Date();
            user.authMethod = 'ldap';
            updated = true;
            
            if (updated) {
              await user.save();
              console.log('🔄 User info updated from LDAP');
            }
          }

          // Create session
          req.session.userId = user._id;
          req.session.isAdmin = user.isAdmin;
          req.session.authMethod = 'ldap';

          console.log('');
          console.log('✅ SESSION CREATED');
          console.log(`   User ID: ${user._id}`);
          console.log(`   Is Admin: ${user.isAdmin}`);
          console.log(`   Auth Method: LDAP`);
          console.log('');
          console.log('🎉 LDAP LOGIN SUCCESS!');
          console.log('='.repeat(70));
          console.log('');

          return res.json({
            user: {
              id: user._id,
              username: user.username,
              displayName: ldapResult.user.displayName,
              email: ldapResult.user.email,
              department: ldapResult.user.department,
              title: ldapResult.user.title,
              isAdmin: user.isAdmin,
              assignedBots: user.assignedBots,
              authMethod: 'ldap'
            }
          });
        }

        // LDAP authentication failed
        console.log('❌ LDAP Authentication FAILED');
        console.log(`   Reason: ${ldapResult.message}`);
        
      } catch (ldapError) {
        console.error('❌ LDAP Error:', ldapError.message);
      }
    } else {
      console.log('');
      console.log('ℹ️  LDAP is disabled or not configured');
    }

    // ==================== STEP 2: TRY LOCAL DATABASE AUTHENTICATION ====================
    console.log('');
    console.log('🔐 STEP 2: Checking Local Database');
    console.log('-'.repeat(70));
    
    const user = await User.findOne({ username }).populate('assignedBots');

    if (!user) {
      console.log('❌ User not found in database');
      console.log('');
      console.log('❌ LOGIN FAILED: Invalid credentials');
      console.log('='.repeat(70));
      console.log('');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('✅ User found in database');
    console.log(`   Username: ${user.username}`);
    console.log(`   Auth Method: ${user.authMethod || 'local'}`);
    console.log(`   Is Admin: ${user.isAdmin}`);

    // Verify password
    console.log('🔍 Verifying password...');
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      console.log('❌ Invalid password');
      console.log('');
      console.log('❌ LOGIN FAILED: Invalid credentials');
      console.log('='.repeat(70));
      console.log('');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('✅ Password valid');

    // Update last login
    user.lastLogin = new Date();
    user.authMethod = 'local';
    await user.save();

    // Create session
    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin;
    req.session.authMethod = 'local';

    console.log('');
    console.log('✅ SESSION CREATED');
    console.log(`   User ID: ${user._id}`);
    console.log(`   Is Admin: ${user.isAdmin}`);
    console.log(`   Auth Method: LOCAL`);
    console.log('');
    console.log('🎉 LOCAL LOGIN SUCCESS!');
    console.log('='.repeat(70));
    console.log('');

    res.json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
        assignedBots: user.assignedBots,
        authMethod: 'local'
      }
    });

  } catch (error) {
    console.error('');
    console.error('❌ LOGIN ERROR');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(70));
    console.error('');
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  const username = req.session.username || 'unknown';
  const authMethod = req.session.authMethod || 'unknown';
  
  console.log('');
  console.log('👋 LOGOUT');
  console.log(`   User: ${username}`);
  console.log(`   Auth Method: ${authMethod}`);
  console.log('');
  
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
      .populate('assignedBots')
      .select('-password');
    
    res.json({ 
      user: {
        ...user.toObject(),
        authMethod: req.session.authMethod || user.authMethod || 'unknown'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test LDAP connection (admin only)
router.get('/test-ldap', requireAuth, async (req, res) => {
  try {
    if (!ldapService.isEnabled()) {
      return res.json({
        enabled: false,
        message: 'LDAP is not enabled'
      });
    }

    const result = await ldapService.testConnection();
    res.json({
      enabled: true,
      ...result,
      config: {
        url: ldapService.ldapUrl,
        searchBase: ldapService.searchBase,
        searchFilter: ldapService.searchFilter
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      enabled: ldapService.isEnabled()
    });
  }
});

export default router;

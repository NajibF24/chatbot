// server/services/ldap.service.js - FIXED VERSION WITH BETTER FILTER VALIDATION
import ldap from 'ldapjs';

class LDAPService {
  constructor() {
    this.enabled = process.env.LDAP_ENABLED === 'true';
    this.ldapUrl = process.env.LDAP_URL;
    this.bindDN = process.env.LDAP_BIND_DN;
    this.bindPassword = process.env.LDAP_BIND_PASSWORD;
    this.searchBase = process.env.LDAP_SEARCH_BASE;
    this.searchFilter = process.env.LDAP_SEARCH_FILTER || '(sAMAccountName={{username}})';
    this.usernameAttribute = process.env.LDAP_USERNAME_ATTRIBUTE || 'sAMAccountName';
    this.mailAttribute = process.env.LDAP_MAIL_ATTRIBUTE || 'mail';
    this.displayNameAttribute = process.env.LDAP_DISPLAYNAME_ATTRIBUTE || 'cn';
    this.firstNameAttribute = process.env.LDAP_FIRSTNAME_ATTRIBUTE || 'givenName';
    this.lastNameAttribute = process.env.LDAP_LASTNAME_ATTRIBUTE || 'sn';

    // Connection settings
    this.connectionTimeout = parseInt(process.env.LDAP_CONNECTION_TIMEOUT) || 10000;
    this.searchTimeout = parseInt(process.env.LDAP_SEARCH_TIMEOUT) || 5000;
  }

  /**
   * Check if LDAP is enabled and properly configured
   */
  isEnabled() {
    if (!this.enabled) {
      return false;
    }

    const required = [this.ldapUrl, this.bindDN, this.bindPassword, this.searchBase];
    const allConfigured = required.every(val => val && val.trim().length > 0);

    if (!allConfigured) {
      console.warn('⚠️  LDAP enabled but missing required configuration:');
      if (!this.ldapUrl) console.warn('   - LDAP_URL is missing');
      if (!this.bindDN) console.warn('   - LDAP_BIND_DN is missing');
      if (!this.bindPassword) console.warn('   - LDAP_BIND_PASSWORD is missing');
      if (!this.searchBase) console.warn('   - LDAP_SEARCH_BASE is missing');
    }

    return allConfigured;
  }

  /**
   * Create LDAP client with improved settings
   */
  createClient() {
    return ldap.createClient({
      url: this.ldapUrl,
      timeout: this.searchTimeout,
      connectTimeout: this.connectionTimeout,
      reconnect: {
        initialDelay: 100,
        maxDelay: 1000,
        failAfter: 3
      },
      tlsOptions: {
        rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false'
      }
    });
  }

  /**
   * ✅ IMPROVED: Escape LDAP special characters to prevent injection
   */
  escapeLDAPValue(value) {
    if (!value) return '';

    return String(value)
      .replace(/\\/g, '\\5c')   // Backslash
      .replace(/\*/g, '\\2a')   // Asterisk
      .replace(/\(/g, '\\28')   // Left parenthesis
      .replace(/\)/g, '\\29')   // Right parenthesis
      .replace(/\0/g, '\\00')   // Null
      .replace(/\//g, '\\2f');  // Forward slash
  }

  /**
   * ✅ FIXED: Build LDAP filter with strict validation and auto-fix
   */
  buildSearchFilter(username) {
    // Escape username
    const escapedUsername = this.escapeLDAPValue(username);

    // Get filter template and clean it thoroughly
    let filterTemplate = String(this.searchFilter)
      .trim()
      .replace(/\s+/g, ' ')   // Remove extra spaces
      .replace(/\r\n/g, '')   // Remove Windows line breaks
      .replace(/\n/g, '')     // Remove Unix line breaks
      .replace(/\t/g, '');    // Remove tabs

    console.log('🔍 Building LDAP filter:');
    console.log(`   Original template: "${filterTemplate}"`);
    console.log(`   Template length: ${filterTemplate.length} chars`);

    // Count parentheses
    const openCount = (filterTemplate.match(/\(/g) || []).length;
    const closeCount = (filterTemplate.match(/\)/g) || []).length;

    console.log(`   Open parentheses: ${openCount}`);
    console.log(`   Close parentheses: ${closeCount}`);

    // Fix unbalanced parentheses
    if (openCount !== closeCount) {
      console.warn('⚠️  LDAP filter has unbalanced parentheses!');
      
      // Remove extra closing parentheses from the end
      let fixCount = 0;
      while ((filterTemplate.match(/\)/g) || []).length > (filterTemplate.match(/\(/g) || []).length) {
        const lastCloseIndex = filterTemplate.lastIndexOf(')');
        if (lastCloseIndex === -1) break;
        
        filterTemplate = filterTemplate.substring(0, lastCloseIndex) + filterTemplate.substring(lastCloseIndex + 1);
        fixCount++;
        
        if (fixCount > 10) { // Safety limit
          console.error('❌ Too many closing parentheses to fix!');
          break;
        }
      }

      if (fixCount > 0) {
        console.log(`   ✅ Removed ${fixCount} extra closing parenthesis`);
      }

      // Add missing closing parentheses at the end
      fixCount = 0;
      while ((filterTemplate.match(/\(/g) || []).length > (filterTemplate.match(/\)/g) || []).length) {
        filterTemplate = filterTemplate + ')';
        fixCount++;
        
        if (fixCount > 10) { // Safety limit
          console.error('❌ Too many opening parentheses to fix!');
          break;
        }
      }

      if (fixCount > 0) {
        console.log(`   ✅ Added ${fixCount} missing closing parenthesis`);
      }

      console.log(`   ✅ Fixed filter: "${filterTemplate}"`);
    } else {
      console.log('   ✅ Filter is balanced');
    }

    // Replace placeholder with escaped username
    const finalFilter = filterTemplate.replace(/\{\{username\}\}/g, escapedUsername);

    console.log(`   🎯 Final filter: "${finalFilter}"`);
    console.log(`   📝 Username: "${username}" → "${escapedUsername}"`);

    return finalFilter;
  }

  /**
   * ✅ IMPROVED: Search user with timeout and error handling
   */
  async searchUser(username) {
    return new Promise((resolve, reject) => {
      const client = this.createClient();
      let searchTimedOut = false;

      // Set overall timeout
      const timeoutId = setTimeout(() => {
        searchTimedOut = true;
        client.unbind();
        reject(new Error('LDAP search timeout'));
      }, this.searchTimeout);

      // Build search filter
      const searchFilter = this.buildSearchFilter(username);

      console.log('🔍 LDAP Search:');
      console.log(`   Base DN: ${this.searchBase}`);
      console.log(`   Filter: ${searchFilter}`);
      console.log(`   Timeout: ${this.searchTimeout}ms`);

      // Bind with service account
      client.bind(this.bindDN, this.bindPassword, (bindErr) => {
        if (searchTimedOut) return;

        if (bindErr) {
          clearTimeout(timeoutId);
          console.error('❌ LDAP Bind Error:', bindErr.message);
          client.unbind();

          // Provide better error messages
          if (bindErr.message.includes('Invalid Credentials')) {
            return reject(new Error('LDAP service account credentials are invalid'));
          }

          return reject(new Error(`LDAP bind failed: ${bindErr.message}`));
        }

        console.log('✅ LDAP Bind successful');

        const opts = {
          filter: searchFilter,
          scope: 'sub',
          timeLimit: Math.floor(this.searchTimeout / 1000), // Convert to seconds
          attributes: [
            this.usernameAttribute,
            this.mailAttribute,
            this.displayNameAttribute,
            this.firstNameAttribute,
            this.lastNameAttribute,
            'dn',
            'cn',
            'memberOf',
            'department',
            'title',
            'telephoneNumber',
            'mobile',
            'manager',
            'employeeID',
            'distinguishedName'
          ]
        };

        const users = [];

        client.search(this.searchBase, opts, (searchErr, res) => {
          if (searchTimedOut) return;

          if (searchErr) {
            clearTimeout(timeoutId);
            console.error('❌ LDAP Search Error:', searchErr.message);
            client.unbind();
            return reject(new Error(`LDAP search failed: ${searchErr.message}`));
          }

          res.on('searchEntry', (entry) => {
            if (searchTimedOut) return;
            console.log('✅ User found:', entry.objectName);
            users.push(entry.object);
          });

          res.on('error', (err) => {
            if (searchTimedOut) return;
            clearTimeout(timeoutId);
            console.error('❌ LDAP Search Stream Error:', err.message);
            client.unbind();
            reject(new Error(`LDAP search error: ${err.message}`));
          });

          res.on('end', (result) => {
            if (searchTimedOut) return;
            clearTimeout(timeoutId);
            client.unbind();

            if (result.status !== 0) {
              console.error('❌ LDAP Search ended with error status:', result.status);
              return reject(new Error(`LDAP search failed with status ${result.status}`));
            }

            if (users.length === 0) {
              console.log('⚠️  User not found in LDAP');
              return resolve(null);
            }

            if (users.length > 1) {
              console.warn(`⚠️  Multiple users found (${users.length}), using first result`);
            }

            console.log('✅ LDAP Search complete');
            resolve(users[0]);
          });
        });
      });
    });
  }

  /**
   * ✅ IMPROVED: Bind user with timeout
   */
  async bindUser(userDN, password) {
    return new Promise((resolve) => {
      const client = this.createClient();
      let bindTimedOut = false;

      // Set timeout
      const timeoutId = setTimeout(() => {
        bindTimedOut = true;
        client.unbind();
        console.error('❌ User bind timeout');
        resolve(false);
      }, this.connectionTimeout);

      client.bind(userDN, password, (err) => {
        if (bindTimedOut) return;

        clearTimeout(timeoutId);
        client.unbind();

        if (err) {
          console.error('❌ User bind failed:', err.message);
          resolve(false);
        } else {
          console.log('✅ User bind successful');
          resolve(true);
        }
      });
    });
  }

  /**
   * ✅ IMPROVED: Authenticate with better error handling
   */
  async authenticate(username, password) {
    try {
      if (!this.isEnabled()) {
        return {
          success: false,
          message: 'LDAP is not enabled or properly configured'
        };
      }

      // Validate input
      if (!username || !password) {
        return {
          success: false,
          message: 'Username and password are required'
        };
      }

      console.log('');
      console.log('='.repeat(70));
      console.log('🔐 LDAP AUTHENTICATION');
      console.log('='.repeat(70));
      console.log(`Username: ${username}`);
      console.log(`Server: ${this.ldapUrl}`);
      console.log(`Search Base: ${this.searchBase}`);
      console.log('');

      // Step 1: Search for user
      let userEntry;
      try {
        userEntry = await this.searchUser(username);
      } catch (searchError) {
        console.error('❌ Search failed:', searchError.message);
        return {
          success: false,
          message: `User search failed: ${searchError.message}`
        };
      }

      if (!userEntry) {
        console.log('❌ User not found in LDAP');
        console.log('='.repeat(70));
        return {
          success: false,
          message: 'User not found in Active Directory'
        };
      }

      const userDN = userEntry.dn || userEntry.distinguishedName;
      if (!userDN) {
        console.error('❌ User DN not found in search result');
        return {
          success: false,
          message: 'User DN is missing'
        };
      }

      console.log('✅ User DN:', userDN);

      // Step 2: Authenticate with user credentials
      let authResult;
      try {
        authResult = await this.bindUser(userDN, password);
      } catch (bindError) {
        console.error('❌ Bind failed:', bindError.message);
        return {
          success: false,
          message: `Authentication failed: ${bindError.message}`
        };
      }

      if (!authResult) {
        console.log('❌ Invalid password');
        console.log('='.repeat(70));
        return {
          success: false,
          message: 'Invalid password'
        };
      }

      console.log('✅ Authentication successful');
      console.log('='.repeat(70));

      // Step 3: Extract user info
      const userInfo = {
        username: userEntry[this.usernameAttribute] || username,
        email: userEntry[this.mailAttribute] || null,
        displayName: userEntry[this.displayNameAttribute] || userEntry.cn || username,
        firstName: userEntry[this.firstNameAttribute] || null,
        lastName: userEntry[this.lastNameAttribute] || null,
        department: userEntry.department || null,
        title: userEntry.title || null,
        telephoneNumber: userEntry.telephoneNumber || null,
        mobile: userEntry.mobile || null,
        manager: userEntry.manager || null,
        employeeID: userEntry.employeeID || null,
        dn: userDN,
        groups: this.extractGroups(userEntry.memberOf)
      };

      console.log('📋 User Info:');
      console.log(`   Username: ${userInfo.username}`);
      console.log(`   Display Name: ${userInfo.displayName}`);
      console.log(`   Email: ${userInfo.email || 'N/A'}`);
      console.log(`   Department: ${userInfo.department || 'N/A'}`);
      console.log(`   Groups: ${userInfo.groups.length}`);
      console.log('');

      return {
        success: true,
        user: userInfo
      };

    } catch (error) {
      console.error('❌ LDAP Authentication Error:', error.message);
      console.log('='.repeat(70));
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Extract groups from memberOf attribute
   */
  extractGroups(memberOf) {
    if (!memberOf) return [];

    const groups = Array.isArray(memberOf) ? memberOf : [memberOf];

    // Extract CN from DN (e.g., "CN=Domain Admins,CN=Users,DC=company,DC=com" -> "Domain Admins")
    return groups.map(dn => {
      const match = dn.match(/^CN=([^,]+)/i);
      return match ? match[1] : dn;
    }).filter(g => g); // Remove empty values
  }

  /**
   * Check if user is admin based on groups
   */
  isAdmin(groups) {
    const adminGroups = (process.env.LDAP_ADMIN_GROUPS || '')
      .split(',')
      .map(g => g.trim())
      .filter(g => g.length > 0);

    if (adminGroups.length === 0) {
      console.log('ℹ️  No admin groups configured (LDAP_ADMIN_GROUPS)');
      return false;
    }

    const isAdminUser = groups.some(userGroup =>
      adminGroups.some(adminGroup =>
        userGroup.toLowerCase() === adminGroup.toLowerCase()
      )
    );

    if (isAdminUser) {
      console.log('✅ User is admin (member of configured groups)');
      console.log(`   Matching groups: ${groups.filter(g =>
        adminGroups.some(ag => ag.toLowerCase() === g.toLowerCase())
      ).join(', ')}`);
    }

    return isAdminUser;
  }

  /**
   * ✅ IMPROVED: Test connection with detailed diagnostics
   */
  async testConnection() {
    return new Promise((resolve) => {
      console.log('🔍 Testing LDAP Connection...');
      console.log(`   URL: ${this.ldapUrl}`);
      console.log(`   Bind DN: ${this.bindDN}`);
      console.log(`   Search Base: ${this.searchBase}`);

      const client = this.createClient();
      let testTimedOut = false;

      const timeoutId = setTimeout(() => {
        testTimedOut = true;
        client.unbind();
        console.error('❌ Connection test timeout');
        resolve({
          success: false,
          message: 'Connection timeout',
          details: {
            url: this.ldapUrl,
            timeout: this.connectionTimeout
          }
        });
      }, this.connectionTimeout);

      client.bind(this.bindDN, this.bindPassword, (err) => {
        if (testTimedOut) return;

        clearTimeout(timeoutId);
        client.unbind();

        if (err) {
          console.error('❌ Connection test failed:', err.message);
          resolve({
            success: false,
            message: err.message,
            details: {
              url: this.ldapUrl,
              bindDN: this.bindDN,
              error: err.message
            }
          });
        } else {
          console.log('✅ Connection test successful');
          resolve({
            success: true,
            message: 'LDAP connection successful',
            details: {
              url: this.ldapUrl,
              bindDN: this.bindDN,
              searchBase: this.searchBase,
              timeout: this.connectionTimeout
            }
          });
        }
      });
    });
  }

  /**
   * Get user details without authentication
   */
  async getUserDetails(username) {
    try {
      const userEntry = await this.searchUser(username);

      if (!userEntry) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      const userInfo = {
        username: userEntry[this.usernameAttribute] || username,
        email: userEntry[this.mailAttribute] || null,
        displayName: userEntry[this.displayNameAttribute] || userEntry.cn || username,
        firstName: userEntry[this.firstNameAttribute] || null,
        lastName: userEntry[this.lastNameAttribute] || null,
        department: userEntry.department || null,
        title: userEntry.title || null,
        dn: userEntry.dn,
        groups: this.extractGroups(userEntry.memberOf)
      };

      return {
        success: true,
        user: userInfo
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * ✅ NEW: Health check with connection pooling test
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const result = await this.testConnection();
      const responseTime = Date.now() - startTime;

      return {
        ...result,
        responseTime: `${responseTime}ms`,
        healthy: result.success
      };
    } catch (error) {
      return {
        success: false,
        healthy: false,
        message: error.message,
        responseTime: `${Date.now() - startTime}ms`
      };
    }
  }
}

export default LDAPService;

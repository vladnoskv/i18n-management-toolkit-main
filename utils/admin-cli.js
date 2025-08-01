const readline = require('readline');
const i18n = require('./i18n-helper');
const AdminAuth = require('./admin-auth');
const SecurityUtils = require('./security');

/**
 * CLI Helper for Admin Authentication
 */
class AdminCLI {
  constructor() {
    this.adminAuth = new AdminAuth();
    this.rl = null;
  }

  /**
   * Initialize readline interface
   */
  initReadline() {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        historySize: 0
      });
    }
    return this.rl;
  }

  /**
   * Close readline interface
   */
  closeReadline() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Prompt for PIN input (hidden)
   */
  async promptPin(message = 'Enter admin PIN: ') {
    return new Promise((resolve) => {
      const rl = this.initReadline();
      
      // Check if stdin is a TTY (interactive terminal)
      const stdin = process.stdin;
      const isTTY = stdin.isTTY;
      
      if (isTTY) {
         // Hide input for PIN in interactive mode
         stdin.setRawMode(true);
         stdin.resume();
         stdin.setEncoding('utf8');
       }
       
       if (isTTY) {
         // Interactive mode with hidden input
         let pin = '';
         process.stdout.write(message);
        
        const onData = (char) => {
          switch (char) {
            case '\n':
            case '\r':
            case '\u0004': // Ctrl+D
              stdin.setRawMode(false);
              stdin.pause();
              stdin.removeListener('data', onData);
              process.stdout.write('\n');
              resolve(pin);
              break;
            case '\u0003': // Ctrl+C
              stdin.setRawMode(false);
              stdin.pause();
              stdin.removeListener('data', onData);
              process.stdout.write('\n');
              process.exit(1);
              break;
            case '\u007f': // Backspace
              if (pin.length > 0) {
                pin = pin.slice(0, -1);
                process.stdout.write('\b \b');
              }
              break;
            default:
              if (char >= '0' && char <= '9' && pin.length < 4) {
                pin += char;
                process.stdout.write('*');
              }
              break;
          }
        };
        
        stdin.on('data', onData);
      } else {
        // Non-interactive mode (piped input)
        rl.question(message, (answer) => {
          resolve(answer.trim());
        });
      }
    });
  }

  /**
   * Prompt for yes/no confirmation
   */
  async promptConfirm(message) {
    return new Promise((resolve) => {
      const rl = this.initReadline();
      rl.question(`${message} (y/N): `, (answer) => {
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  /**
   * Setup admin PIN
   */
  async setupAdminPin() {
    try {
      console.log(i18n.t('adminCli.setupPinProtectionTitle'));
      console.log(i18n.t('adminCli.setupPinProtectionDescription'));
      
      const confirm = await this.promptConfirm(i18n.t('adminCli.enablePinProtectionPrompt'));
      if (!confirm) {
        console.log(i18n.t('adminCli.setupCancelled'));
        this.closeReadline();
        return false;
      }

      let pin1, pin2;
      do {
        pin1 = await this.promptPin(i18n.t('adminCli.enterPinPrompt'));
        
        if (!/^\d{4}$/.test(pin1)) {
          console.log(i18n.t('adminCli.pinFormatError'));
          continue;
        }
        
        pin2 = await this.promptPin(i18n.t('adminCli.confirmPinPrompt'));
        
        if (pin1 !== pin2) {
          console.log(i18n.t('adminCli.pinMismatchError'));
        }
      } while (pin1 !== pin2 || !/^\d{4}$/.test(pin1));

      await this.adminAuth.initialize();
      const success = await this.adminAuth.setupPin(pin1);
      
      if (success) {
        console.log(i18n.t('adminCli.pinProtectionEnabledSuccess'));
        console.log(i18n.t('adminCli.pinRecoveryWarning'));
        SecurityUtils.logSecurityEvent(i18n.t('adminCli.adminPinSetupCli'), 'info', 'Admin PIN setup completed via CLI');
      } else {
        console.log(i18n.t('adminCli.setupPinProtectionFailed'));
      }
      
      this.closeReadline();
      return success;
    } catch (error) {
      console.error(i18n.t('adminCli.errorSettingUpPin', { message: error.message }));
      this.closeReadline();
      return false;
    }
  }

  /**
   * Authenticate admin user
   */
  async authenticateAdmin(operation = 'administrative operation') {
    try {
      await this.adminAuth.initialize();
      
      const authRequired = await this.adminAuth.isAuthRequired();
      if (!authRequired) {
        return true; // No authentication required
      }

      console.log(i18n.t('adminCli.authRequiredForOperation', { operation }));
      
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        const pin = await this.promptPin('Enter admin PIN: ');
        
        if (!/^\d{4}$/.test(pin)) {
          console.log(i18n.t('adminCli.invalidPinFormat'));
          attempts++;
          continue;
        }
        
        const isValid = await this.adminAuth.verifyPin(pin);
        
        if (isValid) {
          console.log(i18n.t('adminCli.authenticationSuccess'));
          this.closeReadline();
          return true;
        } else {
          attempts++;
          const remaining = maxAttempts - attempts;
          if (remaining > 0) {
            console.log(i18n.t('adminCli.invalidPinAttemptsRemaining', { remaining }));
          }
        }
      }
      
      console.log(i18n.t('adminCli.authenticationFailedAccessDenied'));
      SecurityUtils.logSecurityEvent(i18n.t('adminCli.adminAuthFailedCli'), 'warning', `Admin authentication failed after ${maxAttempts} attempts`);
      this.closeReadline();
      return false;
    } catch (error) {
      console.error(i18n.t('adminCli.authenticationError', { message: error.message }));
      this.closeReadline();
      return false;
    }
  }

  /**
   * Disable admin authentication
   */
  async disableAdminAuth() {
    try {
      await this.adminAuth.initialize();
      
      const authRequired = await this.adminAuth.isAuthRequired();
      if (!authRequired) {
        console.log(i18n.t('adminCli.pinProtectionNotEnabled'));
        return true;
      }

      console.log(i18n.t('adminCli.disablingPinProtectionTitle'));
      
      // Require authentication to disable
      const authenticated = await this.authenticateAdmin('disable admin protection');
      if (!authenticated) {
        return false;
      }
      
      const confirm = await this.promptConfirm(i18n.t('adminCli.confirmDisablePinProtection'));
      if (!confirm) {
        console.log(i18n.t('adminCli.operationCancelled'));
        this.closeReadline();
        return false;
      }
      
      const success = await this.adminAuth.disableAuth();
      
      if (success) {
        console.log(i18n.t('adminCli.pinProtectionDisabledSuccess'));
        SecurityUtils.logSecurityEvent(i18n.t('adminCli.adminAuthDisabledCli'), 'info', 'Admin PIN protection disabled via CLI');
      } else {
        console.log(i18n.t('adminCli.disablePinProtectionFailed'));
      }
      
      this.closeReadline();
      return success;
    } catch (error) {
      console.error(i18n.t('adminCli.errorDisablingPinProtection', { message: error.message }));
      this.closeReadline();
      return false;
    }
  }

  /**
   * Show admin status
   */
  async showAdminStatus() {
    try {
      await this.adminAuth.initialize();
      
      const authRequired = await this.adminAuth.isAuthRequired();
      
      console.log(i18n.t('adminCli.adminProtectionStatusTitle'));
      console.log('=' .repeat(30));
      
      if (authRequired) {
        console.log(i18n.t('adminCli.statusEnabled'));
        console.log(i18n.t('adminCli.protectionDetails'));
        console.log(i18n.t('adminCli.lockoutDetails'));
      } else {
        console.log(i18n.t('adminCli.statusDisabled'));
        console.log(i18n.t('adminCli.noAuthRequired'));
        console.log(i18n.t('adminCli.unprotectedRisk'));
      }
      
      return authRequired;
    } catch (error) {
      console.error(i18n.t('adminCli.errorCheckingAdminStatus', { message: error.message }));
      return false;
    }
  }

  /**
   * Check if operation requires admin authentication
   */
  static requiresAdminAuth(operation) {
    const adminOperations = [
      'complete',
      'manage',
      'init',
      'bulk-update',
      'delete-language',
      'reset-translations',
      'delete',
      'workflow'
    ];
    
    return adminOperations.includes(operation);
  }

  /**
   * Static method to check if operation requires auth (alias)
   */
  static requiresAuth(operation) {
    return AdminCLI.requiresAdminAuth(operation);
  }

  /**
   * Static method to authenticate
   */
  static async authenticate(operation = 'administrative operation') {
    const cli = new AdminCLI();
    return await cli.authenticateAdmin(operation);
  }

  /**
   * Static method to setup admin
   */
  static async setupAdmin() {
    const cli = new AdminCLI();
    return await cli.setupAdminPin();
  }

  /**
   * Static method to disable admin
   */
  static async disableAdmin() {
    const cli = new AdminCLI();
    return await cli.disableAdminAuth();
  }

  /**
   * Static method to show status
   */
  static async showStatus() {
    const cli = new AdminCLI();
    return await cli.showAdminStatus();
  }
}

module.exports = AdminCLI;
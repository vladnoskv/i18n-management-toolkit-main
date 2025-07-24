#!/usr/bin/env node
/**
 * I18N MANAGEMENT SCRIPT
 * 
 * This is the main entry point for all i18n operations.
 * It provides an interactive interface to manage translations.
 * 
 * Usage:
 *   node scripts/i18n/00-manage-i18n.js
 *   node scripts/i18n/00-manage-i18n.js --command=init
 *   node scripts/i18n/00-manage-i18n.js --command=analyze
 *   node scripts/i18n/00-manage-i18n.js --command=validate
 *   node scripts/i18n/00-manage-i18n.js --command=usage
 *   node scripts/i18n/00-manage-i18n.js --help
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Import UI internationalization
const uiI18n = require('./ui-i18n');

// Import other i18n scripts
const I18nInitializer = require('./01-init-i18n');
const I18nAnalyzer = require('./02-analyze-translations');
const I18nValidator = require('./03-validate-translations');
const I18nUsageAnalyzer = require('./04-check-usage');
const I18nSizingAnalyzer = require('./06-analyze-sizing');
const SettingsCLI = require('./settings-cli');

// Default configuration
const DEFAULT_CONFIG = {
  sourceDir: './locales',
  sourceLanguage: 'en',
  defaultLanguages: ['de', 'es', 'fr', 'ru'],
  outputDir: './i18n-reports'
};

class I18nManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  // Parse command line arguments
  parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        
        if (key === 'command') {
          parsed.command = value;
        } else if (key === 'help') {
          parsed.help = true;
        } else if (key === 'source-dir') {
          parsed.sourceDir = value || args[++i];
        } else if (key === 'languages') {
          parsed.languages = (value || args[++i]).split(',');
        } else if (key === 'interactive') {
          parsed.interactive = (value || args[++i]) !== 'false';
        } else if (key === 'ui-language') {
          parsed.uiLanguage = value || args[++i];
        } else if (key === 'report-language') {
          parsed.reportLanguage = value || args[++i];
        } else if (key === 'sizing') {
          parsed.sizing = true;
        } else if (key === 'sizing-threshold') {
          parsed.sizingThreshold = parseInt(value || args[++i]);
        } else if (key === 'sizing-format') {
          parsed.sizingFormat = value || args[++i];
        }
      } else {
        // Handle commands without -- prefix
        if (!parsed.command && ['init', 'analyze', 'validate', 'usage', 'complete', 'sizing', 'status', 'workflow', 'delete', 'help'].includes(arg)) {
          parsed.command = arg;
        }
      }
    }
    
    return parsed;
  }

  // Display help information
  showHelp() {
    console.log(`\n${uiI18n.t('help.title')}`);
    console.log(uiI18n.t('help.separator'));
    console.log(uiI18n.t('help.description') + '\n');
    
    console.log(uiI18n.t('help.commands'));
    console.log(`  init      ${uiI18n.t('help.commandList.init')}`);
    console.log(`  analyze   ${uiI18n.t('help.commandList.analyze')}`);
    console.log(`  validate  ${uiI18n.t('help.commandList.validate')}`);
    console.log(`  usage     ${uiI18n.t('help.commandList.usage')}`);
    console.log(`  complete  ${uiI18n.t('help.commandList.complete')}`);
    console.log(`  sizing    ${uiI18n.t('help.commandList.sizing')}`);
    console.log(`  status    ${uiI18n.t('help.commandList.status')}`);
    console.log(`  workflow  ${uiI18n.t('help.commandList.workflow')}`);
    console.log(`  delete    ${uiI18n.t('help.commandList.delete')}`);
    console.log(`  help      ${uiI18n.t('help.commandList.help')}\n`);
    
    console.log(uiI18n.t('help.options'));
    console.log(`  ${uiI18n.t('help.optionList.command')}`);
    console.log(`  ${uiI18n.t('help.optionList.sourceDir')}`);
    console.log(`  ${uiI18n.t('help.optionList.languages')}`);
    console.log(`  ${uiI18n.t('help.optionList.interactive')}`);
    console.log(`  ${uiI18n.t('help.optionList.uiLanguage')}`);
    console.log(`  ${uiI18n.t('help.optionList.reportLanguage')}`);
    console.log(`  ${uiI18n.t('help.optionList.sizing')}`);
    console.log(`  ${uiI18n.t('help.optionList.sizingThreshold')}`);
    console.log(`  ${uiI18n.t('help.optionList.sizingFormat')}\n`);
    
    console.log(uiI18n.t('help.examples'));
    uiI18n.t('help.exampleList').forEach(example => {
      console.log(`  ${example}`);
    });
    console.log('');
  }

  // Prompt user for input
  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  // Get project status
  async getProjectStatus() {
    const sourceDir = path.resolve(this.config.sourceDir);
    const sourceLanguageDir = path.join(sourceDir, this.config.sourceLanguage);
    
    const status = {
      hasI18n: fs.existsSync(sourceDir),
      hasSourceLanguage: fs.existsSync(sourceLanguageDir),
      languages: [],
      files: [],
      totalKeys: 0
    };
    
    if (status.hasI18n) {
      // Get available languages
      status.languages = fs.readdirSync(sourceDir)
        .filter(item => {
          const itemPath = path.join(sourceDir, item);
          return fs.statSync(itemPath).isDirectory();
        });
      
      // Get translation files
      if (status.hasSourceLanguage) {
        status.files = fs.readdirSync(sourceLanguageDir)
          .filter(file => file.endsWith('.json'));
        
        // Count total keys
        for (const fileName of status.files) {
          try {
            const filePath = path.join(sourceLanguageDir, fileName);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            status.totalKeys += this.countKeys(content);
          } catch (error) {
            // Ignore parsing errors for status
          }
        }
      }
    }
    
    return status;
  }

  // Count keys recursively
  countKeys(obj) {
    let count = 0;
    
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        count += this.countKeys(value);
      } else {
        count++;
      }
    }
    
    return count;
  }

  // Display project status
  async showStatus() {
    console.log(uiI18n.t('status.title'));
    console.log(uiI18n.t('status.separator'));
    
    const status = await this.getProjectStatus();
    
    console.log(`${uiI18n.t('status.sourceDir')}: ${path.resolve(this.config.sourceDir)}`);
    console.log(`${uiI18n.t('status.sourceLanguage')}: ${this.config.sourceLanguage}`);
    console.log(`${uiI18n.t('status.i18nSetup')}: ${status.hasI18n ? uiI18n.t('status.yes') : uiI18n.t('status.no')}`);
    
    if (status.hasI18n) {
      console.log(`${uiI18n.t('status.availableLanguages')}: ${status.languages.join(', ')}`);
      console.log(`${uiI18n.t('status.translationFiles')}: ${status.files.length}`);
      console.log(`${uiI18n.t('status.totalKeys')}: ${status.totalKeys}`);
      
      if (status.languages.length > 1) {
        console.log('\n' + uiI18n.t('status.suggestions.analysis'));
      }
    } else {
      console.log('\n' + uiI18n.t('status.suggestions.init'));
    }
  }

  // Interactive menu
  async showMenu() {
    console.log('\n' + uiI18n.t('menu.title'));
    console.log(uiI18n.t('menu.separator'));
    console.log(`1. ${uiI18n.t('menu.options.init')}`);
    console.log(`2. ${uiI18n.t('menu.options.analyze')}`);
    console.log(`3. ${uiI18n.t('menu.options.validate')}`);
    console.log(`4. ${uiI18n.t('menu.options.usage')}`);
    console.log(`5. ${uiI18n.t('menu.options.complete')}`);
    console.log(`6. ${uiI18n.t('menu.options.sizing')}`);
    console.log(`7. ${uiI18n.t('menu.options.workflow')}`);
    console.log(`8. ${uiI18n.t('menu.options.status')}`);
    console.log(`9. ${uiI18n.t('menu.options.delete')}`);
    console.log(`10. ${uiI18n.t('menu.options.language')}`);
    console.log(`11. ${uiI18n.t('menu.options.help')}`);
    console.log(`12. ${uiI18n.t('menu.options.settings')} (Advanced)`);
    console.log(`0. ${uiI18n.t('menu.options.exit')}\n`);
    
    const choice = await this.prompt(uiI18n.t('menu.prompt'));
    return choice;
  }

  // Run initialization
  async runInit(languages = null) {
    console.log('\n' + uiI18n.t('operations.init.title'));
    console.log(uiI18n.t('operations.init.separator'));
    
    const initializer = new I18nInitializer({
      sourceDir: this.config.sourceDir,
      sourceLanguage: this.config.sourceLanguage
    });
    
    if (languages) {
      // Non-interactive mode with specified languages
      await initializer.init(languages);
    } else {
      // Interactive mode
      await initializer.init();
    }
  }

  // Run analysis
  async runAnalysis(languages = null) {
    console.log('\n' + uiI18n.t('operations.analyze.title'));
    console.log(uiI18n.t('operations.analyze.separator'));
    
    const analyzer = new I18nAnalyzer({
      sourceDir: this.config.sourceDir,
      sourceLanguage: this.config.sourceLanguage,
      outputDir: this.config.outputDir,
      uiLanguage: uiI18n.getCurrentLanguage()
    });
    
    // Override command line args for specific languages
    if (languages) {
      process.argv = process.argv.slice(0, 2).concat([
        `--languages=${languages.join(',')}`,
        '--output-reports'
      ]);
    } else {
      process.argv = process.argv.slice(0, 2).concat(['--output-reports']);
    }
    
    await analyzer.analyze();
  }

  // Run validation
  async runValidation(languages = null) {
    console.log('\n' + uiI18n.t('operations.validate.title'));
    console.log(uiI18n.t('operations.validate.separator'));
    
    const validator = new I18nValidator({
      sourceDir: this.config.sourceDir,
      sourceLanguage: this.config.sourceLanguage,
      uiLanguage: uiI18n.getCurrentLanguage()
    });
    
    // Override command line args for specific languages
    if (languages) {
      process.argv = process.argv.slice(0, 2).concat([
        `--language=${languages[0]}` // Validator takes single language
      ]);
    }
    
    const result = await validator.validate();
    return result;
  }

  // Run usage analysis
  async runUsageAnalysis() {
    console.log('\n' + uiI18n.t('operations.usage.title'));
    console.log(uiI18n.t('operations.usage.separator'));
    
    const usageAnalyzer = new I18nUsageAnalyzer({
      sourceDir: './src',
      i18nDir: this.config.sourceDir,
      sourceLanguage: this.config.sourceLanguage,
      outputDir: this.config.outputDir
    });
    
    // Override command line args
    process.argv = process.argv.slice(0, 2).concat(['--output-report']);
    
    await usageAnalyzer.analyze();
  }

  // Run completion
  async runCompletion() {
    console.log('\n' + uiI18n.t('operations.complete.title'));
    console.log(uiI18n.t('operations.complete.separator'));
    
    try {
      const I18nCompleter = require('./05-complete-translations');
      const completer = new I18nCompleter({
        sourceDir: this.config.sourceDir,
        sourceLanguage: this.config.sourceLanguage,
        outputDir: this.config.outputDir
      });
      
      await completer.complete();
    } catch (error) {
      console.error(uiI18n.t('errors.errorRunning'), error.message);
    }
  }

  // Run sizing analysis
  async runSizingAnalysis(options = {}) {
    console.log('\n' + uiI18n.t('operations.sizing.title'));
    console.log(uiI18n.t('operations.sizing.separator'));
    
    try {
      const analyzer = new I18nSizingAnalyzer({
        sourceDir: this.config.sourceDir,
        sourceLanguage: this.config.sourceLanguage,
        outputDir: this.config.outputDir,
        ...options
      });
      
      await analyzer.analyze();
    } catch (error) {
      console.error(uiI18n.t('errors.errorRunning'), error.message);
    }
  }

  // Delete all reports
  async deleteReports() {
    console.log('\n' + uiI18n.t('operations.deleteReports.title'));
    console.log(uiI18n.t('operations.deleteReports.separator'));
    
    // Use the configured output directory
    const reportsDir = path.resolve(this.config.outputDir);
    
    console.log(uiI18n.t('operations.deleteReports.lookingFor', { dir: reportsDir }));
    
    // Ensure the reports directory exists, create if it doesn't
    if (!fs.existsSync(reportsDir)) {
      console.log(uiI18n.t('operations.deleteReports.directoryNotExists'));
      try {
        fs.mkdirSync(reportsDir, { recursive: true });
        console.log(uiI18n.t('operations.deleteReports.directoryCreated'));
        console.log(uiI18n.t('operations.deleteReports.noFilesToDelete'));
        return;
      } catch (error) {
        console.error(uiI18n.t('errors.errorCreatingDirectory'), error.message);
        return;
      }
    }
    
    try {
      const files = fs.readdirSync(reportsDir);
      const reportFiles = files.filter(file => 
        file.endsWith('.txt') || file.endsWith('.json') || file.endsWith('.log')
      );
      
      if (reportFiles.length === 0) {
        console.log(uiI18n.t('operations.deleteReports.noFilesToDelete'));
        return;
      }
      
      console.log(uiI18n.t('operations.deleteReports.foundFiles', { count: reportFiles.length }));
      reportFiles.forEach(file => console.log(`   - ${file}`));
      
      const confirm = await this.prompt('\n' + uiI18n.t('operations.deleteReports.confirmPrompt'));
      
      if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
        let deletedCount = 0;
        
        for (const file of reportFiles) {
          try {
            fs.unlinkSync(path.join(reportsDir, file));
            deletedCount++;
            console.log(uiI18n.t('operations.deleteReports.deleted', { file }));
          } catch (error) {
            console.log(uiI18n.t('operations.deleteReports.failedToDelete', { file, error: error.message }));
          }
        }
        
        console.log('\n' + uiI18n.t('operations.deleteReports.successfullyDeleted', { count: deletedCount }));
      } else {
        console.log(uiI18n.t('operations.deleteReports.cancelled'));
      }
      
    } catch (error) {
      console.error(uiI18n.t('errors.errorReadingDirectory'), error.message);
    }
  }

  // Run comprehensive workflow
  async runWorkflow() {
    console.log('\n' + uiI18n.t('operations.workflow.title'));
    console.log(uiI18n.t('operations.workflow.separator'));
    
    const status = await this.getProjectStatus();
    
    if (!status.hasI18n) {
      console.log(uiI18n.t('operations.workflow.notSetup'));
      return;
    }
    
    console.log(uiI18n.t('operations.workflow.step1'));
    await this.runCompletion();
    
    console.log('\n' + uiI18n.t('operations.workflow.step2'));
    await this.runValidation();
    
    console.log('\n' + uiI18n.t('operations.workflow.step3'));
    await this.runAnalysis();
    
    console.log('\n' + uiI18n.t('operations.workflow.step4'));
    await this.runUsageAnalysis();
    
    console.log('\n' + uiI18n.t('operations.workflow.completed'));
  }

  // Open settings interface
  async openSettings() {
    console.log('\n' + uiI18n.t('operations.settings.title'));
    console.log(uiI18n.t('operations.settings.separator'));
    
    try {
      const settingsCLI = new SettingsCLI();
      await settingsCLI.start();
      
      // Reload settings in case they were changed
       try {
         const settingsManager = require('./settings-manager');
         const newSettings = settingsManager.getSettings();
         
         // Update current config
         this.config = { ...this.config, ...newSettings };
         
         // Reinitialize UI language if changed
         if (newSettings.ui && newSettings.ui.language !== uiI18n.getCurrentLanguage()) {
           await uiI18n.changeLanguage(newSettings.ui.language);
         }
         
         console.log(uiI18n.t('operations.settings.reloaded'));
       } catch (error) {
         console.log(uiI18n.t('operations.settings.reloadError', 'Warning: Could not reload configuration:'), error.message);
       }
      
    } catch (error) {
      console.error(uiI18n.t('operations.settings.error'), error.message);
      console.log(uiI18n.t('operations.settings.fallback', 'You can manually edit the user-config.json file instead.'));
    }
  }

  // Main execution
  async run() {
    try {
      const args = this.parseArgs();
      
      // Initialize UI language
      await uiI18n.initializeLanguage();
      
      // Update config from args
      if (args.sourceDir) {
        this.config.sourceDir = args.sourceDir;
      }
      
      // Show help
      if (args.help) {
        this.showHelp();
        this.rl.close();
        return;
      }
      
      // Show header
      console.log('\n' + uiI18n.t('menu.title'));
console.log(uiI18n.t('menu.separator'));
      
      // Direct command execution
      if (args.command) {
        switch (args.command.toLowerCase()) {
          case 'init':
            await this.runInit(args.languages);
            break;
          case 'analyze':
            await this.runAnalysis(args.languages);
            break;
          case 'validate':
            await this.runValidation(args.languages);
            break;
          case 'usage':
            await this.runUsageAnalysis();
            break;
          case 'complete':
            await this.runCompletion();
            break;
          case 'sizing':
            await this.runSizingAnalysis({
              threshold: args.sizingThreshold,
              format: args.sizingFormat
            });
            break;
          case 'status':
            await this.showStatus();
            break;
          case 'workflow':
            await this.runWorkflow();
            break;
          case 'delete':
            await this.deleteReports();
            break;
          case 'settings':
            await this.openSettings();
            break;
          case 'help':
            this.showHelp();
            break;
          default:
            console.log(uiI18n.t('menu.invalidChoice') + `: ${args.command}`);
this.showHelp();
        }
        
        this.rl.close();
        return;
      }
      
      // Interactive mode
      if (args.interactive !== false) {
        await this.showStatus();
        
        while (true) {
          const choice = await this.showMenu();
          
          switch (choice) {
            case '1':
              await this.runInit();
              break;
            case '2':
              await this.runAnalysis();
              break;
            case '3':
              await this.runValidation();
              break;
            case '4':
              await this.runUsageAnalysis();
              break;
            case '5':
              await this.runCompletion();
              break;
            case '6':
              await this.runSizingAnalysis();
              break;
            case '7':
              await this.runWorkflow();
              break;
            case '8':
              await this.showStatus();
              break;
            case '9':
              await this.deleteReports();
              break;
            case '10':
              const selectedLang = await uiI18n.selectLanguage();
              uiI18n.saveLanguagePreference(selectedLang);
              break;
            case '11':
              this.showHelp();
              break;
            case '12':
              await this.openSettings();
              break;
            case '0':
              console.log('\n' + uiI18n.t('menu.goodbye'));
              this.rl.close();
              return;
            default:
              console.log(uiI18n.t('menu.invalidChoice'));
              // Do not exit, just continue the loop
              continue;
          }
          
          // Pause before showing menu again
          await this.prompt('\nPress Enter to continue...');
        }
      } else {
        // Non-interactive mode without command
        await this.showStatus();
        this.rl.close();
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      this.rl.close();
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const manager = new I18nManager();
  manager.run();
}

module.exports = I18nManager;
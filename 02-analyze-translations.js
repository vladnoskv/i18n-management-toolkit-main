#!/usr/bin/env node
/**
 * I18N TRANSLATION ANALYSIS SCRIPT
 * 
 * This script analyzes translation files to identify missing translations,
 * inconsistencies, and provides detailed reports for each language.
 * 
 * Usage:
 *   node scripts/i18n/02-analyze-translations.js
 *   node scripts/i18n/02-analyze-translations.js --language=de
 *   node scripts/i18n/02-analyze-translations.js --source-dir=./src/i18n/locales
 *   node scripts/i18n/02-analyze-translations.js --output-reports
 */

const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_CONFIG = {
  sourceDir: './locales',
  sourceLanguage: 'en',
  notTranslatedMarker: '__NOT_TRANSLATED__',
  outputDir: './i18n-reports',
  excludeFiles: ['.DS_Store', 'Thumbs.db']
};

class I18nAnalyzer {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sourceDir = path.resolve(this.config.sourceDir);
    this.sourceLanguageDir = path.join(this.sourceDir, this.config.sourceLanguage);
    this.outputDir = path.resolve(this.config.outputDir);
  }

  // Parse command line arguments
  parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {};
    
    args.forEach(arg => {
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'language') {
          parsed.language = value;
        } else if (key === 'source-dir') {
          parsed.sourceDir = value;
        } else if (key === 'output-reports') {
          parsed.outputReports = true;
        } else if (key === 'output-dir') {
          parsed.outputDir = value;
        }
      }
    });
    
    return parsed;
  }

  // Get all available languages
  getAvailableLanguages() {
    if (!fs.existsSync(this.sourceDir)) {
      throw new Error(`Source directory not found: ${this.sourceDir}`);
    }
    
    return fs.readdirSync(this.sourceDir)
      .filter(item => {
        const itemPath = path.join(this.sourceDir, item);
        return fs.statSync(itemPath).isDirectory() && item !== this.config.sourceLanguage;
      });
  }

  // Get all JSON files from a language directory
  getLanguageFiles(language) {
    const languageDir = path.join(this.sourceDir, language);
    
    if (!fs.existsSync(languageDir)) {
      return [];
    }
    
    return fs.readdirSync(languageDir)
      .filter(file => {
        return file.endsWith('.json') && 
               !this.config.excludeFiles.includes(file);
      });
  }

  // Get all keys recursively from an object
  getAllKeys(obj, prefix = '') {
    const keys = new Set();
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.add(fullKey);
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedKeys = this.getAllKeys(value, fullKey);
        nestedKeys.forEach(k => keys.add(k));
      }
    }
    
    return keys;
  }

  // Get value by key path
  getValueByPath(obj, keyPath) {
    const keys = keyPath.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  // Analyze translation issues in an object
  analyzeTranslationIssues(obj, sourceObj = null, prefix = '') {
    const issues = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const sourceValue = sourceObj ? this.getValueByPath(sourceObj, fullKey) : null;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        issues.push(...this.analyzeTranslationIssues(value, sourceObj, fullKey));
      } else if (typeof value === 'string') {
        if (value === this.config.notTranslatedMarker) {
          issues.push({ 
            type: 'not_translated', 
            key: fullKey, 
            value, 
            sourceValue: sourceValue || 'N/A'
          });
        } else if (value === '') {
          issues.push({ 
            type: 'empty_value', 
            key: fullKey, 
            value, 
            sourceValue: sourceValue || 'N/A'
          });
        } else if (value.includes(this.config.notTranslatedMarker)) {
          issues.push({ 
            type: 'partial_translation', 
            key: fullKey, 
            value, 
            sourceValue: sourceValue || 'N/A'
          });
        } else if (sourceValue && value === sourceValue) {
          issues.push({ 
            type: 'same_as_source', 
            key: fullKey, 
            value, 
            sourceValue
          });
        }
      }
    }
    
    return issues;
  }

  // Get translation statistics for an object
  getTranslationStats(obj) {
    let total = 0;
    let translated = 0;
    let notTranslated = 0;
    let empty = 0;
    let partial = 0;
    
    const count = (item) => {
      if (typeof item === 'string') {
        total++;
        if (item === this.config.notTranslatedMarker) {
          notTranslated++;
        } else if (item === '') {
          empty++;
        } else if (item.includes(this.config.notTranslatedMarker)) {
          partial++;
        } else {
          translated++;
        }
      } else if (Array.isArray(item)) {
        item.forEach(count);
      } else if (item && typeof item === 'object') {
        Object.values(item).forEach(count);
      }
    };
    
    count(obj);
    
    return {
      total,
      translated,
      notTranslated,
      empty,
      partial,
      percentage: total > 0 ? Math.round((translated / total) * 100) : 0,
      missing: notTranslated + empty + partial
    };
  }

  // Check structural consistency between source and target
  checkStructuralConsistency(sourceObj, targetObj) {
    const sourceKeys = this.getAllKeys(sourceObj);
    const targetKeys = this.getAllKeys(targetObj);
    
    const missingKeys = [...sourceKeys].filter(key => !targetKeys.has(key));
    const extraKeys = [...targetKeys].filter(key => !sourceKeys.has(key));
    
    return {
      isConsistent: missingKeys.length === 0 && extraKeys.length === 0,
      missingKeys,
      extraKeys,
      sourceKeyCount: sourceKeys.size,
      targetKeyCount: targetKeys.size
    };
  }

  // Analyze a single language
  analyzeLanguage(language) {
    const languageDir = path.join(this.sourceDir, language);
    const sourceFiles = this.getLanguageFiles(this.config.sourceLanguage);
    const targetFiles = this.getLanguageFiles(language);
    
    const analysis = {
      language,
      files: {},
      summary: {
        totalFiles: sourceFiles.length,
        analyzedFiles: 0,
        totalKeys: 0,
        translatedKeys: 0,
        missingKeys: 0,
        issues: []
      }
    };
    
    for (const fileName of sourceFiles) {
      const sourceFilePath = path.join(this.sourceLanguageDir, fileName);
      const targetFilePath = path.join(languageDir, fileName);
      
      if (!fs.existsSync(sourceFilePath)) {
        continue;
      }
      
      let sourceContent, targetContent;
      
      try {
        sourceContent = JSON.parse(fs.readFileSync(sourceFilePath, 'utf8'));
      } catch (error) {
        analysis.files[fileName] = {
          error: `Failed to parse source file: ${error.message}`
        };
        continue;
      }
      
      if (!fs.existsSync(targetFilePath)) {
        analysis.files[fileName] = {
          status: 'missing',
          sourceKeys: this.getAllKeys(sourceContent).size
        };
        continue;
      }
      
      try {
        targetContent = JSON.parse(fs.readFileSync(targetFilePath, 'utf8'));
      } catch (error) {
        analysis.files[fileName] = {
          error: `Failed to parse target file: ${error.message}`
        };
        continue;
      }
      
      // Analyze this file
      const stats = this.getTranslationStats(targetContent);
      const structural = this.checkStructuralConsistency(sourceContent, targetContent);
      const issues = this.analyzeTranslationIssues(targetContent, sourceContent);
      
      analysis.files[fileName] = {
        status: 'analyzed',
        stats,
        structural,
        issues,
        sourceFilePath,
        targetFilePath
      };
      
      // Update summary
      analysis.summary.analyzedFiles++;
      analysis.summary.totalKeys += stats.total;
      analysis.summary.translatedKeys += stats.translated;
      analysis.summary.missingKeys += stats.missing;
      analysis.summary.issues.push(...issues);
    }
    
    // Calculate overall percentage
    analysis.summary.percentage = analysis.summary.totalKeys > 0 
      ? Math.round((analysis.summary.translatedKeys / analysis.summary.totalKeys) * 100) 
      : 0;
    
    return analysis;
  }

  // Generate detailed report for a language
  generateLanguageReport(analysis) {
    const { language } = analysis;
    const timestamp = new Date().toISOString();
    
    let report = `TRANSLATION ANALYSIS REPORT FOR ${language.toUpperCase()}\n`;
    report += `Generated: ${timestamp}\n`;
    report += `Status: ${analysis.summary.translatedKeys}/${analysis.summary.totalKeys} translated (${analysis.summary.percentage}%)\n`;
    report += `Files analyzed: ${analysis.summary.analyzedFiles}/${analysis.summary.totalFiles}\n`;
    report += `Keys needing translation: ${analysis.summary.missingKeys}\n\n`;
    
    // File-by-file breakdown
    report += `FILE BREAKDOWN:\n`;
    report += `${'='.repeat(50)}\n\n`;
    
    Object.entries(analysis.files).forEach(([fileName, fileData]) => {
      report += `📄 ${fileName}\n`;
      
      if (fileData.error) {
        report += `   ❌ Error: ${fileData.error}\n\n`;
        return;
      }
      
      if (fileData.status === 'missing') {
        report += `   ❌ Status: File missing\n`;
        report += `   📊 Source keys: ${fileData.sourceKeys}\n\n`;
        return;
      }
      
      const { stats, structural, issues } = fileData;
      
      report += `   📊 Translation: ${stats.translated}/${stats.total} (${stats.percentage}%)\n`;
      report += `   🏗️  Structure: ${structural.isConsistent ? 'Consistent' : 'Inconsistent'}\n`;
      
      if (!structural.isConsistent) {
        if (structural.missingKeys.length > 0) {
          report += `      Missing keys: ${structural.missingKeys.length}\n`;
        }
        if (structural.extraKeys.length > 0) {
          report += `      Extra keys: ${structural.extraKeys.length}\n`;
        }
      }
      
      if (issues.length > 0) {
        report += `   ⚠️  Issues: ${issues.length}\n`;
        
        const issueTypes = {
          not_translated: issues.filter(i => i.type === 'not_translated').length,
          empty_value: issues.filter(i => i.type === 'empty_value').length,
          partial_translation: issues.filter(i => i.type === 'partial_translation').length,
          same_as_source: issues.filter(i => i.type === 'same_as_source').length
        };
        
        Object.entries(issueTypes).forEach(([type, count]) => {
          if (count > 0) {
            report += `      ${type.replace('_', ' ')}: ${count}\n`;
          }
        });
      }
      
      report += `\n`;
    });
    
    // Keys needing translation
    const notTranslatedIssues = analysis.summary.issues.filter(issue => 
      issue.type === 'not_translated' || issue.type === 'empty_value'
    );
    
    if (notTranslatedIssues.length > 0) {
      report += `KEYS TO TRANSLATE:\n`;
      report += `${'='.repeat(50)}\n\n`;
      
      notTranslatedIssues.slice(0, 50).forEach(issue => {
        report += `Key: ${issue.key}\n`;
        report += `English: "${issue.sourceValue}"\n`;
        report += `${language}: [NEEDS TRANSLATION]\n\n`;
      });
      
      if (notTranslatedIssues.length > 50) {
        report += `... and ${notTranslatedIssues.length - 50} more keys\n\n`;
      }
    }
    
    return report;
  }

  // Save report to file
  saveReport(language, report) {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    const reportPath = path.join(this.outputDir, `analysis-${language}.txt`);
    fs.writeFileSync(reportPath, report, 'utf8');
    
    return reportPath;
  }

  // Main analysis process
  async analyze() {
    try {
      console.log('🔍 I18N TRANSLATION ANALYSIS');
      console.log('=' .repeat(60));
      
      // Parse command line arguments
      const args = this.parseArgs();
      if (args.sourceDir) {
        this.config.sourceDir = args.sourceDir;
        this.sourceDir = path.resolve(this.config.sourceDir);
        this.sourceLanguageDir = path.join(this.sourceDir, this.config.sourceLanguage);
      }
      if (args.outputDir) {
        this.config.outputDir = args.outputDir;
        this.outputDir = path.resolve(this.config.outputDir);
      }
      
      // Delete old reports if output directory exists
      if (fs.existsSync(this.outputDir)) {
        const oldReports = fs.readdirSync(this.outputDir)
          .filter(file => file.startsWith('analysis-') && file.endsWith('.txt'));
        
        if (oldReports.length > 0) {
          oldReports.forEach(report => {
            fs.unlinkSync(path.join(this.outputDir, report));
          });
          console.log(`🗑️  Deleted ${oldReports.length} old analysis report(s)`);
        }
      }
      
      console.log(`📁 Source directory: ${this.sourceDir}`);
      console.log(`🔤 Source language: ${this.config.sourceLanguage}`);
      
      // Get available languages
      const availableLanguages = this.getAvailableLanguages();
      
      if (availableLanguages.length === 0) {
        console.log('❌ No target languages found.');
        return;
      }
      
      // Filter languages if specified
      const targetLanguages = args.language 
        ? [args.language].filter(lang => availableLanguages.includes(lang))
        : availableLanguages;
      
      if (targetLanguages.length === 0) {
        console.log(`❌ Specified language '${args.language}' not found.`);
        return;
      }
      
      console.log(`🎯 Analyzing languages: ${targetLanguages.join(', ')}`);
      
      const results = {};
      
      // Analyze each language
      for (const language of targetLanguages) {
        console.log(`\n🔄 Analyzing ${language}...`);
        
        const analysis = this.analyzeLanguage(language);
        results[language] = analysis;
        
        // Display summary
        const { summary } = analysis;
        console.log(`   📄 Files: ${summary.analyzedFiles}/${summary.totalFiles}`);
        console.log(`   🔤 Keys: ${summary.translatedKeys}/${summary.totalKeys} (${summary.percentage}%)`);
        console.log(`   ⚠️  Missing: ${summary.missingKeys}`);
        console.log(`   🐛 Issues: ${summary.issues.length}`);
        
        // Generate and save report if requested
        if (args.outputReports) {
          const report = this.generateLanguageReport(analysis);
          const reportPath = this.saveReport(language, report);
          console.log(`   📄 Report saved: ${reportPath}`);
        }
      }
      
      // Overall summary
      console.log('\n' + '=' .repeat(60));
      console.log('📊 ANALYSIS SUMMARY');
      console.log('=' .repeat(60));
      
      const sortedResults = Object.entries(results)
        .sort(([,a], [,b]) => b.summary.percentage - a.summary.percentage);
      
      sortedResults.forEach(([language, analysis]) => {
        const { summary } = analysis;
        const statusIcon = summary.percentage === 100 ? '✅' : summary.percentage >= 80 ? '🟡' : '🔴';
        
        console.log(`${statusIcon} ${language.toUpperCase()}: ${summary.percentage}% complete`);
        console.log(`   📄 Files: ${summary.analyzedFiles}/${summary.totalFiles}`);
        console.log(`   🔤 Keys: ${summary.translatedKeys}/${summary.totalKeys}`);
        console.log(`   ⚠️  Missing: ${summary.missingKeys}`);
      });
      
      // Recommendations
      const totalMissing = Object.values(results)
        .reduce((sum, analysis) => sum + analysis.summary.missingKeys, 0);
      
      console.log('\n📋 RECOMMENDATIONS');
      console.log('=' .repeat(60));
      
      if (totalMissing === 0) {
        console.log('🎉 All translations are complete!');
      } else {
        console.log(`⚠️  ${totalMissing} total translations needed across all languages`);
        console.log('\n🔧 Next steps:');
        console.log('1. Review generated reports (if --output-reports was used)');
        console.log('2. Translate missing values in language files');
        console.log('3. Run: node scripts/i18n/03-validate-translations.js');
        
        // Suggest priority languages
        const priorityLanguages = sortedResults
          .filter(([, analysis]) => analysis.summary.percentage < 100)
          .slice(0, 3)
          .map(([lang]) => lang);
        
        if (priorityLanguages.length > 0) {
          console.log(`\n💡 Priority languages: ${priorityLanguages.join(', ')}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error during analysis:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const analyzer = new I18nAnalyzer();
  analyzer.analyze();
}

module.exports = I18nAnalyzer;
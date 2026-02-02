const fs = require('fs').promises;
const path = require('path');

/**
 * Skill validator implementing feedback loop pattern
 * Validates skills against Claude Skill authoring best practices
 */
class SkillValidator {
  constructor() {
    // Best practice limits
    this.maxSkillLines = 500;
    this.maxNameLength = 64;
    this.maxDescriptionLength = 1024;
    this.reservedWords = ['anthropic', 'claude'];
  }

  /**
   * Validate a skill and return issues with fix suggestions
   */
  async validateSkill(skillPath) {
    const issues = [];
    
    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      const parsed = this.parseSkillContent(content);
      
      // Run all validations
      issues.push(...this.validateFrontmatter(parsed.frontmatter, parsed.name, parsed.description));
      issues.push(...this.validateContent(content, parsed));
      issues.push(...this.validateStructure(parsed));
      issues.push(...this.validateConciseness(content, parsed));
      
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'FILE_ERROR',
        message: `Cannot read skill file: ${error.message}`,
        fix: 'Ensure the skill file exists and is readable'
      });
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      summary: this.generateSummary(issues)
    };
  }

  /**
   * Parse skill file content into components
   */
  parseSkillContent(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
    const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
    
    // Extract frontmatter fields
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    
    return {
      frontmatter,
      body,
      name: nameMatch ? nameMatch[1].trim() : '',
      description: descMatch ? descMatch[1].trim() : '',
      lines: content.split('\n').length
    };
  }

  /**
   * Validate YAML frontmatter
   */
  validateFrontmatter(frontmatter, name, description) {
    const issues = [];

    // Name validation
    if (!name) {
      issues.push({
        severity: 'error',
        code: 'MISSING_NAME',
        message: 'Skill must have a name field in frontmatter',
        fix: 'Add "name: your-skill-name" to the YAML frontmatter'
      });
    } else {
      if (name.length > this.maxNameLength) {
        issues.push({
          severity: 'error',
          code: 'NAME_TOO_LONG',
          message: `Name exceeds ${this.maxNameLength} characters (${name.length})`,
          fix: `Shorten the name to ${this.maxNameLength} characters or less`
        });
      }

      if (!/^[a-z0-9-]+$/.test(name)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_NAME_FORMAT',
          message: 'Name must contain only lowercase letters, numbers, and hyphens',
          fix: 'Use kebab-case with lowercase letters: "my-skill-name"'
        });
      }

      if (this.reservedWords.some(word => name.includes(word))) {
        issues.push({
          severity: 'error',
          code: 'RESERVED_WORD',
          message: `Name contains reserved word: ${this.reservedWords.find(w => name.includes(w))}`,
          fix: 'Remove "anthropic" or "claude" from the skill name'
        });
      }

      // Best practice: gerund form
      if (!this.isGerundForm(name)) {
        issues.push({
          severity: 'warning',
          code: 'NON_GERUND_NAME',
          message: 'Skill name should use gerund form (verb + -ing)',
          fix: 'Rename to gerund form: e.g., "avoiding-x" instead of "avoid-x"'
        });
      }
    }

    // Description validation
    if (!description) {
      issues.push({
        severity: 'error',
        code: 'MISSING_DESCRIPTION',
        message: 'Skill must have a description field in frontmatter',
        fix: 'Add "description: Your skill description" to the YAML frontmatter'
      });
    } else {
      if (description.length > this.maxDescriptionLength) {
        issues.push({
          severity: 'error',
          code: 'DESCRIPTION_TOO_LONG',
          message: `Description exceeds ${this.maxDescriptionLength} characters (${description.length})`,
          fix: `Shorten the description to ${this.maxDescriptionLength} characters or less`
        });
      }

      if (/<[^>]+>/.test(description)) {
        issues.push({
          severity: 'error',
          code: 'XML_IN_DESCRIPTION',
          message: 'Description cannot contain XML tags',
          fix: 'Remove any XML/HTML tags from the description'
        });
      }

      // Best practice: third person
      if (this.isFirstOrSecondPerson(description)) {
        issues.push({
          severity: 'warning',
          code: 'NON_THIRD_PERSON',
          message: 'Description should be written in third person',
          fix: 'Rewrite to third person: "Processes files..." not "I process files..." or "You can process..."'
        });
      }

      // Best practice: includes "when to use"
      if (!this.hasWhenToUse(description)) {
        issues.push({
          severity: 'warning',
          code: 'MISSING_WHEN_TO_USE',
          message: 'Description should include when to use the skill',
          fix: 'Add context: "...Use when working with X" or "Use for Y scenarios"'
        });
      }
    }

    return issues;
  }

  /**
   * Validate skill content
   */
  validateContent(content, parsed) {
    const issues = [];

    // Line count check
    if (parsed.lines > this.maxSkillLines) {
      issues.push({
        severity: 'warning',
        code: 'TOO_MANY_LINES',
        message: `Skill exceeds recommended ${this.maxSkillLines} lines (${parsed.lines})`,
        fix: 'Split content into separate reference files using progressive disclosure'
      });
    }

    // Check for time-sensitive info
    const timePatterns = [
      /before \w+ \d{4}/i,
      /after \w+ \d{4}/i,
      /starting \w+ \d{4}/i,
      /until \w+ \d{4}/i,
      /as of \d{4}/i
    ];
    
    for (const pattern of timePatterns) {
      if (pattern.test(content)) {
        issues.push({
          severity: 'warning',
          code: 'TIME_SENSITIVE_INFO',
          message: 'Content contains time-sensitive information',
          fix: 'Move time-sensitive info to an "old patterns" section or remove it'
        });
        break;
      }
    }

    // Check for Windows-style paths
    if (/[a-zA-Z]:\\|\\[a-zA-Z]+\\/.test(content)) {
      issues.push({
        severity: 'warning',
        code: 'WINDOWS_PATHS',
        message: 'Content contains Windows-style paths',
        fix: 'Use forward slashes for cross-platform compatibility'
      });
    }

    return issues;
  }

  /**
   * Validate skill structure
   */
  validateStructure(parsed) {
    const issues = [];
    const body = parsed.body;

    // Check for required sections
    if (!body.includes('## ')) {
      issues.push({
        severity: 'warning',
        code: 'NO_SECTIONS',
        message: 'Skill should have structured sections',
        fix: 'Add sections like "## Instructions", "## Examples"'
      });
    }

    // Check for deeply nested references
    const referenceMatches = body.match(/See \[.*?\]\(.*?\)/g) || [];
    const nestedRefs = referenceMatches.filter(ref => {
      const pathMatch = ref.match(/\(([^)]+)\)/);
      return pathMatch && pathMatch[1].includes('/') && pathMatch[1].split('/').length > 2;
    });

    if (nestedRefs.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'DEEPLY_NESTED_REFS',
        message: 'References should be one level deep from SKILL.md',
        fix: 'Keep all reference files directly accessible from SKILL.md'
      });
    }

    return issues;
  }

  /**
   * Validate conciseness
   */
  validateConciseness(content, parsed) {
    const issues = [];

    // Check for verbose patterns
    const verbosePatterns = [
      { pattern: /there are many (libraries|options|ways)/i, message: 'Avoid listing multiple options - provide a default' },
      { pattern: /first,? you('ll| will) need to/i, message: 'Remove step-by-step explanations of obvious actions' },
      { pattern: /this (is|means|allows)/i, count: 5, message: 'Excessive explanatory phrases detected' },
      { pattern: /\b(basically|essentially|simply|just)\b/gi, count: 3, message: 'Remove filler words' }
    ];

    for (const { pattern, count, message } of verbosePatterns) {
      const matches = content.match(pattern);
      const threshold = count || 1;
      if (matches && matches.length >= threshold) {
        issues.push({
          severity: 'info',
          code: 'VERBOSE_CONTENT',
          message: message,
          fix: 'Assume Claude already knows common patterns - be more concise'
        });
      }
    }

    // Check for excessive explanation of well-known concepts
    const commonConcepts = ['pdf', 'json', 'api', 'http', 'database', 'function', 'class'];
    for (const concept of commonConcepts) {
      const explainPattern = new RegExp(`${concept}[^.]*is a[^.]*that[^.]*\\.`, 'i');
      if (explainPattern.test(content)) {
        issues.push({
          severity: 'info',
          code: 'UNNECESSARY_EXPLANATION',
          message: `Unnecessary explanation of "${concept}" - Claude knows what it is`,
          fix: 'Remove explanations of well-known concepts'
        });
        break;
      }
    }

    return issues;
  }

  /**
   * Check if name uses gerund form
   */
  isGerundForm(name) {
    const parts = name.split('-');
    const firstWord = parts[0];
    return firstWord.endsWith('ing') || 
           ['setting-up', 'working-with'].some(g => name.startsWith(g));
  }

  /**
   * Check if text uses first or second person
   */
  isFirstOrSecondPerson(text) {
    const patterns = [
      /\bI\s+(can|will|help|am|have)\b/i,
      /\byou\s+(can|will|should|could|may|might|are|have)\b/i,
      /\bwe\s+(can|will|should|are|have)\b/i,
      /\bhelps? you\b/i
    ];
    return patterns.some(p => p.test(text));
  }

  /**
   * Check if description includes when to use
   */
  hasWhenToUse(text) {
    const patterns = [
      /\buse when\b/i,
      /\buse for\b/i,
      /\bwhen (working|dealing|processing|handling)\b/i,
      /\bfor (working|dealing|processing|handling)\b/i,
      /\bif (the user|you need|working)\b/i
    ];
    return patterns.some(p => p.test(text));
  }

  /**
   * Generate validation summary
   */
  generateSummary(issues) {
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const info = issues.filter(i => i.severity === 'info').length;

    if (errors === 0 && warnings === 0 && info === 0) {
      return 'Skill passes all validations';
    }

    const parts = [];
    if (errors > 0) parts.push(`${errors} error(s)`);
    if (warnings > 0) parts.push(`${warnings} warning(s)`);
    if (info > 0) parts.push(`${info} suggestion(s)`);

    return `Found ${parts.join(', ')}`;
  }

  /**
   * Validate all skills in a directory
   */
  async validateAllSkills(skillsDir) {
    const results = [];
    
    try {
      const domains = await this.getDirectories(skillsDir);
      
      for (const domain of domains) {
        const domainPath = path.join(skillsDir, domain);
        const categories = await this.getDirectories(domainPath);
        
        for (const category of categories) {
          const categoryPath = path.join(domainPath, category);
          const skillDirs = await this.getDirectories(categoryPath);
          
          for (const skillDir of skillDirs) {
            const skillPath = path.join(categoryPath, skillDir, 'SKILL.md');
            const result = await this.validateSkill(skillPath);
            results.push({
              path: skillPath,
              ...result
            });
          }
        }
      }
    } catch (error) {
      console.error('Error validating skills:', error);
    }

    return results;
  }

  /**
   * Get subdirectories
   */
  async getDirectories(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      return [];
    }
  }
}

module.exports = SkillValidator;

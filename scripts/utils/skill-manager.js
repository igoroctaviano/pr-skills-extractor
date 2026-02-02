const fs = require('fs').promises;
const path = require('path');

/**
 * Skill manager for organizing, deduplicating, and managing skill files
 */
class SkillManager {
  constructor(skillsDir = '.claude/skills') {
    this.skillsDir = skillsDir;
    this.similarityThreshold = 0.8;
  }

  /**
   * Get the path for a skill file based on domain and category
   */
  getSkillPath(domain, category, skillName) {
    return path.join(this.skillsDir, domain, category, skillName);
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Find similar existing skills
   */
  async findSimilarSkills(newSkill) {
    const existingSkills = await this.getAllSkills();
    const similar = [];

    for (const existing of existingSkills) {
      const similarity = this.calculateSimilarity(newSkill, existing);
      if (similarity >= this.similarityThreshold) {
        similar.push({ skill: existing, similarity });
      }
    }

    return similar.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate similarity between two skills (simple keyword-based)
   */
  calculateSimilarity(skill1, skill2) {
    // Compare titles, descriptions, and keywords
    const text1 = `${skill1.title} ${skill1.description} ${skill1.keywords?.join(' ') || ''}`.toLowerCase();
    const text2 = `${skill2.title} ${skill2.description} ${skill2.keywords?.join(' ') || ''}`.toLowerCase();

    // Simple word overlap similarity
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Get all existing skills
   */
  async getAllSkills() {
    const skills = [];
    
    try {
      await this.ensureDirectory(this.skillsDir);
      const domains = await this.getDirectories(this.skillsDir);

      for (const domain of domains) {
        const domainPath = path.join(this.skillsDir, domain);
        const categories = await this.getDirectories(domainPath);

        for (const category of categories) {
          const categoryPath = path.join(domainPath, category);
          const skillDirs = await this.getDirectories(categoryPath);

          for (const skillDir of skillDirs) {
            const skillPath = path.join(categoryPath, skillDir, 'SKILL.md');
            try {
              const content = await fs.readFile(skillPath, 'utf-8');
              const skill = this.parseSkillFile(content);
              skill.path = skillPath;
              skill.domain = domain;
              skill.category = category;
              skill.skillName = skillDir;
              skills.push(skill);
            } catch (error) {
              // Skip if file doesn't exist or can't be read
              console.warn(`Could not read skill file: ${skillPath}`, error.message);
            }
          }
        }
      }
    } catch (error) {
      // Directory might not exist yet
      if (error.code !== 'ENOENT') {
        console.error('Error reading skills:', error);
      }
    }

    return skills;
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
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Parse skill file to extract metadata
   */
  parseSkillFile(content) {
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const yaml = yamlMatch ? yamlMatch[1] : '';
    
    // Extract basic info from YAML
    const nameMatch = yaml.match(/name:\s*(.+)/);
    const descMatch = yaml.match(/description:\s*(.+)/);
    
    // Extract title from markdown
    const titleMatch = content.match(/^#\s+(.+)$/m);
    
    // Extract instructions
    const instructionsMatch = content.match(/## Instructions\n([\s\S]*?)(?=\n## |$)/);
    
    return {
      name: nameMatch ? nameMatch[1].trim() : '',
      description: descMatch ? descMatch[1].trim() : '',
      title: titleMatch ? titleMatch[1].trim() : '',
      instructions: instructionsMatch ? instructionsMatch[1].trim() : '',
      keywords: []
    };
  }

  /**
   * Merge two skills
   */
  mergeSkills(existingSkill, newSkill) {
    // Combine instructions
    const mergedInstructions = `${existingSkill.instructions}\n\n---\n\n${newSkill.instructions}`;
    
    // Combine keywords
    const mergedKeywords = [
      ...(existingSkill.keywords || []),
      ...(newSkill.keywords || [])
    ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

    // Use the more recent description if available
    const mergedDescription = newSkill.description || existingSkill.description;

    return {
      ...existingSkill,
      description: mergedDescription,
      instructions: mergedInstructions,
      keywords: mergedKeywords,
      // Add source information
      sources: [
        ...(existingSkill.sources || []),
        {
          pr: newSkill.source?.pr,
          author: newSkill.source?.author,
          date: newSkill.source?.date,
          file: newSkill.source?.file
        }
      ]
    };
  }

  /**
   * Normalize skill name (kebab-case, lowercase)
   * Uses gerund form (verb + -ing) as recommended by best practices
   * e.g., "avoid-direct-manipulation" -> "avoiding-direct-manipulation"
   */
  normalizeSkillName(name) {
    let normalized = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Convert to gerund form for action verbs (best practice)
    normalized = this.convertToGerundForm(normalized);
    
    // Enforce max 64 characters
    if (normalized.length > 64) {
      normalized = normalized.substring(0, 64).replace(/-$/, '');
    }

    return normalized;
  }

  /**
   * Convert action verbs to gerund form (-ing)
   * Best practice: gerund form clearly describes the activity
   */
  convertToGerundForm(name) {
    const verbMappings = {
      'avoid': 'avoiding',
      'prefer': 'preferring',
      'use': 'using',
      'implement': 'implementing',
      'handle': 'handling',
      'manage': 'managing',
      'process': 'processing',
      'validate': 'validating',
      'check': 'checking',
      'test': 'testing',
      'create': 'creating',
      'update': 'updating',
      'delete': 'deleting',
      'remove': 'removing',
      'add': 'adding',
      'fix': 'fixing',
      'optimize': 'optimizing',
      'refactor': 'refactoring',
      'extract': 'extracting',
      'configure': 'configuring',
      'setup': 'setting-up',
      'initialize': 'initializing'
    };

    for (const [verb, gerund] of Object.entries(verbMappings)) {
      if (name.startsWith(`${verb}-`)) {
        return name.replace(`${verb}-`, `${gerund}-`);
      }
    }
    return name;
  }

  /**
   * Determine domain from file path and content
   */
  detectDomain(filePath, content = '') {
    const lowerPath = filePath.toLowerCase();
    const lowerContent = content.toLowerCase();

    // Check for OHIF indicators
    if (lowerPath.includes('ohif') || 
        lowerPath.includes('viewer') ||
        lowerContent.includes('ohif') ||
        lowerContent.includes('viewerport')) {
      return 'ohif';
    }

    // Check for Cornerstone3D indicators
    if (lowerPath.includes('cornerstone') ||
        lowerPath.includes('cs3d') ||
        lowerContent.includes('cornerstone') ||
        lowerContent.includes('renderingengine')) {
      return 'cornerstone3d';
    }

    return 'general';
  }

  /**
   * Determine category folder name
   */
  getCategoryFolder(category) {
    if (category === 'anti-pattern') {
      return 'anti-patterns';
    } else if (category === 'best-practice') {
      return 'best-practices';
    }
    return 'general';
  }
}

module.exports = SkillManager;

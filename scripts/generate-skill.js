const fs = require('fs').promises;
const path = require('path');
const SkillManager = require('./utils/skill-manager');
const SkillValidator = require('./utils/skill-validator');

/**
 * Generate a skill file from processed comment data
 * Follows Claude Skill authoring best practices
 */
class SkillGenerator {
  constructor(skillsDir = '.claude/skills') {
    this.skillManager = new SkillManager(skillsDir);
    this.validator = new SkillValidator();
    this.maxSkillLines = 500;
  }

  /**
   * Generate or update a skill file
   * Implements validation feedback loop (best practice)
   */
  async generateSkill(skillData, sourceInfo) {
    const {
      category,
      skillName,
      title,
      description,
      instructions,
      antiPattern,
      bestPractice,
      badExample,
      goodExample,
      domain
    } = skillData;

    // Normalize skill name (now uses gerund form)
    const normalizedName = this.skillManager.normalizeSkillName(skillName);
    const categoryFolder = this.skillManager.getCategoryFolder(category);
    const detectedDomain = domain || 'general';

    // Check for similar skills
    const similarSkills = await this.skillManager.findSimilarSkills({
      title,
      description,
      keywords: skillData.keywords || []
    });

    let finalSkillData = { ...skillData };
    let skillPath;
    let skillDir;

    if (similarSkills.length > 0) {
      // Merge with most similar skill
      const mostSimilar = similarSkills[0].skill;
      finalSkillData = this.skillManager.mergeSkills(mostSimilar, {
        ...skillData,
        source: sourceInfo
      });
      skillPath = mostSimilar.path;
      skillDir = path.dirname(skillPath);
      console.log(`Merging with existing skill: ${skillPath}`);
    } else {
      // Create new skill
      skillDir = this.skillManager.getSkillPath(
        detectedDomain,
        categoryFolder,
        normalizedName
      );
      await this.skillManager.ensureDirectory(skillDir);
      skillPath = path.join(skillDir, 'SKILL.md');
      console.log(`Creating new skill: ${skillPath}`);
    }

    // Generate skill file content
    let content = this.buildSkillContent(finalSkillData, sourceInfo);

    // Check if content exceeds line limit - apply progressive disclosure
    const lineCount = content.split('\n').length;
    if (lineCount > this.maxSkillLines) {
      console.log(`Skill exceeds ${this.maxSkillLines} lines (${lineCount}), applying progressive disclosure...`);
      const { mainContent, referenceFiles } = await this.applyProgressiveDisclosure(
        finalSkillData,
        sourceInfo,
        skillDir
      );
      content = mainContent;
    }

    // Write skill file
    await fs.writeFile(skillPath, content, 'utf-8');
    
    // Validation feedback loop
    const validation = await this.validator.validateSkill(skillPath);
    if (!validation.valid) {
      console.warn(`Skill validation issues: ${validation.summary}`);
      validation.issues.forEach(issue => {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.warn(`  ${icon} [${issue.code}] ${issue.message}`);
        console.warn(`     Fix: ${issue.fix}`);
      });
    } else {
      console.log('✓ Skill passes validation');
    }
    
    return {
      path: skillPath,
      isNew: similarSkills.length === 0,
      merged: similarSkills.length > 0,
      validation
    };
  }

  /**
   * Apply progressive disclosure pattern for large skills
   * Splits content into main SKILL.md and reference files
   */
  async applyProgressiveDisclosure(skillData, sourceInfo, skillDir) {
    const referenceFiles = [];
    
    // Build main SKILL.md with overview and references
    const skillName = this.skillManager.normalizeSkillName(skillData.skillName || skillData.title);
    const domain = skillData.domain || 'general';
    
    let enhancedDescription = skillData.description || skillData.title;
    if (!this.hasWhenToUse(enhancedDescription)) {
      enhancedDescription = this.addWhenToUse(enhancedDescription, skillData.category, domain);
    }
    if (enhancedDescription.length > 1024) {
      enhancedDescription = enhancedDescription.substring(0, 1021) + '...';
    }

    // Main SKILL.md - overview with references
    let mainContent = `---
name: ${skillName}
description: ${enhancedDescription}
---

# ${skillData.title}

## Overview

${this.makeConcise(skillData.instructions)}

`;

    // Split examples into separate file if present
    if (skillData.badExample || skillData.goodExample) {
      const examplesContent = this.buildExamplesFile(skillData);
      const examplesPath = path.join(skillDir, 'EXAMPLES.md');
      await fs.writeFile(examplesPath, examplesContent, 'utf-8');
      referenceFiles.push(examplesPath);
      
      mainContent += `## Examples\n\nSee [EXAMPLES.md](EXAMPLES.md) for code examples.\n\n`;
    }

    // Split detailed guidance into separate file if category content is long
    const categoryContent = skillData.category === 'anti-pattern' ? skillData.antiPattern : skillData.bestPractice;
    if (categoryContent && categoryContent.length > 500) {
      const detailsContent = this.buildDetailsFile(skillData);
      const detailsPath = path.join(skillDir, 'DETAILS.md');
      await fs.writeFile(detailsPath, detailsContent, 'utf-8');
      referenceFiles.push(detailsPath);
      
      const sectionName = skillData.category === 'anti-pattern' ? 'Anti-Pattern Details' : 'Best Practice Details';
      mainContent += `## ${sectionName}\n\nSee [DETAILS.md](DETAILS.md) for detailed guidance.\n\n`;
    } else if (categoryContent) {
      // Include inline if short enough
      const sectionName = skillData.category === 'anti-pattern' ? 'Anti-Pattern' : 'Best Practice';
      mainContent += `## ${sectionName}\n\n${this.makeConcise(categoryContent)}\n\n`;
    }

    // Add source metadata as comment
    mainContent += this.buildSourceMetadata(sourceInfo, skillData.sources);

    return { mainContent, referenceFiles };
  }

  /**
   * Build examples reference file
   */
  buildExamplesFile(skillData) {
    let content = `# Examples\n\n`;
    
    if (skillData.badExample) {
      content += `## Bad Example\n\n\`\`\`\n${skillData.badExample.trim()}\n\`\`\`\n\n`;
    }
    
    if (skillData.goodExample) {
      content += `## Good Example\n\n\`\`\`\n${skillData.goodExample.trim()}\n\`\`\`\n\n`;
    }
    
    return content;
  }

  /**
   * Build details reference file
   */
  buildDetailsFile(skillData) {
    const sectionName = skillData.category === 'anti-pattern' ? 'Anti-Pattern' : 'Best Practice';
    const content = skillData.category === 'anti-pattern' ? skillData.antiPattern : skillData.bestPractice;
    
    return `# ${sectionName} Details\n\n${content}\n`;
  }

  /**
   * Build source metadata comment
   */
  buildSourceMetadata(sourceInfo, additionalSources) {
    let metadata = '\n<!--\n';
    metadata += 'Source Metadata:\n';
    if (sourceInfo?.pr) {
      metadata += `PR: #${sourceInfo.pr}\n`;
    }
    if (sourceInfo?.author) {
      metadata += `Author: @${sourceInfo.author}\n`;
    }
    if (sourceInfo?.date) {
      metadata += `Date: ${sourceInfo.date}\n`;
    }
    if (sourceInfo?.file) {
      metadata += `File: ${sourceInfo.file}\n`;
    }
    if (additionalSources && additionalSources.length > 0) {
      metadata += 'Additional sources:\n';
      additionalSources.forEach(source => {
        if (source.pr) {
          metadata += `  - PR #${source.pr} by @${source.author || 'unknown'}\n`;
        }
      });
    }
    metadata += '-->\n';
    return metadata;
  }

  /**
   * Build skill file content with YAML frontmatter
   * Follows best practices: concise, progressive disclosure, no time-sensitive info
   */
  buildSkillContent(skillData, sourceInfo) {
    const {
      title,
      description,
      instructions,
      antiPattern,
      bestPractice,
      badExample,
      goodExample,
      category
    } = skillData;

    const skillName = this.skillManager.normalizeSkillName(skillData.skillName || skillData.title);
    const domain = skillData.domain || 'general';

    // Build description with "when to use" context (best practice)
    let enhancedDescription = description || title;
    if (!this.hasWhenToUse(enhancedDescription)) {
      enhancedDescription = this.addWhenToUse(enhancedDescription, category, domain);
    }

    // Enforce description max length (1024 chars)
    if (enhancedDescription.length > 1024) {
      enhancedDescription = enhancedDescription.substring(0, 1021) + '...';
    }

    // Build YAML frontmatter (only required fields per best practices)
    const yaml = `---
name: ${skillName}
description: ${enhancedDescription}
---`;

    // Build markdown content - be concise!
    let markdown = `# ${title}\n\n`;

    // Add instructions (main content)
    markdown += `## Instructions\n\n`;
    markdown += `${this.makeConcise(instructions)}\n\n`;

    // Add anti-pattern or best practice section
    if (category === 'anti-pattern' && antiPattern) {
      markdown += `## Anti-Pattern\n\n`;
      markdown += `${this.makeConcise(antiPattern)}\n\n`;
    } else if (category === 'best-practice' && bestPractice) {
      markdown += `## Best Practice\n\n`;
      markdown += `${this.makeConcise(bestPractice)}\n\n`;
    }

    // Add examples - only if they provide value
    if (badExample || goodExample) {
      markdown += `## Examples\n\n`;
      
      if (badExample) {
        markdown += `### Bad\n\n`;
        markdown += `\`\`\`\n${badExample.trim()}\n\`\`\`\n\n`;
      }
      
      if (goodExample) {
        markdown += `### Good\n\n`;
        markdown += `\`\`\`\n${goodExample.trim()}\n\`\`\`\n\n`;
      }
    }

    // Source info in metadata format (not time-sensitive in main body)
    // Store as HTML comment to avoid cluttering skill but preserve attribution
    let metadata = '\n<!--\n';
    metadata += 'Source Metadata (not visible to Claude):\n';
    if (sourceInfo?.pr) {
      metadata += `PR: #${sourceInfo.pr}\n`;
    }
    if (sourceInfo?.author) {
      metadata += `Author: @${sourceInfo.author}\n`;
    }
    if (sourceInfo?.date) {
      metadata += `Date: ${sourceInfo.date}\n`;
    }
    if (sourceInfo?.file) {
      metadata += `File: ${sourceInfo.file}\n`;
    }
    if (skillData.sources && skillData.sources.length > 1) {
      metadata += 'Additional sources:\n';
      skillData.sources.slice(1).forEach(source => {
        if (source.pr) {
          metadata += `  - PR #${source.pr} by @${source.author || 'unknown'}\n`;
        }
      });
    }
    metadata += '-->\n';

    return `${yaml}\n\n${markdown}${metadata}`;
  }

  /**
   * Make content more concise (best practice)
   */
  makeConcise(text) {
    if (!text) return '';
    
    // Remove verbose phrases that Claude doesn't need
    let concise = text
      .replace(/\b(basically|essentially|simply|just)\b\s*/gi, '')
      .replace(/first,?\s*you('ll| will) need to\s*/gi, '')
      .replace(/there are many (options|ways|approaches) (to|for)\s*/gi, '')
      .replace(/this (is|means|allows)\s+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return concise;
  }

  /**
   * Check if description has "when to use" context
   */
  hasWhenToUse(text) {
    const patterns = [
      /\buse when\b/i,
      /\buse for\b/i,
      /\bwhen (working|dealing|processing|handling)\b/i
    ];
    return patterns.some(p => p.test(text));
  }

  /**
   * Add "when to use" context to description
   */
  addWhenToUse(description, category, domain) {
    const domainContext = domain !== 'general' ? ` in ${domain.toUpperCase()} codebase` : '';
    
    if (category === 'anti-pattern') {
      return `${description} Use when reviewing code${domainContext} to avoid this pattern.`;
    } else if (category === 'best-practice') {
      return `${description} Use when implementing similar functionality${domainContext}.`;
    }
    return description;
  }
}

module.exports = SkillGenerator;

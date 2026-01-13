const fs = require('fs').promises;
const path = require('path');
const SkillManager = require('./utils/skill-manager');

/**
 * Generate a skill file from processed comment data
 */
class SkillGenerator {
  constructor(skillsDir = '.claude/skills') {
    this.skillManager = new SkillManager(skillsDir);
  }

  /**
   * Generate or update a skill file
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

    // Normalize skill name
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

    if (similarSkills.length > 0) {
      // Merge with most similar skill
      const mostSimilar = similarSkills[0].skill;
      finalSkillData = this.skillManager.mergeSkills(mostSimilar, {
        ...skillData,
        source: sourceInfo
      });
      skillPath = mostSimilar.path;
      console.log(`Merging with existing skill: ${skillPath}`);
    } else {
      // Create new skill
      skillPath = this.skillManager.getSkillPath(
        detectedDomain,
        categoryFolder,
        normalizedName
      );
      await this.skillManager.ensureDirectory(skillPath);
      skillPath = path.join(skillPath, 'SKILL.md');
      console.log(`Creating new skill: ${skillPath}`);
    }

    // Generate skill file content
    const content = this.buildSkillContent(finalSkillData, sourceInfo);

    // Write skill file
    await fs.writeFile(skillPath, content, 'utf-8');
    
    return {
      path: skillPath,
      isNew: similarSkills.length === 0,
      merged: similarSkills.length > 0
    };
  }

  /**
   * Build skill file content with YAML frontmatter
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

    // Build YAML frontmatter
    const yaml = `---
name: ${skillName}
description: ${description || title}
allowed-tools: Read, Grep, Glob, Write, Edit
---`;

    // Build markdown content
    let markdown = `# ${title}\n\n`;

    // Add context/domain
    const domain = skillData.domain || 'general';
    markdown += `## Context\n\n`;
    markdown += `Domain: ${domain.charAt(0).toUpperCase() + domain.slice(1)}\n\n`;

    // Add instructions
    markdown += `## Instructions\n\n`;
    markdown += `${instructions}\n\n`;

    // Add anti-pattern or best practice section
    if (category === 'anti-pattern' && antiPattern) {
      markdown += `## Anti-Pattern\n\n`;
      markdown += `${antiPattern}\n\n`;
    } else if (category === 'best-practice' && bestPractice) {
      markdown += `## Best Practice\n\n`;
      markdown += `${bestPractice}\n\n`;
    }

    // Add examples
    if (badExample || goodExample) {
      markdown += `## Examples\n\n`;
      
      if (badExample) {
        markdown += `### ❌ Bad\n\n`;
        markdown += `\`\`\`\n${badExample}\n\`\`\`\n\n`;
      }
      
      if (goodExample) {
        markdown += `### ✅ Good\n\n`;
        markdown += `\`\`\`\n${goodExample}\n\`\`\`\n\n`;
      }
    }

    // Add source information
    if (sourceInfo) {
      markdown += `## Source\n\n`;
      if (sourceInfo.pr) {
        markdown += `- Extracted from PR #${sourceInfo.pr}`;
        if (sourceInfo.author) {
          markdown += ` by @${sourceInfo.author}`;
        }
        markdown += `\n`;
      }
      if (sourceInfo.file) {
        markdown += `- Related file: \`${sourceInfo.file}\`\n`;
      }
      if (sourceInfo.date) {
        markdown += `- Date: ${sourceInfo.date}\n`;
      }

      // Add merged sources if available
      if (skillData.sources && skillData.sources.length > 1) {
        markdown += `\n### Additional Sources\n\n`;
        skillData.sources.slice(1).forEach(source => {
          if (source.pr) {
            markdown += `- PR #${source.pr}`;
            if (source.author) {
              markdown += ` by @${source.author}`;
            }
            markdown += `\n`;
          }
        });
      }
    }

    return `${yaml}\n\n${markdown}`;
  }
}

module.exports = SkillGenerator;

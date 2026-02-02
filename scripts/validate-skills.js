#!/usr/bin/env node
const SkillValidator = require('./utils/skill-validator');

/**
 * CLI script to validate skills against best practices
 * Implements the validation feedback loop pattern
 * 
 * Usage:
 *   node scripts/validate-skills.js                    # Validate all skills
 *   node scripts/validate-skills.js path/to/SKILL.md  # Validate single skill
 */
async function main() {
  const args = process.argv.slice(2);
  const validator = new SkillValidator();
  
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Skill Validator - Best Practices       ║');
  console.log('╚════════════════════════════════════════════╝\n');

  if (args.length > 0) {
    // Validate single skill
    const skillPath = args[0];
    console.log(`Validating: ${skillPath}\n`);
    
    const result = await validator.validateSkill(skillPath);
    printResult(skillPath, result);
    
    process.exit(result.valid ? 0 : 1);
  } else {
    // Validate all skills
    const skillsDir = '.claude/skills';
    console.log(`Validating all skills in: ${skillsDir}\n`);
    
    const results = await validator.validateAllSkills(skillsDir);
    
    if (results.length === 0) {
      console.log('No skills found to validate.\n');
      process.exit(0);
    }

    let hasErrors = false;
    let totalIssues = { errors: 0, warnings: 0, info: 0 };
    
    for (const result of results) {
      printResult(result.path, result);
      
      if (!result.valid) hasErrors = true;
      result.issues.forEach(issue => {
        if (issue.severity === 'error') totalIssues.errors++;
        else if (issue.severity === 'warning') totalIssues.warnings++;
        else totalIssues.info++;
      });
    }

    // Print summary
    console.log('\n════════════════════════════════════════════');
    console.log('Summary');
    console.log('════════════════════════════════════════════');
    console.log(`Skills validated: ${results.length}`);
    console.log(`Valid skills: ${results.filter(r => r.valid).length}`);
    console.log(`Total errors: ${totalIssues.errors}`);
    console.log(`Total warnings: ${totalIssues.warnings}`);
    console.log(`Total suggestions: ${totalIssues.info}`);
    
    process.exit(hasErrors ? 1 : 0);
  }
}

function printResult(path, result) {
  const status = result.valid ? '✓ VALID' : '✗ INVALID';
  const statusColor = result.valid ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  console.log(`${statusColor}${status}${reset} ${path}`);
  
  if (result.issues.length > 0) {
    result.issues.forEach(issue => {
      const icon = issue.severity === 'error' ? '❌' : 
                   issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      const color = issue.severity === 'error' ? '\x1b[31m' : 
                    issue.severity === 'warning' ? '\x1b[33m' : '\x1b[36m';
      
      console.log(`  ${icon} ${color}[${issue.code}]${reset} ${issue.message}`);
      console.log(`     └─ Fix: ${issue.fix}`);
    });
  }
  console.log('');
}

// Run
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

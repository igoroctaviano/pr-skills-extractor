const fs = require('fs').promises;
const path = require('path');
const GitHubAPI = require('./utils/github-api');
const AIProcessor = require('./utils/ai-processor');
const SkillGenerator = require('./generate-skill');
const SkillManager = require('./utils/skill-manager');

/**
 * Main script to process PR comments and generate skills
 */
async function main() {
  try {
    // Load GitHub event data
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) {
      throw new Error('GITHUB_EVENT_PATH environment variable not set');
    }

    const eventData = JSON.parse(await fs.readFile(eventPath, 'utf-8'));
    
    // Check if this is a PR comment
    if (!eventData.issue?.pull_request) {
      console.log('Not a pull request comment, skipping...');
      process.exit(0);
    }

    // Extract comment data
    const comment = eventData.comment;
    const issue = eventData.issue;
    const repository = eventData.repository;

    if (!comment) {
      console.log('No comment found in event data');
      process.exit(0);
    }

    console.log(`Processing comment from @${comment.user.login} on PR #${issue.number}`);

    // Initialize components
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN environment variable not set');
    }

    const { owner, repo } = GitHubAPI.parseRepository(repository.full_name);
    const githubAPI = new GitHubAPI(githubToken, owner, repo);

    const cursorApiKey = process.env.CURSOR_API_KEY;
    const aiProcessor = new AIProcessor(cursorApiKey);

    const skillGenerator = new SkillGenerator();
    const skillManager = new SkillManager();

    // Get PR number
    const prNumber = issue.number;

    // Try to get the specific review comment (if it's a review comment)
    let diffHunk = '';
    let filePath = '';
    let commentId = comment.id;

    try {
      // Check if this is a review comment (has path and position)
      if (comment.path) {
        filePath = comment.path;
        // Try to get the review comment details
        try {
          const reviewComment = await githubAPI.getPRComment(commentId);
          diffHunk = reviewComment.diff_hunk || '';
          filePath = reviewComment.path || filePath;
        } catch (error) {
          console.warn('Could not fetch review comment details:', error.message);
        }
      } else {
        // Regular issue comment - try to get PR diff to find context
        console.log('Regular issue comment, attempting to extract context from PR...');
        try {
          const pr = await githubAPI.getPR(prNumber);
          // For regular comments, we'll use the comment body as context
          diffHunk = '';
        } catch (error) {
          console.warn('Could not fetch PR details:', error.message);
        }
      }
    } catch (error) {
      console.warn('Error fetching comment context:', error.message);
    }

    // Prepare comment data for AI processing
    const commentData = {
      body: comment.body,
      filePath: filePath,
      diffHunk: diffHunk,
      author: comment.user.login
    };

    // Process comment with AI
    console.log('Processing comment with AI...');
    const aiResult = await aiProcessor.processComment(commentData);

    // Check if we should create a skill
    if (aiResult.category === 'neutral' || aiResult.confidence < 0.3) {
      console.log(`Comment categorized as ${aiResult.category} with confidence ${aiResult.confidence}, skipping skill creation`);
      process.exit(0);
    }

    // Detect domain if not provided
    if (aiResult.domain === 'general') {
      aiResult.domain = skillManager.detectDomain(filePath, comment.body);
    }

    // Prepare source information
    const sourceInfo = {
      pr: prNumber,
      author: comment.user.login,
      date: new Date().toISOString().split('T')[0],
      file: filePath || 'N/A'
    };

    // Generate skill file
    console.log(`Generating skill: ${aiResult.skillName} (${aiResult.category})`);
    const result = await skillGenerator.generateSkill(aiResult, sourceInfo);

    if (result.isNew) {
      console.log(`✅ Created new skill: ${result.path}`);
    } else {
      console.log(`✅ Updated existing skill: ${result.path}`);
    }

    console.log('Skill extraction completed successfully');

  } catch (error) {
    console.error('Error processing comment:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };

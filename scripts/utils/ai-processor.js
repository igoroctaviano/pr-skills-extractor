const https = require('https');

/**
 * AI processor for categorizing comments and extracting insights
 */
class AIProcessor {
  constructor(apiKey, provider = 'cursor') {
    this.apiKey = apiKey;
    this.provider = provider;
  }

  /**
   * Categorize a comment and extract actionable insights
   */
  async processComment(commentData) {
    const { body, filePath, diffHunk, author } = commentData;

    const prompt = this.buildPrompt(body, filePath, diffHunk, author);
    
    try {
      const response = await this.callAI(prompt);
      return this.parseResponse(response);
    } catch (error) {
      console.error('AI processing error:', error);
      // Fallback to simple keyword-based categorization
      return this.fallbackCategorization(body);
    }
  }

  /**
   * Build the prompt for AI processing
   */
  buildPrompt(commentBody, filePath, diffHunk, author) {
    return `Analyze this code review comment and extract actionable knowledge:

Comment: "${commentBody}"
File: ${filePath}
Author: ${author}
Code Context:
\`\`\`
${diffHunk || 'No diff available'}
\`\`\`

Please categorize this comment and extract insights in the following JSON format:
{
  "category": "anti-pattern" | "best-practice" | "neutral",
  "confidence": 0.0-1.0,
  "skillName": "descriptive-kebab-case-name",
  "title": "Clear Skill Title",
  "description": "Brief description of the skill",
  "instructions": "Clear, actionable guidance extracted from the comment",
  "antiPattern": "What to avoid (if category is anti-pattern)",
  "bestPractice": "What to do (if category is best-practice)",
  "badExample": "Example of bad code if applicable",
  "goodExample": "Example of good code if applicable",
  "domain": "ohif" | "cornerstone3d" | "general",
  "keywords": ["keyword1", "keyword2"]
}

Only return valid JSON, no additional text.`;
  }

  /**
   * Call AI API (using Cursor API or OpenAI-compatible endpoint)
   */
  async callAI(prompt) {
    if (!this.apiKey) {
      throw new Error('AI API key not provided');
    }

    // Try Cursor API first, fallback to OpenAI-compatible
    try {
      return await this.callCursorAPI(prompt);
    } catch (error) {
      console.warn('Cursor API failed, trying OpenAI-compatible:', error.message);
      return await this.callOpenAICompatible(prompt);
    }
  }

  /**
   * Call Cursor API
   */
  async callCursorAPI(prompt) {
    // Cursor API endpoint (adjust if needed)
    const url = 'https://api.cursor.com/v1/chat/completions';
    
    return this.makeAPIRequest(url, {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing code review comments and extracting actionable knowledge for AI coding assistants.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  /**
   * Call OpenAI-compatible API
   */
  async callOpenAICompatible(prompt) {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    return this.makeAPIRequest(url, {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing code review comments and extracting actionable knowledge for AI coding assistants.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  /**
   * Make HTTP request to AI API
   */
  async makeAPIRequest(url, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const postData = JSON.stringify(body);

      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response = JSON.parse(data);
              const content = response.choices[0]?.message?.content || '';
              resolve(content);
            } catch (e) {
              reject(new Error(`Failed to parse AI response: ${e.message}`));
            }
          } else {
            reject(new Error(`AI API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Parse AI response JSON
   */
  parseResponse(responseText) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```')) {
        const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (match) {
          jsonText = match[1];
        }
      }

      const parsed = JSON.parse(jsonText);
      
      // Validate and set defaults
      return {
        category: parsed.category || 'neutral',
        confidence: parsed.confidence || 0.5,
        skillName: parsed.skillName || 'unknown-skill',
        title: parsed.title || 'Untitled Skill',
        description: parsed.description || '',
        instructions: parsed.instructions || '',
        antiPattern: parsed.antiPattern || '',
        bestPractice: parsed.bestPractice || '',
        badExample: parsed.badExample || '',
        goodExample: parsed.goodExample || '',
        domain: parsed.domain || 'general',
        keywords: parsed.keywords || []
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error('Invalid AI response format');
    }
  }

  /**
   * Fallback categorization using keyword matching
   */
  fallbackCategorization(commentBody) {
    const lowerBody = commentBody.toLowerCase();
    
    // Anti-pattern keywords
    const antiPatternKeywords = [
      'avoid', 'don\'t', "don't", 'never', 'should not', 'shouldn\'t', 
      'wrong', 'incorrect', 'bad', 'anti-pattern', 'antipattern',
      'problem', 'issue', 'bug', 'error', 'fix', 'remove'
    ];
    
    // Best practice keywords
    const bestPracticeKeywords = [
      'should', 'prefer', 'recommend', 'good', 'best', 'better',
      'correct', 'proper', 'use', 'implement', 'follow', 'pattern'
    ];

    const hasAntiPattern = antiPatternKeywords.some(kw => lowerBody.includes(kw));
    const hasBestPractice = bestPracticeKeywords.some(kw => lowerBody.includes(kw));

    let category = 'neutral';
    if (hasAntiPattern && !hasBestPractice) {
      category = 'anti-pattern';
    } else if (hasBestPractice && !hasAntiPattern) {
      category = 'best-practice';
    }

    // Generate a simple skill name from comment
    const words = commentBody.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 4);
    const skillName = words.join('-') || 'unknown-skill';

    return {
      category,
      confidence: 0.3,
      skillName,
      title: commentBody.substring(0, 50),
      description: commentBody.substring(0, 200),
      instructions: commentBody,
      antiPattern: category === 'anti-pattern' ? commentBody : '',
      bestPractice: category === 'best-practice' ? commentBody : '',
      badExample: '',
      goodExample: '',
      domain: 'general',
      keywords: words
    };
  }
}

module.exports = AIProcessor;

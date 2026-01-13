const https = require('https');
const { URL } = require('url');

/**
 * GitHub API client for fetching PR comments, diffs, and metadata
 */
class GitHubAPI {
  constructor(token, owner, repo) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.baseURL = 'https://api.github.com';
  }

  /**
   * Make a GitHub API request
   */
  async request(endpoint, options = {}) {
    const url = new URL(`${this.baseURL}${endpoint}`);
    
    const requestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'PR-Skills-Extractor',
        ...options.headers
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode} - ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      
      req.end();
    });
  }

  /**
   * Get PR review comments
   */
  async getPRComments(prNumber) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/comments`);
  }

  /**
   * Get a specific PR review comment by ID
   */
  async getPRComment(commentId) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/comments/${commentId}`);
  }

  /**
   * Get PR details
   */
  async getPR(prNumber) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}`);
  }

  /**
   * Get PR diff
   */
  async getPRDiff(prNumber) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}`, {
      headers: {
        'Accept': 'application/vnd.github.v3.diff'
      }
    });
  }

  /**
   * Get file content from a specific commit
   */
  async getFileContent(path, ref = 'main') {
    const encodedPath = encodeURIComponent(path);
    return this.request(`/repos/${this.owner}/${this.repo}/contents/${encodedPath}?ref=${ref}`);
  }

  /**
   * Parse repository owner and name from "owner/repo" string
   */
  static parseRepository(repoString) {
    const [owner, repo] = repoString.split('/');
    return { owner, repo };
  }
}

module.exports = GitHubAPI;

import { Octokit } from '@octokit/rest';
import express, { Request, Response } from 'express';
import type { 
  DiscordTokenResponse, 
  DiscordUser, 
  DiscordConnection, 
  ContributionResult,
  UserConnection,
  RoleConnectionMetadata
} from './types.js';

console.log('🚀 Starting Aspire Contributor verification app...');

const app = express();
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Store user tokens and metadata for re-verification
const userConnections = new Map<string, UserConnection>();

// Environment variables with type checking
const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/linked-role';
const PORT = process.env.PORT || 3000;

// Parse comma-separated repositories from environment variable
const REPOSITORIES_ENV = process.env.REPOSITORIES || 'dotnet/aspire,communitytoolkit/aspire';
const REPOSITORIES = REPOSITORIES_ENV.split(',').map(repo => repo.trim()).filter(repo => repo.length > 0);

if (REPOSITORIES.length === 0) {
  console.error('❌ Error: At least one repository must be specified in REPOSITORIES environment variable');
  console.error('❌ Format: "owner/repo1,owner/repo2,owner/repo3"');
  process.exit(1);
}

console.log(`📋 Checking repositories: ${REPOSITORIES.join(', ')}`);
console.log(`🔗 Client ID: ${CLIENT_ID ? 'Set' : 'Missing'}`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Function to check contributions across multiple repositories
async function checkContributionsToRepos(githubUsername: string, repositories: string[]): Promise<ContributionResult> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  for (const repo of repositories) {
    try {
      const [owner, repoName] = repo.split('/');
      if (!owner || !repoName) continue;
      
      let allCommits: any[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        try {
          const { data: commits } = await octokit.repos.listCommits({ 
            owner, 
            repo: repoName, 
            since: sixMonthsAgo.toISOString(),
            per_page: 100,
            page 
          });
          
          if (commits.length === 0) {
            hasMore = false;
          } else {
            allCommits.push(...commits);
            page++;
            if (commits.length < 100 || page > 20) {
              hasMore = false;
            }
          }
        } catch (error) {
          hasMore = false;
        }
      }
      
      // Check if user has contributed to this repository
      const hasContributedToThis = allCommits.some(commit => 
        commit.author?.login?.toLowerCase() === githubUsername.toLowerCase() ||
        commit.committer?.login?.toLowerCase() === githubUsername.toLowerCase()
      );
      
      if (hasContributedToThis) {
        return { hasContributed: true, contributedRepo: repo };
      }
      
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error checking ${repo}:`, error.message);
      }
    }
  }
  
  return { hasContributed: false, contributedRepo: null };
}

// Register the linked role with Discord
async function registerLinkedRole(): Promise<void> {
  console.log('🔧 Registering linked role metadata...');
  
  const response = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/role-connections/metadata`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        key: 'contributed_to_repos',
        name: 'Repository Contributor',
        description: `Has contributed to ${REPOSITORIES.join(' or ')} in the last 6 months`,
        type: 7, // BOOLEAN_EQUAL type
      },
    ]),
  });

  if (response.ok) {
    console.log('✅ Linked role metadata registered successfully');
  } else {
    const error = await response.text();
    console.error('❌ Failed to register linked role metadata:', error);
  }
}

app.get('/auth', (req: Request, res: Response) => {
  console.log(`🔍 Starting auth flow for repositories: ${REPOSITORIES.join(', ')}`);
  console.log(`🔧 Using REDIRECT_URI: ${REDIRECT_URI}`);
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=role_connections.write%20identify%20connections`;
  console.log(`🔗 Generated auth URL: ${authUrl}`);
  res.redirect(authUrl);
});

app.get('/linked-role', async (req: Request, res: Response) => {
  const { code } = req.query;
  console.log('🔗 Linked role callback triggered');
  console.log(`🔧 Current REDIRECT_URI: ${REDIRECT_URI}`);
  console.log(`📥 Received code: ${code ? 'present' : 'missing'}`);
  
  if (typeof code !== 'string') {
    console.log('❌ Invalid or missing authorization code');
    return res.send('❌ Invalid authorization code.');
  }
  
  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    
    console.log(`🔄 Token exchange response status: ${tokenResponse.status}`);
    const tokenData: DiscordTokenResponse = await tokenResponse.json();
    console.log(`📋 Token response data:`, tokenData);
    
    if (!tokenData.access_token) {
      console.error('❌ Failed to get access token. Full response:', tokenData);
      return res.send(`❌ Failed to authenticate with Discord. Error: ${JSON.stringify(tokenData)}`);
    }

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const userData: DiscordUser = await userResponse.json();

    const connectionsResponse = await fetch('https://discord.com/api/v10/users/@me/connections', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    
    const connections: DiscordConnection[] = await connectionsResponse.json();
    const githubConnection = connections.find(conn => conn.type === 'github' && conn.verified);
    
    let hasContributed = false;
    let githubUsername: string | null = null;
    let contributedRepo: string | null = null;

    if (githubConnection) {
      githubUsername = githubConnection.name;
      console.log(`✅ Found GitHub: ${githubUsername}`);
      
      const result = await checkContributionsToRepos(githubUsername, REPOSITORIES);
      hasContributed = result.hasContributed;
      contributedRepo = result.contributedRepo;
      
      if (hasContributed) {
        console.log(`✅ ${githubUsername} contributed to ${contributedRepo}`);
      } else {
        console.log(`❌ ${githubUsername} has no contributions to specified repositories`);
      }
    } else {
      console.log('❌ No verified GitHub connection found');
      // Return early with instructions for connecting GitHub
      return res.send(`
        <html>
          <head><title>Discord Linked Role - Connect GitHub</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; max-width: 600px; margin: 0 auto;">
            <h2>🔗 Connect Your GitHub Account</h2>
            <p>To verify your contributions, you need to connect your GitHub account to Discord first.</p>
            
            <div style="background: #f6f8fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left;">
              <h3>📋 Steps to Connect GitHub:</h3>
              <ol style="line-height: 1.6;">
                <li><strong>Open Discord Settings:</strong> Click the gear icon ⚙️ next to your username</li>
                <li><strong>Go to Connections:</strong> Find "Connections" in the left sidebar</li>
                <li><strong>Add GitHub:</strong> Click the GitHub icon and authorize the connection</li>
                <li><strong>Make it Public:</strong> Toggle "Display on profile" to ON (required for verification)</li>
                <li><strong>Try Again:</strong> Come back and use the verification link again</li>
              </ol>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              <strong>Note:</strong> Your GitHub connection must be public and verified for the bot to check your contributions.
            </p>
            
            <p style="margin-top: 30px;">
              <a href="/auth" style="background: #5865F2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                🔄 Try Verification Again
              </a>
            </p>
          </body>
        </html>
      `);
    }

    const updateResponse = await fetch(`https://discord.com/api/v10/users/@me/applications/${CLIENT_ID}/role-connection`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform_name: contributedRepo ? `${contributedRepo} Contributor` : 'Repository Contributor Check',
        platform_username: githubUsername || userData.username,
        metadata: { 
          contributed_to_repos: hasContributed 
        } satisfies RoleConnectionMetadata,
      }),
    });

    if (updateResponse.ok) {
      // Store user connection for periodic re-checks
      userConnections.set(userData.id, {
        token: tokenData.access_token,
        lastChecked: Date.now(),
        githubUsername: githubUsername || '',
        repositories: REPOSITORIES
      });
      
      if (hasContributed && githubUsername) {
        const repoList = REPOSITORIES.join(' or ');
        const contributedMsg = contributedRepo ? contributedRepo : `one of: ${repoList}`;
        res.send(`
          <html>
            <head><title>Discord Linked Role - Success</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2>✅ Success!</h2>
              <p><strong>${githubUsername}</strong> has contributed to ${contributedMsg}!</p>
              <p>Your Discord role has been updated. You can close this window.</p>
            </body>
          </html>
        `);
      } else {
        const repoList = REPOSITORIES.length === 1 ? REPOSITORIES[0] : REPOSITORIES.join(' or ');
        res.send(`
          <html>
            <head><title>Discord Linked Role - No Contributions</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2>❌ No contributions found</h2>
              <p>No contributions found for ${githubUsername} to ${repoList} in the last 6 months.</p>
            </body>
          </html>
        `);
      }
    } else {
      res.send(`
        <html>
          <head><title>Discord Linked Role - Error</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>❌ Error</h2>
            <p>Failed to update role connection.</p>
          </body>
        </html>
      `);
    }
    
  } catch (error) {
    console.error('OAuth2 error:', error);
    res.send(`
      <html>
        <head><title>Discord Linked Role - Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ Error</h2>
          <p>An error occurred during verification.</p>
      </html>
    `);
  }
});

// Function to re-check a user's contributions
async function recheckUserContributions(userId: string, userInfo: UserConnection): Promise<void> {
  try {
    const result = await checkContributionsToRepos(userInfo.githubUsername, REPOSITORIES);
    
    // Update their role connection
    const updateResponse = await fetch(`https://discord.com/api/v10/users/@me/applications/${CLIENT_ID}/role-connection`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${userInfo.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform_name: result.contributedRepo ? `${result.contributedRepo} Contributor` : 'Repository Contributor Check',
        platform_username: userInfo.githubUsername,
        metadata: { contributed_to_repos: result.hasContributed } satisfies RoleConnectionMetadata,
      }),
    });
    
    if (updateResponse.ok) {
      userConnections.set(userId, { ...userInfo, lastChecked: Date.now() });
    }
    
  } catch (error) {
    console.error(`Error re-checking ${userInfo.githubUsername}:`, error);
  }
}

// Periodic re-verification (every month)
async function periodicRecheck(): Promise<void> {
  for (const [userId, userInfo] of userConnections.entries()) {
    const daysSinceLastCheck = (Date.now() - userInfo.lastChecked) / (1000 * 60 * 60 * 24);
    
    if (daysSinceLastCheck >= 30) { // Re-check every 30 days (1 month)
      await recheckUserContributions(userId, userInfo);
      // Add delay between checks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('✅ Periodic re-check completed');
}

// Run periodic check every 24 hours (but only re-check users who haven't been checked in 30 days)
setInterval(periodicRecheck, 24 * 60 * 60 * 1000); // Every 24 hours

app.get('/', (req: Request, res: Response) => {
  const repoListHtml = REPOSITORIES.map(repo => `<li><strong>${repo}</strong></li>`).join('');
  const repoNames = REPOSITORIES.length === 1 ? 'repository' : 'repositories';
  
  res.send(`
    <h1>Repository Contributor Check</h1>
    <p>This app verifies contributions to specified GitHub repositories using Discord's Linked Roles.</p>
    
    <h3>Checked ${repoNames.charAt(0).toUpperCase() + repoNames.slice(1)}:</h3>
    <ul>
      ${repoListHtml}
    </ul>
    
    <p><em>You only need to have contributed to ${REPOSITORIES.length === 1 ? 'this repository' : 'ONE of these repositories'} in the last 6 months.</em></p>
    
    <a href="/auth">🔗 Verify Contributions</a>
  `);
});

app.listen(PORT, async () => {
  console.log(`🌐 Server listening on port ${PORT}`);
  console.log(`🔗 Visit http://localhost:${PORT} to get started`);
  await registerLinkedRole();
});

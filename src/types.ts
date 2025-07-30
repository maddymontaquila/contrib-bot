// Type definitions for our application
export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  verified?: boolean;
  email?: string;
}

export interface DiscordConnection {
  type: string;
  id: string;
  name: string;
  verified: boolean;
  friend_sync?: boolean;
  show_activity?: boolean;
  visibility?: number;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  author?: {
    login: string;
    id: number;
  };
  committer?: {
    login: string;
    id: number;
  };
}

export interface ContributionResult {
  hasContributed: boolean;
  contributedRepo: string | null;
}

export interface UserConnection {
  token: string;
  lastChecked: number;
  githubUsername: string;
  repositories: string[];
}

export interface RoleConnectionMetadata {
  contributed_to_repos: boolean;
}

export interface Environment {
  DISCORD_TOKEN: string;
  GITHUB_TOKEN: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  GUILD_ID: string;
  ROLE_ID: string;
  REPO_1: string;
  REPO_2?: string;
  REDIRECT_URI?: string;
}

export interface DiscordConnection {
  type: string;
  name: string;
  verified: boolean;
}

export interface ContributionResult {
  hasContributed: boolean;
  contributedRepo: string | null;
}

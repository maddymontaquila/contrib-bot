# Repository Contributor Checker - Linked Roles

A Discord Linked Roles application that verifies GitHub contributions to specified repositories. Users who have contributed to any of the configured repositories in the last 6 months can get an automatic role in Discord.

## Features

- **Discord Linked Roles**: Uses Discord's native linked role system
- **Configurable Repositories**: Check contributions to 1 or 2 repositories via environment variables
- **Recent Contributions**: Only counts contributions from the last 6 months
- **Automatic Re-verification**: Monthly checks to keep roles up-to-date
- **OAuth2 Integration**: Seamless GitHub connection through Discord

## Setup

### 1. Discord Application Setup

1. Go to <https://discord.com/developers/applications>
2. Create a new application
3. Go to "OAuth2" section and copy the Client ID and Client Secret
4. Add redirect URI: `http://localhost:3000/linked-role`
5. Go to "Bot" section and create a bot (for role metadata registration)
6. Copy the bot token for `DISCORD_TOKEN`

### 2. GitHub Personal Access Token

1. Go to <https://github.com/settings/personal-access-tokens/tokens>
2. Create a new fine-grained personal access token
3. Grant "Contents" read permission for public repositories
4. Copy the token for `GITHUB_TOKEN`

### 3. Discord Server Setup

1. Get your Discord server ID (`GUILD_ID`)
2. Create or identify the role ID you want to assign (`ROLE_ID`)

### 4. Environment Configuration

This application uses .NET Aspire parameters for configuration management instead of .env files. For detailed setup instructions, see the **[Parameter Configuration Guide](PARAMETER_SETUP.md)**.

**Quick Start:**

1. Run `aspire run` to start the application
2. Open the Aspire dashboard (URL shown in console)
3. Enter the required parameters when prompted
4. Use "Save to user secrets" for sensitive values

**Configuration Overview:**

- **Non-sensitive settings**: Stored in `ContribBot.AppHost/appsettings.json`
- **Sensitive settings**: Stored securely in .NET user secrets via Aspire dashboard

### 5. Install and Run

```bash
# Start the application with Aspire orchestration
aspire run
```

The Aspire AppHost will:

- Read configuration from appsettings.json and user secrets
- Automatically install npm dependencies  
- Start the Discord application with proper environment variables
- Provide a monitoring dashboard at the URL shown in console output

The app will start on `http://localhost:3000` and register the linked role metadata with Discord.

## Discord Linked Role setup

### For Server Admins

1. Set up a Discord role with "Linked Roles" requirement
2. Configure the role to require verification from this application and GitHub
3. Users will see "Connect" button in role requirements

### For Users

1. Navigate to the role in Discord server settings
2. Click "Connect" next to the Repository Contributor requirement
3. Authorize the application to check your GitHub connections
4. Discord automatically assigns the role if you've contributed to any configured repositories

### Manual Verification

Visit `http://localhost:3000` and click "Verify Contributions" to manually check your status.

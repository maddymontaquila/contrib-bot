using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

// Add Azure Container App Environment for cloud deployment
var cae = builder.AddAzureContainerAppEnvironment("contrib-bot-env");

// Add parameters for Discord bot configuration
// Non-sensitive parameters from appsettings.json
var redirectUri = builder.ExecutionContext.IsRunMode 
    ? builder.AddParameter("RedirectUri", "http://localhost:3000/linked-role")
    : builder.AddParameter("RedirectUri")
        .WithDescription(ParameterDescriptions.RedirectUri, enableMarkdown: true);

var repo1 = builder.AddParameter("Repo1")
    .WithDescription(ParameterDescriptions.Repo1, enableMarkdown: true);

var repo2 = builder.AddParameter("Repo2")
    .WithDescription(ParameterDescriptions.Repo2, enableMarkdown: true);

// Sensitive parameters from user secrets
var clientId = builder.AddParameter("ClientId", secret: true)
    .WithDescription(ParameterDescriptions.ClientId, enableMarkdown: true);

var clientSecret = builder.AddParameter("ClientSecret", secret: true)
    .WithDescription(ParameterDescriptions.ClientSecret, enableMarkdown: true);

var discordToken = builder.AddParameter("DiscordToken", secret: true)
    .WithDescription(ParameterDescriptions.DiscordToken, enableMarkdown: true);

var githubToken = builder.AddParameter("GithubToken", secret: true)
    .WithDescription(ParameterDescriptions.GithubToken, enableMarkdown: true);

var guildId = builder.AddParameter("GuildId")
    .WithDescription(ParameterDescriptions.GuildId, enableMarkdown: true);

var roleId = builder.AddParameter("RoleId")
    .WithDescription(ParameterDescriptions.RoleId, enableMarkdown: true);

// Add the TypeScript Discord bot as an npm application using CommunityToolkit
// This will automatically run npm install and use the start script from package.json
var discordBot = builder.AddNpmApp("contrib-verifier", "../")
    .WithNpmPackageInstallation()
    .WithHttpEndpoint(targetPort: 3000, name: "webhook")
    .WithExternalHttpEndpoints()
    .WithEnvironment("CLIENT_ID", clientId)
    .WithEnvironment("CLIENT_SECRET", clientSecret)
    .WithEnvironment("DISCORD_TOKEN", discordToken)
    .WithEnvironment("GITHUB_TOKEN", githubToken)
    .WithEnvironment("REDIRECT_URI", redirectUri)
    .WithEnvironment("REPO_1", repo1)
    .WithEnvironment("REPO_2", repo2)
    .WithEnvironment("GUILD_ID", guildId)
    .WithEnvironment("ROLE_ID", roleId)
    .WithEnvironment("PORT", "3000")
    .PublishAsDockerFile()
    .PublishAsAzureContainerApp((infra, app) =>
    {
        // Configure additional container app settings if needed
        // The app will automatically be deployed to the Azure Container App Environment
    });

builder.Build().Run();

static class ParameterDescriptions
{
    public const string RedirectUri = """
        **OAuth2 Redirect URI** for Discord authentication  
        This should match the redirect URI configured in your Discord application.  
        📋 **Format**: `https://your-domain.com/linked-role`
        """;

    public const string Repo1 = """
        **Primary repository** to check for contributions (required)  
        Format: `owner/repository-name` (e.g., `dotnet/aspire`)
        """;

    public const string Repo2 = """
        **Secondary repository** to check for contributions (optional)  
        Format: `owner/repository-name` or leave empty string `""` if not needed
        """;

    public const string ClientId = """
        **Discord Application Client ID**  
        1. Go to [Discord Developer Portal](https://discord.com/developers/applications)  
        2. Create a new application or select existing  
        3. Navigate to **OAuth2** section  
        4. Copy the **Client ID**
        """;

    public const string ClientSecret = """
        **Discord Application Client Secret**  
        1. Go to [Discord Developer Portal](https://discord.com/developers/applications)  
        2. Select your application  
        3. Navigate to **OAuth2** section  
        4. Click **Reset Secret** and copy the new secret  
        ⚠️ **Note**: Secret is only shown once, save it immediately
        """;

    public const string DiscordToken = """
        **Discord Bot Token**  
        1. Go to [Discord Developer Portal](https://discord.com/developers/applications)  
        2. Select your application  
        3. Navigate to **Bot** section  
        4. Click **Reset Token** and copy the bot token  
        5. Ensure bot has **applications.commands** scope enabled  
        ⚠️ **Note**: Token is only shown once, save it immediately
        """;

    public const string GithubToken = """
        **GitHub Personal Access Token**  
        1. Go to [GitHub Settings → Personal Access Tokens](https://github.com/settings/personal-access-tokens/tokens)  
        2. Click **Generate new token** → **Fine-grained personal access token**  
        3. Set expiration and select **Public Repositories (read)**  
        4. Under **Repository permissions**, grant **Contents: Read**  
        5. Click **Generate token** and copy the token  
        📋 **Required permissions**: Contents (read) for public repositories
        """;

    public const string GuildId = """
        **Discord Server (Guild) ID**  
        1. Enable **Developer Mode** in Discord (User Settings → Advanced → Developer Mode)  
        2. Right-click on your Discord server name  
        3. Click **Copy Server ID**  
        📋 **Format**: 18-19 digit number (e.g., `1361488941836140614`)
        """;

    public const string RoleId = """
        **Discord Role ID** for linked role assignment  
        1. Enable **Developer Mode** in Discord (User Settings → Advanced → Developer Mode)  
        2. Go to your Discord server → Server Settings → Roles  
        3. Right-click on the role you want to assign  
        4. Click **Copy Role ID**  
        📋 **Format**: 18-19 digit number (e.g., `1399874023743291482`)
        """;
}

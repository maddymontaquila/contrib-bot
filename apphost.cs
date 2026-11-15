#:sdk Aspire.AppHost.Sdk@13.6.5
#:package Aspire.Hosting.Azure.AppContainers@13.6.5
#:package Aspire.Hosting.JavaScript@13.6.5
#:property AspireUseCliBundle=true
#:property PublishAot=false

using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

// Add Azure Container App Environment for cloud deployment
builder.AddAzureContainerAppEnvironment("contrib-bot-env");

// Add parameters for Discord bot configuration
// Non-sensitive parameters from appsettings.json
var redirectUri = builder.AddParameter("RedirectUri")
    .WithDescription(ParameterDescriptions.RedirectUri, enableMarkdown: true);

var repositories = builder.AddParameter("Repositories")
    .WithDescription(ParameterDescriptions.Repositories, enableMarkdown: true);

// Aspire prompts for unresolved secrets and passes them to the bot.
var clientId = builder.AddParameter("ClientId", secret: true)
    .WithDescription(ParameterDescriptions.ClientId, enableMarkdown: true);

var clientSecret = builder.AddParameter("ClientSecret", secret: true)
    .WithDescription(ParameterDescriptions.ClientSecret, enableMarkdown: true);

var discordToken = builder.AddParameter("DiscordToken", secret: true)
    .WithDescription(ParameterDescriptions.DiscordToken, enableMarkdown: true);

var githubToken = builder.AddParameter("GithubToken", secret: true)
    .WithDescription(ParameterDescriptions.GithubToken, enableMarkdown: true);

builder.AddJavaScriptApp("contrib-verifier", ".")
    .WithNpm(installCommand: "ci")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("CLIENT_ID", clientId)
    .WithEnvironment("CLIENT_SECRET", clientSecret)
    .WithEnvironment("DISCORD_TOKEN", discordToken)
    .WithEnvironment("GITHUB_TOKEN", githubToken)
    .WithEnvironment("REDIRECT_URI", redirectUri)
    .WithEnvironment("REPOSITORIES", repositories)
    .PublishAsDockerFile()
    .PublishAsAzureContainerApp((infra, app) => { });

builder.Build().Run();

static class ParameterDescriptions
{
    public const string RedirectUri = """
        **OAuth2 Redirect URI** for Discord authentication  
        This should match the redirect URI configured in your Discord application.  
        📋 **Format**: `https://your-domain.com/linked-role`
        """;

    public const string Repositories = """
        **Repositories to check for contributions** (comma-separated list)  
        Format: `owner/repo1,owner/repo2,owner/repo3` (e.g., `microsoft/aspire,CommunityToolkit/Aspire,microsoft/aspire.dev,microsoft/aspire-samples`)
        📋 **Note**: At least one repository is required. Use commas to separate multiple repositories.
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

}

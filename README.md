# Repository Contributor Checker - Linked Roles

A Discord Linked Roles application that checks for commits authored by a user's verified GitHub account in **any** configured repository, at any time. Users authorize Discord once; the app writes the result to Discord's role-connection metadata, and Discord applies the role according to the linked-role requirement configured by the server administrator.

Verification is a one-time check. The app stores no tokens or user data, and Discord keeps the role metadata, so users never need to re-verify. Anyone without a match can verify again after contributing.

Default repositories:

- `microsoft/aspire`
- `CommunityToolkit/Aspire`
- `microsoft/aspire.dev`
- `microsoft/aspire-samples`

## Prerequisites

- Node.js **24 LTS**, npm, and the .NET **10 SDK**.
- Stable Aspire CLI **13.6.5** (matching the pinned AppHost SDK/integrations).
- For real verification: a Discord application and a GitHub token with **Contents: read** access to the repositories being checked. For public repositories, select public-repository access when creating a fine-grained token.
- No database or background worker is required.

## Try locally without credentials

For the landing page and simulated verification flow, only Node 24 and npm are needed:

```bash
npm ci
npm run preview
```

Open `http://localhost:3000`, select **Verify with Discord**, then choose a result: matching contribution, no matching commits, GitHub not connected, or provider unavailable. Return to the start to try another scenario. Callback state still expires and can only be used once.

The preview watches source changes. Refresh the browser after an edit.

The preview binds only to `127.0.0.1`, never reads real credentials, and makes no Discord or GitHub API calls. Every preview page has a visible simulation notice. It cannot grant a real role; `npm start` and `aspire run` always use real providers. Stop the preview with Ctrl+C before running Aspire, since both use port 3000.

If port 3000 is already in use, run `PORT=3001 npm run preview` on macOS/Linux and open `http://localhost:3001` instead.

To run automated, credential-free checks instead:

```bash
npm run build
npm test
```

## Discord setup

Use a separate Discord application and test server if you don't want local tests to affect your existing linked-role configuration.

1. Create/select an application in the Discord Developer Portal.
2. Copy its **Client ID**, **Client Secret**, and **Bot Token**.
3. Add `http://localhost:3000/linked-role` as an OAuth2 redirect URI.
4. Set the application's **Linked Roles Verification URL** to `http://localhost:3000/auth` for local testing.
5. Add the application to your test server. After the bot has started and registered its metadata, configure a role's Linked Roles requirement to use this application and require **Repository Contributor** to be true.

For a remotely accessible web app, use its HTTPS origin for both URLs and update `RedirectUri` to match the registered redirect exactly.

## Run the real bot with Aspire

The AppHost is the single root `apphost.cs`, with pinned `#:sdk` and `#:package` directives; there is no `.csproj`. `aspire.config.json` selects it. Non-sensitive defaults are in root `appsettings.json`. `Parameters:Repositories` accepts a comma-separated list of `owner/repository` names. `Parameters:RedirectUri` defaults to `http://localhost:3000/linked-role`. Guild/role IDs are not needed: Discord manages role assignment.

From the repository root:

```bash
aspire run
```

Aspire prompts for unresolved parameters in the CLI or dashboard. Enter the four values below and select **Save to user secret** in the dashboard if you want Aspire to remember them locally. All four are declared with `secret: true` in `apphost.cs`; do not add them to `appsettings.json`.

| Secret key | Value |
| --- | --- |
| `Parameters:ClientId` | Discord application ID |
| `Parameters:ClientSecret` | Discord OAuth2 client secret |
| `Parameters:DiscordToken` | Discord bot token |
| `Parameters:GithubToken` | GitHub read token |

Alternatively, Aspire 13.6.5 supports these explicit secret commands:

```bash
aspire secret set Parameters:ClientId "<discord-application-id>" --apphost apphost.cs
aspire secret set Parameters:ClientSecret "<discord-client-secret>" --apphost apphost.cs
aspire secret set Parameters:DiscordToken "<discord-bot-token>" --apphost apphost.cs
aspire secret set Parameters:GithubToken "<github-read-token>" --apphost apphost.cs
aspire run
```

Replace the placeholders locally. Prefer the dashboard's secret inputs to avoid putting values in shell history. `aspire secret path --apphost apphost.cs` shows where this AppHost's local secret store lives without printing its values. Moving the AppHost to a different checkout can select a different local store; use Aspire's prompts to configure that checkout.

Aspire installs dependencies using `npm ci`, starts the TypeScript app, and displays its dashboard URL. When `contrib-verifier` is running, visit `http://localhost:3000` and choose **Verify with Discord**. Connect GitHub under Discord Settings > Connections before authorizing. No separate GitHub OAuth callback is required.

After a matching commit is found, return to the test server and select its contributor linked role. Discord applies the role according to the server's requirements. This is a real role-connection update, unlike the preview. Commits are checked on each repository's default branch with no date cutoff.

The default dashboard profile uses HTTPS; its profiles are in `apphost.run.json`. `aspire run --launch-profile http` uses a local HTTP dashboard instead. Startup fails explicitly if required configuration or Discord metadata registration fails.

If the resource exits, inspect its logs in the Aspire dashboard. A Discord 401 usually means the bot token belongs to the wrong application or is invalid; an OAuth redirect error means the configured `RedirectUri` must exactly match the Developer Portal entry. GitHub permission/rate-limit failures leave role eligibility unchanged and show a retry page rather than a false negative.

## Build and regression checks

```bash
npm ci
npm run build
npm test
dotnet build apphost.cs --configuration Release
```

Tests use mocked Discord/GitHub responses. They do not update live roles. CI runs these checks and builds the container on pull requests; registry login/image publication occurs only outside pull-request events.

## Optional container

The Dockerfile builds on Node 24, and runs as the non-root `node` user. Set the web environment variables `CLIENT_ID`, `CLIENT_SECRET`, `DISCORD_TOKEN`, `GITHUB_TOKEN`, `REDIRECT_URI`, and `REPOSITORIES`. The container runs the real bot, not the preview, and excludes preview code. It is stateless; no volume is required. Container deployment is not provisioned by this refresh.

The UI uses the [official Aspire icon and palette](https://microsoft.github.io/aspire-brand/) (CC0 artwork) and locally served Poppins (OFL). Fonts and branding require no third-party requests.

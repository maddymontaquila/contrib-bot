targetScope = 'subscription'

param resourceGroupName string

param location string

param principalId string

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
}

module contrib_bot_env 'contrib-bot-env/contrib-bot-env.bicep' = {
  name: 'contrib-bot-env'
  scope: rg
  params: {
    location: location
    userPrincipalId: principalId
  }
}
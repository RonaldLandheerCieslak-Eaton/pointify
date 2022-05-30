const dotenv = require('dotenv')
const packageJson = require('./package.json')
const envResult = dotenv.config()

if (envResult.error) {
    console.error(`[WARNING] env failed to load: ${envResult.error}`)
}

function requireFromEnv(key) {
    if (!process.env[key]) {
        console.error(`[ERROR] Missing variable: ${key}`)
        return process.exit(1)
    }

    return process.env[key]
}

module.exports = {
    appName: packageJson.name,
    instanceUri: requireFromEnv('INSTANCE_URI'),
    teamProjects: JSON.parse(requireFromEnv('TEAM_PROJECTS')),
    accessToken: requireFromEnv('TEAM_ACCESS_TOKEN'),
    defaultPointsByDiscipline: JSON.parse(requireFromEnv('DEFAULT_POINTS_BY_TYPE')),
    defaultPointsByRelativeSize: JSON.parse(requireFromEnv('DEFAULT_POINTS_BY_RELATIVE_SIZE'))
}
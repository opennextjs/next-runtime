const parseNpmScript = require('@netlify/parse-npm-script')
// Does the build command include this value, either directly or via an npm script?
const usesBuildCommand = ({ build, scripts, command }) => {
  if (!build.command) return false

  if (build.command.includes(command)) {
    return true
  }

  if (!build.command.includes('npm run') && !build.command.includes('yarn')) {
    return false
  }
  // This resolves the npm script that is actually being run
  try {
    const { raw } = parseNpmScript({ scripts }, build.command)
    return raw.some((script) => script.includes(command))
  } catch (error) {
    console.error('There was an error parsing your build command', error)
  }
}

module.exports = usesBuildCommand

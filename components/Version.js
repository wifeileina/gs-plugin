import fs from 'fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const yunzaiVersion = packageJson.version
const isMiao = !!packageJson.dependencies.sequelize
const isTrss = !!Array.isArray(Bot.uin)
const protocol = ['chronocat', 'ICQQ']

let Version = {
  isMiao,
  isTrss,
  protocol,
  version: '1.0.0',
  yunzai: yunzaiVersion
}

export default Version

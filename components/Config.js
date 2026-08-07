import YAML from 'yaml'
import chokidar from 'chokidar'
import fs from 'node:fs'
import YamlReader from './YamlReader.js'
import cfg from '../../../lib/config/config.js'
import _ from 'lodash'
import { modifyWebSocket } from './WebSocket.js'

const Path = process.cwd()
const Plugin_Name = 'gs-plugin'
const Plugin_Path = `${Path}/plugins/${Plugin_Name}`

class Config {
  constructor () {
    this.config = {}
    this.oldConfig = {}
    this.watcher = { config: {}, defSet: {} }
    this.initCfg()
  }

  initCfg () {
    let path = `${Plugin_Path}/config/config/`
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    let pathDef = `${Plugin_Path}/config/default_config/`
    const files = fs.readdirSync(pathDef).filter(file => file.endsWith('.yaml'))
    for (let file of files) {
      if (!fs.existsSync(`${path}${file}`)) {
        fs.copyFileSync(`${pathDef}${file}`, `${path}${file}`)
      } else {
        const config = YAML.parse(fs.readFileSync(`${path}${file}`, 'utf8'))
        const defConfig = YAML.parse(fs.readFileSync(`${pathDef}${file}`, 'utf8'))
        const { differences, result } = this.mergeObjectsWithPriority(config, defConfig)
        if (differences) {
          fs.copyFileSync(`${pathDef}${file}`, `${path}${file}`)
          for (const key in result) {
            this.modify(file.replace('.yaml', ''), key, result[key])
          }
        }
      }
      this.watch(`${path}${file}`, file.replace('.yaml', ''), 'config')
    }
  }

  get bot () {
    return cfg.bot
  }

  get masterQQ () {
    return cfg.masterQQ
  }

  get master () {
    return cfg.master
  }

  get blackGroup () {
    return cfg.getOther().blackGroup
  }

  get whiteGroup () {
    return cfg.getOther().whiteGroup
  }

  get blackQQ () {
    return cfg.getOther().blackQQ
  }

  get heartbeatInterval () {
    return this.getDefOrConfig('gs-config').heartbeatInterval
  }

  get onlyReplyAt () {
    return this.getDefOrConfig('gs-config').onlyReplyAt
  }

  get gsuidBotPrefix () {
    return this.getDefOrConfig('gs-config').gsuidBotPrefix || {}
  }

  get servers () {
    return this.getDefOrConfig('gs-config').servers
  }

  get noMsgStart () {
    return this.getDefOrConfig('gs-config').noMsgStart
  }

  get noMsgInclude () {
    return this.getDefOrConfig('gs-config').noMsgInclude
  }

  get howToMaster () {
    return this.getDefOrConfig('gs-config').howToMaster
  }

  get disconnectToMaster () {
    return this.getDefOrConfig('gs-config').disconnectToMaster
  }

  get reconnectToMaster () {
    return this.getDefOrConfig('gs-config').reconnectToMaster
  }

  get firstconnectToMaster () {
    return this.getDefOrConfig('gs-config').firstconnectToMaster
  }

  get msgStoreTime () {
    return this.getDefOrConfig('gs-config').msgStoreTime
  }

  get noGroup () {
    return this.getDefOrConfig('gs-config').noGroup
  }

  get yesGroup () {
    return this.getDefOrConfig('gs-config').yesGroup
  }

  get muteStop () {
    return this.getDefOrConfig('gs-config').muteStop
  }

  get ignoreOnlyReplyAt () {
    return this.getDefOrConfig('gs-config').ignoreOnlyReplyAt
  }

  get tempMsgReport () {
    return this.getDefOrConfig('gs-config').tempMsgReport
  }

  get groupIntercept () {
    return this.getDefOrConfig('gs-config').groupIntercept || []
  }

  getDefOrConfig (name) {
    let def = this.getdefSet(name)
    let config = this.getConfig(name)
    return { ...def, ...config }
  }

  getdefSet (name) {
    return this.getYaml('default_config', name)
  }

  getConfig (name) {
    return this.getYaml('config', name)
  }

  getYaml (type, name) {
    let file = `${Plugin_Path}/config/${type}/${name}.yaml`
    let key = `${type}.${name}`
    if (this.config[key]) return this.config[key]
    this.config[key] = YAML.parse(fs.readFileSync(file, 'utf8'))
    this.watch(file, name, type)
    return this.config[key]
  }

  watch (file, name, type = 'default_config') {
    let key = `${type}.${name}`
    if (!this.oldConfig[key]) this.oldConfig[key] = _.cloneDeep(this.config[key])
    if (this.watcher[key]) return
    const watcher = chokidar.watch(file)
    watcher.on('change', async path => {
      delete this.config[key]
      if (typeof Bot == 'undefined') return
      logger.mark(`[gs-plugin][修改配置文件][${type}][${name}]`)
      if (name == 'gs-config') {
        const oldConfig = this.oldConfig[key]
        delete this.oldConfig[key]
        const newConfig = this.getYaml(type, name)
        const object = this.findDifference(oldConfig, newConfig)
        for (const key in object) {
          if (Object.hasOwnProperty.call(object, key)) {
            const value = object[key]
            const arr = key.split('.')
            if (arr[0] !== 'servers') continue
            let data = newConfig.servers[arr[1]]
            if (typeof data === 'undefined') data = oldConfig.servers[arr[1]]
            const target = {
              type: null,
              data
            }
            if (typeof value.newValue === 'object' && typeof value.oldValue === 'undefined') {
              target.type = 'add'
            } else if (typeof value.newValue === 'undefined' && typeof value.oldValue === 'object') {
              target.type = 'del'
            } else if (value.newValue === true && (value.oldValue === false || typeof value.oldValue === 'undefined')) {
              target.type = 'close'
            } else if (value.newValue === false && (value.oldValue === true || typeof value.oldValue === 'undefined')) {
              target.type = 'open'
            }
            await modifyWebSocket(target)
          }
        }
      }
    })
    this.watcher[key] = watcher
  }

  getCfg () {
    let gsconfig = this.getDefOrConfig('gs-config')
    return { ...gsconfig }
  }

  modify (name, key, value, type = 'config') {
    let path = `${Plugin_Path}/config/${type}/${name}.yaml`
    new YamlReader(path).set(key, value)
    this.oldConfig[key] = _.cloneDeep(this.config[key])
    delete this.config[`${type}.${name}`]
  }

  modifyarr (name, key, value, category = 'add', type = 'config') {
    let path = `${Plugin_Path}/config/${type}/${name}.yaml`
    let yaml = new YamlReader(path)
    if (category == 'add') {
      yaml.addIn(key, value)
    } else {
      let index = yaml.jsonData[key].indexOf(value)
      yaml.delete(`${key}.${index}`)
    }
  }

  setArr (name, key, item, value, type = 'config') {
    let path = `${Plugin_Path}/config/${type}/${name}.yaml`
    let yaml = new YamlReader(path)
    let arr = yaml.get(key).slice()
    arr[item] = value
    yaml.set(key, arr)
  }

  delServersArr (value, name = 'gs-config', type = 'config') {
    let path = `${Plugin_Path}/config/${type}/${name}.yaml`
    let yaml = new YamlReader(path)
    let key = 'servers'
    let index = yaml.jsonData[key].findIndex(item => item.name === value)
    yaml.delete(`${key}.${index}`)
  }

  findDifference (obj1, obj2, parentKey = '') {
    const result = {}
    for (const key in obj1) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key
      if (_.isObject(obj1[key]) && _.isObject(obj2[key])) {
        const diff = this.findDifference(obj1[key], obj2[key], fullKey)
        if (!_.isEmpty(diff)) {
          Object.assign(result, diff)
        }
      } else if (!_.isEqual(obj1[key], obj2[key])) {
        result[fullKey] = { oldValue: obj1[key], newValue: obj2[key] }
      }
    }
    for (const key in obj2) {
      if (!Object.prototype.hasOwnProperty.call(obj1, key)) {
        const fullKey = parentKey ? `${parentKey}.${key}` : key
        result[fullKey] = { oldValue: undefined, newValue: obj2[key] }
      }
    }
    return result
  }

  mergeObjectsWithPriority (objA, objB) {
    let differences = false
    function customizer (objValue, srcValue, key, object, source, stack) {
      if (_.isArray(objValue) && _.isArray(srcValue)) {
        return objValue
      } else if (_.isPlainObject(objValue) && _.isPlainObject(srcValue)) {
        if (!_.isEqual(objValue, srcValue)) {
          return _.mergeWith(_.cloneDeep(objValue), srcValue, customizer)
        }
      } else if (!_.isEqual(objValue, srcValue)) {
        differences = true
        return objValue !== undefined ? objValue : srcValue
      }
      return objValue !== undefined ? objValue : srcValue
    }
    let result = _.mergeWith(_.cloneDeep(objA), objB, customizer)
    return { differences, result }
  }
}

export default new Config()

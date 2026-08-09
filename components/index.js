import Version from './Version.js'
import YamlReader from './YamlReader.js'
import Config from './Config.js'
import { initWebSocket, createWebSocket, allSocketList, setAllSocketList, sendSocketList, clearWebSocket, modifyWebSocket, getBotList } from './WebSocket.js'

const Path = process.cwd()

export {
  Version,
  Path,
  YamlReader,
  Config,
  initWebSocket,
  clearWebSocket,
  createWebSocket,
  modifyWebSocket,
  allSocketList,
  setAllSocketList,
  sendSocketList,
  getBotList
}

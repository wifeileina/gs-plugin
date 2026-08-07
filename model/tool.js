import _ from 'lodash'
import fs from 'fs'
import { Version, Config } from '../components/index.js'
import { join } from 'path'
import { randomUUID } from 'crypto'
import schedule from 'node-schedule'

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const TMP_DIR = process.cwd() + '/plugins/gs-plugin/Temp'
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR)

schedule.scheduleJob('0 0 0 * * ?', function () {
  logger.mark('[gs-plugin] 执行定时任务: 删除Temp')
  try {
    const files = fs.readdirSync(TMP_DIR)
    for (const file of files) {
      fs.unlink(join(TMP_DIR, file), () => { })
    }
  } catch (error) { }
})

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

function decodeHtml (html) {
  let map = {
    '&amp;': '&',
    '&#91;': '[',
    '&#93;': ']',
    '&#44;': ','
  }
  for (let key in map) {
    const value = map[key]
    const regex = new RegExp(key, 'g')
    html = html.replace(regex, value)
  }
  return html
}

function deleteFolder (directoryPath, keepDirectory = false) {
  try {
    if (fs.existsSync(directoryPath)) {
      fs.readdirSync(directoryPath).forEach((file) => {
        const curPath = join(directoryPath, file)
        if (fs.lstatSync(curPath).isDirectory()) {
          deleteFolder(curPath)
        } else {
          try {
            fs.unlinkSync(curPath)
          } catch (error) {
            logger.error(`[gs-plugin] 删除文件失败: ${curPath}`, error)
          }
        }
      })
      if (!keepDirectory) {
        try {
          fs.rmdirSync(directoryPath)
        } catch (error) {
          logger.error(`[gs-plugin] 删除文件夹失败: ${directoryPath}`, error)
        }
      }
    }
  } catch (error) {
    logger.error('[gs-plugin] 删除文件失败', error)
  }
}

export {
  sleep,
  TMP_DIR,
  mimeTypes,
  decodeHtml,
  deleteFolder
}

import fs from 'fs'
import { join } from 'path'
import schedule from 'node-schedule'

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

export {
  TMP_DIR
}

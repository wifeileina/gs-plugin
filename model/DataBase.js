import { Config } from '../components/index.js'
import {
  saveMessage_id,
  existSQL,
  findUser_id,
  saveUser_id,
  findGroup_id,
  saveGroup_id
} from './db/index.js'

let latestMsg = {}

async function setMsg(value) {
  if (Array.isArray(value.message_id)) {
    value.message_id = value.message_id[0];
  }
  if (!value.seq) value.seq = Date.now();
  if (!value.rand) value.rand = Math.floor(Math.random() * 1000000);
  if (existSQL) {
    await saveMessage_id(value);
  } else {
    const EX = Config.msgStoreTime;
    if (EX > 0) {
      await redis.set(`Yz:gs-plugin:msg:${value.onebot_id || value.message_id}`, JSON.stringify(value), { EX });
      await redis.set(`Yz:gs-plugin:msg:${value.message_id}`, JSON.stringify(value), { EX });
    }
  }
}

function getLatestMsg (id) {
  const data = latestMsg[id]
  if (data && Math.floor(Date.now() / 1000) - data.time < 5 * 60) {
    return data
  }
  return null
}

function setLatestMsg (id, data) {
  latestMsg[id] = data
}

async function getUser_id (where) {
  if (where.user_id) {
    if (!isNaN(Number(where.user_id))) {
      return Number(where.user_id)
    }
    where.user_id = String(where.user_id)
  }
  let data = await findUser_id(where)
  if (!data) {
    if (where.user_id) {
      data = await saveUser_id(where.user_id)
    } else {
      return where.custom || where.id
    }
  }
  if (where.user_id) {
    return Number(data.custom) || data.id
  } else {
    return data.user_id
  }
}

async function getGroup_id (where) {
  if (where.group_id) {
    if (!isNaN(Number(where.group_id))) {
      return Number(where.group_id)
    }
    where.group_id = String(where.group_id)
  }
  let data = await findGroup_id(where)
  if (!data) {
    if (where.group_id) {
      data = await saveGroup_id(where.group_id)
    } else {
      return where.custom || where.id
    }
  }
  if (where.group_id) {
    return Number(data.custom) || data.id
  } else {
    return data.group_id
  }
}

export {
  setMsg,
  getLatestMsg,
  setLatestMsg,
  getUser_id,
  getGroup_id
}

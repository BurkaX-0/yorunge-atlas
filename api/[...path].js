import { randomBytes, randomUUID } from 'node:crypto'
import {
  HttpError, areFriends, cleanHandle, createSession, currentUser, jsonGet, jsonSet,
  publicUser, rateLimit, readBody, redis, requireFriend, requireUser, send, setSessionCookie,
  hashPassword, verifyPassword,
} from './_lib/store.js'

function routeParts(req) {
  return new URL(req.url, `https://${req.headers.host || 'localhost'}`).pathname.split('/').filter(Boolean).slice(1)
}

async function auth(req, res, action) {
  const body = await readBody(req)
  if (action === 'register') {
    await rateLimit(req, 'register', 5, 3600)
    const name = String(body.name || '').trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 40) throw new HttpError(400, 'Adın 2–40 karakter arasında olmalı.')
    const handle = cleanHandle(body.handle)
    const passwordHash = await hashPassword(body.password)
    const id = randomUUID()
    const user = { id, handle, name, passwordHash, createdAt: Date.now() }
    const reserved = await redis('SET', `handle:${handle}`, id, 'NX')
    if (reserved !== 'OK') throw new HttpError(409, 'Bu kullanıcı adı kullanımda. Başka bir ad dene.')
    await jsonSet(`user:${id}`, user)
    await createSession(user, req, res)
    return send(res, 201, { user: publicUser(user) })
  }
  if (action === 'login') {
    await rateLimit(req, 'login', 10, 300)
    const handle = cleanHandle(body.handle)
    const id = await redis('GET', `handle:${handle}`)
    const user = id ? await jsonGet(`user:${id}`) : null
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(401, 'Kullanıcı adı veya parola hatalı.')
    await createSession(user, req, res)
    return send(res, 200, { user: publicUser(user) })
  }
  if (action === 'logout') {
    const match = String(req.headers.cookie || '').match(/(?:^|;\s*)yorunge_session=([^;]+)/)
    if (match) await redis('DEL', `session:${decodeURIComponent(match[1])}`)
    setSessionCookie(req, res, '', 0)
    return send(res, 200, { ok: true })
  }
  if (action === 'me') {
    const user = await currentUser(req)
    return send(res, 200, { user: user ? publicUser(user) : null })
  }
  throw new HttpError(404, 'Adres bulunamadı.')
}

async function friends(req, res, user, action) {
  if (req.method === 'GET') {
    const ids = await redis('SMEMBERS', `friends:${user.id}`) || []
    const incoming = await redis('SMEMBERS', `requests:${user.id}`) || []
    const [friendsList, requests] = await Promise.all([
      Promise.all(ids.map(async id => {
        const friend = await jsonGet(`user:${id}`)
        const nudgedAt = await redis('GET', `nudge:${user.id}:${id}`)
        return friend ? { ...publicUser(friend), nudgedAt: nudgedAt ? Number(nudgedAt) : null } : null
      })),
      Promise.all(incoming.map(async id => {
        const requester = await jsonGet(`user:${id}`)
        return requester ? publicUser(requester) : null
      })),
    ])
    return send(res, 200, { friends: friendsList.filter(Boolean), requests: requests.filter(Boolean) })
  }
  const body = await readBody(req)
  if (action === 'request' && req.method === 'POST') {
    await rateLimit(req, `friend:${user.id}`, 20, 3600)
    const targetId = await redis('GET', `handle:${cleanHandle(body.handle)}`)
    if (!targetId) throw new HttpError(404, 'Bu kullanıcı adıyla hesap bulunamadı.')
    if (targetId === user.id) throw new HttpError(400, 'Kendine arkadaşlık isteği gönderemezsin 🙂')
    if (await areFriends(user.id, targetId)) throw new HttpError(409, 'Bu kişi zaten arkadaş listende.')
    if (await redis('GET', `request:${targetId}:${user.id}`) === 'pending') {
      await redis('DEL', `request:${targetId}:${user.id}`)
      await redis('SREM', `requests:${user.id}`, targetId)
      await redis('SADD', `friends:${user.id}`, targetId)
      await redis('SADD', `friends:${targetId}`, user.id)
      return send(res, 200, { ok: true, accepted: true })
    }
    const status = await redis('SET', `request:${user.id}:${targetId}`, 'pending', 'NX')
    if (status !== 'OK') throw new HttpError(409, 'Arkadaşlık isteği zaten gönderilmiş.')
    await redis('SADD', `requests:${targetId}`, user.id)
    return send(res, 201, { ok: true })
  }
  if (action === 'accept' && req.method === 'POST') {
    const fromId = String(body.userId || '')
    if (await redis('GET', `request:${fromId}:${user.id}`) !== 'pending') throw new HttpError(404, 'Bekleyen istek bulunamadı.')
    await redis('DEL', `request:${fromId}:${user.id}`)
    await redis('SREM', `requests:${user.id}`, fromId)
    await redis('SADD', `friends:${user.id}`, fromId)
    await redis('SADD', `friends:${fromId}`, user.id)
    return send(res, 200, { ok: true })
  }
  if (action === 'decline' && req.method === 'POST') {
    const fromId = String(body.userId || '')
    await redis('DEL', `request:${fromId}:${user.id}`)
    await redis('SREM', `requests:${user.id}`, fromId)
    return send(res, 200, { ok: true })
  }
  throw new HttpError(404, 'Arkadaş işlemi bulunamadı.')
}

async function nudge(req, res, user) {
  if (req.method !== 'POST') throw new HttpError(405, 'Bu yöntem desteklenmiyor.')
  const body = await readBody(req)
  const friend = await requireFriend(user, String(body.friendId || ''))
  await rateLimit(req, `nudge:${user.id}`, 30, 3600)
  await redis('SET', `nudge:${friend.id}:${user.id}`, String(Date.now()), 'EX', 86400)
  return send(res, 200, { ok: true })
}

async function messages(req, res, user) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
  if (req.method === 'GET') {
    const friend = await requireFriend(user, url.searchParams.get('with'))
    const key = `chat:${[user.id, friend.id].sort().join(':')}`
    const messages = await redis('LRANGE', key, 0, -1) || []
    return send(res, 200, { messages: messages.map(item => { try { return JSON.parse(item) } catch { return null } }).filter(Boolean) })
  }
  if (req.method === 'POST') {
    const body = await readBody(req)
    const friend = await requireFriend(user, String(body.friendId || ''))
    const text = String(body.text || '').trim()
    if (!text || text.length > 500) throw new HttpError(400, 'Mesaj 1–500 karakter arasında olmalı.')
    await rateLimit(req, `message:${user.id}`, 40, 60)
    const key = `chat:${[user.id, friend.id].sort().join(':')}`
    const message = { id: randomUUID(), from: user.id, text, time: Date.now() }
    await redis('RPUSH', key, JSON.stringify(message))
    await redis('LTRIM', key, -200, -1)
    return send(res, 201, { message })
  }
  throw new HttpError(405, 'Bu yöntem desteklenmiyor.')
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method === 'OPTIONS') return send(res, 204, {})
  try {
    const parts = routeParts(req)
    const [resource, action] = parts
    if (resource === 'auth') return await auth(req, res, action)
    if (resource === 'friends') {
      const user = await requireUser(req)
      return await friends(req, res, user, action)
    }
    if (resource === 'nudge') return await nudge(req, res, await requireUser(req))
    if (resource === 'messages') return await messages(req, res, await requireUser(req))
    return send(res, 404, { error: 'Adres bulunamadı.' })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return send(res, status, { error: status === 500 ? 'İstek tamamlanamadı. Sunucu ayarlarını kontrol et.' : error.message })
  }
}

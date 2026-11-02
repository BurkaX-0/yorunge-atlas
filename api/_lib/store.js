import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const UPSTASH_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const SESSION_SECONDS = 60 * 60 * 24 * 30

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export function send(res, status, body) {
  res.status(status).json(body)
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk; if (raw.length > 16384) reject(new HttpError(413, 'İstek çok büyük.')) })
    req.on('end', () => {
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new HttpError(400, 'Geçersiz istek.')) }
    })
    req.on('error', reject)
  })
}

export async function redis(...args) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new HttpError(503, 'Sunucu deposu henüz hazır değil. Vercel’de Upstash bağlantısını kontrol et.')
  const response = await fetch(`${UPSTASH_URL.replace(/\/$/, '')}/${args.map(value => encodeURIComponent(String(value))).join('/')}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  })
  const payload = await response.json()
  if (!response.ok || payload.error) throw new Error('Redis isteği başarısız oldu.')
  return payload.result
}

export async function jsonGet(key) {
  const value = await redis('GET', key)
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

export async function jsonSet(key, value) {
  return redis('SET', key, JSON.stringify(value))
}

export async function rateLimit(req, scope, max = 12, seconds = 60) {
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 64)
  const key = `rate:${scope}:${ip}`
  const count = Number(await redis('INCR', key))
  if (count === 1) await redis('EXPIRE', key, seconds)
  if (count > max) throw new HttpError(429, 'Çok sık deneme yapıldı. Bir dakika sonra yeniden dene.')
}

export function cleanHandle(value) {
  const handle = String(value || '').trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw new HttpError(400, 'Kullanıcı adı 3–24 karakter olmalı; harf, sayı ve _ kullanabilirsin.')
  return handle
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new HttpError(400, 'Parola en az 10, en fazla 128 karakter olmalı.')
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128 || typeof stored !== 'string') return false
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const hash = Buffer.from(hashHex, 'hex')
    const candidate = await scrypt(password, Buffer.from(saltHex, 'hex'), hash.length)
    return hash.length === candidate.length && timingSafeEqual(hash, candidate)
  } catch { return false }
}

function cookieValue(req, name) {
  const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : ''
}

export async function currentUser(req) {
  const token = cookieValue(req, 'yorunge_session')
  const userId = token ? await redis('GET', `session:${token}`) : null
  return userId ? jsonGet(`user:${userId}`) : null
}

export function setSessionCookie(req, res, token, maxAge = SESSION_SECONDS) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production'
  res.setHeader('Set-Cookie', `yorunge_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`)
}

export async function createSession(user, req, res) {
  const token = randomBytes(32).toString('base64url')
  await redis('SET', `session:${token}`, user.id, 'EX', SESSION_SECONDS)
  setSessionCookie(req, res, token)
}

export function publicUser(user) {
  return { id: user.id, handle: user.handle, name: user.name, createdAt: user.createdAt }
}

export async function requireUser(req) {
  const user = await currentUser(req)
  if (!user) throw new HttpError(401, 'Devam etmek için hesabına giriş yap.')
  return user
}

export async function areFriends(a, b) {
  return Boolean(await redis('SISMEMBER', `friends:${a}`, b))
}

export async function requireFriend(user, friendId) {
  if (!friendId || friendId === user.id || !(await areFriends(user.id, friendId))) throw new HttpError(403, 'Bu işlem yalnızca arkadaşlarınla kullanılabilir.')
  const friend = await jsonGet(`user:${friendId}`)
  if (!friend) throw new HttpError(404, 'Kullanıcı bulunamadı.')
  return friend
}

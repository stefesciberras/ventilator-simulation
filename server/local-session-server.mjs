import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const port = Number(process.env.EDUVENT_LOCAL_PORT || 4173)
const host = process.env.EDUVENT_LOCAL_HOST || '0.0.0.0'
const rooms = new Map()
const MAX_HISTORY = 256

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function roomFor(sessionKey) {
  const key = String(sessionKey || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(key)) return null
  let room = rooms.get(key)
  if (!room) {
    room = { key, sequence: 0, snapshot: null, history: [], clients: new Set(), instructor: null, runtimeMode: 'teaching' }
    rooms.set(key, room)
  }
  return room
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function publish(room, payload) {
  room.sequence += 1
  const envelope = { type: 'runtime', sequence: room.sequence, serverTime: Date.now(), payload }
  if (payload?.type === 'snapshot') room.snapshot = payload.snapshot
  room.history.push(envelope)
  if (room.history.length > MAX_HISTORY) room.history.splice(0, room.history.length - MAX_HISTORY)
  for (const client of room.clients) send(client, envelope)
}

function replay(room, socket, lastSequence) {
  const missing = room.history.filter((item) => item.sequence > lastSequence)
  if (missing.length && missing[0].sequence === lastSequence + 1) {
    for (const item of missing) send(socket, item)
    return
  }
  send(socket, { type: 'welcome', sequence: room.sequence, snapshot: room.snapshot, runtimeMode: room.runtimeMode })
}

function detach(socket) {
  const room = socket.eduventRoom
  if (!room) return
  room.clients.delete(socket)
  if (room.instructor === socket) room.instructor = null
  socket.eduventRoom = null
  if (!room.clients.size && !room.instructor) {
    setTimeout(() => {
      if (!room.clients.size && !room.instructor) rooms.delete(room.key)
    }, 30 * 60_000).unref?.()
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname === '/health' || url.pathname === '/eduvent-local-info') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true, service: 'eduvent-local-runtime', rooms: rooms.size, port }))
    return
  }

  if (!existsSync(root)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('EDUVENT has not been built yet. Run npm run build, then restart the local server.')
    return
  }

  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const safePath = normalize(pathname).replace(/^([.][.][/\\])+/, '')
  let filePath = join(root, safePath)
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end()
    return
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = join(root, 'index.html')
  const type = mime[extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, {
    'content-type': type,
    'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(res)
})

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname !== '/eduvent-session') {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

wss.on('connection', (socket) => {
  socket.isAlive = true
  socket.on('pong', () => { socket.isAlive = true })

  socket.on('message', (raw) => {
    let message
    try { message = JSON.parse(String(raw)) } catch { return }
    if (!message || typeof message !== 'object') return

    if (message.type === 'hello') {
      detach(socket)
      const room = roomFor(message.sessionKey)
      if (!room) {
        send(socket, { type: 'error', error: 'Invalid EDUVENT session key.' })
        socket.close(1008, 'Invalid session key')
        return
      }
      socket.eduventRoom = room
      socket.eduventRole = message.role === 'instructor' ? 'instructor' : 'candidate'
      socket.eduventClientId = String(message.clientId || '')
      room.clients.add(socket)
      if (socket.eduventRole === 'instructor') {
        room.instructor = socket
        room.runtimeMode = message.runtimeMode === 'simulation' ? 'simulation' : 'teaching'
      }
      const lastSequence = Math.max(0, Number(message.lastSequence || 0))
      replay(room, socket, lastSequence)
      return
    }

    const room = socket.eduventRoom
    if (!room) return
    if (message.type === 'publish') {
      const payload = message.payload
      if (!payload || (payload.type !== 'snapshot' && payload.type !== 'scenario-event' && payload.type !== 'command')) return

      const isAuthoritativeInstructor = socket.eduventRole === 'instructor' && room.instructor === socket
      const isSimulationCandidateCommand = socket.eduventRole === 'candidate' && room.runtimeMode === 'simulation' && payload.type === 'command'
      if (!isAuthoritativeInstructor && !isSimulationCandidateCommand) return

      // Candidates may request mutations in Simulation mode, but they may never
      // publish canonical snapshots or instructor/scenario events directly.
      if (socket.eduventRole === 'candidate' && payload.type !== 'command') return
      publish(room, payload)
      return
    }
    if (message.type === 'resync') replay(room, socket, Math.max(0, Number(message.lastSequence || 0)))
  })

  socket.on('close', () => detach(socket))
})

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate()
      continue
    }
    socket.isAlive = false
    socket.ping()
  }
}, 15_000)
heartbeat.unref?.()

server.listen(port, host, () => {
  console.log('\nloppjuSIM local session server is running.\n')
  console.log(`Instructor: http://localhost:${port}`)
  const interfaces = networkInterfaces()
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`Candidates: http://${address.address}:${port}`)
    }
  }
  console.log('\nKeep this terminal open during the session. Teaching keeps candidate runtimes independent; Simulation allows candidate commands into the instructor-authoritative shared runtime. Supabase remains available for authentication, persistence and cloud fallback.\n')
})

process.on('SIGINT', () => {
  clearInterval(heartbeat)
  for (const socket of wss.clients) socket.close(1001, 'Server shutting down')
  server.close(() => process.exit(0))
})

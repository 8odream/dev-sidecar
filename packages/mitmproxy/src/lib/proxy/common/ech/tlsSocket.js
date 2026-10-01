const net = require('node:net')
const { Duplex } = require('node:stream')
const { Tls13Session } = require('./tls13')

/**
 * 把纯 JS 的 TLS 1.3 会话包装成 net.Socket 风格的 Duplex，
 * 这样 Node 的 http/https 客户端可以直接在它上面收发 HTTP/1.1 报文。
 */

function bindSession ({ socket, rawSocket, session, info }) {
  session.on('data', (chunk) => {
    if (!socket.push(chunk)) {
      rawSocket.pause()
    }
  })
  session.on('end', () => {
    if (!socket.readableEnded) {
      socket.push(null)
    }
  })
  session.on('close', () => {
    if (!socket.destroyed) {
      socket.push(null)
    }
  })
  session.on('error', (error) => {
    if (!socket.destroyed) {
      socket.destroy(error)
    }
  })
  rawSocket.on('close', () => {
    if (!socket.destroyed) {
      socket.destroy()
    }
  })
  rawSocket.on('error', (error) => {
    if (!socket.destroyed) {
      socket.destroy(error)
    }
  })
  // 转发空闲超时：http 客户端和 agentkeepalive 都是监听包装后的socket上的'timeout'事件
  // （空闲连接到期回收、卡住的请求中断）。不转发的话，rawSocket上的定时器没有监听者，
  // 包装后的socket永远不会超时：被中间设备掐断的连接会一直留在连接池里，复用时请求要挂到
  // 对端RST才报错（表现为几十秒后 read ECONNRESET）。
  rawSocket.on('timeout', () => {
    if (!socket.destroyed) {
      socket.emit('timeout')
    }
  })
  socket.encrypted = true
  socket.servername = info.servername
  socket.alpnProtocol = info.alpnProtocol || false
  socket.authorized = info.authorized
  socket.authorizationError = info.authorizationError
  socket.echAccepted = info.echAccepted
  socket.getPeerCertificate = () => info.peerCertificate
  socket.getProtocol = () => info.protocol
  socket.getCipher = () => ({ name: info.cipherSuite, version: info.protocol })
  socket.getSession = () => Buffer.alloc(0)
  socket.isSessionReused = () => false
  socket.connecting = false
}

function createTlsSocket ({ rawSocket, session, info }) {
  const socket = new Duplex({
    read () {
      rawSocket.resume()
    },
    write (chunk, encoding, callback) {
      try {
        session.writeApp(chunk)
      } catch (e) {
        callback(e)
        return
      }
      if (rawSocket.writableNeedDrain) {
        rawSocket.once('drain', callback)
      } else {
        callback()
      }
    },
    final (callback) {
      session.closeNotify()
      callback()
    },
    destroy (error, callback) {
      session.destroy()
      if (!rawSocket.destroyed) {
        rawSocket.destroy()
      }
      callback(error)
    },
  })

  // http 客户端会调用这些 net.Socket 上的方法/属性
  socket.setNoDelay = () => socket
  socket.setKeepAlive = () => socket
  socket.ref = () => socket
  socket.unref = () => socket
  socket.setTimeout = (timeout, callback) => {
    if (callback) {
      socket.once('timeout', callback)
    }
    // agentkeepalive 会读 socket.timeout 判断是否需要重设超时
    socket.timeout = timeout
    rawSocket.setTimeout(timeout)
    return socket
  }
  socket.address = () => rawSocket.address()
  socket.remoteAddress = rawSocket.remoteAddress
  socket.remotePort = rawSocket.remotePort
  socket.remoteFamily = rawSocket.remoteFamily
  socket.localAddress = rawSocket.localAddress
  socket.localPort = rawSocket.localPort
  socket.bufferSize = 0

  bindSession({ socket, rawSocket, session, info })
  return socket
}

/**
 * 建立 TCP 连接并完成 TLS 1.3（可用 ECH）握手
 */
async function connectTls ({ host, port, servername, alpnProtocols, echConfig, rejectUnauthorized, ca, lookup, family, localAddress, timeout = 15000, connectTimeout = 10000 }) {
  const rawSocket = await new Promise((resolve, reject) => {
    const socket = net.connect({
      host,
      port,
      lookup,
      family,
      localAddress,
    })
    const timer = setTimeout(() => {
      socket.destroy(new Error(`连接超时(${connectTimeout}ms): ${host}:${port}`))
    }, connectTimeout)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.setNoDelay(true)
      resolve(socket)
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })

  const session = new Tls13Session({
    servername,
    alpnProtocols,
    echConfig,
    rejectUnauthorized,
    ca,
    timeout,
  })
  const info = await session.connect(rawSocket)
  return {
    socket: createTlsSocket({ rawSocket, session, info }),
    session,
    info,
  }
}

module.exports = {
  createTlsSocket,
  connectTls,
}

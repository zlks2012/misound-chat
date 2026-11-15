#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 80);
const ROOT = path.resolve(__dirname);
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OWNER_IP = '122.43.226.96';
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 443);
const CERT_DIR = path.join(ROOT, 'certs');
let tlsOptions = null;
try {
  const certificates = [
    {
      hostname: '0372api.top',
      key: fs.readFileSync(path.join(CERT_DIR, '0372api.top-key.pem')),
      cert: fs.readFileSync(path.join(CERT_DIR, '0372api.top-crt.pem')),
      ca: fs.readFileSync(path.join(CERT_DIR, '0372api.top-chain.pem'))
    },
    {
      hostname: 'zwj.76jh.com',
      key: fs.readFileSync(path.join(CERT_DIR, 'zwj.76jh.com-key.pem')),
      cert: fs.readFileSync(path.join(CERT_DIR, 'zwj.76jh.com-crt.pem')),
      ca: fs.readFileSync(path.join(CERT_DIR, 'zwj.76jh.com-chain.pem'))
    }
  ];
  tlsOptions = {
    SNICallback: (servername, callback) => {
      const name = String(servername || '').toLowerCase();
      const match = certificates.find(item => item.hostname === name);
      callback(null, require('tls').createSecureContext(match || certificates[0]));
    },
    ...certificates[0]
  };
} catch (_) {
  tlsOptions = null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const rooms = new Map();
const clients = new Map();
let clientSeq = 0;

function roomSnapshot(room) {
  const members = [...room.members.values()];
  const ghosts = members.filter(member => member.ghost).length;
  return {
    id: room.id,
    name: room.name,
    visibility: room.visibility,
    locked: room.locked,
    seats: room.seats.map(id => {
      const member = id ? room.members.get(id) : null;
      return member ? member.name : null;
    }),
    seatState: room.seatState,
    banned: [...room.banned],
    ghosts,
    count: room.members.size,
    bytes: room.bytes,
    music: { ...room.music },
    messages: room.messages.slice(-80)
  };
}

function publicRooms() {
  return [...rooms.values()]
    .filter(room => room.visibility === 'public')
    .slice(0, 6)
    .map(room => ({
      id: room.id,
      name: room.name,
      count: room.members.size,
      seats: room.seats.filter(Boolean).length
    }));
}

function sendRooms(client) {
  send(client, { type: 'rooms', rooms: publicRooms() });
}

function broadcastRooms() {
  const payload = { type: 'rooms', rooms: publicRooms() };
  for (const client of clients.values()) {
    send(client, payload);
  }
}

function broadcastRoom(room, exceptClientId) {
  const payload = {
    type: 'state',
    ...roomSnapshot(room),
    roles: [...room.members].reduce((result, [clientId, member]) => {
      result[clientId] = member.role;
      return result;
    }, {}),
    selfSeats: [...room.members].reduce((result, [clientId, member]) => {
      result[clientId] = member.seat;
      return result;
    }, {})
  };
  for (const [clientId, client] of clients) {
    if (room.members.has(clientId) && clientId !== exceptClientId) {
      send(client, { ...payload, selfId: clientId });
    }
  }
}

function systemMessage(room, text, kind) {
  const message = { type: kind || 'sys', who: '系统', text, at: Date.now() };
  room.messages.push(message);
  if (room.messages.length > 80) room.messages.splice(0, room.messages.length - 80);
  broadcastRoom(room);
}

function makeRoom(name, visibility, locked) {
  let id;
  do {
    id = String(1000 + Math.floor(Math.random() * 9000));
  } while (rooms.has(id));
  const room = {
    id,
    name: name.slice(0, 24),
    visibility,
    locked: !!locked,
    seats: new Array(8).fill(null),
    seatState: new Array(8).fill(null),
    members: new Map(),
    banned: new Set(),
    messages: [],
    bytes: 0,
    music: { index: 0, playing: false }
  };
  rooms.set(id, room);
  systemMessage(room, '房间已创建 · 消息仅在内存中流转，最后一人退出即销毁');
  return room;
}

function ensureDefaults() {
  const defaults = [
    ['深夜杂谈局', 'public', false],
    ['午夜点歌台', 'public', false],
    ['雨声自习室', 'public', false]
  ];
  defaults.forEach(([name, visibility, locked]) => makeRoom(name, visibility, locked));
}

function removeMember(client, reason) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  if (!room || !room.members.has(client.id)) return room;
  room.members.delete(client.id);
  if (client.seat >= 0) {
    room.seats[client.seat] = null;
    room.seatState[client.seat] = null;
    client.seat = -1;
  }
  const remaining = [...room.members.keys()];
  if (!remaining.length) {
    rooms.delete(room.id);
    client.roomId = null;
    broadcastRooms();
    return null;
  }
  if (room.ownerId === client.id) {
    room.ownerId = remaining[0];
    room.members.get(room.ownerId).role = 'owner';
    systemMessage(room, '房主已离开 · 房主已自动转让');
  } else {
    systemMessage(room, reason || '一位成员已离开');
  }
  client.roomId = null;
  broadcastRoom(room);
  broadcastRooms();
  return room;
}

function closeRoomByClient(client) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  if (!room) return reply(client, { type: 'error', message: '当前没有房间' });
  const member = room.members.get(client.id);
  const admin = client.admin || (member && member.role === 'owner');
  if (!admin) return reply(client, { type: 'error', message: '仅房主 / 管理员可关闭房间' });
  for (const [clientId] of room.members) {
    const target = clients.get(clientId);
    if (target) {
      target.roomId = null;
      target.seat = -1;
      send(target, { type: 'closed', message: '房间已销毁 · 临时身份与消息已清空' });
    }
  }
  rooms.delete(room.id);
  broadcastRooms();
}

function canManage(client, room) {
  const member = room.members.get(client.id);
  return client.admin || (member && member.role === 'owner');
}

function seatOwner(room, seat) {
  const clientId = room.seats[seat];
  return clientId ? room.members.get(clientId) : null;
}

function handleManage(client, action, seat) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  if (!room || !room.members.has(client.id)) return reply(client, { type: 'error', message: '请先进入房间' });
  if (!canManage(client, room)) return reply(client, { type: 'error', message: '仅房主 / 管理员可执行该操作' });

  if (action === 'mute' && seat >= 0 && seatOwner(room, seat)) {
    room.seatState[seat] = room.seatState[seat] === 'muted' ? 'on' : 'muted';
  } else if (action === 'ban' && seat >= 0 && seatOwner(room, seat)) {
    const target = seatOwner(room, seat);
    if (room.banned.has(target.id)) room.banned.delete(target.id);
    else room.banned.add(target.id);
  } else if ((action === 'down' || action === 'kick') && seat >= 0 && seatOwner(room, seat)) {
    const target = seatOwner(room, seat);
    room.seats[seat] = null;
    room.seatState[seat] = null;
    target.seat = -1;
    if (action === 'kick') {
      const targetClient = clients.get(target.id);
      if (targetClient) {
        removeMember(targetClient, '你已被房主 / 管理员移出房间');
        send(targetClient, { type: 'closed', message: '你已被移出房间 · 临时身份已清空' });
      }
    }
  } else if (action === 'transfer' && seat >= 0 && seatOwner(room, seat) && room.ownerId === client.id) {
    const target = seatOwner(room, seat);
    room.ownerId = target.id;
    target.role = 'owner';
    if (member) member.role = 'visitor';
    systemMessage(room, `房主已转让给 ${target.name}`);
  } else if (action === 'allmute') {
    room.seatState = room.seatState.map((state, index) => (room.seats[index] && index !== client.seat) ? 'muted' : state);
  } else if (action === 'alldown') {
    room.seats.forEach((id, index) => {
      if (id && id !== client.id) {
        room.seats[index] = null;
        room.seatState[index] = null;
        const target = room.members.get(id);
        if (target) target.seat = -1;
      }
    });
  } else if (action === 'lock') {
    room.locked = !room.locked;
    systemMessage(room, room.locked ? '麦位已锁定 · 上麦需先举手' : '麦位锁定已解除');
  } else if (action === 'visibility') {
    room.visibility = room.visibility === 'public' ? 'code' : room.visibility === 'code' ? 'hidden' : 'public';
    roomHead(room);
  } else if (action === 'ghostlist') {
    let removed = 0;
    for (const member of [...room.members.values()]) {
      if (member.ghost) {
        const target = clients.get(member.id);
        if (target) {
          removeMember(target, '隐身听众已被请出');
          send(target, { type: 'closed', message: '你已被请出房间' });
          removed++;
        }
      }
    }
    if (removed) broadcastRooms();
  } else if (action === 'banall') {
    for (const member of room.members.values()) {
      if (member.id !== client.id && member.seat >= 0) room.banned.add(member.id);
    }
  } else if (action === 'closeRoom') {
    return closeRoomByClient(client);
  }
  broadcastRoom(room);
  broadcastRooms();
}

function roomHead(room) {
  room.messages.push({ type: 'sys', who: '系统', text: '房间可见性已更新', at: Date.now() });
}

function joinRoom(client, data) {
  if (client.roomId && rooms.has(client.roomId)) removeMember(client, '一位成员切换了房间');
  let room = data.roomId ? rooms.get(String(data.roomId)) : null;
  if (!room) return reply(client, { type: 'error', message: '房间不存在或已销毁' });
  if (room.members.size >= 8) return reply(client, { type: 'error', message: '房间已满（8 人）' });
  if (room.visibility === 'hidden' && !data.create) return reply(client, { type: 'error', message: '这是隐身房间' });

  const name = String(data.name || '').trim().slice(0, 16) || '匿名旅人';
  const canGhost = client.ownerIp && !data.create;
  const isFirstMember = room.members.size === 0;
  const isRoomOwner = data.create || isFirstMember;
  const member = {
    id: client.id,
    name,
    role: isRoomOwner ? 'owner' : 'visitor',
    seat: -1,
    ghost: canGhost && !!data.ghost
  };
  room.members.set(client.id, member);
  client.roomId = room.id;
  client.seat = -1;
  if (isRoomOwner) {
    room.ownerId = client.id;
    if (data.create) {
      room.seats[0] = client.id;
      room.seatState[0] = 'on';
      client.seat = 0;
    }
  }
  send(client, { type: 'joined', selfId: client.id, ...roomSnapshot(room), role: member.role, selfSeat: client.seat });
  systemMessage(room, `${name} 进入了房间${member.role === 'owner' && !data.create ? ' · 已成为房主' : ''}`);
  broadcastRooms();
}

function createRoom(client, data) {
  if (!data.name || typeof data.name !== 'string') return reply(client, { type: 'error', message: '请填写房间名' });
  const room = makeRoom(data.name, ['public', 'code', 'hidden'].includes(data.visibility) ? data.visibility : 'public', !!data.locked);
  joinRoom(client, { ...data, roomId: room.id, create: true, ghost: false });
}

function handleMusic(client, data) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  const member = room && room.members.get(client.id);
  if (!room || !member) return reply(client, { type: 'error', message: '请先进入房间' });
  if (room.ownerId !== client.id) return reply(client, { type: 'error', message: '仅房主可控制电台' });
  if (data.action === 'toggle') room.music.playing = !room.music.playing;
  else if (data.action === 'next') room.music.index = (room.music.index + 1) % 3;
  else if (data.action === 'prev') room.music.index = (room.music.index + 2) % 3;
  else if (data.action === 'source') {
    const index = Number(data.index);
    if (index >= 0 && index < 3) room.music.index = index;
  }
  broadcastRoom(room);
}

function handleChat(client, text) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  const member = room && room.members.get(client.id);
  if (!room || !member) return reply(client, { type: 'error', message: '请先进入房间' });
  if (member.ghost) return reply(client, { type: 'error', message: '隐身状态仅可收听' });
  if (room.banned.has(client.id)) return reply(client, { type: 'error', message: '你已被禁止文字发言' });
  const clean = String(text || '').trim().slice(0, 200);
  if (!clean) return;
  room.messages.push({ type: 'other', who: member.name, text: clean, from: client.id, at: Date.now() });
  room.bytes += clean.length * 3 + 64;
  if (room.messages.length > 80) room.messages.splice(0, room.messages.length - 80);
  broadcastRoom(room);
}

function handleSeat(client, seat) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  const member = room && room.members.get(client.id);
  if (!room || !member) return;
  seat = Number(seat);
  if (!(seat >= 0 && seat < 8)) return;
  if (member.ghost) return reply(client, { type: 'error', message: '隐身状态不可上麦' });
  if (client.seat === seat) {
    room.seats[seat] = null;
    room.seatState[seat] = null;
    client.seat = -1;
  } else if (!room.seats[seat]) {
    if (room.locked && !client.hand) return reply(client, { type: 'error', message: '麦位已锁定 · 请先举手' });
    if (client.seat >= 0) {
      room.seats[client.seat] = null;
      room.seatState[client.seat] = null;
    }
    room.seats[seat] = client.id;
    room.seatState[seat] = 'on';
    client.seat = seat;
  } else {
    return;
  }
  send(client, { type: 'selfSeat', seat: client.seat });
  broadcastRoom(room);
}

function handleMessage(client, data) {
  if (!data || typeof data.type !== 'string') return;
  if (data.type === 'rooms') return sendRooms(client);
  if (data.type === 'admin') {
    client.admin = client.ownerIp && !!data.admin;
    const room = client.roomId ? rooms.get(client.roomId) : null;
    if (room && room.members.has(client.id)) {
      const member = room.members.get(client.id);
      member.role = client.admin ? 'admin' : (room.ownerId === client.id ? 'owner' : 'visitor');
      broadcastRoom(room);
    }
    return;
  }
  if (data.type === 'join') return joinRoom(client, data);
  if (data.type === 'create') return createRoom(client, data);
  if (data.type === 'chat') return handleChat(client, data.text);
  if (data.type === 'seat') return handleSeat(client, data.index);
  if (data.type === 'music') return handleMusic(client, data);
  if (data.type === 'hand') {
    client.hand = !!data.hand;
    return;
  }
  if (data.type === 'op') return handleManage(client, data.action, Number(data.seat));
  if (data.type === 'close') return closeRoomByClient(client);
  if (data.type === 'leave') {
    removeMember(client, '一位成员已离开房间');
    send(client, { type: 'closed', message: '房间已销毁 · 临时身份与消息已清空' });
  }
}

function reply(client, payload) {
  send(client, payload);
}

function safeFile(input) {
  const pathname = decodeURIComponent((input || '/').split('?')[0]);
  const requestPath = pathname;
  const relative = pathname === '/' ? '/index.html' : pathname;
  let resolved = path.normalize(path.join(ROOT, relative));
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    resolved = path.normalize(path.join(resolved, 'index.html'));
  }
  const rootWithSeparator = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (resolved === ROOT || resolved.startsWith(rootWithSeparator)) return resolved;
  console.log('static reject', JSON.stringify({ ROOT, requestPath, resolved, rootWithSeparator }));
  return null;
}

function requestPathname(input) {
  return decodeURIComponent((input || '/').split('?')[0]);
}

function serveStatic(req, res) {
  const filename = safeFile(req.url);
  const pathname = requestPathname(req.url);
  if (!filename) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  fs.readFile(filename, (error, data) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    let body = data;
    if (filename.endsWith(`${path.sep}index.html`) && !pathname.endsWith('.html')) {
      const directory = pathname.replace(/\/+$/, '');
      body = Buffer.from(data.toString('utf8').replace(
        /(href|src)="\.\/(?!\/)/g,
        directory ? `$1="../${directory.slice(1)}/` : '$1="./'
      ));
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(body);
  });
}

function send(client, object) {
  if (client.socket.destroyed) return;
  client.socket.write(encodeFrame(Buffer.from(JSON.stringify(object))));
}

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeFrame(payload) {
  const length = payload.length;
  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }
  if (length < 65536) {
    return Buffer.concat([Buffer.from([0x81, 126, length >> 8, length & 255]), payload]);
  }
  const high = Math.floor(length / 4294967296);
  const low = length >>> 0;
  return Buffer.concat([Buffer.from([0x81, 127, high, (length >> 24) & 255, (length >> 16) & 255, (length >> 8) & 255, low & 255]), payload]);
}

function parseFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 15;
    const masked = Boolean(second & 128);
    let length = second & 127;
    let offset = 2;
    if (length === 126) {
      if (client.buffer.length < 4) return;
      length = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (client.buffer.length < 10) return;
      length = Number(client.buffer.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLength = masked ? 4 : 0;
    if (client.buffer.length < offset + maskLength + length) return;
    let payload = client.buffer.slice(offset + maskLength, offset + maskLength + length);
    if (masked) {
      const mask = client.buffer.slice(offset, offset + 4);
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    client.buffer = client.buffer.slice(offset + maskLength + length);
    if (opcode === 8) {
      client.socket.end();
      return;
    }
    if (opcode === 9) {
      client.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
      continue;
    }
    if (opcode === 1) {
      try {
        handleMessage(client, JSON.parse(payload.toString('utf8')));
      } catch (_) {
        reply(client, { type: 'error', message: '消息格式错误' });
      }
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/.well-known/acme-challenge/')) {
    return serveStatic(req, res);
  }
  const host = (req.headers.host || '').split(':')[0];
  res.writeHead(301, { Location: `https://${host}${req.url}` });
  res.end();
});

let secureServer = null;
if (tlsOptions) {
  secureServer = https.createServer(tlsOptions, serveStatic);
  secureServer.on('upgrade', upgradeHandler);
}

function upgradeHandler(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    '', ''
  ].join('\r\n'));
  socket.setNoDelay(true);
  const client = {
    id: 'c' + (++clientSeq),
    socket,
    buffer: Buffer.alloc(0),
    admin: false,
    hand: false,
    seat: -1,
    roomId: null,
    ownerIp: req.socket.remoteAddress === `::ffff:${OWNER_IP}` || req.socket.remoteAddress === OWNER_IP
  };
  clients.set(client.id, client);
  socket.on('data', chunk => parseFrames(client, chunk));
  socket.on('close', () => {
    removeMember(client, '一位成员已断开');
    clients.delete(client.id);
  });
  socket.on('error', () => socket.destroy());
  sendRooms(client);

}

if (secureServer) {
  secureServer.listen(HTTPS_PORT, HOST, () => {
    console.log(`MISOUND secure server: https://${HOST}:${HTTPS_PORT}`);
  });
}

server.listen(PORT, HOST, () => {
  console.log(`MISOUND redirect server: http://${HOST}:${PORT}`);
});
ensureDefaults();

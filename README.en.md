# MISOUND

Languages: [简体中文](README.md) · [English](README.en.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [Русский](README.ru.md) · [Español](README.es.md)

MISOUND is an anonymous text-chat room website with realtime rooms, eight seat states, room-owner management, synchronized online radio, and per-listener volume control. This version uses only the Node.js standard library for HTTP, HTTPS, static files, and WebSocket service. It requires no database and no third-party runtime dependency.

## Live Site

- Primary domain: <https://0372api.top>
- Secondary domain: <https://zwj.76jh.com>
- Chat room: <https://0372api.top/prototype/>

## Features

- No registration or login; a random nickname is generated on entry.
- Realtime room list, room creation, joining, and leaving.
- Realtime text messages. The latest 80 messages remain in server memory.
- Eight synchronized seats with join, leave, mute, text-ban, kick, owner transfer, and room close.
- The first person entering an empty room becomes the owner; room creators are owners by default.
- The room owner controls radio play, pause, previous station, next station, and source selection.
- Every member has an independent local volume slider.
- Admin and invisible-entry controls are shown only to the configured authorized IP and are also enforced by the server.
- HTTP redirects to HTTPS, and WebSocket uses `wss://`.
- Multiple HTTPS domains are supported through SNI.

## Project Structure

```text
site-home/
  server.js              HTTP/HTTPS/WebSocket server and room logic
  index.html             Marketing home page
  prototype/index.html   Chat room application
  assets/                Icons and preview images
  certs/                 Local TLS certificates, excluded from Git
h5-prototype/            Interactive prototype backup
icon-assets/             Icon and design assets
deliverables/            Design screenshots
```

## Quick Start

Requirements:

- Node.js 18 or newer
- Root, administrator, or `CAP_NET_BIND_SERVICE` to bind ports 80/443
- A DNS A record pointing to the server IP
- TCP 80 and 443 open in the firewall and cloud security group

```bash
cd site-home
node server.js
```

Defaults:

- HTTP `0.0.0.0:80`
- HTTPS `0.0.0.0:443`

Environment variables:

```bash
HOST=0.0.0.0
PORT=80
HTTPS_PORT=443
```

If `certs/` is empty, HTTP still starts. With valid certificate files, HTTPS starts as well. Port 80 redirects to HTTPS, while `/.well-known/acme-challenge/` remains directly accessible for certificate renewal.

## TLS Certificates

`site-home/certs/` contains private keys in production and is excluded by `.gitignore`. Provide these files:

```text
certs/0372api.top-key.pem
certs/0372api.top-crt.pem
certs/0372api.top-chain.pem
certs/zwj.76jh.com-key.pem
certs/zwj.76jh.com-crt.pem
certs/zwj.76jh.com-chain.pem
```

Use an ACME client such as win-acme or Certbot. The server handles HTTP-01 renewal paths. Restart Node after certificate renewal.

To add another HTTPS domain, copy one entry in the `certificates` array and replace the hostname and certificate filenames.

## Admin and Invisible Entry

`OWNER_IP` in `server.js` is `122.43.226.96` by default. Only connections from this IP see the admin and invisible-entry switches, and the server rejects forged permission requests from other IPs.

```js
const OWNER_IP = 'YOUR_IP';
```

Behind NAT or a reverse proxy, `req.socket.remoteAddress` may be the proxy address. Parse `x-forwarded-for` only from a trusted proxy if that applies to your deployment.

## Room Rules

- A room holds up to 8 members.
- Public rooms appear in the realtime room list.
- A room creator becomes owner and takes seat 1.
- The first member entering an empty default room becomes owner.
- When the owner leaves, ownership transfers to a remaining member.
- Messages and room state live in memory and disappear after restart.

## Radio Rules

- The room owner can play, pause, and switch stations.
- The server synchronizes room radio state to all members.
- Volume affects only the listener's own browser.
- Streams come from SomaFM and SoundHelix. If autoplay is blocked, a listener should click the page once and the owner should play again.

## Deployment Checklist

1. Point a DNS A record to the server IP.
2. Open TCP 80/443 in the cloud security group.
3. Open TCP 80/443 in the server firewall.
4. Use a valid public TLS certificate.
5. Never commit `certs/`, private keys, or secret environment files.
6. Run the service with NSSM, pm2, systemd, or another supervisor.
7. Back up code and certificate renewal configuration.
8. Confirm local regulatory requirements, including ICP filing where applicable.

## Known Boundaries

- Voice is local capture and waveform preview only; multi-user voice requires WebRTC, ZEGO, or a similar realtime audio service.
- Rooms and messages are memory-only.
- Privacy copy is a product draft and should be reviewed before formal launch.
- IP-based admin authorization is lightweight and not suitable for complex multi-admin teams.

## License

MIT

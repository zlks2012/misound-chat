# MISOUND v1.0.0

First public release.

## Included

- Anonymous text chat with realtime rooms and eight synchronized seats.
- Room creation, joining, leaving, owner transfer, bans, kicks, mute, and room close.
- First person in an empty room becomes room owner.
- Owner-controlled synchronized online radio and per-listener local volume.
- IP-restricted admin and invisible-entry controls.
- HTTP/HTTPS server, HTTP-to-HTTPS redirect, ACME HTTP-01 path handling.
- WebSocket over `wss://`.
- Multi-domain HTTPS certificates through SNI.
- No database or third-party runtime dependency.

## Verified

- HTTPS `200` responses on both live domains.
- Valid TLS certificate chains on both domains.
- WebSocket `101 Switching Protocols`.
- Realtime default room list and room creation.
- Two-client permission test for owner radio control.

## Files

- `misound-chat-v1.0.0-full-source.zip`: full public source and design assets.
- `misound-chat-v1.0.0-site-deploy.zip`: deployment-ready site without TLS private keys.

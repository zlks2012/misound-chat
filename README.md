# 觅声 MISOUND

觅声是一个匿名文字聊天房网站，支持实时房间、8 个麦位状态、房主管理、在线电台同步和本地音量控制。当前版本使用 Node.js 标准库实现 HTTP、HTTPS、静态文件服务和 WebSocket，无需数据库或第三方运行时依赖。

## 在线地址

- 主域名：<https://0372api.top>
- 备用域名：<https://zwj.76jh.com>
- 聊天房：<https://0372api.top/prototype/>

## 功能

- 零注册、零登录，进入时生成随机昵称。
- 实时房间列表、创建房间、加入房间、退出房间。
- 文字消息实时同步，最多保留最近 80 条，均保存在服务进程内存中。
- 8 麦位状态同步，支持上麦、下麦、静音、禁言、踢出、转让房主和关闭房间。
- 空房间第一位进入者自动成为房主；创建房间者默认成为房主。
- 房主控制在线电台的播放、暂停、上一台、下一台和音源切换。
- 所有成员可调整自己浏览器里的电台音量。
- 管理员和隐身进房控制仅对配置的授权 IP 显示，服务端同时校验来源 IP。
- HTTP 自动跳转 HTTPS，WebSocket 使用 `wss://`。
- 通过 SNI 支持多个域名的 HTTPS 证书。

## 项目结构

```text
site-home/
  server.js              Node.js 服务端：HTTP/HTTPS/WebSocket/房间逻辑
  index.html             网站主页
  prototype/index.html   聊天房页面
  assets/                图标与预览图
  certs/                 本地 TLS 证书目录（不会提交到 Git）
h5-prototype/            交互原型备份
icon-assets/             图标与设计资产
deliverables/            设计稿截图
```

## 快速启动

要求：

- Node.js 18 或更高版本
- 如需使用 80/443 端口，Linux 下需 root/CAP_NET_BIND_SERVICE，Windows 下需管理员权限
- 域名 A 记录指向服务器公网 IP
- 防火墙和云安全组放行 TCP 80 与 443

启动：

```bash
cd site-home
node server.js
```

默认监听：

- HTTP `0.0.0.0:80`
- HTTPS `0.0.0.0:443`

可用环境变量：

```bash
HOST=0.0.0.0
PORT=80
HTTPS_PORT=443
```

如果 `certs/` 中没有可用证书，服务仍会启动 HTTP；配置证书后会同时启动 HTTPS。80 端口会自动 301 跳转到 HTTPS，但 `/.well-known/acme-challenge/` 保持在 HTTP 直接响应，方便证书续期。

## TLS 证书

生产目录 `site-home/certs/` 包含私钥，已在 `.gitignore` 中排除。部署时需要放置以下文件：

```text
certs/0372api.top-key.pem
certs/0372api.top-crt.pem
certs/0372api.top-chain.pem
certs/zwj.76jh.com-key.pem
certs/zwj.76jh.com-crt.pem
certs/zwj.76jh.com-chain.pem
```

推荐使用支持 ACME 的客户端签发证书，例如 win-acme 或 certbot。HTTP-01 验证路径已由 `server.js` 处理。证书续期后重启 Node 进程即可生效。

当前 `server.js` 通过 SNI 按域名选择证书；新增域名时复制 `certificates` 中的一项，替换 hostname 和证书文件名。

## 管理员与隐身权限

`server.js` 中的 `OWNER_IP` 默认为 `122.43.226.96`。只有来自该 IP 的连接会看到管理员权限和隐身进房开关，并且服务端会拒绝其他 IP 伪造的 WebSocket 权限请求。

修改授权 IP：

```js
const OWNER_IP = '你的IP';
```

注意：如果服务器位于 NAT 或反向代理后，`req.socket.remoteAddress` 可能是代理地址，需要改为解析 `x-forwarded-for` 并只信任受信代理。

## 房间规则

- 普通房间最多 8 人。
- 公开房间会出现在首页实时房间列表。
- 创建者自动成为房主并占用 1 号麦位。
- 空房间第一位进入者自动成为房主，但不强制上麦。
- 房主离开后自动转让给房间内剩余成员。
- 房间内消息和状态只保存在内存，服务重启后清空。

## 电台规则

- 房主可播放、暂停、切换电台。
- 服务器保存房间的电台状态并同步给所有成员。
- 每个成员的音量只作用于自己的浏览器。
- 在线音源来自 SomaFM 和 SoundHelix。如果浏览器策略阻止自动播放，成员需要先点击页面，房主重新播放后即可同步。

## 安全部署清单

1. DNS A 记录指向服务器 IP。
2. 云安全组放行 TCP 80/443。
3. 服务器防火墙放行 TCP 80/443。
4. 使用正式 TLS 证书，不使用自签证书对外服务。
5. 不要提交 `certs/`、私钥或环境变量文件。
6. 用进程守护工具保持服务运行，例如 NSSM、pm2 或 systemd。
7. 定期备份代码和证书续期配置。
8. 如面向中国大陆用户提供服务，请确认域名备案和当地合规要求。

## 已知边界

- 语音目前只做本机采集和波形预览，尚未上传或多人互通；多人语音仍需接入 WebRTC、ZEGO 或类似实时音视频服务。
- 房间和消息为内存存储，进程重启即清空。
- 隐私文案为产品草案，正式上线前建议由法务确认。
- 管理员 IP 白名单是轻量授权方案，不适合复杂多管理员场景。

## License

MIT

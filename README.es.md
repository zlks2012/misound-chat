# MISOUND

Idiomas: [简体中文](README.md) · [English](README.en.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [Русский](README.ru.md) · [Español](README.es.md)

MISOUND es un sitio de chat de texto anónimo con salas en tiempo real, ocho asientos sincronizados, gestión por parte del propietario, radio en línea sincronizada y volumen independiente para cada oyente. Esta versión usa solo la biblioteca estándar de Node.js para HTTP, HTTPS, archivos estáticos y WebSocket; no necesita base de datos ni dependencias externas.

## Sitio

- Dominio principal: <https://0372api.top>
- Dominio secundario: <https://zwj.76jh.com>
- Sala de chat: <https://0372api.top/prototype/>

## Funciones

- Sin registro ni inicio de sesión; se genera un apodo aleatorio al entrar.
- Lista de salas en tiempo real, creación, entrada y salida.
- Mensajes sincronizados en tiempo real; solo los últimos 80 permanecen en memoria.
- Ocho asientos con entrar, salir, silenciar, prohibir texto, expulsar, transferir propiedad y cerrar sala.
- La primera persona que entra en una sala vacía es propietaria; quien crea la sala también lo es.
- El propietario controla reproducción, pausa, emisora anterior, siguiente y selección de fuente.
- Cada miembro tiene un control de volumen local.
- Los controles de administrador y entrada invisible solo se muestran a la IP autorizada y el servidor los valida.
- HTTP redirige a HTTPS y WebSocket usa `wss://`.
- Se admiten varios dominios HTTPS mediante SNI.

## Inicio rápido

```bash
cd site-home
node server.js
```

Por defecto HTTP escucha en `0.0.0.0:80` y HTTPS en `0.0.0.0:443`. Las variables `HOST`, `PORT` y `HTTPS_PORT` permiten cambiarlo. Para usar 80/443 se necesitan permisos elevados en Linux o Windows.

## Puntos de despliegue

1. Apunte un registro DNS A a la IP del servidor.
2. Abra TCP 80/443 en el firewall y en el grupo de seguridad.
3. Use Node.js 18 o superior.
4. Use un certificado TLS público y nunca suba `certs/` ni claves privadas.
5. Mantenga el proceso activo con NSSM, pm2 o systemd.
6. Reinicie Node después de renovar certificados.

## Límites actuales

- La voz solo captura localmente y muestra una vista previa de onda; la voz multiusuario requiere WebRTC, ZEGO u otro servicio similar.
- Las salas y mensajes solo existen en memoria.
- Los textos de privacidad son un borrador y deben revisarse legalmente antes del lanzamiento.

## Licencia

MIT

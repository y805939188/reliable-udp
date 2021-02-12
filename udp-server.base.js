// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
//创建一个监听某个端口的 udp server
const udp_server = dgram.createSocket('udp4');
const SERVER_PORT = 13190;
// 绑定端口
udp_server.bind(SERVER_PORT);

// 监听端口
udp_server.on('listening', () => console.log(`upd 服务正在监听 ${SERVER_PORT} 端口`));

// 错误处理
udp_server.on('error', (err) => {
  console.log(`upd 服务发生错误: ${err}`);
  udp_server.close();
});

// 接收消息
udp_server.on('message', (msg, { port, address }) => {
  console.log(`${SERVER_PORT} 端口的 udp 服务接收到了来自 ${address}:${port} 的消息: ${String(msg)}`);
  // 返回一些信息给客户端 也可以不要这步
  udp_server.send(`${msg} 接收成功`, 0, msg.length, port, address);
});

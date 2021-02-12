// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
//创建一个监听某个端口的 udp server
const udp_client = dgram.createSocket('udp4');
const SEND_INTERVAL = 1000;
const SERVER_PORT = 13190;
const SERVER_ADDRESS = '192.168.31.86';
const CLIENT_PORT = 19411;

// 绑定某个端口
udp_client.bind(CLIENT_PORT);

// 当客户端关闭
udp_client.on('close', () => console.log('udp 客户端关闭'));

// 错误处理
udp_client.on('error', (err) => console.log(`upd 服务发生错误: ${err}`));

// 接收消息
udp_client.on('message', (msg, { port, address }) => {
  console.log(`udp 客户端接收到了来自 ${address}:${port} 的消息: ${String(msg)}`);
});

// 每隔多少秒定时向服务器发送消息
setInterval(((index) => () => {
  // 有中文的话最好使用 Buffer 缓冲区 否则下面 send 方法的第三个参数的 length 不好判断
  const _buffer = Buffer.from(`数字: ${index++}`);
  // 第二参数 0 表示要发送的信息在 _buffer 中的偏移量
  udp_client.send(_buffer, 0, _buffer.byteLength, SERVER_PORT, SERVER_ADDRESS); 
})(0), SEND_INTERVAL);

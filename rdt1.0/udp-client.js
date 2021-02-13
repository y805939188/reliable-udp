// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
const SEND_INTERVAL = 1000;
const SERVER_PORT = 13190;
const SERVER_ADDRESS = '127.0.0.1';
const CLIENT_PORT = 19411;

class ClientFiniteStateMachine {
  ACTIONS = {
    RDT_SEND: 'rdt_send',
  };

  constructor({ SEND_INTERVAL, SERVER_PORT, SERVER_ADDRESS, CLIENT_PORT }) {
    if (SEND_INTERVAL && SERVER_PORT && SERVER_ADDRESS && CLIENT_PORT) {
      //创建一个监听某个端口的 udp server
      this.udp_client = dgram.createSocket('udp4');
      this.SEND_INTERVAL = SEND_INTERVAL;
      this.SERVER_PORT = SERVER_PORT;
      this.SERVER_ADDRESS = SERVER_ADDRESS;
      this.CLIENT_PORT = CLIENT_PORT;
      this.init();
    }
  }

  init = () => {
    this.init_bind_port();
    this.init_on_message();
    this.init_on_close();
    this.init_on_error();
  }

  // 接收消息
  init_on_message = () => this.udp_client.on('message', (msg, { port, address }) => {
    console.log(`udp 客户端接收到了来自 ${address}:${port} 的消息: ${String(msg)}`);
  });

  dispatch = (action, msg) => {
    switch(action) {
      case this.ACTIONS.RDT_SEND:
        const packet = this.make_pkt(msg);
        this.udt_send(packet);
      default: return;
    }
  }

  make_pkt = (msg) => (JSON.stringify({ data: msg }));

  udt_send = (pkt) => {
    // 有中文的话最好使用 Buffer 缓冲区 否则下面 send 方法的第三个参数的 length 不好判断
    const _buffer = Buffer.from(pkt);
    // 第二参数 0 表示要发送的信息在 _buffer 中的偏移量
    this.udp_client.send(_buffer, 0, _buffer.byteLength, this.SERVER_PORT, this.SERVER_ADDRESS);
  }

  // 绑定某个端口
  init_bind_port = () => this.udp_client.bind(this.CLIENT_PORT);

  // 当客户端关闭
  init_on_close = () => this.udp_client.on('close', () => console.log('udp 客户端关闭'));

  // 错误处理
  init_on_error = () => this.udp_client.on('error', (err) => console.log(`upd 服务发生错误: ${err}`));

}

// 初始化一个 UDP 客户端的状态机
const CFSM = new ClientFiniteStateMachine({ SEND_INTERVAL, SERVER_PORT, SERVER_ADDRESS, CLIENT_PORT });
// 每隔多少秒定时给客户端的 UDP 状态机派发一个发送消息的动作
setInterval(((index) => () => CFSM.dispatch('rdt_send', `数字: ${index++}`))(0), SEND_INTERVAL);

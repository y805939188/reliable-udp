const dgram = require('dgram'); // dgram 模块提供了对 udp socket 的封装
const SEND_INTERVAL = 1000; // 每隔 1 秒向服务端发送一次消息
const SERVER_PORT = 13190; // 服务端的端口号时 13190
const SERVER_ADDRESS = '127.0.0.1'; // 服务端的地址就是本机
const CLIENT_PORT = 19411; // 当前这个客户端的端口号是 19411, 其实客户端也可以绑定 port, socket 也会自动绑定​

ACTIONS = {
  RDT_SEND: 'rdt_send', // rdt_send 表示发送一条消息
}

// 首先定义一个客户端的 FSM
class ClientFiniteStateMachine {
  ACTIONS = {
    RDT_SEND: 'rdt_send', // rdt_send 表示发送一条消息
  }

  constructor({ SEND_INTERVAL, SERVER_PORT, SERVER_ADDRESS, CLIENT_PORT }) {
    if (SEND_INTERVAL && SERVER_PORT && SERVER_ADDRESS && CLIENT_PORT) {
      //创建一个监听某个端口的 udp server
      this.udp_client = dgram.createSocket('udp4');
      // 初始化一些参数
      this.SEND_INTERVAL = SEND_INTERVAL;
      this.SERVER_PORT = SERVER_PORT;
      this.SERVER_ADDRESS = SERVER_ADDRESS;
      this.CLIENT_PORT = CLIENT_PORT;
      this.init();
    }
  }

  init = () => {
    // 初始化一些 socket 自带的事件
    this.init_bind_port();
    this.init_on_message();
    this.init_on_close();
    this.init_on_error();
  }
  
  //  该方法作为暴露给上层的接口进行调用
  send_message = (msg) => this.dispatch('rdt_send', msg)

  // 接收消息 当服务端返回消息就会触发 message 事件
  init_on_message = () => this.udp_client.on('message', (msg, { port, address }) => {
    console.log(`udp 客户端接收到了来自 ${address}:${port} 的消息: ${String(msg)}`);
  });
  
  // dispatch 中定义所有的操作对应的动作
  dispatch = (action, msg) => {
    switch(action) {
      case this.ACTIONS.RDT_SEND:
        // 创建一个分组(或者说数据报)
        const packet = this.make_pkt(msg);
        // 发送该分组(或者说数据报)
        this.udt_send(packet);
      default: return;
    }
  }
  // 这里只是j简单d额进行一下 json 序列化
  make_pkt = (msg) => (JSON.stringify({ data: msg }));
  
  // 发送分组(或者说数据报)的方法
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
// 每隔多少秒给 UDP 的服务端发送一条消息
setInterval(((index) => () => CFSM.send_message(`数字: ${index++}`))(0), SEND_INTERVAL);

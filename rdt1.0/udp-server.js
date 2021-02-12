// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
const SERVER_PORT = 13190;

class ServerFiniteStateMachine {
  ACTIONS = {
    RDT_RECEIVE: 'rdt_rcv',
  };

  constructor({ SERVER_PORT }) {
    if (SERVER_PORT) {
      this.udp_server = dgram.createSocket('udp4');
      this.SERVER_PORT = SERVER_PORT;
    }
  }

  run = () => this.init();

  init = () => {
    this.init_bind_port();
    this.init_on_message();
    this.init_on_listening();
    this.init_on_error();
  }

  // 绑定端口
  init_bind_port = () => this.udp_server.bind(this.SERVER_PORT);

  // 接收消息
  init_on_message = () => this.udp_server.on('message', (pkt, { port, address }) => {
    console.log(`${SERVER_PORT} 端口的 udp 服务接收到了来自 ${address}:${port} 的消息: ${pkt}`);
    // 在服务端的 UDP 服务中派发 接收到请求 这个动作
    this.dispatch('rdt_rcv', { packet: pkt, port, address });
  });

  // 监听端口
  init_on_listening = () => this.udp_server.on('listening', () => console.log(`upd 服务正在监听 ${SERVER_PORT} 端口`));

  // 错误处理
  init_on_error = () => this.udp_server.on('error', (err) => {
    console.log(`upd 服务发生错误: ${err}`);
    this.udp_server.close();
  });

  dispatch = (action, { packet, port, address }) => {
    switch(action) {
      case this.ACTIONS.RDT_RECEIVE:
        // 处理 packet 得到 data
        const data = this.extract(packet);
        // 把 data 往上层应用层送
        this.deliver_data(data, { port, address });
      default: return;
    }
  }

  extract = (packet) => (JSON.parse(packet));

  deliver_data = (data, { port, address }) => {
    // 有中文的话最好使用 Buffer 缓冲区 否则下面 send 方法的第三个参数的 length 不好判断
    const _buffer = Buffer.from(`接收成功: ${JSON.stringify(data)}`);
    // 返回一些信息给客户端 也可以不要这步
    this.udp_server.send(_buffer, 0, _buffer.byteLength, port, address);
  }
}

const SFSM = new ServerFiniteStateMachine({ SERVER_PORT });
SFSM.run();

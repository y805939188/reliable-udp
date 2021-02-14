const dgram = require('dgram'); // dgram 模块提供了对 udp socket 的封装
const SERVER_PORT = 13190; // 设置服务端的 port 为 13190, 要和客户端的保持一致

class ServerFiniteStateMachine {
  ACTIONS = {
    RDT_RECEIVE: 'rdt_rcv',
  };

  constructor({ SERVER_PORT }) {
    if (SERVER_PORT) {
      this.udp_server = dgram.createSocket('udp4'); // 初始化一个 udp 的服务端
      this.SERVER_PORT = SERVER_PORT;
    }
  }

  // 该方法暴露给外部, 当初始化该 class 之后调用
  receive_message = () => this.init();

  init = () => {
    // 初始化监听事件
    this.init_bind_port();
    this.init_on_message();
    this.init_on_listening();
    this.init_on_error();
  }

  // 接收消息
  init_on_message = () => this.udp_server.on('message', (pkt, { port, address }) => {
    console.log(`${SERVER_PORT} 端口的 udp 服务接收到了来自 ${address}:${port} 的消息: ${pkt}`);
    // 在服务端的 UDP 服务中派发 接收到请求 这个动作
    this.dispatch('rdt_rcv', { packet: pkt, port, address });
  });

  dispatch = (action, { packet, port, address }) => {
    switch(action) {
      case this.ACTIONS.RDT_RECEIVE: // 该 action 表示要处理下层发送过来的消息
        // 处理 packet 得到 data
        const data = this.extract(packet);
        // 把 data 往上层应用层送
        this.deliver_data(data, { port, address });
      default: return;
    }
  }

  extract = (packet) => (JSON.parse(packet));

  deliver_data = (data, { port, address }) => {
    // 在这里进行 data 的处理, 可以推给上面的应用层或做一些其他的事情
    const _buffer = Buffer.from(`接收成功: ${JSON.stringify(data)}`);
    // 这里简单的返回一些信息给客户端 也可以不要这步 或者换成其他任意操作
    this.udp_server.send(_buffer, 0, _buffer.byteLength, port, address);
  }
  
  // 绑定端口
  init_bind_port = () => this.udp_server.bind(this.SERVER_PORT);

  // 监听端口
  init_on_listening = () => this.udp_server.on('listening', () => console.log(`upd 服务正在监听 ${SERVER_PORT} 端口`));

  // 错误处理
  init_on_error = () => this.udp_server.on('error', (err) => {
    console.log(`upd 服务发生错误: ${err}`);
    this.udp_server.close();
  });

}

const SFSM = new ServerFiniteStateMachine({ SERVER_PORT });
// 当开始调用 receive_message 表示开始监听端口并准备接受来自客户端的消息
SFSM.receive_message();

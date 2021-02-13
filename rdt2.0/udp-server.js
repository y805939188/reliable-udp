// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
const SERVER_PORT = 13190;

class ServerFiniteStateMachine {
  ACTIONS = {
    RDT_RECEIVE: 'rdt_rcv',
    NOT_CORRUPT: 'not_corrupt', // 该动作在校验和没出错的情况下触发
    CORRUPT: 'corrupt', // 该动作在校验和出错的情况下触发
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

  // 接收消息
  init_on_message = () => this.udp_server.on('message', (pkt, { port, address }) => {
    console.log(`${SERVER_PORT} 端口的 udp 服务接收到了来自 ${address}:${port} 的消息`);
    const { checksum, data } = JSON.parse(pkt);
    if (checksum) {
      console.log(`消息的校验和 checksum 是正确的, 将返回 ACK 应答`);
      this.dispatch('not_corrupt', { packet: JSON.stringify(data), port, address });
    } else {
      console.log(`消息的校验和 checksum 发生了错误, 将返回 NAK 应答`);
      this.dispatch('corrupt', { port, address });
    }
  });

  dispatch = (action, { packet, port, address }) => {
    switch(action) {
      case this.ACTIONS.RDT_RECEIVE:
        // 处理 packet 得到 data
        const data = this.extract(packet);
        // 把 data 往上层应用层送
        this.deliver_data(data, { port, address });
        break;
      case this.ACTIONS.CORRUPT:
        // 如果发生了错误的话就构建一个 NAK 错误应答的报文
        const sndpkt1 = this.make_pkt('NAK');
        // 并且把这个 NAK 的否定应答返回给客户端
        this.udt_send(sndpkt1, { port, address });
        break;
      case this.ACTIONS.NOT_CORRUPT:
        // 如果状态是 not corrupt 说明客户端发送过来的报文的校验和是正确的
        this.dispatch('rdt_rcv', { packet, port, address });
        // 此时就要构建一个 ACK 应答表示成功接收到了数据报或分组
        const sndpkt2 = this.make_pkt('ACK');
        // 然后将成功应答返回给客户端
        this.udt_send(sndpkt2, { port, address });
        break;
      default: return;
    }
  }

  // flag 表示 NAK 或 ACK 标志位
  make_pkt = (flag, msg) => (JSON.stringify({ data: msg, flag }));

  extract = (packet) => (JSON.parse(packet));

  deliver_data = (data, { port, address }) => {
    // 在 deliver_data 可以自有地处理客户端发送过的数据报 比如将发过来的东西交给应用层等等
    console.log(`从 ${address}:${port} 接收数据分组成功, 发过来的 data: ${JSON.stringify(data)}`);
  }

  // 服务端在返回信息的时候需要知道客户端的 port 和 address
  udt_send = (pkt, { port, address }) => {
    // 有中文的话最好使用 Buffer 缓冲区 否则下面 send 方法的第三个参数的 length 不好判断
    const _buffer = Buffer.from(pkt);
    // 第二参数 0 表示要发送的信息在 _buffer 中的偏移量
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
SFSM.run();

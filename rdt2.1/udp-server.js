// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
const SERVER_PORT = 13190;

class ServerFiniteStateMachine {
  ACTIONS = {
    RDT_RECEIVE: 'rdt_rcv',
    NOT_CORRUPT: 'not_corrupt', // 该动作在校验和没出错的情况下触发
    CORRUPT: 'corrupt', // 该动作在校验和出错的情况下触发
  };

  // 用该变量表示服务端渴望接收到的分组的序号
  desired_seq = 0;

  constructor({ SERVER_PORT }) {
    if (SERVER_PORT) {
      this.udp_server = dgram.createSocket('udp4');
      this.SERVER_PORT = SERVER_PORT;
    }
  }

  // 该方法暴露给外部, 当初始化该 class 之后调用
  receive_message = () => this.init();

  init = () => {
    this.init_bind_port();
    this.init_on_message();
    this.init_on_listening();
    this.init_on_error();
  }

  // 接收消息
  init_on_message = () => this.udp_server.on('message', (pkt, { port, address }) => {
    console.log(`${SERVER_PORT} 端口的 udp 服务接收到了来自 ${address}:${port} 的消息`);
    const { seq, checksum, data } = JSON.parse(pkt);
    if (checksum && seq === this.desired_seq) {
      // 如果校验和没有出错并且客户端传过来的序号和服务端渴望得到的序号也一致
      // 那就可以返回 ACK 报文
      console.log(`消息的校验和 checksum 以及 seq 都是正确的, 将返回 ACK 应答`);
      // 然后要修改渴望得到的序号为下一个
      this.desired_seq = this.desired_seq === 0 ? 1 : 0;
      this.dispatch('not_corrupt', { packet: JSON.stringify(data), port, address });
    } else {
      if (!checksum) {
        // 如果校验和出错说明客户端传过来的数据本身可能出现问题了
        console.log(`消息的校验和 checksum 出错, 将返回 NAK 应答`);
        this.dispatch('corrupt', { port, address });
      } else if (seq !== this.desired_seq) {
        // 如果校验和没错但是传过来的序号不是期望得到的
        // 说明可能在上次一服务端往客户端传送应答时的那份儿应答挂了
        // 此时需要重新回传一份 ACK, 这份 ACK 就是网络中冗余的报文分组
        this.dispatch('not_corrupt', { packet: JSON.stringify(data), port, address });
      }
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
        const sndpkt1 = this.make_pkt('NAK', this.get_checksum());
        // 并且把这个 NAK 的否定应答返回给客户端
        this.udt_send(sndpkt1, { port, address });
        break;
      case this.ACTIONS.NOT_CORRUPT:
        // 如果状态是 not corrupt 说明客户端发送过来的报文的校验和是正确的
        this.dispatch('rdt_rcv', { packet, port, address });
        // 此时就要构建一个 ACK 应答表示成功接收到了数据报或分组
        const sndpkt2 = this.make_pkt('ACK', this.get_checksum());
        // 然后将成功应答返回给客户端
        this.udt_send(sndpkt2, { port, address });
        break;
      default: return;
    }
  }

  // flag 表示 NAK 或 ACK 标志位
  // 由于返回的应答报文实际上也可能会发生错误 所以也需要有个 checksum
  make_pkt = (flag, checksum, msg) => (JSON.stringify({ data: msg, flag, checksum }));

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

  // 生成一个假的随机的校验和
  get_checksum = () => {
    // 由于当前不好模拟真正网络请求中校验和出错的场景 所以这里设置一个假的开关
    const random_error_switch = Math.random() >= 0.5;
    // 该开关为 0 时候表示校验和出现差错, 为 1 时表示校验和没有出现差错
    const checksum = random_error_switch ? 0 : 1;
    console.log(`本次分组随机生成的校验和是: ${checksum}`);
    return checksum;
  }

}

const SFSM = new ServerFiniteStateMachine({ SERVER_PORT });
SFSM.receive_message();

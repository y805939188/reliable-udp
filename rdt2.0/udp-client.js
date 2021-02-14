const dgram = require('dgram'); // dgram 模块提供了对 udp socket 的封装
const SEND_INTERVAL = 1000; // 每隔 1 秒向服务端发送一次消息
const SERVER_PORT = 13190; // 服务端的端口号时 13190
const SERVER_ADDRESS = '127.0.0.1'; // 服务端的地址就是本机
const CLIENT_PORT = 19411; // 当前这个客户端的端口号是 19411, 其实客户端也可以绑定 port, socket 也会自动绑定​

class ClientFiniteStateMachine {
  ACTIONS = {
    RDT_SEND: 'rdt_send', // rdt_send 表示发送一条消息
    IS_ACK: 'is_ack', // 服务端可能会回送 肯定应答
    IS_NAK: 'is_nak', // 服务端可能会回送 否定应答
  };

  // 用一个变量来保存上一次发送的 msg
  prev_msg = null;

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

  //  该方法作为暴露给上层的接口进行调用
  send_message = (msg) => this.dispatch('rdt_send', msg)

  // 接收消息
  init_on_message = () => this.udp_client.on('message', (msg, { port, address }) => {
    console.log(`udp 客户端接收到了来自 ${address}:${port} 的消息`);
    // 服务端将会在相应中使用 flag 来标识是 ACK 还是 NAK
    const { flag } = JSON.parse(msg);
    if (flag === 'ACK') {
      console.log(`客户端发送消息后接收到了 ACK 应答, 该分组发送成功`);
      this.dispatch('is_ack');
    } else if (flag === 'NAK') {
      console.log(`客户端发送消息后接收到了 NAK 应答, 该分组发送失败, 将会重新发送`);
      this.dispatch('is_nak');
    }
  });

  dispatch = (action, msg) => {
    switch(action) {
      case this.ACTIONS.RDT_SEND:
        // 先把本次要发送的 msg 作为上一次的 msg 记录下来 方便之后拿到否定应答的话重传
        this.prev_msg = msg;
        // 这里构建 packet 时需要多加上一个 checksum
        const packet = this.make_pkt(this.get_checksum(), msg);
        this.udt_send(packet);
        break;
      case this.ACTIONS.IS_NAK:
        // 如果是 NAK 应答的话说明 UDP 的服务端认为数据报或分组发生了错误 此时需要重传
        this.dispatch('rdt_send', this.prev_msg);
        break;
      case this.ACTIONS.IS_ACK:
        // 如果是 ACK 应答的话就可以什么都不做或是继续发送下一个分组了
        console.log('可以做一些别的事情了比如发送下一个分组之类的或者断开 socket');
        this.udp_client.close();
        break;
      default: return;
    }
  }

  // 将 checksum 也构建进去
  make_pkt = (checksum, msg) => (JSON.stringify({ data: msg, checksum }));

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

// 初始化一个 UDP 客户端的状态机
const CFSM = new ClientFiniteStateMachine({ SEND_INTERVAL, SERVER_PORT, SERVER_ADDRESS, CLIENT_PORT });
// 这里先只进行一次发送 因为 CFSM 目前的实现中还没有办法按照顺序处理多个发生了错误的分组 暂时只能处理一个发生错误的分组
setTimeout(() => CFSM.send_message('ding test'), SEND_INTERVAL);

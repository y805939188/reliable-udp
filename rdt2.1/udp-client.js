// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
const SEND_INTERVAL = 1000;
const SERVER_PORT = 13190;
const SERVER_ADDRESS = '127.0.0.1';
const CLIENT_PORT = 19411;

class ClientFiniteStateMachine {
  ACTIONS = {
    RDT_SEND: 'rdt_send',
    IS_ACK: 'is_ack', // 表示触发了接收到 ack 报文的动作
    IS_NAK: 'is_nak', // 表示触发了接收到 nak 报文的动作
    NOT_CORRUPT: 'not_corrupt', // 由于来自服务端的 checksum 可能是正确的所以需要这么一个行为动作
    CORRUPT: 'corrupt', // 由于来自服务端的 checksum 可能会出错所以需要这么一个行为动作
  };

  // 用一个变量来保存上一次发送的 msg
  prev_msg = null;

  // 设置一条队列用来缓存还未发送的数据
  buffer_queue = [];

  // 设置一个初始序号 该序号要在 0 和 1 之间来回切换
  current_seq = 0;

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
    // 把上一次发送的 msg 也就是队列最左侧的 msg 先拿出来, 这个 msg 有可能发送成功, 也有可能发送失败
    const prev_msg = this.buffer_queue.shift();
    // 在当前协议中 udp 的服务端也会返回 checksum, 因为此时的 ack 应答中其实也可能会产生错误
    const { flag, checksum } = JSON.parse(msg);
    if (!checksum) {
      // ACK/NAK 应答报文在网络传输过程中其实也是可能发生错误的 此时 checksum 会不正确
      console.log('服务端返回的 checksum 错误, 该应答回送失败, 客户端将会重新发送当前分组');
      this.dispatch('corrupt', prev_msg);
    } else {
      // 进到这里说明服务端回送的数据报没有问题
      if (flag === 'NAK') {
        console.log('服务端返回了 NAK 应答, 客户端将会重新发送当前分组');
        this.dispatch('is_nak', prev_msg);
      } else if (flag === 'ACK') {
        console.log('服务端返回了 ACK 应答, 本次分组发送成功');
        // 如果校验和没出错同时还是 ACK 应答的话 说明该分组没毛病 可以发送下一个序号的分组了
        this.current_seq = this.current_seq === 1 ? 0 : 1;
        this.dispatch('is_ack');
      }
    }
  });

  dispatch = (action, msg) => {
    switch(action) {
      case this.ACTIONS.RDT_SEND:
        if (this.buffer_queue.length) {
          // 如果队列中有 msg 的话说明之前还有分组没有被发送完成
          // 需要先等之前的分组发送完成才能继续发送下一个分组
          // 把当前的 msg 先推入队列 只有当该 buffer_queue[0] 位的 msg 成功被发送到 udp 的服务端时
          // 才能把 buffer_queue[0] 真的从队列的左侧 shift 出来
          Array.isArray(msg) ? this.buffer_queue.push(...msg) : this.buffer_queue.push(msg);
        } else {
          // 如果 buffer_queue 中没有 msg 了那就可以立即发送当前传进来的 msg 了
          // 同样也要先把它放进 buffer_queue 的最左侧缓存起来 以防止该 msg 发送失败
          // 同时 unshift 之后也能保证再 udp 服务端没有应答之前再有新的消息进来的话可以保证走到上面有 length 的逻辑
          Array.isArray(msg) ? this.buffer_queue.unshift(...msg) : this.buffer_queue.unshift(msg);
          // 使用队列中最左侧的元素作为 msg 封装为 packet
          // 同时要使用 current_seq 作为一个序号 第一次是 0
          const packet = this.make_pkt(this.current_seq, this.get_checksum(), this.buffer_queue[0]);
          // 发送该数据报
          this.udt_send(packet);
        }
        break;
      case this.ACTIONS.CORRUPT:
        // 出错的话逻辑和 NAK 时的逻辑基本一样
        const temp_current_msg1 = msg ? [msg, ...this.buffer_queue] : [...this.buffer_queue];
        this.buffer_queue.length = 0;
        this.dispatch('rdt_send', temp_current_msg1);
        break;
      case this.ACTIONS.NOT_CORRUPT:
        // 没出错时的逻辑和 ACK 应答时基本一样
        if (this.buffer_queue.length) {
          const temp_current_msg2 = [...this.buffer_queue];
          this.buffer_queue.length = 0;
          this.dispatch('rdt_send', temp_current_msg2);
        } else {
          console.log('可以做一些别的事情了比如断开 socket');
        }
      case this.ACTIONS.IS_NAK:
        // 如果是 NAK 应答的话说明 UDP 的服务端认为数据报或分组发生了错误 此时需要重传
        const temp_current_msg3 = msg ? [msg, ...this.buffer_queue] : [...this.buffer_queue];
        this.buffer_queue.length = 0;
        this.dispatch('rdt_send', temp_current_msg3);
        break;
      case this.ACTIONS.IS_ACK:
        // 如果是 ACK 应答的话就可以什么都不做或是继续发送下一个分组了
        if (this.buffer_queue.length) {
          const temp_current_msg4 = [...this.buffer_queue];
          this.buffer_queue.length = 0;
          this.dispatch('rdt_send', temp_current_msg4);
        } else {
          console.log('可以做一些别的事情了比如断开 socket');
        }
        break;
      default: return;
    }
  }

  make_pkt = (seq, checksum, msg) => (JSON.stringify({ data: msg, checksum, seq }));

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
// 每隔多少秒定时给客户端的 UDP 状态机派发一个发送消息的动作
setInterval(((index) => () => CFSM.send_message(`数字: ${index++}`))(0), SEND_INTERVAL);

// dgram 模块提供了对 udp socket 的封装
const dgram = require('dgram');
const SEND_INTERVAL = 1000;
const SERVER_PORT = 13190;
const SERVER_ADDRESS = '127.0.0.1';
const CLIENT_PORT = 19411;

class ClientFiniteStateMachine {
  ACTIONS = {
    RDT_SEND: 'rdt_send',
    IS_ACK: 'is_ack',
    NOT_CORRUPT: 'not_corrupt',
    CORRUPT: 'corrupt',
  };

  prev_msg = null;

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

  // 接收消息
  init_on_message = () => this.udp_client.on('message', (msg, { port, address }) => {
    console.log(`udp 客户端接收到了来自 ${address}:${port} 的消息`);
    // 把上一次发送的 msg 也就是队列最左侧的 msg 先拿出来, 这个 msg 有可能发送成功, 也有可能发送失败
    const prev_msg = this.buffer_queue.shift();
    // 在当前协议中 udp 的服务端也会返回 checksum, 因为此时的 ack 应答中其实也可能会产生错误
    // 当前协议中不再需要其他应答报文 只需要有个 ACK 应答就好
    const { ack_with_seq, checksum } = JSON.parse(msg);
    // 不过需要对 ACK 报文的序号做处理
    const { is_ack, ack_seq } = this.get_ack_and_seq(ack_with_seq);
    if (!checksum) {
      // ACK 应答报文在网络传输过程中其实也是可能发生错误的 此时 checksum 会不正确
      console.log('服务端返回的 checksum 错误, 该应答回送失败, 客户端将会重新发送当前分组');
      // 并且保证序号 seq 不发生改变
      this.dispatch('corrupt', prev_msg);
    } else if (is_ack) {
      // 在该协议中干掉 NAK 应答 只保留 ACK 应答, 但是要给每个 ACK 进行编号
      // 是为了减少网络中要处理的报文状态 以为当日后跳脱出当前这种等停模式之后
      // 如果同时处理多个分组时每个分组都有两个报文的状态的话会很乱且麻烦

      if (ack_seq === this.current_seq) {
        console.log('服务端返回了 ACK 应答, 并且 ACK 序号和预期一致本次, 分组发送成功');
        // 如果校验和没出错同时还是 ACK 应答的话 说明该分组没毛病 可以发送下一个序号的分组了
        this.current_seq = this.current_seq === 1 ? 0 : 1;
        this.dispatch('not_corrupt');
      } else {
        console.log('服务端虽然返回了 ACK 应答但是客户端接收到的序号和本次发送的不一样, 说明客户端发送过去的 msg 可能出现错误, 将重新发送该分组');
        this.dispatch('corrupt', prev_msg);
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
        const temp_current_msg1 = msg ? [msg, ...this.buffer_queue] : [...this.buffer_queue];
        this.buffer_queue.length = 0;
        this.dispatch('rdt_send', temp_current_msg1);
        break;
      case this.ACTIONS.NOT_CORRUPT:
        if (this.buffer_queue.length) {
          const temp_current_msg2 = [...this.buffer_queue];
          this.buffer_queue.length = 0;
          this.dispatch('rdt_send', temp_current_msg2);
        } else {
          console.log('可以做一些别的事情了比如断开 socket');
        }
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

  get_ack_and_seq = (ack_with_seq) => ({is_ack: 'ACK' === ack_with_seq.replace(/(\d)+/ig, '').toLocaleUpperCase(), ack_seq: Number(ack_with_seq.replace(/[a-zA-Z]+/ig, ''))});

}

// 初始化一个 UDP 客户端的状态机
const CFSM = new ClientFiniteStateMachine({ SEND_INTERVAL, SERVER_PORT, SERVER_ADDRESS, CLIENT_PORT });
// 每隔多少秒定时给客户端的 UDP 状态机派发一个发送消息的动作
setInterval(((index) => () => CFSM.dispatch('rdt_send', `数字: ${index++}`))(0), SEND_INTERVAL);

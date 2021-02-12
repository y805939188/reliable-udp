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
    IS_NAK: 'is_nak',
  };

  prev_msg = null;

  buffer_queue = [];

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

  // 绑定某个端口
  init_bind_port = () => this.udp_client.bind(this.CLIENT_PORT);

  // 接收消息
  init_on_message = () => this.udp_client.on('message', (msg, { port, address }) => {
    console.log(`udp 客户端接收到了来自 ${address}:${port} 的消息`);
    const { flag, data } = JSON.parse(msg);
    // 把上一次发送的 msg 也就是队列最左侧的 msg 先拿出来, 这个 msg 有可能发送成功, 也有可能发送失败
    const prev_msg = this.buffer_queue.shift();
    if (flag === 'ACK') {
      console.log(`客户端发送消息后接收到了 ACK 应答, 该分组发送成功`);
      // 如果得到 ACK 应答说明发送成功因此 prev msg 可以直接撇了
      this.dispatch('is_ack');
    } else if (flag === 'NAK') {
      console.log(`客户端发送消息后接收到了 NAK 应答, 该分组发送失败, 将会重新发送`);
      // 但是如果得到 NAK  应答说明发送失败 要重新传这个 prev msg
      this.dispatch('is_nak', prev_msg);
    }
  });

  // 当客户端关闭
  init_on_close = () => this.udp_client.on('close', () => console.log('udp 客户端关闭'));

  // 错误处理
  init_on_error = () => this.udp_client.on('error', (err) => console.log(`upd 服务发生错误: ${err}`));

  /**
   * 当进入该状态机的时候 可能会有多个场景触发 rdt_send
   *  1. 由上层应用(比如 setIntervel)调用
   *    a. 调用时可能 buffer_queue 存在其他 msg 说明当前正在有一个 msg 被发送中,
   *       此时要等上一个 msg 被发送成功后才能进入下一个 msg 的发送,
   *       所以先把传进来的新的 msg 放到 buffer_queue 的队尾 也就是最后一个
   *    b. 调用时 buffer_queue 中不存在其他 msg 说明可能是第一次调用 也可能是空闲时的调用,
   *       此时直接把 msg 放进 buffer_queue 的队头 对头的 msg 就表示下一个要发送的分组的 msg,
   *       然后走之后的逻辑 将该 msg 发送到 udp 的服务端
   *  2. 当 udp 的服务端返回 NAK 应答时需要重新发送 msg 此时需要调用 rdt_send
   *    a. 当接收到 NAK 的时候先使用一个临时变量将 buffer_queue 中所有的 msg 都保存出来
   *       然后将 buffer_queue 的 length 置为 0, 这是为了下一步调用 rdt_send 的时候可以保证走到上面 1.b 中的逻辑
   *  3. 当 udp 的服务端返回 ACK 应答的时候需要判断 buffer_queue 中是否还有排队中的 msg
   *    a. 如果 buffer_queue 中还有在排队的 msg, 则需要也把所有的 msg 先保存一下,
   *       然后让 buffer_queue 的 length 为 0, 也是为了保证下一步 rdt_send 的时候能够立即发送 buffer_queue[0] 的 msg
   *    b. 如果 buffer_queue 中没有 msg 了就可以做一些其他的操作了
   */
  dispatch = (action, msg) => {
    switch(action) {
      case this.ACTIONS.RDT_SEND:
        if (this.buffer_queue.length) {
          // 如果队列中有 msg 的话说明之前还有分组没有被发送完成
          // 需要先等之前的分组发送完成才能继续发送下一个分组
          // 把当前的 msg 先推入队列 只有当该 buffer_queue[0] 位的 msg 成功被发送到 udp 的服务端时
          // 才能把 buffer_queue[0] 真的从队列的左侧 shift 出来
          if (Array.isArray(msg)) {
            // 如果是个 array 类型就平铺开
            this.buffer_queue.push(...msg);
          } else {
            // 如果传进来的 msg 不是 Array 就直接 push 到队尾
            this.buffer_queue.push(msg);
          }
        } else {
          // 如果 buffer_queue 中没有 msg 了那就可以立即发送当前传进来的 msg 了
          // 同样也要先把它放进 buffer_queue 的最左侧缓存起来 以防止该 msg 发送失败
          // 同时 unshift 之后也能保证再 udp 服务端没有应答之前再有新的消息进来的话可以保证走到上面有 length 的逻辑
          if (Array.isArray(msg)) {
            // 如果是个 array 类型就平铺插到队头
            this.buffer_queue.unshift(...msg);
          } else {
            // 如果传进来的 msg 不是 Array 就直接插入到队头 也就是 buffer_queue 的最左侧
            this.buffer_queue.unshift(msg);
          } 
          // 由于当前不好模拟真正网络请求中校验和出错的场景 所以这里设置一个假的开关
          const random_error_switch = Math.random() >= 0.5;
          // 该开关为 0 时候表示校验和出现差错, 为 1 时表示校验和没有出现差错
          const checksum = random_error_switch ? 0 : 1;
          console.log(`本次分组随机生成的校验和是: ${checksum}`);
          // 使用队列中最左侧的元素作为 msg 封装为 packet
          const packet = this.make_pkt(checksum, this.buffer_queue[0]);
          // 发送该数据报
          this.udt_send(packet);
        }
        break;
      case this.ACTIONS.IS_NAK:
        // 如果是 NAK 应答的话说明 UDP 的服务端认为数据报或分组发生了错误 此时需要重传
        const temp_current_msg1 = [msg, ...this.buffer_queue];
        this.buffer_queue.length = 0;
        this.dispatch('rdt_send', temp_current_msg1);
        break;
      case this.ACTIONS.IS_ACK:
        // 如果是 ACK 应答的话就可以什么都不做或是继续发送下一个分组了
        if (this.buffer_queue.length) {
          // 从队列的最左侧拿出一个 msg
          const temp_current_msg2 = [...this.buffer_queue];
          this.buffer_queue.length = 0;
          this.dispatch('rdt_send', temp_current_msg2);
        } else {
          console.log('可以做一些别的事情了比如发送下一个分组之类的或者断开 socket');
          // this.udp_client.close();
        }
        break;
      default: return;
    }
  }

  make_pkt = (checksum, msg) => (JSON.stringify({ data: msg, checksum }));

  udt_send = (pkt) => {
    // 有中文的话最好使用 Buffer 缓冲区 否则下面 send 方法的第三个参数的 length 不好判断
    const _buffer = Buffer.from(pkt);
    // 第二参数 0 表示要发送的信息在 _buffer 中的偏移量
    this.udp_client.send(_buffer, 0, _buffer.byteLength, this.SERVER_PORT, this.SERVER_ADDRESS);
  }
}

// 初始化一个 UDP 客户端的状态机
const CFSM = new ClientFiniteStateMachine({ SEND_INTERVAL, SERVER_PORT, SERVER_ADDRESS, CLIENT_PORT });
// 每隔多少秒定时给客户端的 UDP 状态机派发一个发送消息的动作
setInterval(((index) => () => CFSM.dispatch('rdt_send', `数字: ${index++}`))(0), SEND_INTERVAL);

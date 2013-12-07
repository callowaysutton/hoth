var Hoth = (function() {
  'use strict';

  var el = function(cl, tag) {
    var d = document.createElement(tag || 'div');
    d.className = cl || '';
    return d;
  };

  var pad = function(ch, n, s) {
    return Array(n + 1).join(ch).slice(s.length) + s;
  };

  var formatTime = function(d) {
    return d.getHours() + ':' + pad('0', 2, '' + d.getMinutes());
  };

  var escapeXML = function(string) {
    return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/, '&apos;');
  };

  var RE_HASHTAG = /^(#([^\s{}\[\]]+?)|!(\w+))([\.!?"',;:\)\]]*(\s|$))/;
  var RE_INLINE_CODE = /^(\[(`+)([^]+?)\2\])|^((`+)([^]+?)\5)/;
  var RE_STRONG = /^__/;
  var RE_EMPHASIS = /^_/;
  var RE_WORD = /^[^\[!`_\s#][^_#\s]+|^\s+/;

  var parse = function(string) {
    string = string.trim();

    var result = '';
    var i = 0;
    var tags = [];

    var toggle = function(source, tag) {
      var index = tags.length - 1;
      while (index >= 0) {
        if (tags[index].tag === tag) break;
        index -= 1;
      }
      if (index !== -1) {
        for (var j = tags.length - 1; j >= index; j--) {
          result += '</' + tags[j].tag + '>';
        }
        tags.splice(index, 1);
        for (j = index; j < tags.length; j++) {
          result += '<' + tags[j].tag + '>';
        }
      } else {
        tags.push({
          tag: tag,
          source: source,
          index: result.length,
          length: ('<' + tag + '>').length
        });
        result += '<' + tag + '>';
      }
    };

    while (i < string.length) {
      var x = null;
      var sub = string.slice(i);
      if (x = RE_HASHTAG.exec(sub)) {
        if (x[2]) {
          result += '<a href="#' + escapeXML(x[2]) + '">#' + escapeXML(x[2]) + '</a>';
        } else {
          result += '<a href="#' + escapeXML(JSON.stringify([{ goto: '!' + x[3] }])) + '">(thread)</a>';
        }
        result += escapeXML(x[4]);
      } else if (x = RE_INLINE_CODE.exec(sub)) {
        if (x[2]) {
          result += '<a href="#' + escapeXML(JSON.stringify([{ run: x[3].replace(/^\//, '') }])) + '"><code>' + escapeXML(x[3]) + '</code></a>';
        } else {
          var multiline = x[6].search(/[\n\r]/) !== -1;
          if (multiline) result += '<pre>';
          result += '<code>' + escapeXML(x[6]) + '</code>';
          if (multiline) result += '</pre>';
        }
      } else if (x = RE_STRONG.exec(sub)) {
        toggle(x[0], 'strong');
      } else if (x = RE_EMPHASIS.exec(sub)) {
        toggle(x[0], 'em');
      } else if (x = RE_WORD.exec(sub)) {
        result += escapeXML(x[0]);
      } else {
        var j = string.slice(i + 1).search(/[#!\[`_*]/);
        if (j === -1) {
          j = string.length;
        } else {
          j += i + 1;
        }
        result += escapeXML(string.slice(i, j));
        i = j;
      }
      if (x) {
        i += x[0].length;
      }
    }

    while (tags.length) {
      var tag = tags.pop();
      result = result.slice(0, tag.index) + tag.source + result.slice(tag.index + tag.length);
    }

    return result;
  };

  var Thread = function(data) {
    if (!data) data = {};

    this.messages = [];
    this.shouldAutoscroll = true;
    this.contentSize = 0;
    this.dragging = false;
    this.$scroll = 0;
    this.$prompt = null;

    this.onScrollMouseMove = this.onScrollMouseMove.bind(this);
    this.onScrollMouseUp = this.onScrollMouseUp.bind(this);

    this.template();

    this.id = data.id;

    if (this.id) {
      socket.emit('open thread', this.id);
    } else {
      socket.emit('create thread', function(err, uid) {
        if (err) return;
        this.id = '!' + uid;
        Thread.map[this.id] = this;
        if (app.activeThread === this) {
          location.hash = this.permalink;
        }
      }.bind(this));
    }
  };

  Thread.map = {};

  Thread.get = function(id) {
    id = id.toLowerCase();

    if (Thread.map[id]) {
      return Thread.map[id];
    }
    return Thread.map[id] = new Thread({
      id: id
    });
  };

  Thread.prototype.template = function() {
    this.element = el('hoth-thread');
    this.element.appendChild(this.elName = el('hoth-thread-name'));
    this.element.appendChild(this.elContent = el('hoth-thread-content'));
    this.elContent.appendChild(this.elScrollbar = el('hoth-thread-scrollbar'));
    this.elScrollbar.appendChild(this.elMarkers = el('hoth-thread-markers'));
    this.elScrollbar.appendChild(this.elScrollbarHandle = el('hoth-thread-scrollbar-handle'));
    this.elContent.appendChild(this.elWrap = el('hoth-thread-wrap'));
    this.elWrap.appendChild(this.elMessages = el('hoth-thread-messages'));

    this.elScrollbar.addEventListener('mousedown', this.onScrollMouseDown.bind(this));
    this.element.addEventListener('click', this.onClick.bind(this));
    this.element.addEventListener('mousewheel', this.onMouseWheel.bind(this));
  };

  Object.defineProperty(Thread.prototype, 'id', {
    set: function(id) {
      this.$id = id;
      this.elName.textContent = id ? id.slice(1) : '';
      if (id && id[0] === '#') {
        this.element.classList.add('topic');
      } else {
        this.element.classList.remove('topic');
      }
    },
    get: function() {
      return this.$id;
    }
  });

  Object.defineProperty(Thread.prototype, 'permalink', {
    get: function() {
      return this.id && (this.id[0] === '#' ? this.id : '#' + JSON.stringify([{ goto: this.id }]));
    }
  });

  Object.defineProperty(Thread.prototype, 'prompt', {
    set: function(prompt) {
      if (this.$prompt) {
        this.$prompt.thread = null;
        this.elMessages.removeChild(this.$prompt.element);
        this.element.classList.remove('active');
      }
      if (this.$prompt = prompt) {
        this.element.classList.add('active');
        if (prompt.thread) {
          prompt.thread.prompt = null;
        }
        prompt.thread = this;
        this.elMessages.appendChild(prompt.element);
      }
      this.shouldAutoscroll = true;
      this.contentChanged();
    },
    get: function() {
      return this.$prompt;
    }
  });

  Object.defineProperty(Thread.prototype, 'lastMessage', {
    get: function() {
      return this.messages[this.messages.length - 1];
    }
  });

  Thread.prototype.append = function(message) {
    message.delete();

    if (this.lastMessage && this.lastMessage.author === message.author && this.lastMessage.constructor === message.constructor) {
      message.collapsed = true;
    }

    this.messages.push(message);
    if (this.prompt) {
      this.elMessages.insertBefore(message.element, this.prompt.element);
    } else {
      this.elMessages.appendChild(message.element);
    }
    message.thread = this;

    this.contentChanged();
  };

  Thread.prototype.close = function() {
    if (this !== app.lobby) {
      var i = app.threads.indexOf(this);
      this.delete();
      app.activeThread = app.threads[i] || app.threads[i - 1] || app.threads[0];
    }
  };

  Thread.prototype.delete = function() {
    if (!this.open) return;

    if (this.element.parentNode === app.element) {
      app.element.removeChild(this.element);
    }

    var i = app.threads.indexOf(this);
    if (i !== -1) {
      app.threads.splice(i, 1);
    }
    this.open = false;

    if (this.prompt) {
      this.prompt = null;
      app.activeThread = null;
    }
  };

  Thread.prototype.reply = function(message) {
    this.shouldAutoscroll = true;
    this.append(message);
    socket.emit(message.isChat ? 'chat' : 'system', message.data());
  };

  Thread.prototype.onMouseWheel = function(e) {
    this.shouldAutoscroll = false;
    this.scroll -= e.wheelDeltaY;
    this.updateScroll();
  };

  Thread.prototype.onClick = function() {
    if (document.getSelection().isCollapsed) {
      app.activeThread = this;
      if (this.prompt) {
        this.prompt.focus();
      }
    }
  };

  Thread.prototype.onScrollMouseMove = function(e) {
    if (!this.dragging) return;
    this.dragScrollbar(e);
  };

  Thread.prototype.onScrollMouseDown = function(e) {
    this.dragging = true;
    this.dragScrollbar(e);
    e.preventDefault();
    document.addEventListener('mousemove', this.onScrollMouseMove);
    document.addEventListener('mouseup', this.onScrollMouseUp);
  };

  Thread.prototype.onScrollMouseUp = function(e) {
    this.dragging = false;
    this.dragScrollbar(e);
    document.removeEventListener('mousemove', this.onScrollMouseMove);
    document.removeEventListener('mouseup', this.onScrollMouseUp);
  };

  Thread.prototype.dragScrollbar = function(e) {
    var scrollbarSize = this.elScrollbar.offsetHeight;
    var viewportSize = this.elContent.offsetHeight;
    var contentSize = Math.max(viewportSize, this.elWrap.offsetHeight);

    var d = (1 - (e.clientY - this.elScrollbar.getBoundingClientRect().top) / scrollbarSize) / Thread.SCROLL_CONSTANT;
    var x = -d / (Thread.SCROLL_CONSTANT * d - 1);
    this.scroll = contentSize - x * viewportSize;
  };

  Thread.prototype.viewportChanged = function() {
    this.viewportSize = this.elContent.offsetHeight;
    this.scrollbarSize = this.elScrollbar.offsetHeight;
    this.rescroll()
  };

  Thread.prototype.contentChanged = function() {
    this.contentSize = this.elWrap.offsetHeight;
    this.rescroll();
  };

  Object.defineProperty(Thread.prototype, 'scroll', {
    set: function(value) {
      if (!this.scrollbarSize) {
        this.$scroll = value
        return;
      }

      this.$scroll = value = Math.max(0, Math.min(value, this.contentSize - this.viewportSize));
      this.updateScroll(true);
    },
    get: function() {
      return this.$scroll;
    }
  });

  Thread.AUTOSCROLL_THRESHOLD = 5;
  Thread.SCROLL_CONSTANT = .1;

  Thread.prototype.rescroll = function() {
    if (this.shouldAutoscroll) {
      this.scroll = this.contentSize - this.viewportSize;
    } else {
      this.updateScroll();
    }
  };

  Thread.prototype.updateScroll = function(property) {
    var max = Math.max(this.contentSize, this.viewportSize);
    if (!property) {
      this.shouldAutoscroll = max - this.viewportSize - this.scroll <= Thread.AUTOSCROLL_THRESHOLD;
    }
    var x = (max - this.scroll) / this.viewportSize;
    var y = (max - (this.scroll + this.viewportSize)) / this.viewportSize;

    var minValue = this.scrollbarSize * (1 - Thread.SCROLL_CONSTANT * x / (Thread.SCROLL_CONSTANT * x + 1));
    var maxValue = this.scrollbarSize * (1 - Thread.SCROLL_CONSTANT * y / (Thread.SCROLL_CONSTANT * y + 1));

    this.elScrollbarHandle.style.top = minValue + 'px';
    this.elScrollbarHandle.style.height = Math.max(1, maxValue - minValue) + 'px';

    this.elWrap.style.top = -this.scroll + 'px';
  };

  var Message = function(data) {
    this.children = [];

    this.template();

    this.time = data.time || new Date;
    if (data.htmlBody) {
      this.html = data.htmlBody
    } else if (data.rawBody) {
      this.html = escapeXML(data.rawBody);
    } else {
      this.body = data.body || '';
    }
  };

  Object.defineProperty(Message.prototype, 'time', {
    set: function(time) {
      this.$time = time;
      this.elTimestamp.textContent = formatTime(time);
    },
    get: function() {
      return this.$time;
    }
  });

  Object.defineProperty(Message.prototype, 'body', {
    set: function(body) {
      this.$body = body;
      this.html = parse(body);
    },
    get: function() {
      return this.$body;
    }
  });

  Object.defineProperty(Message.prototype, 'html', {
    set: function(html) {
      this.$html = html;
      this.elBody.innerHTML = html;
    },
    get: function() {
      return this.$html;
    }
  });

  Object.defineProperty(Message.prototype, 'collapsed', {
    set: function(collapsed) {
      this.$collapsed = collapsed;
      if (collapsed) {
        this.element.classList.add('collapsed');
      } else {
        this.element.classList.remove('collapsed');
      }
    },
    get: function() {
      return this.$collapsed;
    }
  });

  Message.prototype.data = function() {
    return {
      thread: this.thread.id,
      body: this.body
    };
  };

  Message.prototype.template = function() {
    this.element = el('hoth-message');
    this.element.appendChild(this.elHeader = el('hoth-message-header'));
    this.elHeader.appendChild(this.elTimestamp = el('hoth-message-time'));
    this.element.appendChild(this.elBody = el('hoth-message-body'));
  };

  Message.prototype.delete = function() {
    if (!this.thread) return;

    if (this.element.parentNode === this.thread.elMessages) {
      this.thread.elMessages.removeChild(this.element);
    }

    var i = this.thread.messages.indexOf(this);
    if (i !== -1) {
      this.thread.messages.splice(i, 1);
    }
  };

  var ChatMessage = function(data) {
    this.isChat = true;

    Message.call(this, data);

    if (data.author) this.author = data.author;
  };
  ChatMessage.prototype = Object.create(Message.prototype);
  ChatMessage.prototype.constructor = ChatMessage;

  Object.defineProperty(ChatMessage.prototype, 'author', {
    set: function(author) {
      this.$author = author;
      this.elAuthor.textContent = author.name;
    },
    get: function() {
      return this.$author;
    }
  });

  ChatMessage.prototype.data = function() {
    var json = Message.prototype.data.call(this);
    json.author = this.author.id;
    return json;
  };

  ChatMessage.prototype.template = function() {
    Message.prototype.template.call(this);

    this.element.classList.add('chat');

    this.elHeader.appendChild(this.elAuthor = el('hoth-message-author'));
  };

  var SystemMessage = function(data) {
    Message.call(this, data);
  };
  SystemMessage.prototype = Object.create(Message.prototype);
  SystemMessage.prototype.constructor = SystemMessage;

  SystemMessage.prototype.template = function() {
    Message.prototype.template.call(this);

    this.element.classList.add('system');
  };

  var ErrorMessage = function(data) {
    Message.call(this, data);
  };
  ErrorMessage.prototype = Object.create(Message.prototype);
  ErrorMessage.prototype.constructor = ErrorMessage;

  ErrorMessage.prototype.template = function() {
    Message.prototype.template.call(this);

    this.element.classList.add('error');
  };

  var Prompt = function(data) {
    this.element = el('hoth-message');
    this.element.appendChild(this.elBody = el('hoth-message-body'));

    this.elBody.appendChild(this.elInput = el('hoth-message-input', 'textarea'));
    document.body.appendChild(this.elMeasure = el('hoth-message-measure'));
    this.elMeasure.textContent = 'X';

    this.elInput.placeholder = 'Say something\u2026';
    this.elInput.style.height = this.elMeasure.offsetHeight + 'px';

    this.elInput.addEventListener('input', this.autosize.bind(this));
    this.elInput.addEventListener('keydown', this.onKeyDown.bind(this));
  };

  Prompt.prototype.onKeyDown = function(e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      var i = app.threads.indexOf(app.activeThread);
      if (e.keyCode === 221) {
        app.activeThread = app.threads[i + 1] || app.threads[app.threads.length - 1];
        e.preventDefault();
      } else if (e.keyCode === 219) {
        app.activeThread = app.threads[i - 1] || app.threads[0];
        e.preventDefault();
      }
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

    notify.request();

    if (e.keyCode === 13) {
      if (currentUser) {
        if (this.elInput.value) {
          this.send(this.elInput.value);
        }
        this.elInput.value = '';
        this.autosize();
      }
      e.preventDefault();
    }
  };

  Prompt.prototype.autosize = function() {
    this.elMeasure.style.width = this.elInput.offsetWidth + 'px';
    this.elMeasure.textContent = this.elInput.value.replace(/(^|\n)$/, '$1X');
    var height = this.elMeasure.offsetHeight;
    if (this.height !== height) {
      this.height = height;
      this.elInput.style.height = height + 'px';
      if (this.thread) {
        this.thread.contentChanged();
      }
    }
  };

  Prompt.prototype.send = function(value) {
    if (value[0] === '/') {
      this.sendCommand(value.substr(1));
    } else {
      this.sendMessage(value);
    }
  };

  Prompt.prototype.sendMessage = function(value) {
    var x = RE_HASHTAG.exec(value);
    if (x) {
      value = value.slice(x[0].length).trim();
      app.activeThread = Thread.get(x[1]);
      if (!value) return;
    }
    var message = new ChatMessage({
      author: currentUser,
      body: value
    });
    this.thread.reply(message);
  };

  Prompt.prototype.sendCommand = function(command) {
    try {
      new Script(command).run();
    } catch (e) {
      app.activeThread.append(new ErrorMessage({
        body: e.stack || e.toString()
      }));
    }
  };

  Prompt.prototype.focus = function() {
    this.elInput.focus();
  };

  var ScriptError = function(message, source, position) {
    this.message = message;
    this.source = source;
    this.position = position;
  };

  ScriptError.prototype.toString = function() {
    var i = this.position;
    var lines = this.source.split(/\r?\n|\r/);
    while (i > lines[0].length) {
      i -= lines[0].length;
      lines.shift();
    }
    return 'Error: ' + this.message + '\n' + lines[0] + '\n' + Array(i + 1).join(' ') + '^';
  };

  var StringStream = function(string, start, end) {
    this.string = string;
    this.start = start == null ? 0 : start;
    this.end = end == null ? string.length : end;
    this.length = this.end - this.start;
    this.position = 0;
  };

  StringStream.prototype.reset = function() {
    this.position = 0;
  };

  StringStream.prototype.peek = function() {
    if (this.position < 0 || this.position >= this.length) {
      return '';
    }
    return this.string[this.start + this.position];
  };

  StringStream.prototype.next = function() {
    if (this.position < 0 || this.position >= this.length) {
      return '';
    }
    return this.string[this.start + this.position++];
  };

  StringStream.prototype.save = function() {
    return this.position;
  };

  StringStream.prototype.restore = function(state) {
    this.position = state;
  };

  Object.defineProperty(StringStream.prototype, 'whitespace', {
    get: function() {
      var c = this.peek();
      return c === ' ' || c === '\t';
    }
  });

  Object.defineProperty(StringStream.prototype, 'newline', {
    get: function() {
      var c = this.peek();
      return c === '\n' || c === '\r';
    }
  });

  Object.defineProperty(StringStream.prototype, 'wordChar', {
    get: function() {
      var c = this.peek();
      return c && !this.whitespace && !this.newline && c !== '$' && c !== ';' && c !== '(' && c !== ')' && c !== '{' && c !== '}';
    }
  });

  Object.defineProperty(StringStream.prototype, 'atEnd', {
    get: function() {
      return this.position >= this.end;
    }
  });

  StringStream.prototype.consume = function(c) {
    if (this.peek() === c) {
      this.next();
      return true;
    }
    return false;
  };

  StringStream.prototype.require = function(c) {
    if (this.peek() !== c) {
      this.error(c + ' expected', this.save());
    }
    this.next();
  };

  StringStream.prototype.word = function() {
    var value = '';
    while (this.wordChar) {
      value += this.next();
    }
    return value;
  };

  StringStream.prototype.skipSpace = function() {
    while (this.whitespace) {
      this.next();
    }
  };

  StringStream.prototype.skipNewline = function() {
    while (this.newline) {
      this.next();
    }
  };

  StringStream.prototype.error = function(message, place) {
    throw new ScriptError(message, this.string, place);
  };

  var Script = function(source) {
    this.stream = new StringStream(source);
  };

  Script.prototype.run = function() {
    this.stream.reset();
    var expression;
    while (!this.stream.atEnd) {
      this.execCommand();
      while (this.stream.newline || this.stream.whitespace) {
        this.stream.next();
      }
    }
  };

  Script.prototype.execCommand = function() {
    while (this.stream.newline || this.stream.whitespace) {
      this.stream.next();
    }
    var start = this.stream.save();
    var name = this.stream.word();
    if (!name) this.stream.error('Name expected', start);

    var args = [];
    do {
      var arg = this.execArg();
      if (arg) {
        args.push(arg);
      }
    } while (arg);

    if (!commands[name]) {
      this.stream.error(name + ' is undefined', start);
    }
    return commands[name].apply(null, args);
  };

  Script.prototype.execArg = function() {
    this.stream.skipSpace();
    if (this.stream.wordChar) {
      return this.stream.word();
    }
    if (this.stream.consume('$')) {
      return environment[this.execArg()];
    }
    if (this.stream.consume('(')) {
      var result = this.execCommand();
      this.stream.require(')');
      return result;
    }
    if (this.stream.consume('{')) {
      var result = '';
      var brackets = 1;
      for (;;) {
        var c = this.stream.next();
        if (!c) {
          this.stream.error('Expected }', this.stream.save());
        }
        if (c === '{') {
          brackets += 1;
        } else if (c === '}') {
          if (brackets === 1) break;
          brackets -= 1;
        }
        result += c;
      }
      return result;
    }
  };

  var environment = {};

  var commands = {};

  // Debugging

  commands.log = function() {
    app.activeThread.append(new SystemMessage({
      body: [].join.call(arguments, ' ')
    }));
  };

  commands.help = function() {
    var list = [];
    for (var key in commands) if (Object.prototype.hasOwnProperty.call(commands, key)) {
      list.push('```' + key + '```');
    }
    app.activeThread.append(new SystemMessage({
      body: '__Commands:__\n' + list.join('\n')
    }));
  };

  // Control flow

  commands.repeat = function(n, command) {
    for (var i = 0; i < n; i++) {
      new Script(command).run();
    }
  };

  // Variables

  commands.set = function(name, value) {
    environment[name] = value;
  };

  commands.change = function(name, value) {
    environment[name] = Number(environment[name]) + Number(value);
  };

  // Arithmetic

  commands['+'] = function() {
    return [].reduce.call(arguments, function(x, y) {
      return x + Number(y);
    }, 0);
  };

  commands['-'] = function(x, y) {
    return Number(x) - Number(y);
  };

  commands['*'] = function() {
    return [].reduce.call(arguments, function(x, y) {
      return x * Number(y);
    }, 1);
  };

  commands['/'] = function(x, y) {
    return Number(x) / Number(y);
  };

  // Sessions

  commands.signout = function() {
    localStorage.removeItem('hoth.name');
    localStorage.removeItem('hoth.token');
    setTimeout(function() {
      location.reload();
    });
  };

  // Threads

  commands.open = commands.o = function(id) {
    Thread.get(id, function(err, thread) {
      if (err) {
        Thread.get('#' + id, function(err, thread) {
          if (err) return;
          app.activeThread = thread;
        });
        return;
      }
      app.activeThread = thread;
    });
  };

  commands.close = commands.c = function() {
    app.activeThread.close();
  };

  commands.fork = commands.f = function() {
    app.activeThread = new Thread;
  };

  commands.threads = function() {
    app.activeThread.append(new SystemMessage({
      body: '__Open threads:__\n' + app.threads.map(function (thread) {
        return thread.id
      }).join('\n')
    }));
  };

  Object.defineProperty(environment, 'thread', {
    enumerable: true,
    get: function() {
      return app.activeThread.id;
    }
  });

  var User = function(data) {
    this.name = data.name;
    this.id = data.id;
  };
  User.map = {};

  User.get = function(id, callback) {
    if (User.map[id]) {
      callback(null, User.map[id]);
      return;
    }
    socket.emit('user', id, function(err, data) {
      if (err) return callback(err);
      callback(null, User.map[id] = new User(data));
    });
  };

  var currentUser;

  var app = {};

  app.init = function() {
    this.threads = [];
    this.topics = {};

    this.element = el('hoth-app');
    document.body.appendChild(this.element);

    this.element.appendChild(this.elLightbox = el('hoth-lightbox'));
    this.element.appendChild(this.elSignInForm = el('hoth-sign-in-form sign-in'));
    this.elSignInForm.appendChild(this.elUsername = el('hoth-sign-in-input', 'input'));
    this.elUsername.autofocus = true;
    this.elUsername.placeholder = 'Username';
    this.elSignInForm.appendChild(this.elPassword = el('hoth-sign-in-input', 'input'));
    this.elPassword.type = 'password';
    this.elPassword.placeholder = 'Password';
    this.elSignInForm.appendChild(this.elConfirmPassword = el('hoth-sign-in-input register-only', 'input'));
    this.elConfirmPassword.type = 'password';
    this.elConfirmPassword.placeholder = 'Confirm Password';

    this.elSignInForm.appendChild(this.elRememberWrap = el('hoth-sign-in-remember', 'label'));
    this.elRememberWrap.appendChild(this.elRemember = el('hoth-sign-in-checkbox', 'input'));
    this.elRemember.type = 'checkbox';
    this.elRemember.checked = true;
    this.elRememberWrap.appendChild(document.createTextNode('Remember me'));

    this.elSignInForm.appendChild(this.elSignInButton = el('hoth-sign-in-button sign-in-only', 'button'));
    this.elSignInButton.textContent = 'Sign In';
    this.elSignInForm.appendChild(this.elRegisterButton = el('hoth-sign-in-button sign-in-only', 'button'));
    this.elRegisterButton.textContent = 'Create Account';
    this.elSignInForm.appendChild(this.elRegisterBackButton = el('hoth-sign-in-button register-only', 'button'));
    this.elRegisterBackButton.textContent = 'Back';
    this.elSignInForm.appendChild(this.elRegisterGoButton = el('hoth-sign-in-button register-only', 'button'));
    this.elRegisterGoButton.textContent = 'Go';
    this.hideSignIn();

    this.lobby = Thread.get('#lobby');
    this.append(this.lobby);

    this.prompt = new Prompt;
    this.onHashChange();
    if (!this.activeThread) {
      this.activeThread = this.lobby;
    }

    var name = localStorage.getItem('hoth.name');
    var token = localStorage.getItem('hoth.token');
    if (name && token) {
      socket.emit('sign in', {
        name: name,
        token: token
      }, function(err, data) {
        if (err) {
          app.showSignIn();
          return;
        }
        app.signIn(data);
        app.lobby.append(new SystemMessage({
          body: 'You were automatically signed in. Type [`/signout`] to sign out.'
        }));
      });
    } else {
      this.showSignIn();
    }

    document.body.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('resize', this.layout.bind(this));
    window.addEventListener('hashchange', this.onHashChange.bind(this));

    this.elUsername.addEventListener('keydown', this.onKeySubmit.bind(this));
    this.elPassword.addEventListener('keydown', this.onKeySubmit.bind(this));
    this.elConfirmPassword.addEventListener('keydown', this.onKeySubmit.bind(this));
    this.elSignInButton.addEventListener('click', this.onSignInClick.bind(this));
    this.elRegisterButton.addEventListener('click', this.onRegisterClick.bind(this));
    this.elRegisterBackButton.addEventListener('click', this.onRegisterBackClick.bind(this));
    this.elRegisterGoButton.addEventListener('click', this.onRegisterGoClick.bind(this));
  };

  app.showSignIn = function() {
    this.elLightbox.style.display = 'block';
    this.elSignInForm.style.display = 'block';
    this.elUsername.value = localStorage.getItem('hoth.name');
    this.focusSignIn();
  };

  app.hideSignIn = function() {
    this.elLightbox.style.display = 'none';
    this.elSignInForm.style.display = 'none';
    setTimeout(function() {
      app.prompt.focus();
    });
  };

  app.focusSignIn = function() {
    setTimeout(function() {
      if (!this.elUsername.value) {
        this.elUsername.focus();
      } else if (!this.elPassword.value) {
        this.elPassword.focus();
      } else {
        this.elConfirmPassword.focus();
      }
    }.bind(this));
  };

  app.onKeySubmit = function(e) {
    if (e.keyCode === 13) {
      if (this.elSignInForm.classList.contains('register')) {
        this.onRegisterGoClick();
      } else {
        this.onSignInClick();
      }
    }
  };

  app.onSignInClick = function() {
    if (this.elSignInButton.disabled) return;
    this.removeSignInFeedback();
    this.elSignInButton.disabled = true;
    socket.emit('sign in', {
      name: this.elUsername.value,
      password: this.elPassword.value,
      remember: this.elRemember.checked
    }, function(err, data) {
      app.elSignInButton.disabled = false;
      if (err) {
        app.elUsername.classList.add('error');
        app.elPassword.classList.add('error');
        return;
      }
      app.signIn(data);
    });
  };

  app.onRegisterClick = function() {
    this.removeSignInFeedback();
    this.elSignInForm.classList.remove('sign-in');
    this.elSignInForm.classList.add('register');
    this.focusSignIn();
  };

  app.onRegisterBackClick = function() {
    this.removeSignInFeedback();
    this.elSignInForm.classList.add('sign-in');
    this.elSignInForm.classList.remove('register');
    this.focusSignIn();
  };

  app.onRegisterGoClick = function() {
    if (this.elRegisterGoButton.disabled) return;
    this.removeSignInFeedback();
    if (this.elPassword.value < 8) {
      this.elPassword.classList.add('error');
      return;
    }
    if (this.elConfirmPassword.value !== this.elPassword.value) {
      this.elConfirmPassword.classList.add('error');
      return;
    }
    this.elRegisterGoButton.disabled = true;
    socket.emit('create account', {
      name: this.elUsername.value,
      password: this.elPassword.value,
      remember: this.elRemember.checked
    }, function(err, data) {
      app.elRegisterGoButton.disabled = false;
      if (err === 'user already exists' || err === 'bad username') {
        app.elUsername.classList.add('error');
        return;
      } else if (err) {
        app.elPassword.classList.add('error');
        return;
      }
      app.signIn(data);
    });
  };

  app.removeSignInFeedback = function() {
    this.elUsername.classList.remove('error');
    this.elPassword.classList.remove('error');
    this.elConfirmPassword.classList.remove('error');
  };

  app.signIn = function(data) {
    currentUser = new User(data.user);
    localStorage.setItem('hoth.name', currentUser.name);
    if (data.token) {
      localStorage.setItem('hoth.token', data.token);
    } else {
      localStorage.removeItem('hoth.token');
    }
    this.hideSignIn();
    socket.emit('init');
  };

  Object.defineProperty(app, 'prompt', {
    set: function(prompt) {
      if (this.$prompt) {
        this.$prompt.delete();
      }
      this.$prompt = prompt;
      if (this.activeThread) {
        this.activeThread.prompt = prompt;
      }
    },
    get: function() {
      return this.$prompt;
    }
  });

  app.thread = Thread.get;
  app.topic = Thread.topic;

  Object.defineProperty(app, 'activeThread', {
    set: function(thread) {
      if (this.$activeThread === thread) return;

      if (this.$activeThread = thread) {
        if (!thread.open) {
          this.append(thread);
        }
        if (thread.permalink) {
          location.hash = thread.permalink;
        }
        thread.element.scrollIntoView();
        if (this.prompt) {
          thread.prompt = this.prompt;
          setTimeout(function() {
            this.prompt.focus();
          }.bind(this));
        }
      }
    },
    get: function() {
      return this.$activeThread;
    }
  });

  app.append = function(thread) {
    if (thread.open) return;
    this.threads.push(thread);
    this.element.appendChild(thread.element);
    thread.open = true;
    thread.viewportChanged();
  };

  app.layout = function() {
    this.threads.forEach(function(thread) {
      thread.viewportChanged();
    });
  };

  app.reply = function(message) {
    this.activeThread.reply(message);
  };

  app.onKeyDown = function(e) {
    var modifiers =
      (e.ctrlKey ? 'c' : '') +
      (e.altKey ? 'a' : '') +
      (e.shiftKey ? 's' : '') +
      (e.metaKey ? 'm' : '');
  };

  app.onHashChange = function() {
    var hash = location.hash;
    if (hash.length <= 1) return;
    if (hash[1] === '{' || hash[1] === '[') {
      try {
        var json = JSON.parse(hash.slice(1));
      } catch (e) {}
      if (json) {
        if (Object.prototype.toString.call(json) === '[object Array]') {
          for (var i = 0; i < json.length; i++) {
            this.runHash(json[i]);
          }
        } else {
          this.runHash(json);
        }
      }
      if (this.activeThread) {
        location.replace((location + '').split('#')[0] + this.activeThread.permalink);
      }
      return;
    }
    this.activeThread = Thread.get(hash);
  };

  app.runHash = function(json) {
    if (json.goto) {
      app.activeThread = Thread.get(json.goto);
    } else if (json.run) {
      try {
        new Script(json.run).run();
      } catch (e) {
        (app.activeThread || this.lobby).append(new ErrorMessage({
          body: e.stack || e.toString()
        }));
      }
    }
  };

  Object.defineProperty(app, 'currentUser', {
    get: function () {
      return currentUser;
    }
  });

  var notify;
  if (typeof webkitNotifications !== 'undefined') {
    notify = function(data) {
      if (webkitNotifications.checkPermission() !== 0 || document.hasFocus()) return;

      var notification = webkitNotifications.createNotification('', data.title || document.title, data.body);

      notification.onclick = function() {
        window.focus();
        if (data.thread) app.activeThread = data.thread;
        var i = notify.visible.indexOf(notification);
        if (i !== -1) {
          notify.visible.splice(i, 1);
        }
        notification.close();
      };

      notification.show();
      notify.visible.push(notification);
    };
    notify.request = function() {
      webkitNotifications.requestPermission();
    };
  } else {
    notify = function() {};
    notify.request = function() {};
  }
  notify.visible = [];

  window.addEventListener('focus', function() {
    if (!notify.visible.length) return;

    for (var i = 0; i < notify.visible.length; i++) {
      notify.visible[i].close();
    }
    notify.visible = [];
  });

  var socket = io.connect('https://' + location.host, { secure: true });

  socket.on('system', function(data) {
    if (!data.body) return;
    Thread.get(data.thread).append(new SystemMessage({ body: data.body }));
  }.bind(this));

  socket.on('chat', function(data) {
    if (!data.body) return;
    User.get(data.author, function(err, user) {
      if (err) return;
      var thread = Thread.get(data.thread);
      notify({
        title: user.name + (thread.id ? ' (' + thread.id + ')' : ''),
        body: data.body
      });
      thread.append(new ChatMessage({
        author: user,
        body: data.body
      }));
    });
  });

  socket.on('open thread', function(name) {
    Thread.get(name, function(err, thread) {
      if (err) return;
      app.append(thread);
    });
  });

  app.init();

  app.User = User;
  app.Thread = Thread;
  app.ChatMessage = ChatMessage;
  app.SystemMessage = SystemMessage;
  app.Message = Message;

  app.environment = environment;
  app.commands = commands;

  app.notify = notify;

  return app;

}());

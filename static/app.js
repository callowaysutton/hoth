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
    var now = new Date;
    var s = '';
    if (d.getFullYear() !== now.getFullYear() ||
        d.getMonth() !== now.getMonth() ||
        d.getDate() !== now.getDate()) {
      s += d.toLocaleDateString() + ' ';
    }

    s += d.getHours() + ':' + pad('0', 2, '' + d.getMinutes());
    return s;
  };

  var escapeXML = function(string) {
    return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/, '&apos;');
  };

  var RE_HASHTAG = /^(#([^\s{}\[\]]+?)|!(\w+))([\.!?"',;:\)\]]*(\s|$))/;
  var RE_AUTOLINK = /^(https?:\/\/\S+)([\.!?"',;:\)\]]*(\s|$))/;
  var RE_LINK = /^<(https?:\/\/[^>]+)>/;
  var RE_INLINE_CODE = /^(\[(`+)([^]+?)\2\])|^((`+)([^]+?)\5)/;
  var RE_STRONG = /^__/;
  var RE_EMPHASIS = /^_/;
  var RE_ESCAPE = /^\\(.)/;
  var RE_WORD = /^[^\[!`_\s#\\][^\s_#\\]+|^\s+/;

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
      } else if (x = RE_AUTOLINK.exec(sub)) {
        result += '<a target=_blank href="' + escapeXML(x[1]) + '">' + escapeXML(x[1]) + '</a>' + escapeXML(x[2]);
      } else if (x = RE_LINK.exec(sub)) {
        result += '&lt;<a target=_blank href="' + escapeXML(x[1]) + '">' + escapeXML(x[1]) + '</a>&gt;';
      } else if (x = RE_ESCAPE.exec(sub)) {
        result += escapeXML(x[1]);
      } else if (x = RE_WORD.exec(sub)) {
        result += escapeXML(x[0]);
      } else {
        var j = string.slice(i + 1).search(/[\\#!\[`_<h]/);
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

  var escapeMarkup = function(text) {
    return text.replace(/[\\#!\[`_<h]/g, '\\$&');
  };

  var Thread = function(data) {
    if (!data) data = {};

    this.messages = [];
    this.shouldAutoscroll = true;
    this.loaded = false;
    this.contentSize = 0;
    this.dragging = false;
    this.$scroll = 0;

    this.onScrollMouseMove = this.onScrollMouseMove.bind(this);
    this.onScrollMouseUp = this.onScrollMouseUp.bind(this);

    this.template();

    this.id = data.id;

    this.prompt = data.prompt == null ? '/' : data.prompt;

    if (this.id) {
      socket.emit('open thread', this.id);
      this.initLoad();
    } else if (data.assignId) {
      this.loaded = true;
      socket.emit('create thread', function(err, uid) {
        if (err) return;
        this.id = '!' + uid;
        Thread.map[this.id] = this;
        if (app.activeThread === this) {
          location.hash = this.permalink;
        }
      }.bind(this));
    } else {
      this.loaded = true;
    }
  };

  Thread.map = {};

  Thread.get = function(id) {
    id = id.toLowerCase();

    var thread = Thread.map[id] || (Thread.map[id] = new Thread({ id: id }));
    app.append(thread);
    return thread;
  };

  Thread.fork = function() {
    return new Thread({ assignId: true });
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
    this.elContent.addEventListener('scroll', this.onScroll.bind(this));
    this.element.addEventListener('click', this.onClick.bind(this));
    this.element.addEventListener('mousewheel', this.onMouseWheel.bind(this));
  };

  Object.defineProperty(Thread.prototype, 'id', {
    set: function(id) {
      this.$id = id;
      this.title = id ? id.slice(1) : '';
      this.element.classList.remove('topic');
      this.element.classList.remove('temp');
      if (id) {
        if (id[0] === '#') {
          this.element.classList.add('topic');
        } else {
          this.element.classList.add('temp');
        }
      }
    },
    get: function() {
      return this.$id;
    }
  });

  Object.defineProperty(Thread.prototype, 'title', {
    set: function(title) {
      this.$title = title;
      this.elName.textContent = title;
    },
    get: function() {
      return this.$title;
    }
  });

  Object.defineProperty(Thread.prototype, 'permalink', {
    get: function() {
      return this.id && (this.id[0] === '#' ? this.id : '#' + JSON.stringify([{ goto: this.id }]));
    }
  });

  Object.defineProperty(Thread.prototype, 'firstMessage', {
    get: function() {
      return this.messages[0];
    }
  });

  Object.defineProperty(Thread.prototype, 'lastMessage', {
    get: function() {
      return this.messages[this.messages.length - 1];
    }
  });

  Object.defineProperty(Thread.prototype, 'active', {
    get: function() {
      return app.activeThread === this;
    }
  });

  Thread.prototype.COLLAPSE_THRESHOLD = 1000 * 60 * 2;

  Thread.prototype.append = function(message) {
    var messages = [].concat.apply([], [].slice.call(arguments));
    for (var i = 0; i < messages.length; i++) {
      message = messages[i];
      message.delete();

      if (this.lastMessage && this.lastMessage.authorId === message.authorId && message.time - this.lastMessage.time < Thread.prototype.COLLAPSE_THRESHOLD && this.lastMessage.type === message.type) {
        message.collapsed = true;
      }

      this.messages.push(message);
      if (this.input) {
        this.elMessages.insertBefore(message.element, this.input.element);
      } else {
        this.elMessages.appendChild(message.element);
      }
      message.thread = this;

      if (message.type === 'chat') {
        app.emitMessage(message);
      }
    }

    this.messageCount += messages.length;
    this.contentChanged();
  };

  Thread.prototype.insert = function(index, message) {
    var oldSize = this.contentSize;

    var messages = [].concat.apply([], [].slice.call(arguments, 1));
    for (var i = messages.length; i--;) {
      message = messages[i];
      message.delete();

      var after = this.messages[index];
      if (after && after.authorId === message.authorId && message.time - this.lastMessage.time < Thread.prototype.COLLAPSE_THRESHOLD && after.type === message.type) {
        after.collapsed = true;
      }

      this.messages.splice(index, 0, message);
      this.elMessages.insertBefore(message.element, after ? after.element : this.input ? this.input.element : null);
      message.thread = this;
    }

    this.messageCount += messages.length;
    this.contentSize = this.elWrap.offsetHeight;
    this.scroll += this.contentSize - oldSize;
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

    if (this.active) {
      app.activeThread = null;
    }
  };

  Thread.prototype.reply = function(message) {
    this.shouldAutoscroll = true;
    this.append(message);
    if (this.id) {
      socket.emit(message.type, message.data());
      if (message.type !== 'chat') {
        app.emitMessage(message);
      }
    }
  };

  Thread.prototype.activate = function() {
    if (this.permalink) {
      location.hash = this.permalink;
    }
    this.element.scrollIntoView();
    this.element.classList.add('active');
    if (!this.input) {
      this.createInput();
    }
    if (this.input) {
      if (this.input.empty) {
        this.input.show();
        this.contentChanged();
      }
      setTimeout(function() {
        this.input.focus();
      }.bind(this));
    }
  };

  Thread.prototype.createInput = function() {
    this.input = new Input({ thread: this });
    this.elMessages.appendChild(this.input.element);
    this.input.reset();
  };

  Thread.prototype.deactivate = function() {
    this.element.classList.remove('active');
    if (this.input && this.input.empty) {
      this.input.hide();
      this.contentChanged();
    }
  };

  Thread.CHUNK_SIZE = 50;
  Thread.LOAD_POLL_TIME = 200;
  Thread.LOAD_THRESHOLD = 1000;

  Thread.prototype.initLoad = function() {
    if (this.loading || this.messageCount) {
      return;
    }
    this.loading = true;
    socket.emit('thread length', {
      thread: this.id
    }, function(err, count) {
      if (err) return;
      this.loading = false;
      this.messageCount = count;
      this.load();
    }.bind(this));
  };

  Thread.prototype.load = function() {
    if (this.loaded) return;
    if (this.loading) {
      clearTimeout(this.loadTimeout);
      this.loadTimeout = setTimeout(this.load.bind(this), Thread.LOAD_POLL_TIME);
      return;
    }

    var length = Thread.CHUNK_SIZE;
    var offset = this.messageCount - this.messages.length - length;
    if (offset < 0) {
      length += offset;
      offset = 0;
    }

    if (length === 0) {
      this.loaded = true;
      return;
    }

    this.loading = true;
    socket.emit('thread history', {
      thread: this.id,
      offset: offset,
      length: length
    }, function(err, data) {
      if (err) return;

      this.insert(0, data.map(Message.fromJSON));
      this.messageCount -= data.length;

      if (offset === 0) {
        this.loaded = true;
      }
      this.loading = false;
    }.bind(this));
  };

  Thread.prototype.onMouseWheel = function(e) {
    this.shouldAutoscroll = false;
    this.scroll -= e.wheelDeltaY;
    this.updateScroll();
  };

  Thread.prototype.onClick = function() {
    app.activeThread = this;
    if (document.getSelection().isCollapsed && this.shouldAutoscroll) {
      if (this.input) {
        this.input.focus();
      }
    }
  };

  Thread.prototype.onScroll = function(e) {
    var scroll = this.elContent.scrollTop;
    this.elContent.scrollTop = 0;
    this.scroll += scroll;
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
      if (this.shouldAutoscroll && this.input) {
        this.input.focus();
      }
    }
    if (this.scroll < Thread.LOAD_THRESHOLD && !this.loaded) {
      this.load();
    }
    var x = (max - this.scroll) / this.viewportSize;
    var y = (max - (this.scroll + this.viewportSize)) / this.viewportSize;

    var minValue = this.scrollbarSize * (1 - Thread.SCROLL_CONSTANT * x / (Thread.SCROLL_CONSTANT * x + 1));
    var maxValue = this.scrollbarSize * (1 - Thread.SCROLL_CONSTANT * y / (Thread.SCROLL_CONSTANT * y + 1));

    this.elScrollbarHandle.style.top = minValue + 'px';
    this.elScrollbarHandle.style.height = Math.max(1, maxValue - minValue) + 'px';

    this.elWrap.style.top = -this.scroll + 'px';
  };

  Thread.prototype.send = function(data) {
    if (data.slice(0, this.prompt.length) !== this.prompt) {
      this.sendMessage(data);
    } else {
      this.sendCommand(data.slice(this.prompt.length));
    }
  };

  Thread.prototype.sendMessage = function(value) {
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
    app.activeThread.reply(message);
  };

  Thread.prototype.sendCommand = function(command) {
    this.append(new Message({
      type: 'terminal',
      rawBody: this.prompt + command
    }));
    app.run(command);
  };

  var Console = function() {
    Thread.call(this, {});

    this.alwaysPrompt = true;
    this.title = 'Console';
    this.prompt = '';
  };
  Console.prototype = Object.create(Thread.prototype);
  Console.prototype.constructor = Console;

  Console.prototype.reply = function() {};

  var Message = function(data) {
    this.children = [];

    this.template();

    this.time = data.time || new Date;
    if (data.htmlBody) {
      this.html = data.htmlBody;
    } else if (data.rawBody) {
      this.html = escapeXML(data.rawBody);
    } else {
      this.body = data.body || '';
    }

    this.type = data.type || 'system';
  };

  Message.fromJSON = function(data) {
    if (data.type === 'system') {
      return new Message({
        body: data.body,
        time: new Date(data.sent)
      });
    }
    if (data.type === 'chat') {
      return new ChatMessage({
        author: data.author,
        body: data.body,
        time: new Date(data.sent)
      });
    }
    throw new Error('Invalid message type');
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

  Object.defineProperty(Message.prototype, 'type', {
    set: function(type) {
      if (this.$type) {
        this.element.classList.remove(this.$type);
      }
      if (this.$type = type) {
        this.element.classList.add(type);
      }
    },
    get: function() {
      return this.$type;
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

    this.thread.messageCount -= 1;
    this.thread = null;
  };

  var ChatMessage = function(data) {
    Message.call(this, data);

    this.type = 'chat';
    if (data.author) this.author = data.author;
  };
  ChatMessage.prototype = Object.create(Message.prototype);
  ChatMessage.prototype.constructor = ChatMessage;

  Object.defineProperty(ChatMessage.prototype, 'author', {
    set: function(author) {
      this.$author = author;
      if (typeof author === 'string') {
        this.elAuthor.textContent = '';
        User.get(author, function(err, user) {
          if (err) return;
          this.author = user;
        }.bind(this));
      } else {
        this.elAuthor.textContent = author.name;
      }
    },
    get: function() {
      return this.$author;
    }
  });

  Object.defineProperty(ChatMessage.prototype, 'authorId', {
    get: function() {
      return this.author.id || this.author;
    }
  });

  ChatMessage.prototype.data = function() {
    var json = Message.prototype.data.call(this);
    json.author = this.author.id;
    return json;
  };

  ChatMessage.prototype.template = function() {
    Message.prototype.template.call(this);

    this.elHeader.appendChild(this.elAuthor = el('hoth-message-author'));
  };

  var Input = function(data) {
    this.element = el('hoth-message');
    this.element.appendChild(this.elBody = el('hoth-message-body'));

    this.elBody.appendChild(this.elInput = el('hoth-message-input', 'textarea'));
    document.body.appendChild(this.elMeasure = el('hoth-message-measure'));
    this.elMeasure.textContent = 'X';

    this.elInput.placeholder = 'Say something\u2026';
    this.elInput.style.height = this.elMeasure.offsetHeight + 'px';

    this.elInput.addEventListener('input', this.autosize.bind(this));
    this.elInput.addEventListener('keydown', this.onKeyDown.bind(this));

    this.thread = data.thread;
  };

  Object.defineProperty(Input.prototype, 'empty', {
    get: function() {
      return this.elInput.value === '';
    }
  });

  Object.defineProperty(Input.prototype, 'value', {
    get: function() {
      return this.elInput.value;
    },
    set: function(value) {
      this.elInput.value = value;
      this.autosize();
    }
  });

  Input.prototype.onKeyDown = function(e) {
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
        var value = this.value;
        this.reset();
        if (value) this.thread.send(value);
      }
      e.preventDefault();
    }
  };

  Input.prototype.reset = function() {
    this.value = this.thread.alwaysPrompt ? this.thread.prompt : '';
    this.elInput.selectionStart = this.elInput.selectionEnd = this.value.length;
    this.autosize();
  };

  Input.prototype.show = function() {
    this.element.style.display = '';
  };

  Input.prototype.hide = function() {
    this.element.style.display = 'none';
  };

  Input.prototype.autosize = function() {
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
    this.classify();
  };

  Input.prototype.classify = function() {
    if (this.elInput.value.slice(0, this.thread.prompt.length) === this.thread.prompt) {
      this.element.classList.add('terminal');
    } else {
      this.element.classList.remove('terminal');
    }
  };

  Input.prototype.focus = function() {
    this.elInput.focus();
  };

  var ScriptError = function(message, source, position) {
    this.message = message;
    this.source = source;
    this.position = position;
  };

  ScriptError.prototype.toString = function() {
    var i = this.position;
    var lines = this.source.split(/(?=\r?\n|\r)/);
    while (i > lines[0].length) {
      i -= lines[0].length;
      lines.shift();
    }
    var line = lines[0].replace(/\r?\n|\r/, function(x) {
      i -= x.length;
      return '';
    });
    return 'Error: ' + this.message + '\n' + line + '\n' + Array(i + 1).join(' ') + '^';
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

  StringStream.prototype.consumeAll = function(s) {
    var state = this.save();
    for (var i = 0; i < s.length; i++) {
      if (this.peek() !== s.charAt(i)) {
        this.restore(state);
        return false;
      }
      this.next();
    }
    return true;
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

  StringStream.prototype.space = function() {
    var value = '';
    while (this.whitespace) {
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

  Script.prototype.run = function(environment) {
    var state = this.stream.save();
    var oldEnvironment = this.environment;

    this.stream.reset();
    this.environment = environment;

    var expression;
    while (!this.stream.atEnd) {
      expression = this.execCommand();
      while (this.stream.newline || this.stream.whitespace) {
        this.stream.next();
      }
    }

    this.stream.restore(state);
    this.environment = oldEnvironment;

    return expression;
  };

  var NO_ARG = {};

  Script.prototype.execCommand = function() {
    while (this.stream.newline || this.stream.whitespace) {
      this.stream.next();
    }
    var start = this.stream.save();
    var name = this.stream.word();
    if (!name) this.stream.error('Name expected', start);

    var args = [];
    for (;;) {
      var arg = this.execExp(0);
      if (arg === NO_ARG) break;
      args.push(arg);
    }

    return this.call(name, args, start);
  };

  Script.prototype.execExp = function(precedence) {
    var arg = this.execArg();
    var operators = this.environment.operators;
    var operatorNames = commands.keys(operators);
    do {
      var has = false;
      this.stream.skipSpace();
      var start = this.stream.save();
      for (var i = 0; i < operatorNames.length; i++) {
        var op = operators[operatorNames[i]];
        var prec = commands.isobj(op) ? op.precedence : Number(op);
        var right = commands.isobj(op) && op.right;
        var state = this.stream.save();
        if (prec >= precedence && this.stream.consumeAll(operatorNames[i])) {
          if (!this.stream.space()) {
            this.stream.restore(state);
          } else {
            arg = this.call(operatorNames[i], [arg, this.execExp(right ? prec : prec + .0001)], start);
            has = true;
            break;
          }
        }
      }
    } while (has);
    return arg;
  };

  Script.prototype.call = function(name, args, start) {
    if (!commands[name]) {
      this.stream.error(name + ' is undefined', start);
    }
    commands[name].environment = this.environment;
    return commands[name].apply(null, args);
  };

  Script.prototype.execArg = function() {
    this.stream.skipSpace();
    if (this.stream.wordChar) {
      return this.stream.word();
    }
    if (this.stream.consume('$')) {
      return this.environment[this.stream.word()];
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
    return NO_ARG;
  };

  var globals = Object.create(null);
  var handlers = {};
  var commands = {};

  // Introspection

  globals.operators = {
    '.': 20,
    '=': 40,
    '+': 50,
    '-': 50,
    '*': 60,
    '/': 60,
    '^': { precedence: 70, right: true },
    '|': 80,
    '@': 90
  };

  Object.defineProperty(globals, 'vars', {
    get: function() {
      return this;
    }
  });

  globals.globals = globals;

  // Debugging

  commands.print = function() {
    app.activeThread.append(new Message({
      body: [].map.call(arguments, function(arg) {
        return commands.isstr(arg) ? arg : commands.tostr(arg);
      }).join(' ')
    }));
  };

  commands.show = function() {
    app.activeThread.append(new Message({
      body: [].map.call(arguments, function(arg) {
        return commands.tostr(arg);
      }).join(' ')
    }));
  };

  commands.log = function() {
    console.log.apply(console, arguments);
  };

  commands.tostr = function(obj, instances) {
    if (instances) {
      var i = instances.indexOf(obj);
      if (i !== -1) {
        return '*recursion@' + i + '*';
      }
    } else {
      instances = [];
    }
    switch (commands.type(obj)) {
      case 'number':
      case 'boolean':
        return '' + obj;
      case 'string':
        if (/^[^ \t\n\r$;(){}]+$/.test(obj)) {
          return obj;
        } else {
          return '{' + obj + '}';
        }
      case 'object':
        instances.push(obj);
        var keys = commands.keys(obj);
        return '(#' + (keys.length ? ' ' + keys.map(function(key) {
          return commands.tostr(key, instances) + ' ' + commands.tostr(obj[key], instances);
        }).join(' ') : '') + ')';
      case 'array':
        return '(:' + (obj.length ? ' ' + obj.map(function(item) {
          return commands.tostr(item, instances);
        }).join(' ') : '') + ')';
      default:
        return '*internal*';
    }
  };

  commands.help = function() {
    var list = [];
    for (var key in commands) if (Object.prototype.hasOwnProperty.call(commands, key)) {
      list.push('```' + key + '```');
    }
    app.activeThread.append(new Message({
      body: '__Commands:__\n' + list.join('\n')
    }));
  };

  commands.console = function() {
    app.activeThread = new Console;
  };

  // Types

  commands.type = function(obj) {
    return typeof obj === 'boolean' ? 'boolean' :
      typeof obj === 'number' ? 'number' :
      typeof obj === 'string' ? 'string' :
      Object.prototype.toString.call(obj) === '[object Array]' ? 'array' :
      Object.prototype.toString.call(obj) === '[object Object]' ? 'object' :
      'internal';
  };

  commands['bool?'] = commands.isbool = function(obj) {
    return commands.type(obj) === 'boolean';
  };

  commands['num?'] = commands.isnum = function(obj) {
    return commands.type(obj) === 'number';
  };

  commands['str?'] = commands.isstr = function(obj) {
    return commands.type(obj) === 'string';
  };

  commands['arr?'] = commands.isarr = function(obj) {
    return commands.type(obj) === 'array';
  };

  commands['obj?'] = commands.isobj = function(obj) {
    return commands.type(obj) === 'object';
  };

  commands['internal?'] = commands.isinternal = function(obj) {
    return commands.type(obj) === 'internal';
  };

  // Control flow

  commands.repeat = function(n, command) {
    var body = new Script(command);
    for (var i = 0; i < n; i++) {
      body.run(app.env(commands.repeat.environment, {
        '#': i
      }));
    }
  };

  commands.if = function(condition, then, else_, otherwise) {
    if (condition) {
      return new Script(then).run(commands.if.environment);
    } else {
      if (else_) {
        if (else_ !== 'else') throw new ScriptError('"else" expected');
        return new Script(otherwise).run(commands.if.environment);
      }
    }
  };

  commands.def = function(name) {
    var environment = commands.def.environment;
    var fps = [].slice.call(arguments, 1, -1);
    var body = new Script(arguments[fps.length + 1]);
    commands[name] = function() {
      var vars = Object.create(environment);
      for (var i = 0; i < fps.length; i++) {
        if (fps[i] === '...') {
          vars['...'] = [].slice.call(arguments, i);
          break;
        }
        vars[fps[i]] = arguments[i];
      }
      return body.run(vars);
    };
  };

  commands.with = function(value, body) {
    return new Script(body).run(app.env(commands.with.environment, {
      '.': value
    }));
  };

  commands.when = function(value, body) {
    if (commands['='](commands.when.environment['.'], value)) {
      return new Script(body).run(commands.when.environment);
    }
  };

  commands.run = function(body, vars) {
    return new Script(body).run(vars);
  };

  // Variables

  commands.set = function(name, value) {
    try {
      globals[name] = value;
    } catch (e) {}
  };

  commands.change = function(name, value) {
    globals[name] = Number(globals[name]) + Number(value);
  };

  // Dicts

  commands.dict = commands['#'] = function() {
    var result = Object.create(null);
    var args = arguments;
    for (var i = 0; i + 1 < args.length; i += 2) {
      result[args[i]] = args[i + 1];
    }
    return result;
  };

  commands.put = function(dict) {
    var args = arguments;
    for (var i = 1; i + 1 < args.length; i += 2) {
      dict[args[i]] = args[i + 1];
    }
    return dict;
  };

  commands.get = commands['@'] = function(dict, key) {
    return dict[key];
  };

  commands.clone = commands['#+'] = function(object) {
    var result = Object.create(object);
    var args = arguments;
    for (var i = 1; i + 1 < args.length; i += 2) {
      result[args[i]] = args[i + 1];
    }
    return result;
  };

  commands.ownkeys = function(object) {
    return Object.getOwnPropertyNames(object);
  };

  commands.keys = function(object) {
    var keys = [];
    var p = object;
    while (p && p !== Object.prototype) {
      keys = keys.concat(Object.getOwnPropertyNames(p));
      p = Object.getPrototypeOf(p);
    }
    return keys;
  };

  // Lists

  commands.list = commands[':'] = function() {
    return [].slice.call(arguments);
  };

  commands.each = function() {
    var a = 0;
    var list = arguments[a++];
    var name = arguments[a] === 'as' ? (a++, arguments[a++]) : '?';
    var body = new Script(arguments[a++]);
    for (var i = 0; i < list.length; i++) {
      var vars = {};
      vars[name] = list[i];
      vars['#'] = i;
      vars['.'] = list;
      body.run(app.env(commands.each.environment, vars));
    }
  };

  commands.add = function(list, item) {
    list.push.apply(list, [].slice.call(arguments, 1));
    return list;
  };

  commands.next = function(list) {
    return list.shift();
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

  commands['^'] = function(x, y) {
    return Math.pow(Number(x), Number(y));
  };

  // Strings

  globals.NL = '\n';

  commands['.'] = function() {
    return [].join.call(arguments, '');
  };

  // Equality

  commands['='] = function(x, y) {
    return commands.tostr(x) === commands.tostr(y);
  };

  commands['|'] = function(x, y) {
    return x == null ? y : x;
  };

  // Events

  commands.on = function(event, listener) {
    if (!handlers[event]) handlers[event] = [];

    handlers[event].push(new Script(listener));
  };

  commands.unlisten = function(event) {
    delete handlers[event];
  };

  // Persistence

  commands.unstash = function(key) {
    var s = localStorage.getItem('hoth.scripts.' + key);
    try {
      return JSON.parse(s);
    } catch (e) {}
  };

  commands.stash = function(key, obj) {
    // TODO: discards prototypes
    localStorage.setItem('hoth.scripts.' + key, JSON.stringify(obj));
  };

  // Sessions

  commands.signout = function() {
    localStorage.removeItem('hoth.name');
    localStorage.removeItem('hoth.token');
    setTimeout(function() {
      location.reload();
    });
  };

  // Users

  commands.online = function() {
    User.online(function(err, list) {
      if (err) return;
      app.activeThread.append(new Message({
        body: '__Online users:__\n' + list.sort().map(function(name) {
          return escapeMarkup(name);
        }).join('\n')
      }));
    });
  };

  // Messages

  commands.say = function() {
    app.reply(new ChatMessage({
      author: currentUser,
      body: [].join.call(arguments, ' ')
    }));
  };

  commands.setsay = function(string) {
    app.activeThread.input.value = string;
  };

  commands.setprompt = function(string) {
    app.activeThread.input.value = app.activeThread.prompt + string;
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
    app.activeThread = Thread.fork();
  };

  commands.threads = function() {
    app.activeThread.append(new Message({
      body: '__Open threads:__\n' + app.threads.map(function (thread) {
        return thread.id
      }).join('\n')
    }));
  };

  Object.defineProperty(globals, 'thread', {
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

  User.online = function(callback) {
    socket.emit('user list', function(err, list) {
      if (err) return callback(err);
      callback(null, list);
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
    this.element.appendChild(this.elWarning = el('hoth-dialog'));
    this.elWarning.style.display = 'none';
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
        app.lobby.append(new Message({
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

    [].forEach.call(document.querySelectorAll('script[type="text/x-hoth"]'), function(script) {
      app.run(script.textContent);
    });
  };

  Object.defineProperty(app, 'connected', {
    set: function(connected) {
      this.$connected = connected;
      if (!this.connected) {
        this.warn('Not connected');
      } else {
        this.hideWarning();
      }
    },
    get: function() {
      return this.$connected;
    }
  });

  app.hideWarning = function() {
    this.warning = null;
    if (this.signInShown) return;
    this.elLightbox.style.display = 'none';
    this.elWarning.style.display = 'none';
  };

  app.warn = function(message) {
    this.warning = message;
    if (this.signInShown) return;
    this.elWarning.textContent = message;
    this.elLightbox.style.display = 'block';
    this.elWarning.style.display = 'block';
  };

  app.showSignIn = function() {
    this.elLightbox.style.display = 'block';
    this.elSignInForm.style.display = 'block';
    this.signInShown = true;
    this.elUsername.value = localStorage.getItem('hoth.name');
    this.focusSignIn();
  };

  app.hideSignIn = function() {
    this.elSignInForm.style.display = 'none';
    this.elLightbox.style.display = this.warning ? 'block' : 'none';
    this.signInShown = false;
    if (this.warning) {
      this.warn(this.warning);
    }
    setTimeout(function() {
      if (app.input) {
        app.input.focus();
      }
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
        if (err.type === 'passwordTooShort') {
          app.elSignInForm.dataset.min = err.min;
          app.elSignInForm.classList.add('short');
        }
        return;
      }
      app.signIn(data);
    });
  };

  app.removeSignInFeedback = function() {
    this.elUsername.classList.remove('error');
    this.elPassword.classList.remove('error');
    this.elSignInForm.classList.remove('short');
    this.elConfirmPassword.classList.remove('error');
  };

  app.signIn = function(data, quiet) {
    currentUser = new User(data.user);
    localStorage.setItem('hoth.name', currentUser.name);
    if (data.token) {
      localStorage.setItem('hoth.token', data.token);
    } else {
      localStorage.removeItem('hoth.token');
    }
    this.hideSignIn();
    if (!quiet) {
      socket.emit('init');
    }
  };

  Object.defineProperty(app, 'input', {
    get: function() {
      return this.activeThread.input;
    }
  });

  app.thread = Thread.get;
  app.topic = Thread.topic;

  Object.defineProperty(app, 'activeThread', {
    set: function(thread) {
      if (this.$activeThread === thread) return;

      if (this.$activeThread) {
        this.$activeThread.deactivate();
      }
      if (this.$activeThread = thread) {
        if (!thread.open) {
          this.append(thread);
        }
        thread.activate();
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
      app.run(json.run);
    }
  };

  app.run = function(source) {
    try {
      new Script(source).run(globals);
    } catch (e) {
      (app.activeThread || this.lobby).append(new Message({
        type: 'error',
        body: e.stack || e.toString()
      }));
    }
  };

  app.env = function(parent, vars) {
    var environment = Object.create(parent);
    Object.getOwnPropertyNames(vars).forEach(function(name) {
      Object.defineProperty(environment, name, Object.getOwnPropertyDescriptor(vars, name));
    });
    return environment;
  };

  app.emit = function(event, vars) {
    var list = handlers[event];
    if (!list) return;

    list.forEach(function(handler) {
      handler.run(app.env(globals, vars));
    });
  };

  app.emitMessage = function(message) {
    this.emit(message.type === 'chat' ? 'message' : 'broadcast', {
      get author() { return message.author.name },
      get message() { return message.body }
    });
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

  socket.on('connect', function() {
    app.connected = true;
  });

  socket.on('reconnect', function() {
    app.connected = true;
    var name = currentUser.name;
    var token = localStorage.getItem('hoth.token');
    currentUser = null;

    if (name && token) {
      socket.emit('sign in', {
        name: name,
        token: token
      }, function(err, data) {
        if (err) {
          app.showSignIn();
          return;
        }
        app.signIn(data, true);
      });
    } else {
      app.showSignIn();
    }
    app.lobby.append(new Message({
      body: 'Reconnected to server.'
    }));
  });

  socket.on('disconnect', function() {
    app.connected = false;
    app.lobby.append(new Message({
      body: 'Disconnected from server.'
    }));
  });

  socket.on('system', function(data) {
    if (!data.body) return;
    Thread.get(data.thread).append(new Message({ body: data.body }));
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

  socket.on('user join', function(name) {
    app.lobby.append(new Message({
      body: '__' + escapeMarkup(name) + '__ joined.'
    }));
  });

  socket.on('user leave', function(name) {
    app.lobby.append(new Message({
      body: '__' + escapeMarkup(name) + '__ left.'
    }));
  });

  app.init();

  app.escapeXML = escapeXML;
  app.escapeMarkup = escapeMarkup;
  app.parse = parse;

  app.User = User;
  app.Thread = Thread;
  app.ChatMessage = ChatMessage;
  app.Message = Message;

  app.globals = globals;
  app.commands = commands;

  app.notify = notify;

  return app;

}());

var Hoth = (function() {
  'use strict';

  var el = function(cl, tag) {
    var d = document.createElement(tag || 'div');
    d.className = cl || '';
    return d;
  };

  var pad0 = function(n, s) {
    while (s.length < n) {
      s = '0' + s;
    }
    return s;
  };

  var formatTime = function(d) {
    return d.getHours() + ':' + pad0(2, d.getMinutes());
  };

  var AUTOSCROLL_THRESHOLD = 5;
  window.SCROLL_CONSTANT = .1;

  var Thread = function(data) {
    this.app = data.app;
    this.messages = [];
    this.shouldAutoscroll = true;
    this.scroll = 0;
    this.dragging = false;

    this.element = el('hoth-thread');
    this.element.appendChild(this.elName = el('hoth-thread-name'));
    this.element.appendChild(this.elContent = el('hoth-thread-content'));
    this.elContent.appendChild(this.elScrollbar = el('hoth-thread-scrollbar'));
    this.elScrollbar.appendChild(this.elScrollbarHandle = el('hoth-thread-scrollbar-handle'));
    this.elContent.appendChild(this.elWrap = el('hoth-thread-wrap'));
    this.elWrap.appendChild(this.elMessages = el('hoth-thread-messages'));

    this.elScrollbar.addEventListener('mousedown', function(e) {
      this.dragging = true;
      this.drag(e);
      e.preventDefault();
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    }.bind(this));
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);

    this.element.addEventListener('mousewheel', function(e) {
      this.shouldAutoscroll = false;
      this.scroll -= e.wheelDeltaY;
      this.autoscroll();
    }.bind(this));

    this.name = data.name;
  };

  Object.defineProperty(Thread.prototype, 'name', {
    set: function(name) {
      this.$name = name;
      if (name) {
        this.elName.textContent = name;
        this.elName.style.display = 'block';
        this.element.classList.add('named');
      } else {
        this.elName.style.display = 'none';
        this.element.classList.remove('named');
      }
    },
    get: function() { return this.$name; }
  });

  Thread.prototype.append = function(message) {
    var i = this.messages.indexOf(message);
    if (i !== -1) {
      this.messages.splice(i, 1);
    }

    if (this.messages.length && this.messages[this.messages.length - 1].isTransient) {
      this.messages.splice(this.messages.length - 1, 0, message);
      this.elMessages.insertBefore(message.element, this.elMessages.lastElementChild);
    } else {
      this.messages.push(message);
      this.elMessages.appendChild(message.element);
    }
    message.thread = this;

    this.autoscroll();
  };

  Thread.prototype.onMouseMove = function(e) {
    if (!this.dragging) return;
    this.drag(e);
  };

  Thread.prototype.onMouseUp = function(e) {
    this.dragging = false;
    this.drag(e);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  };

  Thread.prototype.drag = function(e) {
    var scrollbarSize = this.elScrollbar.offsetHeight;
    var viewportSize = this.elContent.offsetHeight;
    var contentSize = Math.max(viewportSize, this.elWrap.offsetHeight);

    var d = (1 - (e.clientY - this.elScrollbar.getBoundingClientRect().top) / scrollbarSize) / SCROLL_CONSTANT;
    var x = -d / (SCROLL_CONSTANT * d - 1);
    this.scroll = contentSize - x * viewportSize;
    this.shouldAutoscroll = false;
    this.autoscroll();
  };

  Thread.prototype.autoscroll = function() {

    var viewportSize = this.elContent.offsetHeight;
    var contentSize = Math.max(viewportSize, this.elWrap.offsetHeight);
    var scrollbarSize = this.elScrollbar.offsetHeight;

    if (this.shouldAutoscroll) {
      this.scroll = contentSize - viewportSize;
    }
    this.scroll = Math.min(Math.max(this.scroll, 0), contentSize - viewportSize);
    this.shouldAutoscroll = contentSize - viewportSize - this.scroll >= AUTOSCROLL_THRESHOLD;

    var x = (contentSize - this.scroll) / viewportSize;
    var y = (contentSize - (this.scroll + viewportSize)) / viewportSize;

    var minValue = scrollbarSize * (1 - SCROLL_CONSTANT * x / (SCROLL_CONSTANT * x + 1));
    var maxValue = scrollbarSize * (1 - SCROLL_CONSTANT * y / (SCROLL_CONSTANT * y + 1));

    this.elScrollbarHandle.style.top = minValue + 'px';
    this.elScrollbarHandle.style.height = Math.max(1, maxValue - minValue) + 'px';

    this.elWrap.style.top = -this.scroll + 'px';
  };

  Thread.prototype.delete = function() {
    var app = this.app;
    if (app) {
      if (this.element.parentNode === app.element) {
        app.element.removeChild(this.element);
      }

      var threads = this.app.threads;
      var i = threads.indexOf(this);
      if (i > -1) {
        threads.splice(i, 1);
      }
    }
  };

  var Message = function(data) {
    this.app = data.app;
    this.children = [];

    this.template();

    if (data.author) this.elAuthor.textContent = data.author;
    if (data.time) this.elTimestamp.textContent = formatTime(data.time);
    if (data.body) this.elBody.textContent = data.body;
  };

  Message.prototype.template = function() {
    this.element = el('hoth-message');
    this.element.appendChild(this.elHeader = el('hoth-message-header'));
    this.elHeader.appendChild(this.elAuthor = el('hoth-message-author'));
    this.elHeader.appendChild(this.elTimestamp = el('hoth-message-time'));
    this.element.appendChild(this.elBody = el('hoth-message-body'));

    this.element.addEventListener('mousedown', function() {

    }.bind(this));
  };

  Message.prototype.delete = function() {
    var thread = this.thread;
    if (thread) {
      if (this.element.parentNode === thread.elMessages) {
        thread.elMessages.removeChild(this.element);
      }
      var messages = thread.messages;
      var i = messages.indexOf(this);
      if (i > -1) {
        messages.splice(i, 1);
      }
    }
  };

  var Input = function(data) {
    this.element = el('hoth-message');
    this.element.appendChild(this.elBody = el('hoth-message-body'));

    this.app = data.app;
    this.isTransient = true;

    this.elBody.appendChild(this.elInput = el('hoth-message-input', 'textarea'));
    document.body.appendChild(this.elMeasure = el('hoth-message-measure'));
    this.elMeasure.textContent = 'X';

    this.elInput.placeholder = 'Say something\u2026';
    this.elInput.autofocus = true;
    this.elInput.style.height = this.elMeasure.offsetHeight + 'px';

    this.elInput.addEventListener('input', function() {
      this.elMeasure.textContent = this.elInput.value + 'X';
      this.elInput.style.height = this.elMeasure.offsetHeight + 'px';
    }.bind(this));

    this.elInput.addEventListener('keydown', function(e) {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.keyCode === 13) {
          if (this.elInput.value) {
            this.app.reply(new Message({
              app: this.app,
              author: data.author,
              time: new Date,
              body: this.elInput.value
            }));
          }
          this.elInput.value = '';
          e.preventDefault();
        }
      }
    }.bind(this));
  };
  Input.prototype = Object.create(Message.prototype);

  var App = function() {
    this.element = el('hoth-app');

    this.threads = [new Thread({ app: this, name: 'main' })];
    this.element.appendChild(this.threads[0].element);

    this.input = new Input({ app: this, author: 'Nathan Dinsmore', time: new Date });
    this.threads[0].append(this.input);

    document.body.addEventListener('keydown', function(e) {
      var modifiers =
        (e.ctrlKey ? 'c' : '') +
        (e.altKey ? 'a' : '') +
        (e.shiftKey ? 's' : '') +
        (e.metaKey ? 'm' : '');
      if (modifiers === '') {
        if (e.keyCode === 38) {
          this.selectPreviousMessage();
          e.preventDefault();
        } else if (e.keyCode === 40) {
          this.selectNextMessage();
          e.preventDefault();
        } else if (e.keyCode === 37) {
          this.selectPreviousTopic();
          e.preventDefault();
        } else if (e.keyCode === 39) {
          this.selectNextTopic();
          e.preventDefault();
        }
      }
      if (modifiers === 'm' || modifiers === 'c') {
        if (e.keyCode === 40) {
          this.selectLastMessage();
        }
      }
    }.bind(this));

    window.addEventListener('resize', this.layout.bind(this));
  };

  App.prototype.layout = function() {
    this.threads.forEach(function(thread) {
      thread.autoscroll();
    });
  };

  App.prototype.reply = function(message) {
    this.input.thread.shouldAutoscroll = true;
    this.input.thread.append(message);
    this.input.thread.append(this.input);
  };

  return {
    App: App,
    Thread: Thread,
    Message: Message
  };

}());

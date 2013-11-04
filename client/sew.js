var Sew = (function () {
  'use strict';

  var el = function (cl, tag) {
    var d = document.createElement(tag || 'div');
    d.className = cl || '';
    return d;
  };

  var pad0 = function (n, s) {
    while (s.length < n) {
      s = '0' + s;
    }
    return s;
  };

  var formatTime = function (d) {
    return d.getHours() + ':' + pad0(2, d.getMinutes());
  };

  var Thread = function (data) {
    this.app = data.app;
    this.messages = [];

    this.element = el('sew-thread');
    this.element.appendChild(this.elSpacer = el('sew-thread-spacer'));
    this.element.appendChild(this.elLine = el('sew-thread-line', 'canvas'));
    this.elLine.width = 0;
    this.elLine.height = 0;
  };

  Thread.prototype.delete = function () {
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

  Thread.prototype.connectTo = function (message) {
    var mbb = message.element.getBoundingClientRect();
    var tbb = this.elSpacer.getBoundingClientRect();
    var ubb = this.elLine.nextElementSibling.getBoundingClientRect();

    var h = ubb.top - (mbb.top + mbb.bottom) / 2 + 1;
    var w = tbb.right - mbb.right;
    var r = 10;

    this.elLine.width = w;
    this.elLine.height = h;
    this.elLine.style.top = ubb.top - h + 'px';
    this.elLine.style.right = 0;

    var context = this.elLine.getContext('2d');
    context.strokeStyle = '#ccc';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(w - (tbb.right - tbb.left) / 2, h);
    context.arc(w - (tbb.right - tbb.left) / 2 - r, r + 1, r, 0, Math.PI * 3 / 2, true);
    context.lineTo(0, 1);
    context.stroke();
  };

  var Message = function (data) {
    this.app = data.app;
    this.children = [];

    this.template();

    if (data.author) this.elAuthor.textContent = data.author;
    if (data.time) this.elTimestamp.textContent = formatTime(data.time);
    if (data.body) this.elBody.textContent = data.body;
  };

  Message.prototype.template = function () {
    this.element = el('sew-message');
    this.element.appendChild(this.elHeader = el('sew-message-header'));
    this.elHeader.appendChild(this.elAuthor = el('sew-message-author'));
    this.elHeader.appendChild(this.elTimestamp = el('sew-message-time'));
    this.element.appendChild(this.elBody = el('sew-message-body'));

    this.element.addEventListener('mousedown', function () {
      this.app.select(this);
    }.bind(this));
  };

  Message.prototype.reply = function (message) {
    if (this.children.length) {
      var newThread = message.thread = new Thread({ app: this.app });
      var threads = this.app.threads;
      var i = threads.indexOf(this.thread);
      if (i > -1 && i < threads.length - 1) {
        threads.splice(i + 1, 0, newThread);
      } else {
        threads.push(newThread);
      }

      newThread.messages.push(message);
      newThread.source = this;

      newThread.startY = this.element.getBoundingClientRect().bottom - this.thread.element.getBoundingClientRect().top;
      newThread.elSpacer.style.height = newThread.startY + 'px';
      newThread.element.appendChild(message.element);
      this.app.element.insertBefore(newThread.element, this.thread.element.nextElementSibling);
    } else {
      message.thread = this.thread;

      var messages = this.thread.messages;
      var i = messages.indexOf(this);
      if (i === messages.length - 1) {
        messages.push(message);
      } else {
        messages.splice(i, 0, message);
      }

      this.thread.element.insertBefore(message.element, this.element.nextElementSibling);
    }

    message.parent = this;
    if (!this.children.length) {
      message.previous = this;
    }
    if (!message.isPreview) {
      this.children.push(message);
      this.app.select(message);
    }
    this.app.layout();

    return newThread;
  };

  Message.prototype.delete = function () {
    var thread = this.thread;
    if (thread) {
      if (this.element.parentNode === thread.element) {
        thread.element.removeChild(this.element);
      }
      var messages = thread.messages;
      var i = messages.indexOf(this);
      if (i > -1) {
        messages.splice(i, 1);
      }
    }
  };

  var Input = function (data) {
    this.element = el('sew-message');
    this.element.appendChild(this.elBody = el('sew-message-body'));

    this.app = data.app;

    this.elBody.appendChild(this.elInput = el('sew-message-input', 'textarea'));
    document.body.appendChild(this.elMeasure = el('sew-message-measure'));
    this.elMeasure.textContent = 'X';

    this.elInput.placeholder = 'Say something\u2026';
    this.elInput.autofocus = true;
    this.elInput.style.height = this.elMeasure.offsetHeight + 'px';

    this.elInput.addEventListener('input', function () {
      this.elMeasure.textContent = this.elInput.value + 'X';
      this.elInput.style.height = this.elMeasure.offsetHeight + 'px';
    }.bind(this));

    this.elInput.addEventListener('keydown', function (e) {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.keyCode === 13) {
          var message = new Message({
            app: this.app,
            author: data.author,
            time: new Date,
            body: this.elInput.value
          });
          if (this.app.selectedMessage) {
            this.app.selectedMessage.reply(message);
          } else {
            this.app.addRoot(message);
          }
          this.elInput.value = '';
          e.preventDefault();
        }
      }
    }.bind(this));
  };
  Input.prototype = Object.create(Message.prototype);

  Input.prototype.isPreview = true;

  var App = function () {
    this.element = el('sew-app');

    this.threads = [new Thread({ app: this })];
    this.element.appendChild(this.threads[0].element);

    this.input = new Input({ app: this, author: 'Nathan Dinsmore', time: new Date });
    this.threads[0].element.appendChild(this.input.element);

    document.body.addEventListener('keydown', function (e) {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
    }.bind(this));
  };

  App.prototype.addRoot = function (message) {
    message.thread = this.threads[0];
    message.thread.element.insertBefore(message.element, this.input.element);
    message.thread.messages.push(message.thread);
    this.select(message);
    this.layout();
  };

  App.prototype.select = function (message) {
    if (this.selectedMessage) {
      this.selectedMessage.element.classList.remove('selected');
    }
    if (this.tempThread) {
      var i = this.threads.indexOf(this.tempThread);
      if (i > -1) {
        this.threads.splice(i, 1);
        this.element.removeChild(this.tempThread.element);
      }
    }
    this.selectedMessage = message;
    message.element.classList.add('selected');

    if (this.tempThread) {
      this.tempThread.delete();
    }

    this.input.delete();
    this.tempThread = message.reply(this.input);
    if (this.tempThread) {
      this.tempThread.isPreview = true;
    }

    setTimeout(function () {
      this.input.elInput.focus();
    }.bind(this));
  };

  App.prototype.layout = function () {
    var threads = this.threads;
    var i = threads.length;
    var z = 0;
    while (i--) {
      var t = threads[i];
      if (t.source) {
        t.connectTo(t.source);
      }
      t.element.style.zIndex = z;
      z += 1;
    }
  };

  App.prototype.selectPreviousMessage = function () {
    if (this.selectedMessage.previous) {
      this.select(this.selectedMessage.previous);
    }
  };

  App.prototype.selectNextMessage = function () {
    if (this.selectedMessage.children[0]) {
      this.select(this.selectedMessage.children[0]);
    }
  };

  App.prototype.selectPreviousTopic = function () {
    this.selectTopic(-1);
  };

  App.prototype.selectNextTopic = function () {
    this.selectTopic(1);
  };

  App.prototype.selectTopic = function (n) {
    if (!this.selectedMessage) return;
    var threads = this.threads;
    var i = threads.indexOf(this.selectedMessage.thread);
    var p = 0;
    do {
      p += n;
      if (i + p < 0 || i + p >= threads.length) return;
      var thread = threads[i + p];
    } while (thread.isPreview);
    var bb = this.selectedMessage.element.getBoundingClientRect();
    var messages = thread.messages;
    var j = messages.length;
    var d = Infinity;
    while (j--) {
      var m = messages[j];
      var mbb = m.element.getBoundingClientRect();
      var nd = Math.abs(mbb.top - bb.top);
      if (nd < d) {
        d = nd;
        var target = m;
      }
    }
    if (target) {
      this.select(target);
    }
  };

  return {
    App: App
  };

}());

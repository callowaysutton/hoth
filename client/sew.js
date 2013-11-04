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
    this.element = el('sew-thread');
    this.element.appendChild(this.elSpacer = el('sew-thread-spacer'));
    this.element.appendChild(this.elLine = el('sew-thread-line', 'canvas'));
    this.elLine.width = 0;
    this.elLine.height = 0;
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
    this.elLine.style.marginTop = (ubb.top - tbb.bottom - h) + 'px';
    this.elLine.style.marginLeft = (tbb.right - tbb.left - w) + 'px';
    this.elLine.style.marginBottom = (tbb.bottom - ubb.top) + 'px';

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

    this.children = [];

    this.element.addEventListener('mousedown', function () {
      this.app.select(this);
    }.bind(this));
  };

  Message.prototype.reply = function (message) {
    if (this.children.length) {
      message.thread = new Thread;
      this.app.threads.push(message.thread);

      message.thread.elSpacer.style.height = this.element.getBoundingClientRect().bottom - this.thread.element.getBoundingClientRect().top + 'px';
      message.thread.element.appendChild(message.element);
      this.app.element.insertBefore(message.thread.element, this.thread.element.nextElementSibling);
      message.thread.source = this;
    } else {
      message.thread = this.thread;

      this.thread.element.insertBefore(message.element, this.element.nextElementSibling);
    }
    message.previous = this;
    this.children.push(message);
    this.app.select(message);
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
            this.app.addMessage(message);
          }
          this.elInput.value = '';
          e.preventDefault();
        }
      }
    }.bind(this));
  };

  var App = function () {
    this.element = el('sew-app');

    this.threads = [new Thread];
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

  App.prototype.addMessage = function (message) {
    if (this.selectedMessage) {
      message.previous = this.selectedMessage;
      this.selectedMessage.children.push(message);
    }
    message.thread = this.selectedMessage ? this.selectedMessage.thread : this.threads[0];
    message.thread.element.insertBefore(message.element, this.input.element);
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
    if (message.children.length) {
      var thread = this.tempThread = new Thread;
      this.threads.push(thread);
      this.element.insertBefore(thread.element, message.thread.element.nextElementSibling);
      thread.elSpacer.style.height = message.element.getBoundingClientRect().bottom - message.thread.element.getBoundingClientRect().top + 'px';
      thread.element.appendChild(this.input.element);
      thread.source = message;
    } else {
      message.thread.element.appendChild(this.input.element);
      this.element.scrollTop = this.element.scrollHeight;
    }
    this.layout();
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
    var message = this.selectedMessage;
    var origin = message.previous;
    var descent = 0;
    while (origin) {
      var children = origin.children;
      var i = children.indexOf(message);
      if (i > -1 && i + n > -1 && i + n < children.length) {
        var target = children[i + n];
        break;
      }
      message = origin;
      origin = origin.previous;
      descent += 1;
    }
    if (target) {
      while (target.children.length && descent > 0) {
        target = target.children[0];
        descent -= 1;
      }
      this.select(target);
    }
  };

  return {
    App: App
  };

}());

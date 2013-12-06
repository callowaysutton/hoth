var fs = require('fs');

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/hoth');

var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);

app.listen(8080);

var STATIC = {
  '/': 'app.html',
  '/app.css': 'app.css',
  '/app.js': 'app.js'
};

function handler(req, res) {
  if (req.method === 'GET') {

    if (!STATIC[req.url]) {
      res.writeHead(404);
      return res.end('Not found');
    }

    fs.readFile(__dirname + '/static/' + STATIC[req.url], function(err, data) {
      if (err) {
        res.writeHead(500);
        return res.end('Internal error');
      }

      res.writeHead(200);
      res.end(data);
    });

  } else if (req.method === 'HEAD') {

    res.writeHead(STATIC[req.url] ? 200 : 404);
    res.end();

  } else {
    res.writeHead(500);
    res.end('Unsupported method');
  }
}

var users = {};
var nextUID = 0;

var getUser = function(id) {
  return users[id] || (users[id] = {
    name: 'User #' + id,
    id: id
  });
};

io.sockets.on('connection', function(socket) {

  var user = getUser(nextUID++);

  socket.emit('init', {
    user: user
  });

  socket.emit('system', {
    thread: '#lobby',
    body: 'Welcome to the #lobby! Type `/index` for an index of important topics and `/help` for a list of commands.'
  });

  socket.on('user', function(id, callback) {
    callback(getUser(id));
  });

  socket.on('chat', function(data) {
    socket.broadcast.emit('chat', data);
    socket.broadcast.emit('open thread', data.thread);
  });

  socket.on('system', function(data) {
    socket.broadcast.emit('system', data);
    socket.broadcast.emit('open thread', data.thread);
  });

  socket.on('open thread', function(name) {
    socket.broadcast.emit('open thread', name);
  });

  socket.on('create thread', function(callback) {
    var uid = nextUID++;
    socket.broadcast.emit('open thread', '!' + uid);
    callback(uid);
  });

});

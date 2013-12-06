var fs = require('fs');
var bcrypt = require('bcryptjs');

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/hoth');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {

  var userSchema = mongoose.Schema({
    name: String,
    id: Number,
    hash: String
  });

  userSchema.statics.findByName = function(name, cb) {
    this.findOne({ name: name }, cb);
  };

  userSchema.methods.toJSON = function() {
    return {
      name: this.name,
      id: this.id
    };
  };

  var User = mongoose.model('User', userSchema);

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

  io.sockets.on('connection', function(socket) {

    var currentUser = null;

    socket.on('sign in', function(data, callback) {
      User.findByName(data.name, function(err, user) {
        if (err || !user) return callback('authentication failed');
        bcrypt.compare(data.password, user.hash, function(err, res) {
          if (err) return callback('internal error');
          if (res) {
            currentUser = user;
            callback(null, user.toJSON());
          } else {
            callback('authentication failed');
          }
        });
      });
    });

    socket.on('create account', function(data, callback) {
      if (currentUser) callback('already logged in');

      if (!data.name) return callback('bad username');
      if (data.password.length < 8) return callback('bad password');

      User.findByName(data.name, function(err, user) {
        if (user) return callback('user already exists');
        bcrypt.genSalt(10, function(err, salt) {
          if (err) return callback('internal error');
          bcrypt.hash(data.password, salt, function(err, hash) {
            if (err) return callback('internal error');
            new User({
              name: data.name,
              hash: hash
            }).save(function(err, user) {
              if (err) return callback('internal error');
              currentUser = user;
              callback(null, user.toJSON());
            });
          });
        });
      });
    });

    socket.on('init', function() {
      socket.emit('system', {
        thread: '#lobby',
        body: 'Welcome to the #lobby! Type `/index` for an index of important topics and `/help` for a list of commands.'
      });
    });

    socket.on('user', function(id, callback) {
      User.findById(id, function(err, user) {
        if (err) callback(err);
        callback(null, user.toJSON());
      });
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

});


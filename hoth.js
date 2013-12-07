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
      id: this._id
    };
  };

  var userTokenSchema = mongoose.Schema({
    name: String,
    token: String
  });

  var TOKEN_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function genToken() {
    var s = '';
    for (var i = 0; i < 32; i++) {
      s += TOKEN_CHARS[Math.random() * TOKEN_CHARS.length | 0];
    }
    return s;
  }

  userTokenSchema.statics.create = function(name, cb) {
    new UserToken({
      name: name,
      token: genToken()
    }).save(cb);
  };

  userTokenSchema.methods.refresh = function(cb) {
    this.token = genToken();
    this.save(cb);
  };

  var User = mongoose.model('User', userSchema);

  var UserToken = mongoose.model('UserToken', userTokenSchema);

  var app = require('https').createServer({
    key: fs.readFileSync('private/key.pem'),
    cert: fs.readFileSync('private/cert.pem')
  }, handler);
  app.listen(8080);

  var io = require('socket.io').listen(app);

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
  var nextUID = 1;

  io.sockets.on('connection', function(socket) {

    var currentUser = null;

    function signIn(remember, user, callback) {
      currentUser = user;
      if (remember) {
        UserToken.create(user.name, function(err, tuple) {
          if (err) return handleError(err, callback);
          callback(null, {
            user: user.toJSON(),
            token: tuple.token
          });
        });
      } else {
        callback(null, {
          user: user.toJSON(),
          token: null
        });
      }
      signedIn();
    }

    function handleError(err, callback) {
      console.log(err);
      callback('internal error');
    }

    socket.on('sign in', function(data, callback) {
      if (data.token) {
        UserToken.findOne({ name: data.name, token: data.token }, function(err, tuple) {
          if (err) return handleError(err, callback);
          if (!tuple) return callback('invalid token');
          tuple.refresh(function(err, tuple) {
            if (err) return handleError(err, callback);
            User.findByName(data.name, function(err, user) {
              if (err) return handleError(err, callback);
              callback(null, {
                user: user.toJSON(),
                token: tuple.token
              });
            });
          });
        });
      } else {
        User.findByName(data.name, function(err, user) {
          if (err || !user) return callback('authentication failed');
          bcrypt.compare(data.password, user.hash, function(err, res) {
            if (err) return handleError(err, callback);
            if (res) {
              signIn(data.remember, user, callback);
            } else {
              callback('authentication failed');
            }
          });
        });
      }
    });

    socket.on('create account', function(data, callback) {
      if (currentUser) callback('already logged in');

      if (!data.name) return callback('bad username');
      if (data.password.length < 8) return callback('bad password');

      User.findByName(data.name, function(err, user) {
        if (user) return callback('user already exists');
        bcrypt.genSalt(10, function(err, salt) {
          if (err) return handleError(err, callback);
          bcrypt.hash(data.password, salt, function(err, hash) {
            if (err) return handleError(err, callback);
            new User({
              name: data.name,
              hash: hash
            }).save(function(err, user) {
              if (err) return handleError(err, callback);
              signIn(data.remember, user, callback);
            });
          });
        });
      });
    });

    socket.on('init', function() {
      socket.emit('system', {
        thread: '#lobby',
        body: 'Welcome to the #lobby! Type [`/index`] for an index of important topics and [`/help`] for a list of commands.'
      });
    });

    function signedIn() {

      socket.on('user', function(id, callback) {
        User.findById(id, function(err, user) {
          if (err) return handleError(err, callback);
          if (!user) return callback('user not found');
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
        callback(null, uid);
      });

    }

  });

});


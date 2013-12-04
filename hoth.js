var fs = require('fs');

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/hoth');

var app = require('http').createServer(handler);
var io = require('socket.io');

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


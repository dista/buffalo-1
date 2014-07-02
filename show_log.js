var http = require('http');
var exec = require('child_process').exec;

http.createServer(function (req, res) {
      exec("tail -n 50 /tmp/buffalo1.log", function(err, stdout, stderr){
          res.writeHead(200, {'Content-Type': 'text/plain'});
          res.end(stdout);
      })
}).listen(9099);
console.log('Server 9099');


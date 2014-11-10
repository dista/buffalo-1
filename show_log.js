var http = require('http');
var exec = require('child_process').exec;

http.createServer(function (req, res) {
      exec("tail -n 200 /var/log/buffalo-1.log", function(err, stdout, stderr){
          res.writeHead(200, {'Content-Type': 'text/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Expires': 0
            });
          res.end(stdout);
      })
}).listen(9099);
console.log('Server 9099');


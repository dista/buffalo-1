var fs = require('fs');

var deleteExpiredFile = function(){
    fs.readdir(__dirname + "/files", function(err, files){
        for(var i = 0; i < files.length; i++){
            var file = files[i];
            var cb = function(){
                var f = file;

                return function(err, stats){
                    var escaped = (new Date()).getTime() - stats['ctime'].getTime();
                    if(escaped > 3600 * 1000){
                        fs.unlink(__dirname + "/files/" + f, function(){}); 
                    }
                };
            };

            fs.stat(__dirname + "/files/" + file, cb());
        }
    });
}

exports.startCleanupTmpFiles = function(){
    setInterval(deleteExpiredFile, 3600 * 1000);
}

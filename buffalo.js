var net = require('net');
var embed_device = require('./embed_device.js');
var phone = require('./phone.js');
var posix = require('posix');
var cluster = require('cluster');
var port = 7000;

function handleClient(c)
{
    var sock = c;
    var type_determined = false;
    var device;
    var device_interface = null;
    var buff = null;
    var buff_index = 0;
    var timeout_hd = null;
    var starving = false;

    var one_step_cb = function(bytes_used){
        buff_index += bytes_used;

        if(starving){
            console.log("protocal starving, close connection");
            sock.destroy();
            handle_error();
            return;
        }

        if(bytes_used == 0){
            starving = true;
            timeout_hd = setTimeout(handle_proto, 1000);
            return;
        }

        if(buff.length > 1024 && buff_index > buff.length / 2){
            var new_buff = new Buffer(buff.length - buff_index);
            buff.copy(new_buff, 0, buff_index, buff.length);
            buff = new_buff;
            buff_index = 0;
        }

        if(buff_index >= buff.length){
            buff = null;
            buff_index = 0;
        }
        else{
            handle_proto();
        }
    }
    
    var handle_proto = function(){
        if(!type_determined)
        {
            var type_cate = buff[buff_index + 1] & 0xf0;
            if(type_cate == 0x30)
            {
                device = "embed";
                device_interface = embed_device.create_embed_device(sock, one_step_cb);
            }
            else if(type_cate == 0x10 || type_cate == 0x20)
            {
                device = "phone";
                device_interface = phone.create_phone(sock, one_step_cb);
            }
            else
            {
                console.error("unknown type_cate " + type_cate);
                sock.destroy();
                return;
            }

            console.log("[connect] At " + (new Date()) + " " + device + "[" + sock.remoteAddress + ":" + sock.remotePort + "]");

            type_determined = true;
        }

        device_interface.handle_data(buff, buff_index);
    }

    var handle_data = function(data){
        var is_init_buff = false;

        if(buff == null){
            is_init_buff = true;
            buff = data;
        }
        else{
            buff = Buffer.concat([buff, data]);
        }

        if(starving){
            clearTimeout(timeout_hd);
            starving = false;
            is_init_buff = true;
        }

        if(!is_init_buff){
            return;
        }

        if(buff.length - buff_index < 2){
            starving = true;
            timeout_hd = setTimeout(handle_proto, 1000);
        }
        else{
            handle_proto();
        }
    }

    var handle_end = function(){
        if(device_interface != null)
        {
            device_interface.handle_end();
        }
    }

    var handle_error = function(e){
        if(device_interface != null)
        {
            device_interface.handle_error(e);
        }
        console.error(e);
    }

    sock.on('data', handle_data);
    sock.on('end', handle_end);
    sock.on('error', handle_error);
}

posix.setrlimit('nofile', {'soft': 10000, 'hard': 10000});

var numCPUs = require('os').cpus().length;
numCPUs = 1;
if(cluster.isMaster){
    var after_init = function(err){
        if(err){
            console.log("init device failed");
            return;
        }

        for (var i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        function message_handler(msg) {
            if("server_id" in msg){
                cluster.workers[msg["server_id"]].send(msg);
            }
            else{
                Object.keys(cluster.workers).forEach(function(id){
                    if(cluster.workers[id].id != msg.from){
                        cluster.workers[id].send(msg); 
                    }
                });
            }
        }

        Object.keys(cluster.workers).forEach(function(id) {
            cluster.workers[id].on('message', message_handler);
        });

        var send_worker_exit_msg = function(worker){
            var msg = {};
            msg["from"] = -1;
            msg["type"] = "worker_exit";
            msg["to"] = "all";
            msg["data"] = {};
            msg["data"]["worker"] = worker.id;

            Object.keys(cluster.workers).forEach(function(id){
                if(cluster.workers[id].id != worker.id){
                    cluster.workers[id].send(msg); 
                }
            });
        }
        
        cluster.on('online', function(new_worker){
            // the worker is bring back
            var send_online_to_workers = function(){
                if(new_worker.old_id){
                    var msg = {};
                    msg["from"] = -1;
                    msg["type"] = "worker_started";
                    msg["to"] = "all";
                    msg["data"] = {};
                    msg["data"]["worker"] = new_worker.id;
                    Object.keys(cluster.workers).forEach(function(id){
                        if(cluster.workers[id].id != new_worker.id){
                            cluster.workers[id].send(msg); 
                        }
                    });
                }
            }

            send_online_to_workers();
        });

        cluster.on('exit', function(worker, code, signal) {
            console.log("EXIT.....");
                    Object.keys(cluster.workers).forEach(function(id){
                        if(cluster.workers[id].id != new_worker.id){
                            cluster.workers[id].kill(); 
                        }
                    });
            //send_worker_exit_msg(worker);

            var restart_worker = function(){
                console.log('worker [' + worker.id + '][' + worker.process.pid + '] died, restarting...');
                var new_worker = cluster.fork();
                new_worker.on('message', message_handler);
                new_worker.old_id = worker.id;
            }

            //restart_worker();
        });
    }

    embed_device.init(after_init);
}
else{
    cluster.worker.on('message', function(msg){
        if(msg["to"] == "device"){
            embed_device.notify_msg(msg);
        }
        else if(msg["to"] == "all"){
            embed_device.notify_msg(msg);
        }
    });

    var server = net.createServer(handleClient);
    server.listen(port, function(){
        console.log("Welcome, Buffalo server started. Port " + port + ", server time " + (new Date()));
        });
}

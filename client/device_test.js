var net = require("net");
var util = require("../util.js");
var port = 6000;
var posix = require('posix');
var ip = "127.0.0.1"

var device_test = function(device_id){
    var device_client = net.connect(port, ip, function(){
        //send_heartbeat();
        send_login(device_id, new Buffer([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]));
        /*
        setInterval(function(){
            send_heartbeat();
        }, 50000);
        */
        //setTimeout(function(){send_status(device_id, 1, 123, 124, 129, 1);}, 500);
        //setTimeout(function(){send_sync_time(device_id);}, 500);

        device_client.on('data', function(data){
            console.log(data);
            var type = data[1];
            var msg = {};
            msg["type"] = type;
            msg["packet_id"] = data.readUInt32BE(2);

            if(type == 0x41){
                send_control_response(msg, 1);
            }
            else if(type == 0x42){
                send_status_response(msg,
                                     0,
                                     1,
                                     20,
                                     30,
                                     123,
                                     1
                    );
            }
            else if(type == 0x43)
            {
                send_control_response(msg, 0);
            }
            else if(type == 0x44)
            {
                send_control_response(msg, 0);
            }
            else if(type == 0x45)
            {
                send_control_response(msg, 0);
            }
            else if(type == 0x46){
                send_control_response(msg, 0);
            }
        });
    });

    device_client.on('error', function(err){
        console.log(err);
    });

    device_client.on('close', function(has_error){
        console.log('close');
        device_test(device_id);
    });

    device_client.on('end', function(){
    });
        
    var send_status_response = function(msg,
                                        code,
                                        state,
                                        temperature,
                                        humidity,
                                        battery,
                                        locked)
    {
        if(code == 0)
        {
            var buff = new Buffer(10 + 2 + 6);
            util.setCommonPart(buff, msg);
            buff[8] = 0x01;
            buff[10] = state;
            buff[11] = temperature;
            buff[12] = humidity;
            buff.writeUInt16BE(battery, 13);
            buff[15] = locked;
            util.setChecksum(buff);
            device_client.write(buff);
        }
        else{
            device_client.write(util.buildErr(msg, code));
        }
    }

    var send_control_response = function(msg, code){
        console.log("send control response");
        if(code != 0){
            device_client.write(util.buildErr(msg, code));
        }
        else
        {
            var ret = util.buildGeneralOk(msg);
            console.log(ret);
            device_client.write(util.buildGeneralOk(msg));
        }
    }

    var send_heartbeat = function(){
        var buff = new Buffer(10 + 16);
        util.setCommonPart(buff, {"type": 0x30, "packet_id": 1});
        util.setChecksum(buff);

        console.log(buff);
        device_client.write(buff);
    }

    var send_login = function(device_id, mac){
        var buff = new Buffer(10 + 18);
        util.setCommonPart(buff, {"type": 0x31, "packet_id": 1});
        (new Buffer(device_id)).copy(buff, 8);
        mac.copy(buff, 20);
        util.setChecksum(buff);

        console.log(buff);
        device_client.write(buff);
    }

    var send_status = function(device_id, 
                               state,
                               temperature,
                               humidity,
                               battery,
                               locked) 
    {
        var buff = new Buffer(10 + 18 + 6);
        util.setCommonPart(buff, {"type": 0x32, "packet_id": 1});
        (new Buffer(device_id)).copy(buff, 12);
        buff[24] = state;
        buff[25] = temperature;
        buff[26] = humidity;
        buff.writeUInt16BE(battery, 27);
        buff[29]= locked;
        util.setChecksum(buff);

        console.log(buff);
        device_client.write(buff);
    }

    var send_sync_time = function(device_id){
        var buff = new Buffer(10 + 16);
        util.setCommonPart(buff, {"type": 0x33, "packet_id": 1});
        (new Buffer(device_id)).copy(buff, 12);
        util.setChecksum(buff);

        console.log(buff);
        device_client.write(buff);
    }
}
posix.setrlimit('nofile', {'soft': 10000, 'hard': 10000});

for(var i = 2090; i < 2091; i++)
{
    device_test("RELEASE1" + util.formatNumber(i, 4));
}

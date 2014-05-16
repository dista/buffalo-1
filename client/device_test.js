var net = require("net");
var util = require("../util.js");
var error_code = require("../error_code.js");
var port = 8000;
var posix = require('posix');
var ip = "127.0.0.1"

var device_test = function(device_id){
    var device_client = net.connect(port, ip, function(){
        send_login(device_id);
        /*
        setInterval(function(){
            send_heartbeat();
        }, 50000);
        */
        //setTimeout(function(){send_status(device_id, 1, 123, 124, 129, 1);}, 500);
        //setTimeout(function(){send_sync_time(device_id);}, 500);

        device_client.on('data', function(data){
            console.log(data);
            if(data[0] == 0xa0){
                send_heartbeat();
            }
            else if(data[0] == 0xa1){
                send_sync_time();
            }
            else if(data[0] == 0xa7){
                send_status(device_id);
            }
            else if(data[0] == 0xa6){
                send_query_resp(data);
            }
            else if(data[0] == 0xa5){
                send_control_resp(data);
            }
        });
    });

    device_client.on('error', function(err){
        console.log(err);
    });

    device_client.on('close', function(has_error){
        console.log('close');
        //device_test(device_id);
    });

    device_client.on('end', function(){
    });

    var send_query_resp = function(data){
        var packet_id = data.readUInt32BE(1); 
        var buff = new Buffer(util.RESP_HEADER_SIZE +
                util.getStringEncodingLen("Temp") +
                2
                );
        console.log("buff length %d", buff.length);
        util.setRespCommonPart(buff, {"type": 0xa6, "packet_id": packet_id}, true);
        var index = util.RESP_HEADER_SIZE;
        index = util.writeString(buff, index, "Temp");
        console.log("index %d", index);
        buff.writeUInt16BE(30, index);
        index += 2;

        console.log(buff);
        device_client.write(buff);
    }

    var send_control_resp = function(data){
        var packet_id = data.readUInt32BE(1);
        var index = util.REQ_HEADER_SIZE + 16;
        var ctl_cmd = data.readUInt16BE(index);
        var orig_msg = {
            "type": data[0],
            "packet_id": packet_id
        };
        if(ctl_cmd == 0x01){
            device_client.write(util.buildGeneralOk(orig_msg));
        }
        else if(ctl_cmd == 0x10){
            var buff = new Buffer(util.RESP_HEADER_SIZE + 1 + 20);
            buff.fill(0);
            buff[util.RESP_HEADER_SIZE] = 0x10;
            var ir = new Buffer("1234567890abcdefghij");
            ir.copy(buff, util.RESP_HEADER_SIZE + 1);
            util.setRespCommonPart(buff, orig_msg, true);
            device_client.write(buff);
        }
        else if(ctl_cmd == 0x11){
            console.log("==========================");
            console.log(data);
            device_client.write(util.buildErr(orig_msg, error_code.ErrorCode.USED,
                        error_code.ErrorTarget.DEVICE)); 
        }
    }

    var send_heartbeat = function(){
        var buff = new Buffer(util.REQ_HEADER_SIZE);
        util.setReqCommonPart(buff, {"type": 0xa1, "packet_id": 1});

        console.log(buff);
        device_client.write(buff);
    }

    var send_login = function(device_id){
        var buff = new Buffer(util.REQ_HEADER_SIZE + 16);
        util.setReqCommonPart(buff, {"type": 0xa0, "packet_id": 1});
        console.log(device_id);
        device_id.copy(buff, util.REQ_HEADER_SIZE);

        console.log(buff);
        device_client.write(buff);
    }

    var send_status = function(device_id)
    {
        var stats = {"Temp": 30};
        var stats_buffer = util.serializeStatus(stats);
        var buff = new Buffer(util.REQ_HEADER_SIZE + 16 + stats_buffer.length);
        util.setReqCommonPart(buff, {"type": 0xa2, "packet_id": 1});
        var index = util.REQ_HEADER_SIZE;
        device_id.copy(buff, index);
        index += 16;
        stats_buffer.copy(buff, index);

        console.log(buff);
        device_client.write(buff);
    }

    var send_sync_time = function(device_id){
        var buff = new Buffer(util.REQ_HEADER_SIZE);
        util.setReqCommonPart(buff, {"type": 0xa7, "packet_id": 1});

        console.log(buff);
        device_client.write(buff);
    }
}
posix.setrlimit('nofile', {'soft': 10000, 'hard': 10000});

for(var i = 31; i < 32; i++)
{
    device_test(util.createDeviceId(i));
}

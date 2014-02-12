var net = require("net");
var util = require("../util.js");
var port = 9000;
var ip = "127.0.0.1"

var phone_test = function(name, device, device2){
var phone_client = net.connect(port, ip, function(){
    //console.log(device);
    //send_check_name("dista");
    //send_check_email("dista@qq.com");
    /*
    for(var i = 80; i < 100; i++){
        send_register("dista"+i, "dista" + i + "@qq.com", "654321");
    }
    */
    //send_query_status(device);
    //console.log(new Date());
    //send_register(name + "@qq.com", "654321");
    send_login(name + "@qq.com", "654321");
    //setTimeout(function(){send_asso(name, device, "myss1id", "Asia/Hong_Kong");}, 1000);
    //setTimeout(function(){send_query_all();}, 1000);
    //setTimeout(function(){send_change_password("654321");}, 1000);
    //setTimeout(function(){send_logout();}, 1000);
    //setTimeout(function(){send_query_all();}, 2000);
    //setTimeout(function(){send_control(device, 1, 20);}, 2000);
    //setTimeout(function(){send_query_status(device);}, 3000);
    /*
    setTimeout(function(){send_upload_time("RELEASE10001",
            [{
                "sid": 1,
                "start_time": "11:23",
                "end_time": "12:21",
                 "repeat": 1
            }
            ]);}, 1000);
    */
    //setTimeout(function(){send_lock("RELEASE10001", 1);}, 2000);
    //setTimeout(function(){send_del_time("RELEASE10001", 1);}, 2000);
    //setTimeout(function(){send_del_delay("RELEASE10001");}, 2000);
    //send_forgot_password("dista@qq.com");
    //setTimeout(function(){send_heartbeat()}, 1000);

    phone_client.on('data', function(data){
        if(data[0] == 0x92){
            //send_asso(device, "America/New_York");
            //send_asso2(device, device2, "America/New_York");
            //send_query_status(device2);

            send_control_0x11(device, true);
            //send_control_learn(device);
            //send_control_lock(device);
        //    setTimeout(function(){send_asso(name, device, "myss1id", "Asia/Hong_Kong");}, 1000);
            //setInterval(function(){send_control(device, 1, 20);}, 2000);
            //setInterval(function(){send_query_status(device);}, 3000);
            //send_del_delay(device);
            //setInterval(function(){send_del_time(device, 1);}, 5000);
            //send_del_time(device, 1);
        }

        //console.log(new Date());
        console.log(data);
    });
});

var send_lock = function(device_id, locked){
    var buff = new Buffer(10 + 20 + 1);
    util.setCommonPart(buff, {"type": 0x19, "packet_id": 1});
    (new Buffer(device_id)).copy(buff, 16);
    buff[28] = locked;
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_del_time = function(device_id, sid){
    var buff = new Buffer(10 + 20 + 1);
    util.setCommonPart(buff, {"type": 0x1d, "packet_id": 1});
    (new Buffer(device_id)).copy(buff, 16);
    buff[28] = sid;
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_del_delay = function(device_id){
    var buff = new Buffer(10 + 20);
    util.setCommonPart(buff, {"type": 0x20, "packet_id": 1});
    (new Buffer(device_id)).copy(buff, 16);
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_upload_time = function(device_id, times){
    var buff = new Buffer(10 + 20 + 1 + 6 * times.length);
    util.setCommonPart(buff, {"type": 0x18, "packet_id": 1});
    (new Buffer(device_id)).copy(buff, 16);
    buff[28] = times.length;

    var index = 29;
    for(var i = 0; i < times.length; i++)
    {
        var time = times[i];
        buff[index++] = time.sid;
        util.time2buff(time.start_time).copy(buff, index); index += 2;
        util.time2buff(time.end_time).copy(buff, index); index += 2;
        buff[index++] = time.repeat;
    }
    util.setChecksum(buff);
    console.log(buff);
    phone_client.write(buff);
}

// NewApi Done
var send_query_status = function(device_id){
    var buff = new Buffer(util.REQ_HEADER_SIZE + 16);
    util.setReqCommonPart(buff, {"type": 0x83, "packet_id": 5});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);

    console.log(buff);
    phone_client.write(buff);
}

var send_control_learn = function(device_id){
    var buff = new Buffer(util.REQ_HEADER_SIZE + 16 + 6);
    util.setReqCommonPart(buff, {"type": 0x84, "packet_id": 2});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);
    var index = util.REQ_HEADER_SIZE + 16;
    buff.writeUInt16BE(0x10, index);
    index += 2;
    buff.writeUInt32BE(0, index);
    console.log(buff);
    phone_client.write(buff);
}

var send_control_lock = function(device_id){
    var buff = new Buffer(util.REQ_HEADER_SIZE + 16 + 7);
    util.setReqCommonPart(buff, {"type": 0x84, "packet_id": 3});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);
    var index = util.REQ_HEADER_SIZE + 16;
    buff.writeUInt16BE(0x01, index);
    index += 2;
    buff.writeUInt32BE(1, index);
    index += 4;
    buff[index] = 1;
    console.log(buff);
    phone_client.write(buff);
}

var send_control_0x11 = function(device_id, use_id){
    var buff;
    if(use_id){
        buff = new Buffer(util.REQ_HEADER_SIZE + 16 + 11);
    }
    else{
        buff = new Buffer(util.REQ_HEADER_SIZE + 16 + 7 + 4 + 20);
    }

    util.setReqCommonPart(buff, {"type": 0x84, "packet_id": 4});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);
    var index = util.REQ_HEADER_SIZE + 16;
    buff.writeUInt16BE(0x11, index);
    index += 2;
    if(use_id){
        buff.writeUInt32BE(5, index);
    }
    else{
        buff.writeUInt32BE(25, index);
    }

    index += 4;

    if(use_id){
        buff[index++] = 1;
        buff.writeUInt32BE(3, index);
    }
    else{
        buff[index++] = 0;
        buff.writeUInt32BE(20, index);
        index += 4;
        var ir = new Buffer("1234567890abcdefghij");
        ir.copy(buff, index);
    }

    console.log(buff);
    phone_client.write(buff);
}

var send_control = function(device_id, state, delay){
    var buff = new Buffer(10 + 25);
    util.setCommonPart(buff, {"type": 0x15, "packet_id": 1});
    (new Buffer(device_id)).copy(buff, 16);
    buff[28] = state;
    buff.writeUInt32BE(delay, 29);
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_heartbeat = function(){
    var buff = new Buffer(10 + 8);
    util.setCommonPart(buff, {"type": 0x10, "packet_id": 1});
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_check_name = function(name){
    var name_buff = new Buffer(name);
    var buff = new Buffer(10 + name_buff.length);
    util.setCommonPart(buff, {"type": 0x22, "packet_id": 2});
    name_buff.copy(buff, 8);
    util.setChecksum(buff); 

    console.log(buff);
    phone_client.write(buff);
}

var send_check_email = function(name){
    var name_buff = new Buffer(name);
    var buff = new Buffer(10 + name_buff.length);
    util.setCommonPart(buff, {"type": 0x21, "packet_id": 1});
    name_buff.copy(buff, 8);
    util.setChecksum(buff); 

    console.log(buff);
    phone_client.write(buff);
}

var send_register = function(email, password){
    var buff = new Buffer(util.REQ_HEADER_SIZE 
            + util.getStringEncodingLen(email)
            + util.getStringEncodingLen(password)
            );

    util.setReqCommonPart(buff, {"type": 0x90, "packet_id": 1});
    var index = util.REQ_HEADER_SIZE;
    index = util.writeString(buff, index, email);
    util.writeString(buff, index, password);

    console.log(buff);
    phone_client.write(buff);
}

var send_login = function(email, password)
{
    var buff = new Buffer(util.REQ_HEADER_SIZE 
            + util.getStringEncodingLen(email)
            + util.getStringEncodingLen(password)
            );

    util.setReqCommonPart(buff, {"type": 0x92, "packet_id": 1});
    var index = util.REQ_HEADER_SIZE;
    index = util.writeString(buff, index, email);
    util.writeString(buff, index, password);

    console.log(buff);
    phone_client.write(buff);
}

var send_asso = function(device_id, timezone)
{
    console.log("DEVICE ID: ");
    console.log(device_id);
    var buff = new Buffer(util.REQ_HEADER_SIZE 
            + 16
            + util.getStringEncodingLen(timezone)
            );

    util.setReqCommonPart(buff, {"type": 0x8c, "packet_id": 1});
    var index = util.REQ_HEADER_SIZE;
    device_id.copy(buff, index);
    index += 16;
    util.writeString(buff, index, timezone);

    console.log(buff);
    phone_client.write(buff);
}

var send_asso2 = function(device_id, device_id2, timezone){
    var buff = new Buffer(util.REQ_HEADER_SIZE 
            + 16
            + 16
            + util.getStringEncodingLen(timezone)
            );

    util.setReqCommonPart(buff, {"type": 0x8c, "packet_id": 1});
    var index = util.REQ_HEADER_SIZE;
    device_id2.copy(buff, index);
    index += 16;
    device_id.copy(buff, index);
    index += 16;
    util.writeString(buff, index, timezone);

    console.log(buff);
    phone_client.write(buff);
}

var send_query_all = function(){
    var buff = new Buffer(10 + 8);
    util.setCommonPart(buff, {"type": 0x17, "packet_id": 1});
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_change_password = function(password){
    var buff = new Buffer(10 + 8 + password.length + 1);
    util.setCommonPart(buff, {"type": 0x1a, "packet_id": 1});
    (new Buffer(password)).copy(buff, 16);
    buff[16+password.length] = 0x27;
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_logout = function(){
    var buff = new Buffer(10 + 8);
    util.setCommonPart(buff, {"type": 0x1B, "packet_id": 1});
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}
var send_forgot_password = function(email){
    var buff = new Buffer(10 + email.length);
    util.setCommonPart(buff, {"type": 0x1E, "packet_id": 1});
    (new Buffer(email)).copy(buff, 8);
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}

var send_check_email = function(name){
    var buff = new Buffer(10 + name.length);
    util.setCommonPart(buff, {"type": 0x21, "packet_id": 1});
    (new Buffer(name)).copy(buff, 8);
    util.setChecksum(buff);

    console.log(buff);
    phone_client.write(buff);
}
}

for(var i = 90 ; i < 91; i++){
    phone_test("dista" + i, util.createDeviceId(i+1), util.createDeviceId(i+2));
}

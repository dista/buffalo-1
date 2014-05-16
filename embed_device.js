var util = require('./util.js');
var phone = require('./phone.js');
var error_code = require('./error_code.js');
var config = require('./config.js');
//var db = require('./db.js');
var db = require('./mysqldb.js');
var native_util = require('util');
var redis = require('redis');
var msg_reason = require('./msg_reason.js');
var phone_client = require('./phone_client');

var embeds = {};
var proxies = {};
var user_id_count = 0;
var packet_id = 0;
var proxy_id = 0;
var pending_proxy_cbs = {};

var pubs = [redis.createClient()];
var sub = redis.createClient();

var find_by_proxy_id = function(proxy_id){
    return proxies[proxy_id];
}

var build_general_msg_cluster = function(msg, type, buff){
    var ret = {};
    ret["to"] = "device";
    ret["type"] = type;
    ret["server_id"] = msg["from"];
    if("cb_id" in msg){
        ret["cb_id"] = msg["cb_id"];
    }
    ret["proxy_id"] = msg["proxy_id"];
    ret["device_id"] = msg["device_id"];
    ret["data"] = {};
    ret["data"]["buff"] = buff;
   
    return ret; 
}

var send_general_msg_cluster = function(msg, type, buff){
    var ret = build_general_msg_cluster(
                        msg, type, buff
                    );

}

exports.init = function(cb){
    db.set_all_offline(cb);
}

exports.notify_msg = function(msg){
    var from = msg["from"];

    if(msg["to"] == "device"){
        var type = msg["type"];

        if(type == "remove_device"){
            var device_id = msg["device_id"];
            var device = find_by_device_id(device_id);

            if(device && !device.is_cluster()){
                db.set_online(device.id);
            }
        }
        else if(type == "general_control"
                || type == "end"
        ){
            var general_control_cb = function(buff){
                send_general_msg_cluster(msg, type + "_cb", buff);
            }

            var device = find_by_device_id(msg["device_id"]);
            if(!device){
                send_general_msg_cluster(msg, type + "_cb", util.buildErr(msg,
                            error_code.ErrorCode.NOT_EXISTS,
                            error_code.ErrorTarget.NOT_SET
                            )); 
            }
            else{
                if(type == "general_control"){
                    var buff = new Buffer(msg["data"]["buff"]);
                    device.general_control(buff[0], buff, general_control_cb);
                }
                else{
                    device.end();
                }
            }
        }
        else if(type == "general_control_cb")
        {
            var device = find_by_device_id(msg["device_id"]);

            if(device && device.is_cluster() && device.server_id == msg["from"]
               && device.proxy_id == msg["proxy_id"])
            {
                device.general_control_cb(msg);
            }
        }
        else if(type == "login"){
            var device = find_by_device_id(msg["device_id"]);

            var need_create = false;
            if(device){
                if(!device.is_cluster()){
                    device.sock.destroy();
                    delete embeds[msg["device_id"]];
                    need_create = true;
                }
                else{
                    if(device.server_id != msg["from"]
                      || device.proxy_id != msg["proxy_id"])
                    {
                        need_create = true;
                    }
                }
            }
            else{
                need_create = true;
            }

            if(need_create){
                var cd = new cluster_device(msg["from"], msg["proxy_id"],
                        msg["device_id"], msg["device"]);

                embeds[msg["device_id"]] = cd;
            }
        }
        else if(type == "exit"){
            var device = find_by_device_id(msg["device_id"]);

            if(device && device.is_cluster()){
                if(device.server_id == msg["from"]
                   && device.proxy_id == msg["proxy_id"]){
                       delete embeds[msg["device_id"]]
                }
            }
        }
    }
    else if(msg["to"] == "all")
    {
        var type = msg["type"];

        if(type == "worker_exit"){
            var worker = msg["data"]["worker"];
            remove_device_by_worker(worker);
        }
        else if(type == "worker_started"){
            var worker = msg["data"]["worker"];
            on_worker_started(msg);
        }
    }
}

var on_worker_started = function(msg){
    for(var k in embeds){
        var device = embeds[k];

        if(device && !device.is_cluster()){
            var ret = {};
            ret["proxy_id"] = device.proxy_id;
            ret["device_id"] = device.device_id;
            ret["device"] = device.device;
            ret["type"] = "login";
            ret["to"] = "device";

        }
    }
}

var remove_device_by_worker = function(worker){
    for(var k in embeds){
        var device = embeds[k];

        if(device.is_cluster() && device.server_id == worker){
            delete embeds[k];
        }
    }
}

var find_by_device_id = function(id) {
    return embeds[id];
}

exports.find_by_device_id = find_by_device_id;

var find_device_not_self = function(id, obj){
    var device = find_by_device_id(id);
    if(device && device != obj){
        return device; 
    }

    return null;
}

var send_msg_to_master = function(msg){
    msg["from"] = cluster.worker.id;

    cluster.worker.send(msg);
}

exports.create_embed_device = function(c, one_step_cb) {
    var embed_device = function(){
        this.sock = c;
        this.one_step_cb = one_step_cb;
        this.remoteAddress = null;
        this.device_id;
        this.device = null;
        this.proxy_id = ++proxy_id;
        var pending_cbs = [];
        var self = this;

        var print_log = function(msg)
        {
            console.log("device[%s]; ip[%s:%s]: %s", "", self.remoteAddress, self.remotePort, msg); 
        }

        var write_data = function(buff){
            print_log(native_util.format("response[%s]: %s", (new Date()), util.formatBuffer(buff)));
            self.sock.write(buff);
        }

        var set_offline_cb = function(err){
            if(!err){
                var found = find_device_not_self(self.device_id, self);
                if(found){
                    db.set_online(self.device.id);
                }
            }
        }

        var after_exit = function(){
            var msg = {};
            msg["proxy_id"] = self.proxy_id;
            msg["device_id"] = self.device_id;
            msg["type"] = "exit";
            msg["to"] = "device";

        }

        var remove_embed_device = function()
        {
            if(self.device){
                db.set_offline(self.device.id, set_offline_cb);
            }

            delete embeds[self.device_id];

            after_exit();

            print_log(native_util.format("embed_device client removed, current embed_devices: %d",
                    Object.keys(embeds).length));
        }

        var rm_another_logined = function(){
            var device = find_by_device_id(self.device_id);

            if(device && device != self){
                print_log("another device already logined, destroy it");
                if(!device.is_cluster())
                {
                    device.sock.destroy();
                }
                delete embeds[self.device_id];
            }
        }

        var handle_protocal_error = function()
        {
            console.error("protocal error, client " + self.sock.remoteAddress + ":" + self.sock.remotePort);
            remove_embed_device();
            self.sock.destroy();
        }

        var get_pending_cb = function(pid)
        {
            var ret = null;
            var i = 0;
            for(; i < pending_cbs.length; i++)
            {
                if(pending_cbs[i]["packet_id"] == pid)
                {
                    ret = pending_cbs[i];
                    ret["is_handled"] = true;
                    break;
                }
            } 

            if(ret)
            {
                pending_cbs.splice(i, 1);
            }

            return ret;
        }

        this.is_cluster = function(){
            return false;
        }
        
        this.handle_data = function(data, data_index){
            handle_data_internal(data, data_index);
        }

        var device_timeout = function(msg){
            if(!msg["is_handled"])
            {
                get_pending_cb(msg["packet_id"]);
                msg["cb"](util.buildErr(msg, error_code.ErrorCode.TIMEOUT, error_code.ErrorTarget.NOT_SET));
            }
        }

        /*
         * payload: payload without device id, can be null
         */
        this.general_control = function(type, payload, cb, ctx){
            var msg = {"packet_id": ++packet_id, "type": type, "cb": cb, "ctx": ctx, "is_handled": false};
            pending_cbs.push(msg);

            var timeout_mseconds = 10000;
            if(type == 0xa5){
                var cmd = payload.readUInt16BE(util.REQ_HEADER_SIZE + 16);
                // learn cmd
                if(cmd == 0x10){
                    // 120 seconds
                    timeout_mseconds = 120000;
                }
            }

            setTimeout(device_timeout, timeout_mseconds, msg);

            payload[0] = type;
            payload.writeUInt32BE(msg["packet_id"], 1);

            write_data(payload);
        }

        this.end = function(){
            self.sock.end();
        }

        this.handle_end = function()
        {
            remove_embed_device();
            self.sock.destroy();
        }

        this.handle_error = function(e)
        {
            print_log("socket error");

            remove_embed_device();
            self.sock.destroy();
        }

        var handle_data_internal = function(data, start){
            if(start >= data.length)
            {
                return;
            }

            if(!self.remoteAddress)
            {
                self.remoteAddress = self.sock.remoteAddress;
                self.remotePort = self.sock.remotePort;
            }

            if((start + 1) >= data.length){
                self.one_step_cb(0);
                return;
            }

            var pre_read_type = data[start];
            var is_resp = false;
            if(pre_read_type == 0xa5 ||
               pre_read_type == 0xa6
                    ){
                is_resp = true;
            } 

            var len = util.checkMsg(data, start, is_resp);
            if(len == -2){
                // no enough data
                self.one_step_cb(0);
                return;
            }

            print_log(native_util.format("request[%s]: %s", (new Date()), util.formatBuffer(data, start, len)));

            var msg = {};
            var type = data[start]; 
            msg["type"] = type;
            msg["packet_id"] = data.readUInt32BE(start + 1);

            if(self.device == null && type != 0xa0){
                print_log("not logined, can't send msg");
                write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS, 
                            error_code.ErrorTarget.NOT_SET
                            ));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
                return;
            }
            
            if(type == 0xa1)
            {
                print_log("heartbeat");
                proto_heartbeat(data, start, msg, len);
            }
            else if(type == 0xa0)
            {
                print_log("login");
                proto_login(data, start, msg, len);
            }
            else if(type == 0xa2)
            {
                print_log("status");
                proto_status(data, start, msg, len);
            }
            else if(type == 0xa7)
            {
                print_log("sync time");
                proto_sync_time(data, start, msg, len);
            }
            else if(type == 0xa5)
            {
                console.log("control response");
                proto_general_control_response(data, start, msg, len);
            }
            else if(type == 0xa6)
            {
                console.log("query response");
                proto_general_control_response(data, start, msg, len);
            }
            else
            {
                print_log("unsupport type [0x" + type.toString(16) + "]"); 
            }
        }

        var proto_login = function(data, start, msg, len){
            self.device_id = util.getDeviceId(data, start, 9, 16);

            rm_another_logined();

            var after_logined = function(){
                embeds[self.device_id] = self;
            }

            var set_device_login_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                var buff;
                if(config.old_ip == config.new_ip)
                {
                    buff = new Buffer(util.RESP_HEADER_SIZE + 9);
                }
                else{
                    buff = new Buffer(util.RESP_HEADER_SIZE + 13);
                }

                var index = util.RESP_HEADER_SIZE;
                var dateBCD = util.getTimeBCD(self.device.timezone);
                dateBCD.copy(buff, index);
                index += 7;
                buff[index] = util.getWeek(self.device.timezone);
                index += 1;
                util.setIp(buff, index, config.old_ip, config.new_ip);
                util.setRespCommonPart(buff, msg, true);

                after_logined();

                write_data(buff);
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var get_device_by_device_id_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row){
                    write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS,
                                error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return
                }

                db.set_device_login(row.id, set_device_login_cb);
                self.device = row;
            }

            db.get_device_by_device_id(self.device_id, get_device_by_device_id_cb);
        }

        var proto_heartbeat = function(data, start, msg, len){
            write_data(util.buildGeneralOk(msg));

            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        var proto_sync_time = function(data, start, msg, len){
            var buff = new Buffer(util.RESP_HEADER_SIZE + 8);
            var index = util.RESP_HEADER_SIZE;
            var dateBCD = util.getTimeBCD(self.device.timezone);
            dateBCD.copy(buff, index);
            index += 7;
            buff[index++] = util.getWeek(self.device.timezone);
            util.setRespCommonPart(buff, msg, true);
            
            write_data(buff);
            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        var proto_status = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;
            var device_id = util.getDeviceId(data, start, index, 16);
            index += 16;
            var stats = util.parseStatus(data, start, index, len);

            if(stats == null){
                write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
                return;
            }

            var state = 1;
            var temperature = stats['Temp'];
            var humidity = 0;
            var battery = 0;
            var locked = 0;

            var set_device_status_cb = function(err){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                }
                else{
                    write_data(util.buildGeneralOk(msg));
                }

                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            db.set_device_status(device_id, state, temperature, humidity, battery, locked, set_device_status_cb);
        }

        var proto_general_control_response = function(data, start, msg, len) {
            var pid = data.readUInt32BE(start + 1);
            var cb = get_pending_cb(pid);

            if(cb == null)
            {
                print_log("can't find request for packet_id " + pid);
            }
            else
            {
                var buff = new Buffer(len);
                data.copy(buff, 0, start, start + len); 
                cb["cb"](buff, cb['ctx']);
            }

            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        return this;
    }

    var device = new embed_device();

    return device;
}


var get_pub_by_host_port = function(host, port){
    return pubs[0];
}

sub.on('subscribe', function(channel, count){
});

var build_buff_for_msg = function(device_id, message){
    var type = message['__type'];
    var ret;
    if(type == 'query'){
        ret = phone_client.build_query_status(device_id);
        ret[0] = 0xa6;
        return ret;
    }
    else if(type == 'control'){
        var cmd = message['cmd'];
        if(cmd == 'lock'){
            ret = phone_client.build_control_lock(device_id,
                    message['is_locked']);
        }
        else if(cmd == 'learn_signal'){
            ret = phone_client.build_control_learn(device_id);
        }
        else if(cmd = 'send_ir'){
            ret = phone_client.build_control_ir(device_id, util.bufferStringToBuffer(message['ir_signal']));
        }

        ret[0] = 0xa5;
        return ret;
    }
}

sub.on('message', function(channel, message){
    var message = JSON.parse(message);
    var device_id = message['device_id'];
    device_id = util.bufferStringToBuffer(device_id);

    var device = find_by_device_id(device_id);
    var pub = get_pub_by_host_port(message['__redis_host'],
        message['__redis_port']);

    if(!device){
        var retmsg = {};
        retmsg['__msg_id'] = message['__msg_id'];
        retmsg['result'] = 'error';
        retmsg['reason'] = msg_reason.DEVICE_IS_NOT_ONLINE;
        pub.publish('buffalo_http_api', JSON.stringify(retmsg)); 
        return;
    }

    var after_general_control = function(resp_data, msg_id){
        var r1 = {};
        r1['__msg_id'] = msg_id;
        r1['result'] = 'ok';
        r1['resp_data'] = util.buffToBufferStr(resp_data);
        pub.publish('buffalo_http_api', JSON.stringify(r1));
    }

    if(message['__type'] == 'query' || message['__type'] == 'control'){
        var target_device_id = util.bufferStringToBuffer(message['target_device_id'])
        var buff = build_buff_for_msg(target_device_id, message);
        device.general_control(buff[0], buff, after_general_control, message['__msg_id']);
    }
    else if(message['__type'] == 'end'){
        device.end();
    }
});

sub.subscribe('buffalo_device');

var cluster_device = function(server_id, proxy_id, device_id, device){
    this.device = device;
    this.server_id = server_id;
    this.proxy_id = proxy_id;
    this.device_id = device_id;
    var self = this;
    var pending_cbs = {};
    var cb_id = 0;

    this.is_cluster = function(){
        return true;
    }

    this.send_to_server = function(msg, cb){
        msg["server_id"] = this.server_id;
        msg["device_id"] = this.device_id;
        msg["proxy_id"] = this.proxy_id;
        msg["to"] = "device";

        var send_to_server_timeout = function(cbx){
            if(!cbx["is_handled"]){
                delete pending_cbs[cbx["cb_id"]];
                cbx["cb"](0, error_code.DEVICE_TIMEOUT);
            }
        }

        if(cb){
            msg["cb_id"] = ++cb_id;
            var cbx = {"cb": cb, "is_handled": false};
            pending_cbs[msg["cb_id"]] = cbx;

            //setTimeout(send_to_server_timeout, 5000, cbx);
        }
    }

    this.end = function(){
        var msg = {};
        msg["data"] = {};
        msg["type"] = "end";
        this.send_to_server(msg);
    }

    this.general_control_cb = function(msg){
        var cb = pending_cbs[msg["cb_id"]];

        if(cb){
            cb["is_handled"] = true;
            delete pending_cbs[msg["cb_id"]];
        }

        cb["cb"](new Buffer(msg["data"]["buff"]));
    }

    this.general_control = function(buff, cb){
        var msg = {};
        msg["type"] = "general_control";
        msg["data"] = {};
        // TODO: to see if buff can be serialized
        msg["data"]["buff"] = buff;
        this.send_to_server(msg, cb);
    }
}

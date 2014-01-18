var util = require('./util.js');
var phone = require('./phone.js');
var error_code = require('./error_code.js');
var config = require('./config.js');
//var db = require('./db.js');
var db = require('./mysqldb.js');
var cluster = require('cluster');
var native_util = require('util');

var embeds = {};
var proxies = {};
var user_id_count = 0;
var package_id = 0;
var timeout_mseconds = 5000;
var proxy_id = 0;
var pending_proxy_cbs = {};

var find_by_proxy_id = function(proxy_id){
    return proxies[proxy_id];
}

if(config.debug_cluster){
    setInterval(function(){
        if(cluster.worker){
            console.log("worker[%s] length [%d]", cluster.worker.id, Object.keys(embeds).length);
        }
    }, 60000);
}

var build_general_msg_cluster = function(msg, type, result, code){
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
    ret["data"]["result"] = result;
    ret["data"]["code"] = code;
   
    return ret; 
}

var send_general_msg_cluster = function(msg, type, result, code){
    var ret = build_general_msg_cluster(
                        msg, type, result, code
                    );

    send_msg_to_master(ret);
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
        else if(type == "del_time"
               || type == "control"
               || type == "upload_time"
               || type == "lock"
               || type == "del_delay"
               || type == "query"
               || type == "end"
        ){
            var general_cb = function(result, code){
                send_general_msg_cluster(msg, type + "_cb", result, code);
            }

            var query_cb = function(result, code, state, temperature,
                    humidity, battery, locked)
            {
                var ret = build_general_msg_cluster(msg, type + "_cb", result, code);
                ret["data"]["state"] = state;
                ret["data"]["temperature"] = temperature;
                ret["data"]["humidity"] = humidity;
                ret["data"]["battery"] = battery;
                ret["data"]["locked"] = locked;

                send_msg_to_master(ret);
            }

            var device = find_by_device_id(msg["device_id"]);
            if(!device){
                send_general_msg_cluster(msg, type + "_cb", 0, error_code.DEVICE_ID_NOT_FOUND); 
            }
            else{
                if(type == "del_time"){
                    device.del_time(msg["data"]["time_id"], general_cb);
                }
                else if(type == "end")
                {
                    device.end();
                    var ret = build_general_msg_cluster(msg, type + "_cb", 1, 0);
                    send_msg_to_master(ret);
                }
                else if(type == "control")
                {
                    device.control(msg["data"]["open_or_not"],
                                   msg["data"]["delay"],
                                   general_cb);
                }
                else if(type == "upload_time"){
                    device.upload_time(new Buffer(msg["data"]["buff"]),
                                       general_cb);
                }
                else if(type == "lock"){
                    device.lock(msg["data"]["locked"],
                                general_cb);
                }
                else if(type == "del_delay"){
                    device.del_delay(general_cb);
                }
                else if(type == "query"){
                    device.query(query_cb);
                }
            }
        }
        else if(type == "del_time_cb"
               || type == "control_cb"
               || type == "upload_time_cb"
               || type == "lock_cb"
               || type == "del_delay_cb"
               || type == "query_cb")
        {
            var device = find_by_device_id(msg["device_id"]);

            if(device && device.is_cluster() && device.server_id == msg["from"]
               && device.proxy_id == msg["proxy_id"])
            {
                if(type == "query_cb")
                {
                    device.query_cb(msg);
                }
                else{
                    device.general_cb(msg);
                }
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

            send_msg_to_master(ret);
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
            console.log("worker[%s]; device[%s]; ip[%s:%s]: %s", cluster.worker.id, self.device_id, self.remoteAddress, self.remotePort, msg); 
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
                else{
                    send_msg_to_master({"type": "remove_device", "device_id": self.device_id, "to": "device"});
                }
            }
        }

        var after_exit = function(){
            var msg = {};
            msg["proxy_id"] = self.proxy_id;
            msg["device_id"] = self.device_id;
            msg["type"] = "exit";
            msg["to"] = "device";

            send_msg_to_master(msg);
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
                if(pending_cbs[i]["package_id"] == pid)
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
                get_pending_cb(msg["package_id"]);
                msg["cb"](0, error_code.DEVICE_TIMEOUT);
            }
        }

        /*
         * payload: payload without device id, can be null
         */
        this.general_control = function(type, payload, cb){
            var msg = {"package_id": ++package_id, "cb": cb, "is_handled": false};
            pending_cbs.push(msg);

            setTimeout(device_timeout, timeout_mseconds, msg);

            var device_id_buff = new Buffer(self.device_id);

            var payload_len = 0;
            if(payload){
                payload_len = payload.length;
            }

            var buff = new Buffer(10 + 12 + payload_len);
            util.setCommonPart(buff, {"packet_id": msg["package_id"], "type": type});
            device_id_buff.copy(buff, 8);
            if(payload)
            {
                payload.copy(buff, 20);
            }
            util.setChecksum(buff);

            write_data(buff);
        }

        this.query = function(cb) {
            this.general_control(0x42, null, cb);
        }

        this.lock = function(locked, cb) {
            var buff = new Buffer(1);
            buff[0] = locked;
            this.general_control(0x43, buff, cb);
        }

        this.del_delay = function(cb) {
            this.general_control(0x46, null, cb);
        }

        this.del_time = function(time_id, cb) {
            var buff = new Buffer(1);
            buff[0] = time_id;

            this.general_control(0x45, buff, cb);
        }

        this.upload_time = function(buff, cb) {
            this.general_control(0x44, buff, cb);
        }

        this.control = function(open_or_not, delay, cb){
            var buff = new Buffer(5);
            buff[0] = open_or_not;
            buff.writeUInt32BE(delay, 1);
            this.general_control(0x41, buff, cb);
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

            var len = util.checkMsg(data, start);
            if(len == null){
                handle_protocal_error();
                return null;
            }
            else if(len == -2){
                // no enough data
                self.one_step_cb(0);
            }

            print_log(native_util.format("request[%s]: %s", (new Date()), util.formatBuffer(data, 10 + len)));

            var msg = {};
            var type = data[start + 1]; 
            msg["type"] = type;
            msg["packet_id"] = data.readUInt32BE(start + 2);

            if(self.device == null && type != 0x31){
                print_log("not logined, can't send msg");
                write_data(util.buildErr(msg, error_code.NOT_LOGINED));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
                return;
            }
            
            if(type == 0x30)
            {
                proto_heartbeat(data, start, msg, len);
                print_log("heartbeat");
            }
            else if(type == 0x31)
            {
                proto_login(data, start, msg, len);
                print_log("login");
            }
            else if(type == 0x32)
            {
                proto_status(data, start, msg, len);
                print_log("status");
            }
            else if(type == 0x33)
            {
                proto_sync_time(data, start, msg, len);
                print_log("sync time");
            }
            else if(type == 0x41)
            {
                proto_general_control_response(data, start, msg, len);
                print_log("control response");
            }
            else if(type == 0x42)
            {
                proto_query_response(data, start, msg, len);
                print_log("query response");
            }
            else if(type == 0x43)
            {
                proto_general_control_response(data, start, msg, len);
                print_log("lock response");
            }
            else if(type == 0x44)
            {
                proto_general_control_response(data, start, msg, len);
                print_log("upload time response");
            }
            else if(type == 0x45)
            {
                proto_general_control_response(data, start, msg, len);
                print_log("del_time response");
            }
            else if(type == 0x46)
            {
                proto_general_control_response(data, start, msg, len);
                print_log("del_delay response");
            }
            else
            {
                print_log("unsupport type [0x" + type.toString(16) + "]"); 
            }
        }

        var proto_login = function(data, start, msg, len){
            self.device_id = data.toString('ascii', start + 8, start + 8 + 12);

            rm_another_logined();

            var mac = data.toString('hex', start + 8 + 12, start + 8 + 12 + 6);

            var after_logined = function(){
                embeds[self.device_id] = self;

                var msg = {};
                msg["proxy_id"] = self.proxy_id;
                msg["device_id"] = self.device_id;
                msg["device"] = self.device;
                msg["type"] = "login";
                msg["to"] = "device";

                send_msg_to_master(msg);
            }

            var set_device_login_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                var get_time_by_device_id_cb = function(err, rows){
                    if(err){
                        write_data(util.buildErr(msg, error_code.DB_ERROR));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var buff = new Buffer(10 + 13 + 1 + 6 * rows.length + 5);
                    util.setCommonPart(buff, msg);
                    buff[8] = 0x01;
                    self.user_id = ++user_id_count;
                    buff.writeUInt32BE(self.user_id, 10);
                    var dateBCD = util.getTimeBCD(self.device.timezone);
                    dateBCD.copy(buff, 14);
                    buff[20] = util.getWeek(self.device.timezone);
                    
                    var index = 21;
                    buff[index++] = rows.length;
                    for(var i = 0; i < rows.length; i++)
                    {
                        var time = rows[i];
                        buff[index++] = time.sid;
                        buff.writeUInt16BE(time.start_time, index); index += 2;
                        buff.writeUInt16BE(time.end_time, index); index += 2;
                        buff[index++] = time.repeatx;
                    }

                    util.setIp(buff, index, config.old_ip, config.new_ip);
                    util.setChecksum(buff);
                    write_data(buff);

                    after_logined();
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                }

                db.get_time_by_device_id(self.device.id, get_time_by_device_id_cb);
            }

            var get_device_by_device_id_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row){
                    write_data(util.buildErr(msg, error_code.DEVICE_ID_NOT_FOUND));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return
                }

                db.set_device_login(row.id, mac, set_device_login_cb);
                self.device = row;
            }

            db.get_device_by_device_id(self.device_id, get_device_by_device_id_cb);
        }

        var proto_heartbeat = function(data, start, msg, len){
            write_data(util.buildGeneralOk(msg));

            /*
            if(self.device){
                db.set_online(self.device.id); 
            }
            */

            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        var proto_sync_time = function(data, start, msg, len){
            var buff = new Buffer(10 + 7);
            util.setCommonPart(buff, msg);
            var dateBCD = util.getTimeBCD(self.device.timezone);
            dateBCD.copy(buff, 8);
            buff[8 + 6] = util.getWeek(self.device.timezone);
            util.setChecksum(buff);
            
            write_data(buff);
            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        var proto_status = function(data, start, msg, len){
            var device_id = data.toString('ascii', start + 12, start + 12 + 12);
            var state = data[start + 12 + 12];
            var temperature = data[start + 12 + 12 + 1];
            var humidity = data[start + 12 + 12 + 2];
            var battery = data.readUInt16BE(start + 12 + 12 + 3);
            var locked = data[start + 12 + 12 + 5]; 

            var set_device_status_cb = function(err){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                }
                else{
                    write_data(util.buildGeneralOk(msg));
                }

                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            db.set_device_status(device_id, state, temperature, humidity, battery, locked, set_device_status_cb);
        }

        var proto_query_response = function(data, start, msg, len) {
            var result = data[start + 8];
            var pid = data.readUInt32BE(start + 2);

            var cb = get_pending_cb(pid);

            if(cb == null)
            {
                print_log("proto_query_response: can't find request for package_id " + pid);
            }
            else{
                if(result != 1){
                    cb["cb"](result, data[start + 9]);      
                }
                else{
                    cb["cb"](result, data[start + 9], 
                            data[start+10], //state
                            data[start+11], //temperature
                            data[start+12], // humidity
                            data.readUInt16BE(start + 13), //battery
                            data[start+15]); // locked

                }
            }
            
            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        var proto_general_control_response = function(data, start, msg, len) {
            var pid = data.readUInt32BE(start + 2);
            var cb = get_pending_cb(pid);

            if(cb == null)
            {
                print_log("can't find request for package_id " + pid);
            }
            else
            {
                cb["cb"](data[start + 8], data[start + 9]);
            }

            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        return this;
    }

    var device = new embed_device();
    return device;
}

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

            setTimeout(send_to_server_timeout, 5000, cbx);
        }

        send_msg_to_master(msg);
    }

    this.del_time = function(time_id, cb){
        var msg = {};
        msg["data"] = {};
        msg["data"]["time_id"] = time_id;
        msg["type"] = "del_time";
        this.send_to_server(msg, cb);
    }

    this.end = function(){
        var msg = {};
        msg["data"] = {};
        msg["type"] = "end";
        this.send_to_server(msg);
    }

    this.general_cb = function(msg){
        var cb = pending_cbs[msg["cb_id"]];

        if(cb){
            cb["is_handled"] = true;
            delete pending_cbs[msg["cb_id"]];
        }

        cb["cb"](msg["data"]["result"], msg["data"]["code"]);
    }

    this.del_time_cb = function(msg){
        this.general_cb(msg);
    }

    this.control = function(open_or_not, delay, cb){
        var msg = {};
        msg["data"] = {};
        msg["data"]["open_or_not"] = open_or_not;
        msg["data"]["delay"] = delay;
        msg["type"] = "control";
        this.send_to_server(msg, cb);
    }

    this.control_cb = function(msg){
        this.general_cb(msg);
    }

    this.query = function(cb){
        var msg = {};
        msg["type"] = "query";
        this.send_to_server(msg, cb);
    }

    this.query_cb = function(msg){
        var cb = pending_cbs[msg["cb_id"]];

        if(cb){
            cb["is_handled"] = true;
            delete pending_cbs[msg["cb_id"]];
        }

        cb["cb"](msg["data"]["result"], msg["data"]["code"],
                msg["data"]["state"], msg["data"]["temperature"],
                msg["data"]["humidity"], msg["data"]["battery"],
                msg["data"]["locked"]);
    }

    this.upload_time = function(buff, cb){
        var msg = {};
        msg["type"] = "upload_time";
        msg["data"] = {};
        // TODO: to see if buff can be serialized
        msg["data"]["buff"] = buff;
        this.send_to_server(msg, cb);
    }

    this.upload_time_cb = function(msg){
        this.general_cb(msg);
    }

    this.lock = function(locked, cb){
        var msg = {};
        msg["type"] = "lock";
        msg["data"] = {};
        msg["data"]["locked"] = locked;
        this.send_to_server(msg, cb);
    }

    this.lock_cb = function(msg){
        this.general_cb(msg);
    }

    this.del_delay = function(cb){
        var msg = {};
        msg["type"] = "del_delay";
        this.send_to_server(msg, cb);
    }

    this.del_delay_cb = function(msg){
        this.general_cb(msg);
    }
}

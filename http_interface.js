var express = require("express");
var bodyParser = require('body-parser');
var mysqldb = require("./mysqldb.js");
var config = require("./config.js");
var gm = require("gm");
var util = require("./util.js");
var redis_db = require('./redis_db.js');
var notification = require('./notification.js');
var embed_device = require('./embed_device.js');
var redis = require('redis');
var msg_reason = require('./msg_reason.js');
var fs = require('fs');
var morgan = require('morgan');
var tmp_cleanuper = require('./tmp_cleanuper.js');

var sub = redis.createClient();
var pubs = [redis.createClient()];

var buffalo = express();
buffalo.use(morgan());
buffalo.use(bodyParser());
buffalo.use("/buffalo/files", express.static(__dirname + '/files'));

buffalo.get('/buffalo/list/server', function(req, res){
    var ret = {"result": "ok"};
    ret["cn"] = config.api_servers;
    res.type("application/json").json(200, ret);
});

var password_reg = /^[a-zA-Z0-9_]+$/;
buffalo.post('/buffalo/register/user', function(req, res){
    var req_data = req.body;

    if(!req_data["name"] || !req_data["email"] || !req_data["password"]){
        res.type("application/json").json(400, {"result": "error", "general_error": "bad request"});
        return;
    }

    var after_register = function(err){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
        }
        else{
            res.type("application/json").json(200, {"result": "ok"});
        }
    }

    var on_check_email_result = function(err, result){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
        }
        else{
            if(!result){
                res.type("application/json").json(200, {"result": "error", "name": "邮箱已经被占用"});
            }
            else{
                if(req_data["password"].length < 6){
                    res.type("application/json").json(200, {"result": "error", "password": "密码长度不能小于6"});
                }
                else if(!password_reg.test(req_data["password"])){
                    res.type("application/json").json(200, {"result": "error", "password": "密码必须使用A-Z, a-z, 0-9或_"});
                }
                else{
                    mysqldb.register_user(req_data["name"], req_data["email"],
                       req_data["password"], after_register); 
                }
            }
        }
    }

    var on_check_name_result = function(err, result){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
        }
        else{
            if(!result){
                res.type("application/json").json(200, {"result": "error", "name": "用户名已经被占用"});
            }
            else{                
                mysqldb.check_email(req_data["email"], on_check_email_result);
            }
        }
    }

    mysqldb.check_name(req_data["name"], on_check_name_result);
});

var get_auth_code = function(){
    var x1 = Math.floor(Math.random() * 23);
    x1 = "A".charCodeAt(0) + x1;
    var x2 = Math.floor(Math.random() * 9);
    var x3 = Math.floor(Math.random() * 23);
    x3 = "a".charCodeAt(0) + x3;
    var x4 = Math.floor(Math.random() * 9);
    var ret = String.fromCharCode(x1) + x2 + String.fromCharCode(x3)
              + x4;

    return ret;
}

var get_color_part = function(){
    var x5 = Math.floor(Math.random() * 200).toString(16);
    if(x5.length < 2){
        x5 = "0" + x5;
    }

    return x5;
}

var gen_auth_pic = function(cb){
    var text = get_auth_code();
    var filename = util.getRandomKey("gen_auth_pic_" + text) + ".png";
    var file_path = __dirname + "/files/" + filename;
    var gx = gm(100, 50, '#ffffff').fontSize(30).fill('#000000').drawText(10, 40, text.substring(0, 2));
    gx.fontSize(40).fill('#b97a57').drawText(50, 35, text.substring(2, 4));
    
    var x1 = Math.floor(Math.random() * 50);
    var x3 = Math.floor(Math.random() * 50);
    
    var x2 = Math.floor(Math.random() * 50) + 99;
    var x4 = Math.floor(Math.random() * 50);
    
    var x5 = get_color_part();
    var x6 = get_color_part();
    var x7 = get_color_part();

    gx.stroke('#' + x5 + x6 + x7).drawLine(x1, x3, x2, x4);
        
    gx.write(file_path, function(err){
        if(err){
            console.log(err);
        }
        cb(err, text, "files/" + filename);
    }); 
}

buffalo.get("/buffalo/gen/auth_pic", function(req, res){
    var after_gen_auth_pic = function(err, code, path){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "gm"});
        }
        else{
            var key = util.getRandomKey("auth_pic");
            redis_db.set_auth_code(key, code);

            res.type("application/json").json(200, {"result": "ok",
                "auth_pic_id": key,
                "auth_pic_url":
                config.file_http_prefix + "/buffalo/" + path
                 });
        }
    }
    gen_auth_pic(after_gen_auth_pic);
});

buffalo.post("/buffalo/change/password", function(req, res){
    var user = req.body['user'] || "";
    var old_password = req.body['old_password'] || "";
    var new_password = req.body['new_password'] || "";

    var is_email = false; 
    if(user.indexOf("@") != -1){
        is_email = true;
    }

    var get_by_name_or_email_cb = function(err, row){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
        }
        else{
            if(!row){
                res.type("application/json").json(200, {"result": "error", "user": "用户不存在"});
            }
            else{
                var user = row;

                var set_password_cb = function(err){
                    if(err){
                        res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                        return;
                    }

                    res.type("application/json").json(200, {"result": "ok"});
                }

                var verify_password = function(){
                    if(row.password != mysqldb.get_hashed_password(old_password)){
                        res.type("application/json").json(200, {"result": "error", "old_password": "密码错误"});
                    }
                    else{
                        if(new_password.length < 6){
                            res.type("application/json").json(200, {"result": "error", "new_password": "密码长度不能小于6"});
                        }
                        else if(!password_reg.test(new_password)){
                            res.type("application/json").json(200, {"result": "error", "new_password": "密码必须使用A-Z, a-z, 0-9或_"});
                        }
                        else{
                            mysqldb.set_password(user.id,
                                    new_password, set_password_cb);
                        }
                    }
                }

                verify_password();
            }
        }
    }

    mysqldb.get_by_name_or_email(user, is_email, get_by_name_or_email_cb);
});

buffalo.post("/buffalo/login/user", function(req, res){
    var user = req.body['user'] || "";
    var password = req.body['password'] || "";
    var keep_time = req.body['keep_time'] || 0;
    var auth_token = req.body['auth_token'];
    var auth_pic_id = req.body["auth_pic_id"] || "";

    var is_email = false; 
    if(user.indexOf("@") != -1){
        is_email = true;
    }

    var get_by_name_or_email_cb = function(err, row){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
        }
        else{
            if(!row){
                res.type("application/json").json(200, {"result": "error", "user": "用户不存在"});
            }
            else{
                var get_failed_time_cb = function(failed_time){
                    var verify_password = function(){
                        if(row.password != mysqldb.get_hashed_password(password)){
                            redis_db.set_failed_time(row.name, failed_time + 1);
                            res.type("application/json").json(200, {"result": "error", "password": "密码错误"});
                        }
                        else{
                            var get_old_auth_id_cb = function(err, reply){
                                if(reply){
                                    redis_db.del_user_auth_id(reply);
                                }

                                var auth_id = redis_db.set_user_auth_id(row.name, keep_time);
                                redis_db.set_failed_time(row.name, 0);
                                res.type("application/json").json(200, {"result": "ok", "auth_id": auth_id});

                            }
                            redis_db.get_old_auth_id(row.name, get_old_auth_id_cb);
                        }
                    } 

                    var get_auth_code_cb = function(err, reply){
                        if(!reply || (reply.toLowerCase() != auth_token.toLowerCase())){
                            res.type("application/json").json(200, {"result": "error", "auth_token": "auth_token不正确"});
                        }
                        else{
                            verify_password();
                        }
                    }

                    if(failed_time > 2){
                        if(auth_token == undefined){
                            res.type("application/json").json(200, {"result": "error", "general_error": "需要auth_token"});
                        }
                        else{
                            redis_db.get_auth_code(auth_pic_id, get_auth_code_cb);
                        }
                    }
                    else{
                        if(auth_token != undefined){
                            redis_db.get_auth_code(auth_pic_id, get_auth_code_cb);
                        }
                        else{
                            verify_password();
                        }
                    }
                }
                redis_db.get_failed_time(row.name, get_failed_time_cb);
            }
        }
    }

    mysqldb.get_by_name_or_email(user, is_email, get_by_name_or_email_cb);
}
);

buffalo.post("/buffalo/forgot/password", function(req, res){
    var email = req.body["email"];
    var user = null;
    var password = null;

    var set_password_cb = function(err){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
            return;
        }

        notification.send_mail(email, email, password, util.dummy); 
        res.type("application/json").json(200, {"result": "ok"});
    }

    var get_by_name_or_email_cb = function(err, row){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
            return;
        }

        if(!row){
            res.type("application/json").json(200, {"result": "error", "email": "email不存在"});
            return;
        }

        user = row;

        password = mysqldb.get_random_password();
        mysqldb.set_password(user.id, password, set_password_cb);
    }

    mysqldb.get_by_name_or_email(email, true, get_by_name_or_email_cb);
});

buffalo.post('/buffalo/logout/user', function(req, res){
    var auth_id = req.body["auth_id"] || "";

    redis_db.del_user_auth_id(auth_id);
    res.type("application/json").json(200, {"result": "ok"});
});

var get_pub_by_device_id = function(device_id){
    return pubs[0];
}

sub.subscribe('buffalo_http_api');
sub.on('subscribe', function(channel, count){
});

var msg_id = 0;
var msg_cache = {};
var timeout_cache = {};
sub.on('message', function(channel, message){
    message = JSON.parse(message);

    var id = message['__msg_id'];
    var mx = msg_cache[id];
    if(mx){
        mx['cb'](false, message);
        clearTimeout(timeout_cache[id]);
        delete timeout_cache[id];
        delete msg_cache[id];
    }
});

var send_msg = function(device_id, mco, cb){
    mco['__msg_id'] = msg_id;
    mco['__redis_host'] = config.api_redis_host;
    mco['__redis_port'] = config.api_redis_port;
    mco['cb'] = cb;

    msg_cache[msg_id] = mco;

    var send_msg_cb = function(cbx){
        var xid = cbx['__msg_id'];

        if(msg_cache[xid]){
            var mx = msg_cache[xid];
            mx['cb'](true, 'timeout');
            delete timeout_cache[xid];
            delete msg_cache[xid];
        }
    }

    var timeout = 10000;
    if(mco['__type'] == 'control' && mco['cmd'] == 'learn_signal'){
        timeout = 120000;
    }

    timeout_cache[msg_id] = setTimeout(send_msg_cb, timeout, mco);
    var pub = get_pub_by_device_id(device_id);
    pub.publish('buffalo_device', JSON.stringify(mco));
}

buffalo.post('/buffalo/status/device', function(req, res){
    console.log(req.body);
    var auth_id = req.body["auth_id"] || "";
    var device_id = req.body['device_id'] || "";
    var target_device_id = device_id;

    var get_user_auth_id_cb = function(err, reply){
        if(!reply){
            res.type("application/json").json(200, {"result": "error", "auth_id": "auth_id不存在"});
        }
        else{
            var user = reply;
            device_id = util.bufferStringToBuffer(device_id);

            var do_status = function(device_id){
                var status_msg = {"device_id": util.buffToBufferStr(device_id)};
                status_msg['__type'] = 'query';
                status_msg['target_device_id'] = target_device_id;

                var after_status_resp = function(has_error, ret_v){
                    if(has_error){
                        res.type("application/json").json(200, {"result": "error", "general_error": ret_v});
                        return;
                    }
                    else{
                        var result = ret_v["result"];
                        if(result == 'error'){
                            res.type("application/json").json(200, {"result": "error", "general_error": msg_reason.trans(ret_v['reason'])});
                        }
                        else{
                            var resp_data = util.bufferStringToBuffer(ret_v['resp_data']);
                            console.log(resp_data);
                            var is_success = resp_data[5];
                            if(!is_success){
                                res.type("application/json").json(200, {"result": "error", "general_error": "获取出错"});
                                return;
                            }

                            var stats = util.parseStatus(resp_data, 0, 10, 
                                    resp_data.length);

                            console.log('status OK');

                            res.type("application/json").json(200, {"result": "ok", "temperature": stats["Temp"], "is_online": 1});
                        }
                    }
                }

                send_msg(status_msg["device_id"], status_msg, after_status_resp);
            }

            if(!util.is_master_device(device_id)){
                var get_master_device_cb = function(err, row){
                    if(err){
                        res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                        return;
                    }

                    do_status(new Buffer(row.device_id, 'utf8'));
                }

                var get_device_by_device_id_cb = function(err, row){
                    if(err){
                        res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                        return;
                    }

                    if(row.master_id == -1){
                        res.type("application/json").json(200, {"result": "error", "device_id": "找不到相应的master_device_id"});
                        return;
                    }

                    mysqldb.get_device_by_id(row.master_id, get_master_device_cb);
                }
                mysqldb.get_device_by_device_id(device_id, get_device_by_device_id_cb);
            }
            else{
                do_status(device_id);
            }
        }
    }

    redis_db.get_user_auth_id(auth_id, get_user_auth_id_cb);
});

buffalo.post('/buffalo/asso/device', function(req, res){
    var auth_id = req.body["auth_id"] || "";
    var device_id = req.body['device_id'] || "";
    var master_device_id = null;
    var timezone = req.body["time_zone"] || "";
    var device = null;
    var master_device = null;
    var user = null;

    var get_user_auth_id_cb = function(err, reply){
        if(!reply){
            res.type("application/json").json(200, {"result": "error", "auth_id": "auth_id不存在"});

            return;
        }

        var name = reply;
        device_id = util.bufferStringToBuffer(device_id);

        if(!util.is_master_device(device_id)){
            master_device_id = util.bufferStringToBuffer(req.body["master_device_id"] || "");
        }

        var asso_user_device_cb = function(err){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }

            if(device){
                mysqldb.set_timezone(timezone, device.id);
            }

            if(master_device){
                mysqldb.set_timezone(timezone, master_device.id);
            }

            var send_device_id = master_device_id;
            if(util.is_master_device(device_id)){
                send_device_id = device_id;
            }
            var end_msg = {'device_id': util.buffToBufferStr(send_device_id)};
            end_msg['__type'] = 'end';
            send_msg(send_device_id, end_msg, util.dummy);

            res.type("application/json").json(200, {"result": "ok"});
        }

        var set_master_id_cb = function(err){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }
            
            mysqldb.asso_user_device(user.id, device.id, asso_user_device_cb);
        }

        var asso_user_master_device_cb = function(err){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }

            mysqldb.set_master_id(device.id, master_device.id, set_master_id_cb);
        }

        var get_master_user_device_cb = function(err, row){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }

            if(row){
                if(row.user_id != user.id){
                    res.type("application/json").json(200, {"result": "error", "master_device_id": "设备已经被其它用户使用"});
                    return;
                }
                
                mysqldb.set_master_id(device.id, master_device.id, set_master_id_cb);
            }
            else{
                // asso master device
                mysqldb.asso_user_device(user.id, master_device.id, asso_user_master_device_cb);
            }
        }

        var get_master_device_id_cb = function(err, row){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }

            if(!row){
                res.type("application/json").json(200, {"result": "error", "master_device_id": "找不到该设备"});
                return;
            }

            master_device = row;

            mysqldb.get_user_device(row.id, get_master_user_device_cb);
        }

        var get_user_device_cb = function(err, row){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }

            if(row){
                if(row.user_id == user.id)
                {
                    res.type("application/json").json(200, {"result": "ok"});
                }
                else{
                    res.type("application/json").json(200, {"result": "error", "general_error": "已经被其它用户注册"});
                }
                return;
            }
            else{
                if(master_device_id == null){
                    mysqldb.asso_user_device(user.id, device.id, asso_user_device_cb);
                }
                else{
                    mysqldb.get_device_by_device_id(master_device_id,
                            get_master_device_id_cb);
                }
            }
        }

        var get_device_by_device_id_cb = function(err, row){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }

            if(!row){
                res.type("application/json").json(200, {"result": "error", "device_id": "不存在"});
                return;
            }

            device = row;
            mysqldb.get_user_device(row.id, get_user_device_cb);
        }

        var get_user_by_name_cb = function(err, row){
            user = row;
            mysqldb.get_device_by_device_id(device_id,
                get_device_by_device_id_cb);
        }

        mysqldb.get_user_by_name(name, get_user_by_name_cb); 
    }
   
    redis_db.get_user_auth_id(auth_id, get_user_auth_id_cb); 
});

buffalo.post('/buffalo/de_asso/device', function(req, res){
    var auth_id = req.body["auth_id"] || "";
    var device_id = req.body["device_id"] || "";
    var device;
    var name;
    var user;

    var get_user_auth_id_cb = function(err, reply){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
            return;
        }

        name = reply;
        
        var get_device_by_device_id_cb = function(err, row){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                return;
            }

            if(!row){
                res.type("application/json").json(200, {"result": "error", "device_id": "不存在"});
                return;
            }

            var del_from_user_device_cb = function(err){
                if(err){
                    res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                    return;
                }

                res.type("application/json").json(200, {"result": "ok"});
            }

            device = row;

            var get_user_by_name_cb = function(err, row){
                mysqldb.del_from_user_device(device.id, row.id, del_from_user_device_cb);
            }

            mysqldb.get_user_by_name(name, get_user_by_name_cb);
        }

        mysqldb.get_device_by_device_id(device_id, get_device_by_device_id_cb);
    }

    redis_db.get_user_auth_id(auth_id, get_user_auth_id_cb);
});

buffalo.post("/buffalo/control/device", function(req, res){
    var auth_id = req.body['auth_id'] || "";
    var device_id = req.body['device_id'] || "";
    var target_device_id = device_id;
    var cmd = req.body["cmd"] || "";
    var ir_signal = null;

    console.log(req.body);

    var get_user_auth_id_cb = function(err, reply){
        if(!reply){
            res.type("application/json").json(200, {"result": "error", "auth_id": "auth_id不存在"});
            return;
        }

        var user = reply;
        device_id = util.bufferStringToBuffer(device_id);

        var do_control = function(device_id){
            var control_msg = {"device_id": util.buffToBufferStr(device_id)};
            control_msg['__type'] = 'control';
            control_msg['cmd'] = cmd;
            control_msg['target_device_id'] = target_device_id;

            var after_pre_process = function(){
                if(cmd == 'lock'){
                    control_msg['is_locked'] = req.body['is_locked'];
                }
                else if(cmd == 'send_ir'){
                    if(req.body['is_ir_id']){
                        control_msg['ir_signal'] = ir_signal;
                    }
                    else{
                        control_msg['ir_signal'] = req.body['ir_signal'];
                    }
                }
                else if(cmd == 'multi_cmd'){
                    control_msg['multi_cmd'] = req.body['multi_cmd'];
                }

                var after_control_resp = function(has_error, ret_v){
                    if(has_error){
                        res.type("application/json").json(200, {"result": "error", "general_error": ret_v});
                        return;
                    }
                    else{
                        var result = ret_v["result"];
                        if(result == 'error'){
                            res.type("application/json").json(200, {"result": "error", "general_error": msg_reason.trans(ret_v['reason'])});
                        }
                        else{
                            var resp_data = util.bufferStringToBuffer(ret_v['resp_data']);
                            console.log(resp_data);
                            var is_success = resp_data[5];
                            if(!is_success){
                                res.type("application/json").json(200, {"result": "error", "general_error": "控制错误"});
                                return;
                            }

                            // handle resp
                            if(cmd == 'lock' || cmd == 'send_ir' || cmd == 'multi_cmd'){
                                res.type("application/json").json(200, {"result": "ok"});
                            }
                            else if(cmd == 'learn_signal'){
                                var ir_len = resp_data.readUInt32BE(6) - 8;
                                var ir = new Buffer(ir_len);
                                resp_data.copy(ir, 0, 18, resp_data.length);
                                console.log(ir);

                                var on_get_ir = function(err, row){
                                    if(err){
                                        res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                                        return;
                                    }

                                    if(row){
                                        res.type("application/json").json(200, {"result": "ok", "ir_id": row.id, 'ir_signal': util.buffToBufferStr(ir)});
                                        return;
                                    }

                                    var on_set_ir = function(err, result){
                                        if(err){
                                            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                                            return;
                                        }

                                        res.type("application/json").json(200, {"result": "ok", "ir_id": result.insertId, 'ir_signal': util.buffToBufferStr(ir)});

                                    }

                                    mysqldb.set_ir(ir, on_set_ir);
                                }

                                mysqldb.get_ir_by_ir(ir, on_get_ir);
                            }
                        }
                    }
                }

                send_msg(control_msg['device_id'], control_msg, after_control_resp);
            }

            if(cmd == 'send_ir'){
                var is_ir_id = req.body['is_ir_id']
                if(is_ir_id){
                   var ir_id = req.body["ir_id"] || "";
                   var get_ir_by_id_cb = function(err, row){
                       if(err){
                           res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                           return;
                       }

                       if(!row){
                           res.type("application/json").json(200, {"result": "error", "ir_id": "错误的ir_id"});
                           return;
                       }

                       ir_signal = util.buffToBufferStr(row.ir);
                       after_pre_process();
                   }
                   mysqldb.get_ir_by_id(ir_id, get_ir_by_id_cb); 
                }
                else{
                    after_pre_process();
                }
            }
            else{
                after_pre_process();
            }
        }

        if(!util.is_master_device(device_id)){
            var get_master_device_cb = function(err, row){
                if(err){
                    res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                    return;
                }

                do_control(new Buffer(row.device_id, 'utf8'));
            }

            var get_device_by_device_id_cb = function(err, row){
                if(err){
                    res.type("application/json").json(500, {"result": "error", "general_error": "db"});
                    return;
                }

                if(row.master_id == -1){
                    res.type("application/json").json(200, {"result": "error", "device_id": "找不到相应的master_device_id"});
                    return;
                }

                mysqldb.get_device_by_id(row.master_id, get_master_device_cb);
            }
            mysqldb.get_device_by_device_id(device_id, get_device_by_device_id_cb);
        }
        else{
            do_control(device_id);
        }
    }
   
    redis_db.get_user_auth_id(auth_id, get_user_auth_id_cb);
}
);

buffalo.post('/buffalo/upload/setting', function(req, res){
    var data = JSON.stringify(req.body);
    var auth_id = req.body['auth_id'];

    var get_user_auth_id_cb = function(err, reply){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
            return;
        }

        var user = reply;

        if(!user){
            res.type("application/json").json(500, {"result": "error", "auth_id": "auth_id is wrong"});
            return;
        }

        fs.writeFile(__dirname + "/user_data/" + user + "_setting.json", data, function(err){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "fs"});
                return;
            }

            res.type("application/json").json(200, {"result": "ok"});
        });
    }

    redis_db.get_user_auth_id(auth_id, get_user_auth_id_cb);
});

buffalo.post('/buffalo/download/setting', function(req, res){
    var auth_id = req.body['auth_id'];

    var get_user_auth_id_cb = function(err, reply){
        if(err){
            res.type("application/json").json(500, {"result": "error", "general_error": "db"});
            return;
        }

        var user = reply;

        if(!user){
            res.type("application/json").json(500, {"result": "error", "auth_id": "auth_id is wrong"});
            return;
        }

        fs.readFile(__dirname + "/user_data/" + user + "_setting.json", function(err, data){
            if(err){
                res.type("application/json").json(500, {"result": "error", "general_error": "fs"});
                return;
            }

            res.type("application/json").json(200, {"result": "ok", "setting": JSON.parse(data)});
        });
    }

    redis_db.get_user_auth_id(auth_id, get_user_auth_id_cb);
});

buffalo.listen(4000);
tmp_cleanuper.startCleanupTmpFiles();

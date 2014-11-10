var phones = [];
var session_id_count = 0;
var embed_device = require("./embed_device.js");
//var db = require("./db.js");
var db = require('./mysqldb.js');
var error_code = require("./error_code.js");
var util = require('./util.js');
var notification = require('./notification.js');
var config = require('./config.js');
var cluster = require('cluster');
var native_util = require('util');

exports.create_phone = function(c, one_step_cb) {
    var phone_constructor = function(){
        this.sock = c;
        this.one_step_cb = one_step_cb;
        this.remoteAddress = null;
        this.user = null;
        var self = this;

        var print_log = function(msg)
        {
            var name = "unknown";
            if(self.user){
                name = self.user.email;
            }

            console.log("phone[%s]; ip[%s:%s]: %s", name, self.remoteAddress, self.remotePort, msg); 
        }

        var write_data = function(buff){
            print_log(native_util.format("response[%s]: %s", (new Date()), util.formatBuffer(buff)));
            self.sock.write(buff);
        }

        var remove_phone = function()
        {
            for(var i = 0; i < phones.length; i++)
            {
                if(phones[i] == self)
                {
                    phones.splice(i, 1);
                    break;
                }
            }

            print_log(native_util.format("phone removed, current phones: %d",
                    phones.length));
        }

        var handle_protocal_error = function()
        {
            print_log("protocal error");
            remove_phone();
            self.sock.destroy();
        }

        this.handle_data = function(data, data_index){
            handle_data_internal(data, data_index);
        }

        this.handle_end = function()
        {
            remove_phone();
        }

        this.handle_error = function(e)
        {
            remove_phone();
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

            if(self.user == null && type != 0x90 && type != 0x91 && type != 0x8e && type != 0x92)
            {
                print_log("not logined, can't send msg");
                write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS,
                            error_code.ErrorTarget.NOT_SET
                            ));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
                return;
            }
            
            if(type == 0x92)
            {
                print_log("login");
                proto_login(data, start, msg, len);
            }
            else if(type == 0x90)
            {
                print_log("register");
                proto_register(data, start, msg, len);
            }
            else if(type == 0x8c)
            {
                print_log("associate");
                proto_asso(data, start, msg, len);
            }
            else if(type == 0x84)
            {
                print_log("control");
                proto_general_control(data, start, msg, len);
            }
            else if(type == 0x83)
            {
                print_log("query");
                proto_general_control(data, start, msg, len);
            }
            else if(type == 0x91)
            {
                print_log("change password");
                proto_change_password(data, start, msg, len);
            }
            else if(type == 0x93)
            {
                print_log("logout");
                proto_logout(data, start, msg, len);
            }
            else if(type == 0x8d)
            {
                print_log("del device");
                proto_del_device(data, start, msg, len);
            }
            else if(type == 0x91)
            {
                print_log("forgot password");
                proto_forgot_password(data, start, msg, len);
            }
            else if(type == 0x94)
            {
                print_log("check email");
                proto_check_email(data, start, msg, len);
            }
            else
            {
                print_log("unsupport type [0x" + type.toString(16) + "]"); 
            }
        }

        var is_master_device_id = function(device_id){
            if((device_id[0] & 0x80) != 0){
                return false;
            }

            return true;
        }

        var proto_check_email = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;
            var tmp = util.parseString(data, start, index, len);
            var email = tmp[1];

            var check_email_cb = function(err, result){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!result)
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.USED, error_code.ErrorTarget.EMAIL));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else
                {
                    write_data(util.buildGeneralOk(msg));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
            }

            db.check_email(email, check_email_cb);
        }
        
        var proto_asso = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;

            var device_id = util.getDeviceId(data, start, index, 16);
            index += 16;

            var master_device_id = null;
            if(!is_master_device_id(device_id)){
                master_device_id = util.getDeviceId(data, start, index, 16);
                index += 16;
            }

            var tmp = util.parseString(data, start, index, len);
            index = tmp[0];
            var timezone = tmp[1];

            var device = null;
            var master_device = null;

            var asso_user_device_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(device){
                    db.set_timezone(timezone, device.id);
                }

                if(master_device){
                    db.set_timezone(timezone, master_device.id);
                }

                var embed = null;
                if(is_master_device_id(device_id)){
                    embed = embed_device.find_by_device_id(device_id);
                }
                else{
                    embed = embed_device.find_by_device_id(master_device_id);
                }

                if(embed){
                    embed.end();
                }

                write_data(util.buildGeneralOk(msg));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var set_master_id_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                
                db.asso_user_device(self.user.id, device.id, asso_user_device_cb);
            }

            var asso_user_master_device_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                db.set_master_id(device.id, master_device.id, set_master_id_cb);
            }

            var get_master_user_device_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(row){
                    if(row.user_id != self.user.id){
                        write_data(util.buildErr(msg, error_code.ErrorCode.USED, error_code.ErrorTarget.DEVICE));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }
                    
                    db.set_master_id(device.id, master_device.id, set_master_id_cb);
                }
                else{
                    // asso master device
                    db.asso_user_device(self.user.id, master_device.id, asso_user_master_device_cb);
                }
            }

            var get_master_device_id_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row){
                    write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS,
                                error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                master_device = row;

                db.get_user_device(row.id, get_master_user_device_cb);
            }

            var get_user_device_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(row){
                    if(row.user_id == self.user.id)
                    {
                        write_data(util.buildGeneralOk(msg));
                    }
                    else{
                        write_data(util.buildErr(msg, error_code.ErrorCode.USED, error_code.ErrorTarget.NOT_SET));
                    }
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else{
                    if(master_device_id == null){
                        db.asso_user_device(self.user.id, device.id, asso_user_device_cb);
                    }
                    else{
                        db.get_device_by_device_id(master_device_id,
                                get_master_device_id_cb);
                    }
                }
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
                    return;
                }

                device = row;
                db.get_user_device(row.id, get_user_device_cb);
            }

            db.get_device_by_device_id(device_id,
                    get_device_by_device_id_cb);
        }

        var proto_register = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;

            var tmp = util.parseString(data, start, index, len);
            index = tmp[0];
            var email = tmp[1];

            tmp = util.parseString(data, start, index, len);
            var password = tmp[1];
            var name = "";

            var register_user_cb = function(err){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                write_data(util.buildGeneralOk(msg));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var check_email_cb = function(err, result){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!result)
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.USED,
                                error_code.ErrorTarget.EMAIL
                                ));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else
                {
                    db.register_user(name, email, password, register_user_cb);
                }
            }

            print_log("register> email " + email);

            db.check_email(email, check_email_cb);
        }

        var proto_change_password = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;

            var tmp = util.parseString(data, start, index, len);
            index = tmp[0];
            var email = tmp[1];

            tmp = util.parseString(data, start, index, len);
            index = tmp[0];
            var password = tmp[1];

            tmp = util.parseString(data, start, index, len);
            var new_password = tmp[1];

            var set_password_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                }
                else
                {
                    write_data(util.buildGeneralOk(msg));
                }

                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            db.set_password(self.user.id, new_password, set_password_cb);
        }

        var proto_logout = function(data, start, msg, len){
            self.user = null; 
            
            write_data(util.buildGeneralOk(msg));
            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        var proto_login = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;

            var tmp = util.parseString(data, start, index, len);
            index = tmp[0];
            var email = tmp[1];

            tmp = util.parseString(data, start, index, len);
            var password = tmp[1];
            var is_email = true;

            var user = null;
            var get_by_name_or_email_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row)
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS, error_code.ErrorTarget.EMAIL));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return
                }
                
                if(row.password != db.get_hashed_password(password))
                {
                    write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS, error_code.ErrorTarget.PASSWORD));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return
                }

                self.user = row;
                self.session_id = ++session_id_count;

                var on_get_all_devices = function(err, rows){
                    if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var all_devices = rows;
                    var ret_size = util.RESP_HEADER_SIZE + 1;
                    if(config.old_ip != config.new_ip){
                        ret_size += 8;
                    }
                    ret_size += 4 + all_devices.length * 7;
                    var ret = new Buffer(ret_size);
                    var ret_index = util.RESP_HEADER_SIZE;
                    if(config.old_ip == config.new_ip){
                        ret[ret_index++] = 0;
                    }
                    else{
                        ret[ret_index++] = 1;
                        util.setIp(ret, ret_index, config.old_ip, config.new_ip);
                        ret_index += 4;
                        ret.writeUInt32BE(config.port, ret_index);
                        ret_index += 4;
                    }

                    ret.writeUInt32BE(all_devices.length, ret_index);
                    ret_index += 4;
                    for(var i in all_devices){
                        var device = all_devices[i];
                        ret.writeUInt16BE(device.temperature, ret_index);
                        ret_index += 2;
                        ret[ret_index++] = device.locked;
                        // skip int
                        ret_index += 4;
                    }

                    util.setRespCommonPart(ret, msg, true);
                    write_data(ret);
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                }

                db.get_all_devices(row.id, on_get_all_devices); 
            }

            db.get_by_name_or_email(email, is_email, get_by_name_or_email_cb);
        }

        var proto_del_device = function(data, start, msg, len){
            var device_id = data.toString('ascii', start + 16, start + 16 + 12);
            var device;

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
                    return;
                }

                var del_from_user_device_cb = function(err){
                    if(err){
                        write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    write_data(util.buildGeneralOk(msg));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                }

                db.del_from_user_device(row.id, self.user.id, del_from_user_device_cb);
            }

            db.get_device_by_device_id(device_id, get_device_by_device_id_cb);
        }

        var proto_forgot_password = function(data, start, msg, len){
            var password;
            var user;
            var index = util.REQ_HEADER_SIZE;
            var tmp = util.parseString(data, start, index, len);
            var email = tmp[1];

            /*
            var send_mail_cb = function(err, mail_msg){
                if(err){
                    write_data(util.buildErr(msg, error_code.EMAIL_SEND_ERROR));
                }
                else{
                    write_data(util.buildGeneralOk(msg));
                }

                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }
            */

            var set_password_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                notification.send_mail(email, user.email, password, util.dummy); 
                write_data(util.buildGeneralOk(msg));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var get_by_name_or_email_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR,
                                error_code.ErrorTarget.NOT_SET
                                ));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row){
                    write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS,
                                error_code.ErrorTarget.EMAIL
                                ));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                user = row;

                password = db.get_random_password();
                db.set_password(user.id, password, set_password_cb);
            }

            db.get_by_name_or_email(email, true, get_by_name_or_email_cb);
        }

        var translate_control_msg = function(req, cb){
            // DEVICE_ID POS
            var index = util.REQ_HEADER_SIZE + 16;

            if(req[0] == 0xa5){
                var ctr_cmd = req.readUInt16BE(index);
                index += 2;

                index += 4;

                // CMD need special process
                if(ctr_cmd == 0x11){
                    // is IR id
                    if(req[index] == 1){
                        index += 1;

                        var ir_id = req.readUInt32BE(index);
                        var get_ir_by_id_cb = function(err, row){
                            if(err){
                                cb(true, req);
                                return;
                            }

                            var new_req = new Buffer(req.length + row.ir.length);
                            var copy_src_index = 0;
                            var copy_dst_index = 0;
                            req.copy(new_req, copy_dst_index, copy_src_index, util.REQ_HEADER_SIZE + 16);
                            copy_src_index += util.REQ_HEADER_SIZE + 16;
                            copy_dst_index += util.REQ_HEADER_SIZE + 16;
                            // short + int
                            req.copy(new_req, copy_dst_index, copy_dst_index, copy_src_index + 6);
                            new_req.writeUInt32BE(5 + row.ir.length, copy_dst_index + 2);
                            copy_src_index += 6;
                            copy_dst_index += 6;
                            // not IR id
                            new_req[copy_dst_index] = 0;
                            copy_dst_index++;
                            new_req.writeUInt32BE(row.ir.length, copy_dst_index);
                            copy_dst_index += 4;
                            row.ir.copy(new_req, copy_dst_index);
                            
                            new_req.writeUInt32BE(new_req.length - util.REQ_HEADER_SIZE, 5);

                            cb(false, new_req);
                        }

                        db.get_ir_by_id(ir_id, get_ir_by_id_cb);
                        return;
                    }
                }
            }

            process.nextTick(function(){
                cb(false, req);
            });
        }

        var translate_control_resp_msg = function(req, resp, cb){
            var resp_idx = 5;
            var is_success = resp[resp_idx];
            resp_idx++;
            var type = req[0];
            var ctr_cmd = req.readUInt32BE(util.REQ_HEADER_SIZE + 16);

            if((type == 0xa5) && (ctr_cmd == 0x10) && is_success){
                var resp_len = resp.readUInt32BE(resp_idx);
                resp_idx += 5;
                var ir = new Buffer(resp_len - 1);
                resp.copy(ir, 0, resp_idx, ir.length);

                var on_get_ir = function(err, row){
                    var msg = {};
                    msg["type"] = resp[0];
                    msg["packet_id"] = resp.readUInt32BE(1);

                    if(err){
                        cb(buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR,
                                    error_code.ErrorTarget.NOT_SET
                                    ));
                        return;
                    }

                    var construct_new_resp_and_cb = function(row_id){
                        resp.writeUInt32BE(row_id, util.RESP_HEADER_SIZE);
                        cb(resp);
                    }

                    if(row){
                        construct_new_resp_and_cb(row.id);
                    }
                    else{
                        var on_set_ir = function(err, result){
                            if(err){
                                cb(buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR,
                                            error_code.ErrorTarget.NOT_SET
                                            ));
                                return;
                            }

                            construct_new_resp_and_cb(result.insertId);
                        }

                        db.set_ir(ir, on_set_ir);
                    }
                }

                db.get_ir_by_ir(ir, on_get_ir);
            }
            else{
                process.nextTick(function(){
                    cb(resp);
                });
            }
        }
        
        var proto_general_control = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;
            var device_id = util.getDeviceId(data, start, index, 16);
            var device_req_buff = new Buffer(len);

            var do_general_control = function(device_id){
                var embed = embed_device.find_by_device_id(device_id);
                if(embed == null)
                {
                    console.log('can not find device');
                    write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS,
                                error_code.ErrorTarget.NOT_SET
                                ));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                var get_all_devices_cb = function(err, rows){
                    if(err){
                        write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR,
                                    error_code.ErrorTarget.NOT_SET
                                    ));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var found = false;
                    for(var i = 0; i < rows.length; i++){
                        if(rows[i].id == embed.device.id){
                            found = true;
                            break;
                        } 
                    }

                    if(!found){
                        write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS,
                                    error_code.ErrorTarget.NOT_SET
                                    ));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var phone_device_cmd_map = {
                        0x84: 0xa5,
                        0x83: 0xa6
                    }

                    var on_translate_crm = function(buff){
                        write_data(buff);
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    }

                    var on_proto_general_control = function(buff) {
                        buff[0] = data[start];
                        buff.writeUInt32BE(data.readUInt32BE(start + 1), 1);

                        translate_control_resp_msg(device_req_buff, buff, on_translate_crm);
                    }

                    data.copy(device_req_buff, 0, start, start + len);
                    device_req_buff[0] = phone_device_cmd_map[data[start]];

                    var translate_control_msg_cb = function(err, req){
                        if(err){
                            write_data(util.buildErr(msg, error_code.ErrorCode.NOT_EXISTS,
                                        error_code.ErrorTarget.NOT_SET
                                        ));
                            self.one_step_cb(util.getNextMsgPos(start, len) - start);
                            return;
                        }

                        embed.general_control(req[0], req, on_proto_general_control);
                    }

                    translate_control_msg(device_req_buff, translate_control_msg_cb);
                }

                db.get_all_devices(self.user.id, get_all_devices_cb);
            }

            if(!util.is_master_device(device_id)){
                var get_master_device_cb = function(err, row){
                    if(err){
                        write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR,
                                    error_code.ErrorTarget.NOT_SET
                                    ));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var master_device_id = new Buffer(row.device_id, 'utf8');
                    do_general_control(master_device_id);
                }

                var get_device_by_device_id_cb = function(err, row){
                    if(err){
                        write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR,
                                    error_code.ErrorTarget.NOT_SET
                                    ));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    // get device ok
                    if(row.master_id == -1){
                        write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR,
                                    error_code.ErrorTarget.NOT_SET
                                    ));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    db.get_device_by_id(row.master_id, get_master_device_cb);

                }

                db.get_device_by_device_id(device_id, get_device_by_device_id_cb);
            }
            else{
                do_general_control(device_id);
            }
        }

        var proto_heartbeat = function(data, start, msg, len){
            write_data(util.buildGeneralOk(msg));
            self.one_step_cb(util.getNextMsgPos(start, len) - start);
        }

        return this;
    }

    var phone_instance = new phone_constructor();
    return phone_instance;
}

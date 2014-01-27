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
                name = self.user.name;
            }

            console.log("worker[%s]; phone[%s]; ip[%s:%s]: %s", cluster.worker.id, name, self.remoteAddress, self.remotePort, msg); 
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

            print_log(native_util.format("request[%s]: %s", (new Date()), util.formatBuffer(data, util.REQ_HEADER_SIZE + len)));

            var msg = {};
            var type = data[start]; 
            msg["type"] = type;
            msg["packet_id"] = data.readUInt32BE(start + 1);

            if(self.user == null && type != 0x10 && type != 0x11 && type != 0x12
               && type != 0x1e & type != 0x21 & type != 0x22)
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
                proto_login(data, start, msg, len);
                print_log("login");
            }
            else if(type == 0x90)
            {
                proto_register(data, start, msg, len);
                print_log("register");
            }
            else if(type == 0x8c)
            {
                proto_asso(data, start, msg, len);
                print_log("associate");
            }
            else if(type == 0x84)
            {
                proto_general_control(data, start, msg, len);
                print_log("control");
            }
            else if(type == 0x83)
            {
                proto_general_control(data, start, msg, len);
                print_log("query");
            }
            else if(type == 0x91)
            {
                proto_change_password(data, start, msg, len);
                print_log("change password");
            }
            else if(type == 0x93)
            {
                proto_logout(data, start, msg, len);
                print_log("logout");
            }
            else if(type == 0x8d)
            {
                proto_del_device(data, start, msg, len);
                print_log("del device");
            }
            else if(type == 0x91)
            {
                proto_forgot_password(data, start, msg, len);
                print_log("forgot password");
            }
            else if(type == 0x94)
            {
                proto_check_email(data, start, msg, len);
                print_log("check email");
            }
            else
            {
                print_log("unsupport type [0x" + type.toString(16) + "]"); 
            }
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
            if((device_id[0] & 0x80) != 0){
                master_device_id = util.getDeviceId(data, start, index, 16);
                index += 16;
            }

            var tmp = util.parseString(data, start, index, len);
            index = tmp[0];
            var timezone = tmp[1];

            var device;
            var master_device;

            var user = null;

            var asso_user_device_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                db.set_ssid(device.id, ssid);
                write_data(util.buildGeneralOk(msg));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var set_master_id_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                
                db.asso_user_device(user.id, device.id, asso_user_device_cb);
            }

            var asso_user_master_device_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.ErrorCode.INTERNAL_ERROR, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(device.master_id == -1){
                    db.set_master_id(device.id, master_device.id, set_master_id_cb);
                }
                else if(device.master_id != master_device.id){
                    // device already has a master
                    write_data(util.buildErr(msg, error_code.ErrorCode.USED, error_code.ErrorTarget.DEVICE));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else{
                    //
                    db.asso_user_device(user.id, device.id, asso_user_device_cb);
                }
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
                    
                    if(device.master_id == -1){
                        db.set_master_id(device.id, master_device.id, set_master_id_cb);
                    }
                    else if(device.master_id != master_device.id){
                        // device already has a master
                        write_data(util.buildErr(msg, error_code.ErrorCode.USED, error_code.ErrorTarget.DEVICE));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }
                    else{
                        //
                        db.asso_user_device(user.id, device.id, asso_user_device_cb);
                    }
                }
                else{
                    // asso master device
                    db.asso_user_device(user.id, master_device.id, asso_user_master_device_cb);
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
                    write_data(util.buildErr(msg, error_code.ErrorCode.USED, error_code.ErrorTarget.NOT_SET));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else{
                    if(master_device_id == null){
                        db.asso_user_device(user.id, device.id, asso_user_device_cb);
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
                db.set_timezone(timezone, row.id);
                var embed = embed_device.find_by_device_id(row.device_id);
                if(embed){
                    // let device reconnect
                    embed.end();
                }
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

                user = row;
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

                    util.setCommonPart(ret, msg, true);
                    write_data(ret);
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                }

                db.get_all_devices(row.id, on_get_all_devices); 
            }

            db.get_by_name_or_email(name_or_email, is_email, get_by_name_or_email_cb);
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
        
        var proto_general_control = function(data, start, msg, len){
            var index = util.REQ_HEADER_SIZE;
            var device_id = util.getDeviceId(data, start, index, 16);

            var embed = embed_device.find_by_device_id(device_id);
            if(embed == null)
            {
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

                var device_phone_cmd_map = {
                    0xa5: 0x84,
                    0xa6: 0x83
                }

                var on_proto_general_control = function(buff) {
                    buff[0] = device_phone_cmd_map[buff[0]];
                    write_data(buff);
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                }

                var device_req_buff = new Buffer(len);
                data.copy(device_req_buff, 0, start, start + len);
                device_req_buff[0] = phone_device_cmd_map[data[start]];
                embed.general_control(device_req_buff[0], device_req_buff, on_proto_general_control);
            }

            db.get_all_devices(self.user.id, get_all_devices_cb);
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

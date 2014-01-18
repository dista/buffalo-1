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

            if(self.user == null && type != 0x10 && type != 0x11 && type != 0x12
               && type != 0x1e & type != 0x21 & type != 0x22)
            {
                print_log("not logined, can't send msg");
                write_data(util.buildErr(msg, error_code.NOT_LOGINED));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
                return;
            }
            
            if(type == 0x10)
            {
                proto_heartbeat(data, start, msg, len);
                print_log("heartbeat");
            }
            else if(type == 0x11)
            {
                proto_login(data, start, msg, len);
                print_log("login");
            }
            else if(type == 0x12)
            {
                proto_register(data, start, msg, len);
                print_log("register");
            }
            else if(type == 0x14)
            {
                proto_asso(data, start, msg, len);
                print_log("associate");
            }
            else if(type == 0x15)
            {
                proto_general_control(data, start, msg, len);
                print_log("control");
            }
            else if(type == 0x16)
            {
                proto_general_control(data, start, msg, len);
                print_log("query");
            }
            else if(type == 0x17)
            {
                proto_query_all(data, start, msg, len);
                print_log("query all");
            }
            else if(type == 0x18)
            {
                proto_general_control(data, start, msg, len);
                print_log("upload time"); 
            }
            else if(type == 0x19)
            {
                proto_general_control(data, start, msg, len);
                print_log("lock");
            }
            else if(type == 0x1a)
            {
                proto_change_password(data, start, msg, len);
                print_log("change password");
            }
            else if(type == 0x1b)
            {
                proto_logout(data, start, msg, len);
                print_log("logout");
            }
            else if(type == 0x1c)
            {
                proto_del_device(data, start, msg, len);
                print_log("del device");
            }
            else if(type == 0x1d)
            {
                proto_del_time(data, start, msg, len);
                print_log("del time"); 
            }
            else if(type == 0x1e)
            {
                proto_forgot_password(data, start, msg, len);
                print_log("forgot password");
            }
            else if(type == 0x20)
            {
                proto_general_control(data, start, msg, len);
                print_log("delete delay");
            }
            else if(type == 0x21)
            {
                proto_check_email(data, start, msg, len);
                print_log("check email");
            }
            else if(type == 0x22)
            {
                proto_check_name(data, start, msg, len);
                print_log("check name");
            }
            else
            {
                print_log("unsupport type [0x" + type.toString(16) + "]"); 
            }
        }

        var proto_check_email = function(data, start, msg, len){
            var email = data.toString('ascii', start + 8, start + 8 + len);

            var check_email_cb = function(err, result){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!result)
                {
                    write_data(util.buildErr(msg, error_code.ID_USED));
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
        
        var proto_check_name = function(data, start, msg, len){
            var name = data.toString('ascii', start + 8, start + 8 + len);

            var check_name_cb = function(err, result){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                // check failed
                if(!result)
                {
                    write_data(util.buildErr(msg, error_code.ID_USED));
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

            db.check_name(name, check_name_cb);
        }

        var proto_asso = function(data, start, msg, len){
            var name_pos = [];
            var ssid_pos = [];
            var timezone_pos = [];
            var device_id;

            name_pos[0] = start + 16;

            for(var i = start + 16; i < util.getNextMsgPos(start, len) - 2;)
            {
                if(data[i] == 0x27)
                {
                    if(name_pos.length < 2)
                    {
                        name_pos[1] = i;
                        ssid_pos[0] = i + 1 + 12;
                        device_id = data.toString('ascii', i+1, i+1+12);
                        i += 1 + 12;
                        continue;
                    }
                    else if(ssid_pos.length == 0){
                        ssid_pos[0] = i + 1;

                        break;
                    }
                    else if(ssid_pos.length == 1)
                    {
                        ssid_pos[1] = i;
                        timezone_pos[0] = i+1;
                    }
                    else{
                        timezone_pos[1] = i;
                    }
                }

                i++;
            }

            if(name_pos.length != 2 || ssid_pos.length != 2 || timezone_pos.length != 2)
            {
                handle_protocal_error();
                return;
            }

            var name = data.toString('ascii', name_pos[0], name_pos[1]);
            var ssid = data.toString('ascii', ssid_pos[0], ssid_pos[1]);
            var timezone = data.toString('ascii', timezone_pos[0], timezone_pos[1]);
            var device;

            var user = null;

            var asso_user_device_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                db.set_ssid(device.id, ssid);
                write_data(util.buildGeneralOk(msg));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var get_user_device_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(row){
                    write_data(util.buildErr(msg, error_code.DEVICE_USED));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else{
                    db.asso_user_device(user.id, device.id, asso_user_device_cb);
                }
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

            var get_user_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row)
                {
                    write_data(util.buildErr(msg, error_code.NO_USER));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                user = row;
                db.get_device_by_device_id(device_id,
                        get_device_by_device_id_cb);
            }
            db.get_user_by_name(name, get_user_cb);
        }

        var proto_register = function(data, start, msg, len){
            var str = data.toString('ascii', start + 8, start + 8 + len - 1);
            var items = str.split("|");
            var name = items[0]; var email = items[1]; var password = items[2]; 

            // name, email, password
            if(items.length != 3)
            {
                handle_protocal_error();
                return;
            }

            var register_user_cb = function(err){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                write_data(util.buildGeneralOk(msg));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var check_email_cb = function(err, result){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!result)
                {
                    write_data(util.buildErr(msg, error_code.EMAIL_USED));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else
                {
                    db.register_user(name, email, password, register_user_cb);
                }
            }

            var check_name_cb = function(err, result){
                if(err)
                {
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                // check failed
                if(!result)
                {
                    write_data(util.buildErr(msg, error_code.USER_EXISTS));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }
                else
                {
                    db.check_email(email, check_email_cb);
                }
            }

            db.check_name(name, check_name_cb);
        }

        var proto_change_password = function(data, start, msg, len){
            // -1, not include 0x27
            var new_password = data.toString('ascii', start + 16, start + 8 + len -1);
            var set_password_cb = function(err){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
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
            var str = data.toString('ascii', start + 8, start + 8 + len - 1);
            var items = str.split("|");
            var name_or_email = items[0]; var password = items[1]; 
            var is_email = false;

            if(name_or_email.indexOf("@") != -1){
                is_email = true;
            }

            var user = null;
            var get_by_name_or_email_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row)
                {
                    var reason = error_code.NO_USER;
                    if(is_email){
                        reason = error_code.EMAIL_NOT_FOUND;
                    } 

                    write_data(util.buildErr(msg, reason));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return
                }
                
                if(row.password != db.get_hashed_password(password))
                {
                    write_data(util.buildErr(msg, error_code.PASSWD_ERR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return
                }

                user = row;
                self.session_id = ++session_id_count;

                var all_devices;
                var send_resp = false;
                var on_get_all_devices = function(err, rows){
                    if(err){
                        write_data(util.buildErr(msg, error_code.DB_ERROR));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var all_devices = rows;
                    var done_count = 0;

                    var on_get_time_by_device_id = function(err, rows, ctx){
                        if(send_resp){return;}

                        if(err){
                            send_resp = true;
                            write_data(util.buildErr(msg, error_code.DB_ERROR));
                            self.one_step_cb(util.getNextMsgPos(start, len) - start);
                            return;
                        }

                        if(ctx != null)
                        {
                            done_count++;
                            ctx["time"] = rows;
                        }

                        // special case: ctx == null
                        if(done_count == all_devices.length || ctx == null){
                            var buff_count = 9 + 5 + 1;
                            for(var i = 0; i < all_devices.length; i++){
                                var device = all_devices[i];
                                buff_count+= 12 + device.ssid.length + 1 + 1 + 1 + 1 + 2 + 1 + 1; 
                                buff_count+= 1; // time count

                                var time = device["time"];
                                for(var j = 0; j < time.length; j++)
                                {
                                    buff_count += 6;
                                }
                            }

                            var buff = new Buffer(10 + buff_count);
                            util.setCommonPart(buff, msg);
                            buff[8] = 0x01;
                            for(var i = 0; i < 8; i++){
                                buff[9+i] = 65 // all 'A'
                            }
                            //buff.writeUInt32BE(self.session_id, 13);
                            buff[17] = all_devices.length;

                            var index = 18;
                            for(var i = 0; i < all_devices.length; i++){
                                var device = all_devices[i];
                                var times = device["time"];
                                (new Buffer(device.device_id)).copy(buff, index);
                                index += 12;
                                (new Buffer(device.ssid)).copy(buff, index);
                                index += device.ssid.length;
                                buff[index++] = 0x27;
                                buff[index++] = device.state;
                                buff[index++] = device.temperature;
                                buff[index++] = device.humidity;
                                buff.writeUInt16BE(device.battery, index); index +=2;
                                buff[index++] = device.locked;
                                buff[index++] = device.online;

                                buff[index++] = times.length;
                                for(var j = 0; j < times.length; j++)
                                {
                                    var time = times[j];
                                    buff[index++] = time.sid;
                                    buff.writeUInt16BE(time.start_time, index); index += 2;
                                    buff.writeUInt16BE(time.end_time, index); index += 2;
                                    buff[index++] = time.repeatx;
                                } 
                            }

                            util.setIp(buff, index, config.old_ip, config.new_ip);
                            util.setChecksum(buff);
                            write_data(buff);
    
                            self.user = user; 
                            db.set_login_info(user.id);
                            phones.push(self);
                            self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        }
                    }

                    if(all_devices.length > 0)
                    {
                        for(var i = 0; i < all_devices.length; i++)
                        {
                            var row = rows[i];
                            db.get_time_by_device_id(row.id, on_get_time_by_device_id, row);
                        }
                    }
                    else{
                        on_get_time_by_device_id(null, null, null);
                        /*
                        var buff = new Buffer(10 + 15);
                        util.setCommonPart(buff, msg);
                        buff[8] = 0x01;
                        buff.writeUInt32BE(0, 9);
                        buff.writeUInt32BE(self.session_id, 13);
                        buff[17] = all_devices.length;
                        util.setIp(buff, 18, config.old_ip, config.new_ip);
                        util.setChecksum(buff);
                        write_data(buff);

                        phones.push(self);
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        */
                    }
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
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row){
                    write_data(util.buildErr(msg, error_code.DEVICE_ID_NOT_FOUND));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                var del_from_time_cb = function(err){
                    if(err){
                        write_data(util.buildErr(msg, error_code.DB_ERROR));
                    }
                    else{

                        write_data(util.buildGeneralOk(msg));
                    }
                    
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                }

                var get_time_by_device_id_cb = function(err, rows){
                    if(err){
                        write_data(util.buildErr(msg, error_code.DB_ERROR));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var embed = embed_device.find_by_device_id(device_id);
                    if(embed){
                        /*
                        for(var i = 0; i < rows.length; i++){
                            embed.del_time(rows[i].sid, util.dummy);
                        }
                        */

                        embed.del_time(100, util.dummy);

                        //embed.lock(0, util.dummy);
                        //embed.control(0, 0, util.dummy);
                    }

                    db.del_from_time(row.id, del_from_time_cb);
                }

                var del_from_user_device_cb = function(err){
                    if(err){
                        write_data(util.buildErr(msg, error_code.DB_ERROR));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    device = row;
                    db.get_time_by_device_id(row.id, get_time_by_device_id_cb);
                }

                db.del_from_user_device(row.id, self.user.id, del_from_user_device_cb);
            }

            db.get_device_by_device_id(device_id, get_device_by_device_id_cb);
        }

        var proto_del_time = function(data, start, msg, len){
            var device_id = data.toString('ascii', start + 16, start + 16 + 12);
            var time_id = data[start + 16 + 12];

            var embed = embed_device.find_by_device_id(device_id);
            if(embed == null || embed.device == null)
            {
                write_data(util.buildErr(msg, error_code.DEVICE_OFFLINE));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
                return;
            }
            
            var get_all_devices_cb = function(err, rows)
            {
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
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
                    write_data(util.buildErr(msg, error_code.DEVICE_ID_NOT_FOUND));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                var on_del_time = function(result, code){
                    if(result == 0){
                        write_data(util.buildErr(msg, code));
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                        return;
                    }

                    var del_time_cb = function(err){
                        if(err){
                            write_data(util.buildErr(msg, error_code.DB_ERROR));
                        }
                        else{
                            write_data(util.buildGeneralOk(msg));
                        }
                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    }

                    db.del_time(time_id, embed.device.id, del_time_cb);
                }

                embed.del_time(time_id, on_del_time);  
            }

            db.get_all_devices(self.user.id, get_all_devices_cb);
        }

        var proto_forgot_password = function(data, start, msg, len){
            var email = data.toString('ascii', start + 8, start + 8 + len);
            var password;
            var user;

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
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                notification.send_mail(email, user.name, password, util.dummy); 
                write_data(util.buildGeneralOk(msg));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            var get_by_name_or_email_cb = function(err, row){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                if(!row){
                    write_data(util.buildErr(msg, error_code.EMAIL_NOT_FOUND));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                user = row;

                password = db.get_random_password();
                db.set_password(user.id, password, set_password_cb);
            }

            db.get_by_name_or_email(email, true, get_by_name_or_email_cb);
        }
        
        var proto_query_all = function(data, start, msg, len){
            var get_all_devices_cb = function(err, rows){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                var payload_len = 2 + 1;
                for(var i = 0; i < rows.length; i++){
                    payload_len += 12 + 7 + rows[i].ssid.length + 1;
                }

                var buff = new Buffer(10 + payload_len);
                util.setCommonPart(buff, msg);
                buff[8] = 0x01;
                var index = 8 + 2 + 1;
                buff[index - 1] = rows.length;

                for(var i = 0; i < rows.length; i++)
                {
                    var row = rows[i];
                    var device_buff = new Buffer(12 + 7 + row.ssid.length + 1);
                    device_buff[device_buff.length - 1] = 0x27;
                    (new Buffer(row.device_id)).copy(device_buff, 0);
                    device_buff[12] = row.state;
                    device_buff[13] = row.temperature;
                    device_buff[14] = row.humidity;
                    device_buff.writeUInt16BE(row.battery, 15);
                    device_buff[17] = row.locked;
                    device_buff[18] = row.online;
                    (new Buffer(row.ssid)).copy(device_buff, 19);
                    device_buff.copy(buff, index);
                    index += device_buff.length;
                }
                util.setChecksum(buff);
                write_data(buff);
                
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
            }

            db.get_all_devices(self.user.id, get_all_devices_cb);
        }

        var proto_general_control = function(data, start, msg, len){
            var device_id = data.toString('ascii', start + 16, start + 16 + 12);

            var embed = embed_device.find_by_device_id(device_id);
            if(embed == null)
            {
                write_data(util.buildErr(msg, error_code.DEVICE_OFFLINE));
                self.one_step_cb(util.getNextMsgPos(start, len) - start);
                return;
            }
            var get_all_devices_cb = function(err, rows){
                if(err){
                    write_data(util.buildErr(msg, error_code.DB_ERROR));
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
                    write_data(util.buildErr(msg, error_code.DEVICE_ID_NOT_FOUND));
                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    return;
                }

                var on_proto_general_control = function(result, code) {
                    if(result == 1)
                    {
                        if(msg["type"] == 0x15){
                            if(data.readUInt32BE(start + 29) == 0){
                                db.set_state(embed.device.id, data[start+28], util.dummy);
                            }
                        }
                        else if(msg["type"] == 0x19){
                            db.set_locked(embed.device.id, data[start+28]);
                        }

                        write_data(util.buildGeneralOk(msg));
                    }
                    else{
                        write_data(util.buildErr(msg, code));
                    }

                    self.one_step_cb(util.getNextMsgPos(start, len) - start);
                }
            
                if(msg["type"] == 0x15)
                { 
                    embed.control(data[start+28], data.readUInt32BE(start + 29), on_proto_general_control);
                }
                else if(msg["type"] == 0x16)
                {
                    var on_query_cb = function(result, code, state, temperature, humidity, battery, locked){
                        if(result != 1){
                            write_data(util.buildErr(msg, code));
                        }
                        else
                        {
                            db.set_device_status(embed.device.device_id, state, temperature, humidity, battery, locked, util.dummy);

                            var buff = new Buffer(10 + 8);
                            util.setCommonPart(buff, msg);
                            buff[8] = 0x01;
                            buff[10] = state;
                            buff[11] = temperature;
                            buff[12] = humidity;
                            buff.writeUInt16BE(battery, 13);
                            buff[15] = locked;
                            util.setChecksum(buff);
                            write_data(buff);
                        }

                        self.one_step_cb(util.getNextMsgPos(start, len) - start);
                    }

                    embed.query(on_query_cb);
                }
                else if(msg["type"] == 0x18)
                {
                    var count = data[start + 28];
                    var done_count = 0;
                    var resp_send = false;
                    var on_add_or_update_time = function(err){
                        if(resp_send){
                            return;
                        }

                        if(err){
                            resp_send = true;
                            write_data(util.buildErr(msg, error_code.DB_ERROR));
                            self.one_step_cb(util.getNextMsgPos(start, len) - start);
                            return;
                        }

                        done_count++;

                        if(done_count == count)
                        {
                            write_data(util.buildGeneralOk(msg));
                            self.one_step_cb(util.getNextMsgPos(start, len) - start);
                            return;
                        }
                    }

                    var on_get_by_sid_cb = function(err, row, ctx){
                        if(resp_send){
                            return;
                        }

                        if(err){
                            resp_send = true;
                            write_data(util.buildErr(msg, error_code.DB_ERROR));
                            self.one_step_cb(util.getNextMsgPos(start, len) - start);
                            return;
                        }
                        
                        var is_update = false;
                        if(row){
                            is_update = true;
                        }    

                        db.add_or_update_time(is_update, 
                                              embed.device.id,
                                              ctx["sid"],
                                              ctx["start_time"],
                                              ctx["end_time"],
                                              ctx["repeatx"],
                                              on_add_or_update_time);
                    }

                    var on_upload_time = function(result, code){
                        if(result != 1){
                            write_data(util.buildErr(msg, code));
                            self.one_step_cb(util.getNextMsgPos(start, len) - start);
                            return;
                        }

                        var index = start + 29;
                        for(var i = 0; i < count; i++){
                            var db_data = {};
                            db_data["sid"] = data[index];
                            db_data["start_time"] = data.readUInt16BE(index+1);
                            db_data["end_time"] = data.readUInt16BE(index + 3);
                            db_data["repeatx"] = data[index + 5];

                            db.get_by_sid(db_data["sid"], embed.device.id, on_get_by_sid_cb, db_data);
                        }
                    }
                    var request_buff = new Buffer(len - 20);
                    data.copy(request_buff, 0, start + 28, start + 28 + request_buff.length);
                    embed.upload_time(request_buff, on_upload_time);
                }
                else if(msg["type"] == 0x19)
                {
                    embed.lock(data[start+28], on_proto_general_control);
                }
                else if(msg["type"] == 0x20)
                {
                    embed.del_delay(on_proto_general_control);
                }
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

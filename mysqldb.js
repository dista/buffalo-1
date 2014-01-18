var crypto = require("crypto");
var util = require("./util.js");
var mysql = require("mysql");

var db;
var dbname = "buffalo";
var use_pool = true;
var db_config = {
    host: "localhost",
    user: "buffalo",
    password: "buffalo",
    database: dbname
    }

var die = function(msg, err){
    console.log(msg + ": " + err);
    process.exit(1);
}

function connect_with_reconnect_enable(){
    db = mysql.createConnection(db_config);

    db.connect(function(err){
        if(err){
            console.log("error when connect to db: ", err);
            setTimeout(handle_disconnect, 2000);
            return;
        }

        /*
        db.query('use ' + dbname, function(){
            for(var i = 0; i <= 5000; i++){
                db.query('INSERT INTO device (device_id, ssid) VALUES (?, ?)', ["RELEASE1" + util.formatNumber(i, 4), util.formatNumber(i, 4)]);
                console.log(i);
            }
        });
        */

        db.query("show databases", function(err, rows){
            var has_db = false;
            for(var i = 0; i < rows.length; i++){
                if(rows[i].Database == dbname){
                    has_db = true;
                    break;
                }
            }

            if(!has_db){
                db.query('CREATE DATABASE IF NOT EXISTS ' + dbname, function(){
                db.query('use ' + dbname, function(){
                db.query('CREATE TABLE IF NOT EXISTS user (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(32) UNIQUE, email VARCHAR(100) UNIQUE, password VARCHAR(64), created_time DATETIME, last_login DATETIME, login_times INT(11) DEFAULT 0)', function(){
                db.query('CREATE INDEX name_index ON user(name)', function(){
                db.query('CREATE INDEX email_index ON user(email)', function(){
                db.query('CREATE INDEX name_pass_index ON user(name, password)', function(){
                db.query('CREATE INDEX email_pass_index ON user(email, password)', function(){
                db.query('CREATE TABLE device (id INT PRIMARY KEY AUTO_INCREMENT, device_id VARCHAR(16) UNIQUE NOT NULL, ssid VARCHAR(32), mac VARCHAR(32), state TINYINT DEFAULT 0, temperature TINYINT DEFAULT 0,' +
                       'humidity TINYINT DEFAULT 0, battery SMALLINT DEFAULT 0, locked TINYINT DEFAULT 0, online TINYINT DEFAULT 0, last_login DATETIME, login_times INT DEFAULT 0, timezone VARCHAR(32))', function(){
                db.query('CREATE INDEX device_id_index ON device(device_id)', function(){
                db.query('CREATE TABLE user_device(user_id INT, device_id INT)', function(){
                db.query('CREATE INDEX user_id_index on user_device(user_id)', function(){
                db.query('CREATE UNIQUE INDEX user_device_index on user_device(user_id, device_id)', function(){
                db.query('CREATE TABLE IF NOT EXISTS time (sid TINYINT, start_time INT, end_time INT, repeatx TINYINT, device_id INT,'+
                       ' FOREIGN KEY(device_id) REFERENCES device(id))', function(){
                db.query('CREATE UNIQUE INDEX sid_index ON time(sid, device_id)', function(){
                // last
                });
                });
                });
                });
                });
                });
                });
                });
                });
                });
                });
                });
                });
                });
            }
        });
    });

    db.on('error', function(err){
        console.log('db error', err);

        if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
            handle_disconnect();                         // lost due to either server restart, or a
        } else {                                      // connnection idle timeout (the wait_timeout
            throw err;                                  // server variable configures this)
        }
    });
}

if(!use_pool){
    connect_with_reconnect_enable();
}
else{
    db = mysql.createPool(db_config);
}

var query_wrapper = function(sql, binds, cb){
    if(typeof(binds) == 'function'){
        cb = binds;
        binds = undefined;
    }

    cb = cb || util.dummy;

    if(!use_pool){
        db.query(sql, binds, cb);
    }
    else{
        db.getConnection(function(err, connection){
            if(err){
                die("pool get connection", err);
            }

            connection.query(sql, binds, function(inner_err, rows){
                connection.release();
                cb(inner_err, rows);
            })
        })
    }
}

exports.register_user = function(name, email, password, cb)
{
    var sha1 = crypto.createHash('sha1');
    sha1.update(password);
    var hashed_pass = sha1.digest('hex');

    query_wrapper("INSERT INTO user (name, email, password, created_time, last_login) VALUES (?, ?, ?, ?, ?)", [name, email, hashed_pass, new Date(), new Date()], cb);
}

var get_hashed_password = function(password)
{
    var sha1 = crypto.createHash('sha1');
    sha1.update(password);
    var hashed_pass = sha1.digest('hex');

    return hashed_pass;
}

exports.get_hashed_password = get_hashed_password;

/*
 * cb(err, result)
 *
 */
exports.check_name = function(name, cb)
{
    query_wrapper("SELECT id FROM user WHERE name=?", [name], function(err, rows){
        if(err){
            cb(err);
        }
        else{
            if(rows.length > 0){
                cb(null, false);
            }
            else{
                cb(null, true);
            }
        }
    });
}

/*
 * cb(err, result)
 *
 */
exports.check_email = function(email, cb)
{
    query_wrapper("SELECT id FROM user WHERE email=?", [email], function(err, rows){
        if(err){
            cb(err);
        }
        else{
            if(rows.length > 0){
                cb(null, false);
            }
            else{
                cb(null, true);
            }
        }
    });
}

exports.get_by_name_or_email = function(name_or_email, is_email, cb)
{
    var sql;

    if(is_email){
        sql = "SELECT * FROM user WHERE email=?";
    }
    else{
        sql = "SELECT * FROM user WHERE name=?";
    }

    query_wrapper(sql, [name_or_email], function(err, rows){
        if(!err && rows.length > 0){
            cb(err, rows[0]);
        }
        else{
            cb(err, null);
        }
    });
}

exports.set_login_info = function(id){
    query_wrapper("UPDATE user set last_login=?, login_times=(login_times+1) WHERE id=?",
            [new Date(),id]);
}

exports.get_user_by_name = function(name, cb)
{
    query_wrapper("SELECT * FROM user WHERE name=?", [name], function(err, rows){
        if(!err && rows.length > 0){
            cb(err, rows[0]);
        }
        else{
            cb(err, null);
        }
    });
}

exports.get_device_by_device_id = function(device_id, cb){
    query_wrapper("SELECT * FROM device WHERE device_id=?", [device_id], function(err, rows){
        if(!err && rows.length > 0){
            cb(err, rows[0]);
        }
        else{
            cb(err, null);
        }
    });
}

exports.set_device_login = function(id, mac, cb){
    query_wrapper("UPDATE device set mac=?, last_login=?, login_times=(login_times+1), online=1 WHERE id=?", [mac, (new Date()), id], cb);
}

exports.set_state = function(id, state, cb){
    query_wrapper("UPDATE device set state=? WHERE id=?",
            [state,
            id],
            cb);
}

exports.set_device_status = function(device_id, state, temperature, humidity, battery, locked, cb)
{
    query_wrapper("UPDATE device set state=?, temperature=?, humidity=?, battery=?, locked=? WHERE device_id=?",
            [state,
            temperature,
            humidity,
            battery,
            locked,
            device_id],
            cb);
} 

/*
 * cb(err, result)
 *
 */
exports.get_device_by_device_id_and_ssid = function(device_id, ssid, cb)
{
    query_wrapper("SELECT * FROM device WHERE device_id=? AND ssid=?", [device_id, ssid],
            function(err, rows){
                if(!err && rows.length > 0){
                    cb(err, rows[0]);
                }
                else{
                    cb(err, null);
                }
            }
            );
}

exports.asso_user_device = function(user_id, device_id, cb)
{
    query_wrapper("INSERT INTO user_device (user_id, device_id) VALUES (?, ?)", [user_id, device_id], cb);
} 

exports.set_password = function(id, pass, cb){
    query_wrapper("UPDATE user SET password=? WHERE id=?", [get_hashed_password(pass), id], cb);
}

exports.del_time = function(sid, device_id, cb){
    query_wrapper("DELETE FROM time WHERE sid=? and device_id=?", [sid, device_id], cb);
}

exports.get_random_password = function(){
    return crypto.randomBytes(3).toString('hex');
}

exports.del_from_user_device = function(device_id, user_id, cb){
    query_wrapper("DELETE FROM user_device WHERE device_id=? AND user_id=?", [device_id, user_id], cb);
}

exports.del_from_time = function(device_id, cb){
    query_wrapper("DELETE FROM time WHERE device_id=?", [device_id], cb);
}

exports.get_all_devices = function(user_id, cb){
    query_wrapper("SELECT device.* FROM device, user_device, user WHERE user.id=? AND user.id=user_device.user_id AND device.id=user_device.device_id",
            [user_id], cb
            )
}

exports.get_by_sid = function(sid, device_id, cb, ctx){
    query_wrapper("SELECT * FROM time WHERE sid=? AND device_id=?", [sid, device_id], function(err, rows){
        if(!err && rows.length > 0){
            cb(err, rows[0], ctx);
        }
        else{
            cb(err, null, ctx);
        }
    });
}

exports.get_user_device = function(device_id, cb){
    query_wrapper("SELECT * FROM user_device WHERE device_id=?", [device_id], function(err, rows){
        console.log(rows);
        if(!err && rows.length > 0){
            cb(err, rows[0]);
        }
        else{
            cb(err, null);
        }
    });
}

var get_time_by_device_id = function(device_id, cb, ctx){
    query_wrapper("SELECT * FROM time where device_id=?", [device_id], function(err, rows){
        cb(err, rows, ctx);
    }); 
}

exports.get_time_by_device_id = get_time_by_device_id;

exports.set_offline = function(id, cb){
    query_wrapper("UPDATE device set online=0 WHERE id=?", [id], cb);
}

exports.set_online = function(id){
    query_wrapper("UPDATE device set online=1 WHERE id=?", [id]);
}

exports.set_timezone = function(timezone, id){
    query_wrapper("UPDATE device set timezone=? WHERE id=?", [timezone, id]);
}

exports.set_all_offline = function(cb){
    query_wrapper("UPDATE device set online=0", cb);
}

exports.set_locked = function(id, locked){
    query_wrapper("UPDATE device set locked=? WHERE id=?", [locked, id]);
}

exports.set_ssid = function(id, ssid){
    query_wrapper("UPDATE device set ssid=? WHERE id=?", [ssid, id]);
}

exports.add_or_update_time = function(is_update, device_id, sid, start_time, end_time, repeatx, cb){
    if(is_update){
        query_wrapper("UPDATE time SET start_time=?, end_time=?, repeatx=? WHERE sid=? and device_id=?", [start_time, end_time, repeatx, sid, device_id], cb);
    }
    else{
        query_wrapper("INSERT into time VALUES(?, ?, ?, ?, ?)", 
                [sid,
                start_time,
                end_time,
                repeatx,
                device_id],
                cb
              );
    }
} 

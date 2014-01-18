var sqlite3 = require('sqlite3');
var crypto = require("crypto");
var util = require("./util.js");
var db_file = "buffalo.db3";

var die = function(msg, err){
    console.log(msg + ": " + err);
    process.exit(1);
}

var db = new sqlite3.Database(db_file, function(err){
    if(err){
        die('open db error', err);
    }

    db.get('SELECT * FROM sqlite_master WHERE type="table"', function(err, row){
        if(err){
            die('open db error', err);
        }

        db.run('PRAGMA journal_mode = OFF');

        if(!row){
            db.serialize(function(){
                db.run('CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, email TEXT UNIQUE, password TEXT, created_time DATETIME, last_login DATETIME, login_times INT DEFAULT 0)');
                db.run('CREATE INDEX name_index ON user(name)');
                db.run('CREATE INDEX email_index ON user(email)');
                db.run('CREATE INDEX name_pass_index ON user(name, password)');
                db.run('CREATE INDEX email_pass_index ON user(email, password)');
                db.run('CREATE TABLE device (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT UNIQUE NOT NULL, ssid TEXT, mac TEXT, state TINYINT DEFAULT 0, temperature TINYINT DEFAULT 0,' +
                       'humidity TINYINT DEFAULT 0, battery SMALLINT DEFAULT 0, locked TINYINT DEFAULT 0, online TINYINT DEFAULT 0, last_login DATETIME, login_times INT DEFAULT 0, timezone TEXT)');
                db.run('CREATE INDEX device_id_index ON device(device_id)');
                db.run('CREATE TABLE user_device(user_id INTEGER, device_id INTEGER)');
                db.run('CREATE INDEX user_id_index on user_device(user_id)');
                db.run('CREATE UNIQUE INDEX user_device_index on user_device(user_id, device_id)');
                db.run('CREATE TABLE IF NOT EXISTS time (sid TINYINT, start_time INT, end_time INT, repeatx TINYINT, device_id INTEGER,'+
                       ' FOREIGN KEY(device_id) REFERENCES device(id))');
                db.run('CREATE UNIQUE INDEX sid_index ON time(sid, device_id)');

                    // TODO: test
                /*
                var i = 0;
                var it = setInterval(function(){
                db.run('INSERT INTO device (device_id, ssid) VALUES (?, ?)', "RELEASE1" + util.formatNumber(i, 4), util.formatNumber(i, 4), function(err){
                });
                i++;
                console.log(i);
                if( i == 5000){
                    clearInterval(it);
                }
                }, 10);
                */
            });
        }
    })
});

exports.register_user = function(name, email, password, cb)
{
    var sha1 = crypto.createHash('sha1');
    sha1.update(password);
    var hashed_pass = sha1.digest('hex');

    db.run("INSERT INTO user (name, email, password, created_time, last_login) VALUES (?, ?, ?, ?, ?)", name, email, hashed_pass, new Date(), new Date(), cb);
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
    db.get("SELECT id FROM user WHERE name=?", name, function(err, row){
        if(err){
            cb(err);
        }
        else{
            if(row){
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
    db.get("SELECT id FROM user WHERE email=?", email, function(err, row){
        if(err){
            cb(err);
        }
        else{
            if(row){
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

    db.get(sql, name_or_email, cb);
}

exports.set_login_info = function(id){
    db.run("UPDATE user set last_login=?, login_times=(login_times+1) WHERE id=?",
            new Date(),
            id
            );
}

exports.get_user_by_name = function(name, cb)
{
    db.get("SELECT * FROM user WHERE name=?", name, cb);
}

exports.get_device_by_device_id = function(device_id, cb){
    db.get("SELECT * FROM device WHERE device_id=?", device_id, cb);
}

exports.set_device_login = function(id, mac, cb){
    db.run("UPDATE device set mac=?, last_login=?, login_times=(login_times+1), online=1 WHERE id=?", mac, (new Date()), id, cb);
}

exports.set_state = function(id, state, cb){
    db.run("UPDATE device set state=? WHERE id=?",
            state,
            id,
            cb);
}

exports.set_device_status = function(device_id, state, temperature, humidity, battery, locked, cb)
{
    db.run("UPDATE device set state=?, temperature=?, humidity=?, battery=?, locked=? WHERE device_id=?",
            state,
            temperature,
            humidity,
            battery,
            locked,
            device_id,
            cb);
} 

/*
 * cb(err, result)
 *
 */
exports.get_device_by_device_id_and_ssid = function(device_id, ssid, cb)
{
    db.get("SELECT * FROM device WHERE device_id=? AND ssid=?", device_id, ssid, cb);
}

exports.asso_user_device = function(user_id, device_id, cb)
{
    db.run("INSERT INTO user_device (user_id, device_id) VALUES (?, ?)", user_id, device_id, cb);
} 

exports.set_password = function(id, pass, cb){
    db.run("UPDATE user SET password=? WHERE id=?", get_hashed_password(pass), id, cb);
}

exports.del_time = function(sid, device_id, cb){
    db.run("DELETE FROM time WHERE sid=? and device_id=?", sid, device_id, cb);
}

exports.get_random_password = function(){
    return crypto.randomBytes(3).toString('hex');
}

exports.del_from_user_device = function(device_id, user_id, cb){
    db.run("DELETE FROM user_device WHERE device_id=? AND user_id=?", device_id, user_id, cb);
}

exports.del_from_time = function(device_id, cb){
    db.run("DELETE FROM time WHERE device_id=?", device_id, cb);
}

exports.get_all_devices = function(user_id, cb){
    db.all("SELECT device.* FROM device, user_device, user WHERE user.id=? AND user.id=user_device.user_id AND device.id=user_device.device_id",
            user_id, cb
            )
}

exports.get_by_sid = function(sid, device_id, cb, ctx){
    db.get("SELECT * FROM time WHERE sid=? AND device_id=?", sid, device_id, function(err, row){
        cb(err, row, ctx);
    });
}

exports.get_user_device = function(device_id, cb){
    db.get("SELECT * FROM user_device WHERE device_id=?", device_id, cb);
}

var get_time_by_device_id = function(device_id, cb, ctx){
    db.all("SELECT * FROM time where device_id=?", device_id, function(err, row){
        cb(err, row, ctx);
    }); 
}

exports.get_time_by_device_id = get_time_by_device_id;

exports.set_offline = function(id, cb){
    db.run("UPDATE device set online=0 WHERE id=?", id, cb);
}

exports.set_online = function(id){
    db.run("UPDATE device set online=1 WHERE id=?", id);
}

exports.set_timezone = function(timezone, id){
    db.run("UPDATE device set timezone=? WHERE id=?", timezone, id);
}

exports.set_all_offline = function(cb){
    db.run("UPDATE device set online=0", cb);
}

exports.set_locked = function(id, locked){
    db.run("UPDATE device set locked=? WHERE id=?", locked, id);
}

exports.set_ssid = function(id, ssid){
    db.run("UPDATE device set ssid=? WHERE id=?", ssid, id);
}

exports.add_or_update_time = function(is_update, device_id, sid, start_time, end_time, repeatx, cb){
    if(is_update){
        db.run("UPDATE time SET start_time=?, end_time=?, repeatx=? WHERE sid=? and device_id=?", start_time, end_time, repeatx, sid, device_id, cb);
    }
    else{
        db.run("INSERT into time VALUES(?, ?, ?, ?, ?)", sid,
                start_time,
                end_time,
                repeatx,
                device_id,
                cb
              );
    }
} 

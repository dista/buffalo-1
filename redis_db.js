var redis = require('redis');
var crypto = require('crypto');

var redis_db = redis.createClient();

exports.set_auth_code = function(id, code){
    redis_db.set(id, code);
    redis_db.expire(id, 3 * 60);
}

exports.get_auth_code = function(id, cb){
    redis_db.get(id, cb);
}

exports.get_failed_time = function(user, cb){
    var item = redis_db.get('failed_' + user, function(err, reply){
        var ret = 0;
        if(reply != null){
            ret = reply;
        }

        cb(ret);        
    });
}

exports.set_failed_time = function(user, val){
    if(val != 0){
        redis_db.set('failed_' + user, val);
    }
    else{
        redis_db.del('failed_' + user);
    }
}

exports.set_user_auth_id = function(user, keep_time){
    var data = crypto.createHash('md5').update(user + (new Date()).getTime()).digest('hex');

    if(keep_time == 0){
        keep_time = 65535;
    }

    redis_db.set(data, user);
    redis_db.expire(data, keep_time * 3600);

    return data;
}

exports.get_user_auth_id = function(auth_id, cb){
    redis_db.get(auth_id, cb);
}

exports.del_user_auth_id = function(user){
    redis_db.del("auth_code_" + user);
}

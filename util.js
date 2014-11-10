var assert = require('assert');
var moment = require('moment-timezone');
var crypto = require('crypto');

int2BCD = function(d)
{
    var out = 0;
    var i = 0;
    while(d)
    {
        var x = d % 10;
        out = out | x << (4*i);
        d = Math.floor(d / 10);
        i++;
    }

    return out;
}

exports.getRandomKey = function(prefix){
    var rd = Math.floor(Math.random() * 65535);
    var data = crypto.createHash('md5').update(prefix + (new Date()).getTime() + rd).digest('hex');

    return data;
}

var getDateByTimezone = function(timezone)
{
    var d = moment();

    if(timezone){
        try{
            d = moment().tz(timezone);
        }
        catch(err){
            console.log('invalid timezone' + timezone);
        }
    }

    return d;
}

exports.getTimeBCD = function(timezone)
{
    var d = getDateByTimezone(timezone);

    var r = new Buffer(7);
    r[0] = Math.floor(d.year() / 100);
    r[1] = d.year() % 100;
    r[2] = d.month() + 1;
    r[3] = d.date();
    r[4] = d.hour();
    r[5] = d.minute();
    r[6] = d.second();

    for(var i = 0; i < r.length; i++)
    {
        r[i] = int2BCD(r[i]);
    }

    return r;
}

exports.getWeek = function(timezone)
{
    var r = (getDateByTimezone(timezone)).day();
    
    if(r == 0)
    {
        r = 7;
    }

    return r;
}

exports.compareDeviceId = function(d1, d2)
{
    return (d1 == d2);
}

exports.formatDeviceId = function(device_id)
{
    var ret = "";
    for(var i = 0; i < device_id.length; i++)
    {
        var m = device_id[i];
        ret += "0x" + m.toString(16);

        if(i != device_id.length - 1)
        {
            ret += "|";
        }
    }

    return ret;
}

var setRespCommonPart = function(buff, msg, is_success)
{
    buff[0] = msg['type'];
    if('packet_id' in msg){
        buff.writeUInt32BE(msg['packet_id'], 1);
    }
    buff.writeUInt32BE(buff.length - RESP_HEADER_SIZE, 6); 

    buff[5] = 0;
    if(is_success){
        buff[5] = 1;
    }
}

var setReqCommonPart = function(buff, msg){
    buff[0] = msg['type'];
    buff.writeUInt32BE(msg['packet_id'], 1);
    buff.writeUInt32BE(buff.length - REQ_HEADER_SIZE, 5);
}

var RESP_HEADER_SIZE = 10;
var REQ_HEADER_SIZE = 9;
exports.RESP_HEADER_SIZE = RESP_HEADER_SIZE;
exports.REQ_HEADER_SIZE = REQ_HEADER_SIZE;

exports.setRespCommonPart = setRespCommonPart;
exports.setReqCommonPart = setReqCommonPart;

exports.buildErr = function(msg, err_code, err_target)
{
    var buff = new Buffer(RESP_HEADER_SIZE+2);
    setRespCommonPart(buff, msg, false);
    buff[RESP_HEADER_SIZE] = err_code;
    buff[RESP_HEADER_SIZE+1] = err_target;
    
    return buff; 
}

exports.getNextMsgPos = function(start, len)
{
    return start + REQ_HEADER_SIZE + len;
}

exports.buildGeneralOk = function(msg)
{
    var buff = new Buffer(RESP_HEADER_SIZE);
    setRespCommonPart(buff, msg, true);

    return buff; 
}

var setChecksum = function(buff)
{
    var checksum = buff[0];

    for(var i = 1; i < buff.length - 2; i++)
    {
        checksum ^= buff[i];
    }

    buff[buff.length - 2] = checksum;
}

exports.setChecksum = setChecksum;

exports.checkMsg = function(data, start, is_resp){
    var header_size = REQ_HEADER_SIZE;
    var len_pos = 5;
    if(is_resp){
        header_size = RESP_HEADER_SIZE;
        len_pos = 6;
    }

    if(start + header_size > data.length)
    {
        return -2;
    }

    var len = data.readUInt32BE(start + len_pos);
    console.log(len);

    if(start + header_size + len > data.length)
    {
        return -2;
    }

    return len + header_size;
}

exports.setIp = function(buff, index, oldip, newip){
    if(oldip == newip){
        buff[index++] = 0;
    }
    else{
        buff[index++] = 1;
        var ip_parts = newip.split(".");
        buff[index++] = parseInt(ip_parts[0], 10);
        buff[index++] = parseInt(ip_parts[1], 10);
        buff[index++] = parseInt(ip_parts[2], 10);
        buff[index++] = parseInt(ip_parts[3], 10);
    }
}

/*
 * 12:23 to 0x12 0x23
 */
exports.time2buff = function(time){
    var tmp = time.split(":");
    var buff = new Buffer(2);
    buff[0] = parseInt(tmp[0], 16);
    buff[1] = parseInt(tmp[1], 16);

    return buff;
}

exports.dummy = function(){
}

var formatNumber = function(num, len){
    var ret = "" + num;

    while(ret.length < len){
        ret = "0" + ret;
    }

    return ret.slice(0, len);
}

exports.formatNumber = formatNumber;

exports.formatBuffer = function(buff, start, len){
    if(start == undefined){
        start = 0;
    }

    if(len == undefined){
        len = buff.length;
    }

    var ret = "";
    for(var i = 0; i < len; i++){
        var tmp = buff[i + start].toString(16);
        if(tmp.length < 2){
            tmp = "0" + tmp;
        }

        ret += tmp;

        if(i < (len - 1)){
            ret += " ";
        }
    }

    return ret;
}

exports.getDeviceId = function(data, start, pos, len){
    var buffer = new Buffer(len);
    data.copy(buffer, 0, start + pos, start + pos + len);
    return buffer;
}

var keyRules = {
    'Temp': 'short'
}

var parseString = function(data, start, pos, len){
    if((pos + 4) > len){
        return [-2, ""];
    }

    var new_pos = start + pos;
    var str_len = data.readUInt32BE(start + pos);
    pos += 4;
    var key = data.toString('utf8', start + pos, start + pos + str_len);
    pos += str_len;

    return new Array(pos, key);
}

exports.parseString = parseString;

exports.parseStatus = function(data, start, pos, len){
    var stats = {};
    while(pos < len){
        var tmp = parseString(data, start, pos, len);
        pos = tmp[0];
        if(pos == -1){
            return NULL;
        }
        var key = tmp[1];

        if(!(key in keyRules)){
            throw new Error("status item is not allowed, key " + key);
        }

        console.log("key: " + key);
        if(keyRules[key] == 'short'){
            if(pos + 2 > len){
                throw 'parseStatus error, no enough data';
            }

            stats[key] = data.readUInt16BE(start + pos);
            pos += 2;
        }
    }

    return stats;
}

var writeString = function(buff, index, str){
    var sb = new Buffer(str, 'utf8');
    buff.writeUInt32BE(sb.length, index);
    index += 4;
    sb.copy(buff, index);
    index += sb.length;

    return index;
}

exports.writeString = writeString;

exports.getStringEncodingLen = function(str){
    var sb = new Buffer(str, 'utf8');
    return 4 + sb.length;
}

exports.serializeStatus = function(stats){
    var size = 0;
    for(key in stats){
        var sb = new Buffer(key, 'utf8')
        size += 4 + sb.length;

        if(keyRules[key] == 'short'){
            size += 2;
        }
    }

    var buff = new Buffer(size);
    var index = 0;
    for(key in stats){
        index = writeString(buff, index, key);
        if(keyRules[key] == 'short')
        {
            buff.writeUInt16BE(stats[key], index);
            index += 2;
        } 
    } 

    return buff;
}

exports.createDeviceId = function(n){
    var deviceId = new Buffer(16);
    deviceId.fill(0);
    if(n % 2){
        deviceId[0] = 0x01;
    }
    else{
        deviceId[0] = 0x81;
    }

    var n = formatNumber(n); 
    var nBuffer = bufferStringToBuffer(n);
    nBuffer.copy(deviceId, 16 - nBuffer.length);

    return deviceId;
}

bufferStringToBuffer = function(str){
    var code0 = "0".charCodeAt(0);
    var charA = 'a'.charCodeAt(0);
    var buff = new Buffer(str.length / 2);
    for(var i = 0; i < str.length;){
        var m = i / 2;
        var t = str.charCodeAt(i);
        var p = t - code0;
        if(t >= charA){
            p = t - charA + 10;
        }
        buff[m] = p * 16;
        t = str.charCodeAt(i+1);
        p = t - code0;
        if( t >= charA){
            p = t - charA + 10;
        }
        buff[m] += p;

        i = i + 2;
    }

    return buff;
}

exports.bufferStringToBuffer = bufferStringToBuffer;

exports.buffToBufferStr = function(buff){
    var ret = "";
    for(var i = 0; i < buff.length; i++){
        var x = buff[i].toString(16);

        if(x.length < 2){
            x = '0' + x;
        }

        ret += x;
    }

    return ret;
}

exports.is_master_device = function(device_id){
    if(device_id[0] & 0x80){
        return false;
    }

    return true;
}

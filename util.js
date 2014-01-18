var assert = require('assert');
var moment = require('moment-timezone');

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

    var r = new Buffer(6);
    r[0] = d.year() - 2000;
    r[1] = d.month() + 1;
    r[2] = d.date();
    r[3] = d.hour();
    r[4] = d.minute();
    r[5] = d.second();

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

var setCommonPart = function(buff, msg)
{
    buff.fill(0);
    buff[0] = 0x97;
    buff[1] = msg['type'];
    buff.writeUInt32BE(msg['packet_id'], 2);
    buff[buff.length - 1] = 0x99;
    buff.writeUInt16BE(buff.length - 10, 6); 
}

exports.setCommonPart = setCommonPart;

exports.buildErr = function(msg, error)
{
    var buff = new Buffer(10+2);
    setCommonPart(buff, msg);
    buff[8] = 0x00;
    buff[9] = error;
    setChecksum(buff);
    
    return buff; 
}

exports.getNextMsgPos = function(start, len)
{
    return start + 10 + len;
}

exports.buildGeneralOk = function(msg)
{
    var buff = new Buffer(10+2);
    setCommonPart(buff, msg);
    buff[8] = 0x01;
    setChecksum(buff);
    
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

exports.checkMsg = function(data, start){
    // there is enough data, buf not start with 0x97, protocal err
    if(start < data.length && data[start] != 0x97){
        return null;
    }

    if(start + 8 > data.length)
    {
        return -2;
    }

    var len = data.readUInt16BE(start + 6);

    if(start + 10 + len > data.length)
    {
        return -2;
    }

    // there is enough data, buf not end with 0x99, protocal err
    if(data[start + 10 + len - 1] != 0x99)
    {
        return null;
    }

    return len;
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

exports.formatNumber = function(num, len){
    var ret = "" + num;

    while(ret.length < len){
        ret = "0" + ret;
    }

    return ret.slice(0, len);
}

exports.formatBuffer = function(buff, len){
    if(len == undefined){
        len = buff.length;
    }

    var ret = "";
    for(var i = 0; i < len; i++){
        var tmp = buff[i].toString(16);
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

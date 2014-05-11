var util = require("./util.js");

exports.build_query_status = function(device_id){
    var buff = new Buffer(util.REQ_HEADER_SIZE + 16);
    util.setReqCommonPart(buff, {"type": 0x83, "packet_id": 5});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);

    return buff;
}

exports.build_control_learn = function(device_id){
    var buff = new Buffer(util.REQ_HEADER_SIZE + 16 + 6);
    util.setReqCommonPart(buff, {"type": 0x84, "packet_id": 2});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);
    var index = util.REQ_HEADER_SIZE + 16;
    buff.writeUInt16BE(0x10, index);
    index += 2;
    buff.writeUInt32BE(0, index);

    return;
}

exports.build_control_lock = function(device_id, is_lock){
    var buff = new Buffer(util.REQ_HEADER_SIZE + 16 + 7);
    util.setReqCommonPart(buff, {"type": 0x84, "packet_id": 3});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);
    var index = util.REQ_HEADER_SIZE + 16;
    buff.writeUInt16BE(0x01, index);
    index += 2;
    buff.writeUInt32BE(1, index);
    index += 4;
    buff[index] = 0;

    if(is_lock){
        buff[index] = 1;
    }

    return buff;
}

exports.build_control_ir = function(device_id, ir){
    var buff = new Buffer(util.REQ_HEADER_SIZE + 16 + 7 + 4 + ir.length);

    util.setReqCommonPart(buff, {"type": 0x84, "packet_id": 4});
    (new Buffer(device_id)).copy(buff, util.REQ_HEADER_SIZE);
    var index = util.REQ_HEADER_SIZE + 16;
    buff.writeUInt16BE(0x11, index);
    index += 2;
    
    buff.writeUInt32BE(5 + ir.length, index);
    index += 4;
    buff[index++] = 0;
    buff.writeUInt32BE(ir.length, index);
    index += 4;
    ir.copy(buff, index);

    return buff;
}

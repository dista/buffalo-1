var DEVICE_IS_NOT_ONLINE = 1;
exports.DEVICE_IS_NOT_ONLINE = DEVICE_IS_NOT_ONLINE;

exports.trans = function(code){
    if(code == DEVICE_IS_NOT_ONLINE){
        return "device is not online";
    }
}

DEVICE_IS_NOT_ONLINE = 1;

exports.trans = function(code){
    if(code == DEVICE_IS_NOT_ONLINE){
        return "device is not online";
    }
}

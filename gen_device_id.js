var util = require('./util.js');

var d1 = util.createDeviceId(50);
var d1x = util.buffToBufferStr(d1);
console.log(d1);
console.log(d1x);

var d2 = util.createDeviceId(51);
var d2x = util.buffToBufferStr(d2);
console.log(d2);
console.log(d2x);


var net = require("net");
var port = 8000;
var ip = "103.21.136.175"

/*
var device_id = new Buffer([0x22, 0x22, 0x22, 0x22,
                 0x22, 0x22, 0x22, 0x22,
                 0x11, 0x22, 0x33, 0x44
                ]);
//var device_id = new Buffer("RELEASE10005");
var mac_addr = new Buffer([0x71, 0x72, 0x73, 0x74, 0x75, 0x76]);

var startEmbed = function(xxx)
{
var p = xxx;
var client = net.connect(port, ip, function(){
    var package_id = 0;

    var buff = new Buffer(18 + 10);
    buff.fill(0);
    buff[0] = 0x97;
    buff[1] = 0x31;
    buff.writeUInt32BE(package_id++, 2);
    buff[7] = 18;
    device_id.copy(buff, 8);
    mac_addr.copy(buff, 20);
    buff[27] = 0x99;

    client.write(buff);

    var heart_beat = function(){
        //console.log("yyy" + p);
        var buff = new Buffer(26);
        buff.fill(0);
        buff[0] = 0x97;
        buff[1] = 0x30;
        buff[2] = p;
        buff[7] = 0x10;
        buff[25] = 0x99
        client.write(buff);
    }

    setInterval(heart_beat, 1000);

    var on_control = function(data){
        var buff = new Buffer(10 + 2);
        buff.fill(0);
        buff[0] = 0x97;
        buff[1] = 0x41;
        buff.writeUInt32BE(data.readUInt32BE(2), 2);
        buff[7] = 0x02;
        buff[8] = 0x01;
        buff[11] = 0x99;

        client.write(buff);
    }

    client.on('data', function(data){
        console.log("device" + data.toJSON() + " " + (new Date()));
        if(data[1] == 0x41){
            console.log("device receive control");
            //on_control(data);         
        }
    })
});
}
*/

var startPhone = function(id, user){
var phone_client = net.connect(port, function(){
    var buff = new Buffer(10 + 4);
    buff.fill(0);
    buff[0] = 0x97;
    buff[1] = 0x11;
    buff[7] = 4;
    buff[8] = user.charCodeAt(0);
    buff[9] = '|'.charCodeAt(0);
    buff[10] = 'd'.charCodeAt(0);
    buff[11] = 0x27;
    buff[13] = 0x99;

    var heart_beatx = function(){
        var buff = new Buffer(18);
        buff.fill(0);
        buff[0] = 0x97;
        buff[1] = 0x10;
        buff[7] = 0x08;
        buff[17] = 0x99
        phone_client.write(buff);
    }

    //setInterval(heart_beatx, 1000);

    phone_client.write(buff);

    var control = function(pc){
        var buff = new Buffer(10 + 25);
        buff.fill(0);
        buff[0] = 0x97;
        buff[1] = 0x15;
        buff[7] = 25;
        device_id.copy(buff, 16);
        buff[28] = 1; // on/off
        buff.writeUInt32BE(0, 29);
        buff[34] = 0x99;
        pc.write(buff);
    } 
    setInterval(control, 1000, phone_client);

    phone_client.on('data', function(data){
        if(data[1] == 0x15){
            console.log("control resp *** " + data.toJSON() + " " + (new Date()));
        }
    });
});
}

//startEmbed(1);
startPhone("xxx1", 'c');
/*
for(var i = 0; i < 100; i++)
{
startPhone("xxx1", 'c');
startPhone("xxx2", 'e');
}
*/

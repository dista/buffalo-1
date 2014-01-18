var email = require('emailjs');

var server = email.server.connect({
    user: 'service@yunguo.com.cn',
    password: 'hzzh0571',
    host: 'smtp.yunguo.com.cn',
    port: 25
});

exports.send_mail = function(email, name, password, cb)
{
    var now = new Date();

    var message = {
        from:    "service <service@yunguo.com.cn>", 
        to:      email,
        subject: "云果科技-找回密码",
        attachment: [
            {data: "<html><div style='color: #333'><p>尊敬的用户，您好：</p>"+
                "<p>&nbsp;&nbsp;&nbsp;&nbsp;您于" +
                    now.getFullYear() + "年" +
                    (now.getMonth() + 1)+"月" +
                    now.getDate() +"日" + 
                    "提交了找回密码请求，您的原始注册帐号为：" + name + 
                    "，密码为：" + password + "，如非本人操作，请忽略此邮件。如需获取更多信息，请致电400-885-6869或查询云果官网: " +
                "<a href='http://www.hzzh0571.com'>http://www.hzzh0571.com</a></p>" +
                "</div></html>", alternative: true}
        ]
    };

    server.send(message, cb);
}

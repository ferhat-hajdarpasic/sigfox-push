var https = require('follow-redirects').https;
var fs = require('fs');

var qs = require('querystring');

const CBKEY = 'E23F705C-B366-4F97-8C47-1DDEC3F72C26';

const createOptions = (postData) => {
    return {
        method: 'POST',
        hostname: 'app.airtracker.io',
        path: '/api/v1/sigfox/batchdata',
        headers: {
            'content-length': `${postData.length}`,
            'accept-encoding': 'gzip,deflate',
            'host': ' app.airtracker.io',
            'content-type': 'application/x-www-form-urlencoded'
        },
        maxRedirects: 20
    }
}

const createRequest = (options) => {
    return https.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function (chunk) {
            var body = Buffer.concat(chunks);
            console.error(`Response from airtracker: ${body.toString()}`);
        });

        res.on("error", function (error) {
            console.error(`Error response from airtracker: ${error}`);
        });
    });
}

const createPostData = (data) => {
    var line = `${data.device};${data.time};${data.data};${data.seqNumber}`;
    var body = {
        'cbkey': CBKEY,
        'batch': line
    }
    return qs.stringify(body);
}

const sendData = async (data) => {
    const postData = createPostData(data);
    console.log(postData);
    const options = createOptions(postData);
    const req = createRequest(options);

    req.write(postData);
    req.end();
}

// sendData({
//     device: "410CBA",
//     time: "1563599688",
//     data: "1701001128000080070041e2",
//     seqNumber: "2282"
// });

module.exports = { sendData };
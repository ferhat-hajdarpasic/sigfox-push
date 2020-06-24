const https = require('https');
const http = require('http');
const mongo = require('./mongo');
const airtracker = require('./airtracker');

'use strict';

const shl = (buf /*:Buffer*/, shiftBits /*:number*/) => {
    if (shiftBits < 0) { return shr(buf, -shiftBits); }
    if (shiftBits !== (shiftBits | 0)) { throw new Error("shiftBits must be a 32 bit int"); }
    const bytes = 2 * ((shiftBits >> 4) + ((shiftBits & 15) !== 0));
    const bits = (bytes * 8) - shiftBits;
    for (let reg = 0, i = 0; i - bytes < buf.length; i += 2) {
        reg <<= 16;
        if (i < buf.length - 1) {
            reg |= buf.readUInt16BE(i);
        } else if (i < buf.length) {
            reg |= buf[i] << 8;
        }
        if (i - bytes >= 0) {
            if (i - bytes < buf.length - 1) {
                buf.writeUInt16BE((reg >>> bits) & 0xffff, i - bytes);
            } else {
                if (i - bytes !== buf.length - 1) { throw new Error(); }
                buf[i - bytes] = reg >>> (bits + 8);
            }
        } else if (i - bytes === -1) {
            buf[0] = reg >>> bits;
        }
    }
};

const shr = (buf /*:Buffer*/, shiftBits /*:number*/) => {
    if (shiftBits < 0) { return shl(buf, -shiftBits); }
    if (shiftBits !== (shiftBits | 0)) { throw new Error("shiftBits must be a 32 bit int"); }
    const bytes = 2 * ((shiftBits >> 4) + ((shiftBits & 15) !== 0));
    const bits = 16 - ((bytes * 8) - shiftBits);
    for (let reg = 0, i = buf.length - 2; i + bytes >= -1; i -= 2) {
        reg >>>= 16;
        if (i >= 0) {
            reg |= buf.readUInt16BE(i) << 16;
        } else if (i === -1) {
            reg |= buf[0] << 16;
        }
        if (i + bytes + 1 < buf.length) {
            if (i + bytes >= 0) {
                buf.writeUInt16BE((reg >>> bits) & 0xffff, i + bytes);
            } else {
                if (i + bytes + 1) { throw new Error(); }
                buf[0] = reg >>> bits;
            }
        } else if (i + bytes + 1 === buf.length) {
            buf[i + bytes] = reg >>> (bits + 8);
        }
    }
};

const schedule = [
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
    [8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0],
    [0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8],
    [12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0],
    [0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12],
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 12, 12, 0, 0, 0, 0, 0, 0, 0, 0],
    [12, 12, 12, 12, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    [0, 0, 0, 0, 12, 12, 12, 12, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 12, 12, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 12, 12],
];

const frames = [
    0x01, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26
];

const names = ["Pm2_5", "Pm10", "Noise", "Solar", "Battery", "O3", "S02", "NO2", "CO", "Ammonia", "Temperature", "Humidity", "Barometric_Pressure", "VOX_CO2", "CO2"];

const parse = (data) => {
    const buffer = Buffer.from(data, 'hex');
    const frameId = buffer[0];
    shl(buffer, 8);

    const frameIndex = frames.indexOf(frameId);
    let temp = {};
    for (let measurementIndex = 0; measurementIndex < schedule.length; measurementIndex++) {
        const bits = schedule[measurementIndex][frameIndex];
        const name = names[measurementIndex];
        if (bits == 8) {
            temp[name] = format(name, buffer[0]);
        } else if (bits == 12) {
            temp[name] = format(name, 16 * buffer[0] + (0xf0 & buffer[1]) / 16);
        }
        shl(buffer, bits);
    }
    return temp;
}

const metrics = {
    "Pm2_5": { offset: 0, step: 1, unit: "ug/m3" },
    "Pm10": { offset: 0, step: 1, unit: "ug/m3" },
    "Noise": { offset: 0, step: 0.5, unit: "dB" },
    "Solar": { offset: 0, step: 0.5, unit: "%" },
    "Battery": { offset: 0, step: 0.5, unit: "%" },
    "O3": { offset: 0, step: 5, unit: "ppb" },
    "S02": { offset: 0, step: 0, unit: "ppb" },
    "NO2": { offset: 0, step: 5, unit: "ppb" },
    "CO": { offset: 0, step: 0.5, unit: "ppm" },
    "Ammonia": { offset: 0, step: 0.5, unit: "ppm" },
    "Temperature": { offset: -100, step: 0.2, unit: "oC" },
    "Humidity": { offset: 0, step: 0.2, unit: "RH" },
    "Barometric_Pressure": { offset: 600, step: 0.5, unit: "hPA" },
    "VOX_CO2": { offset: 0, step: 1, unit: "ppm" },
    "CO2": { offset: 0, step: 0.5, unit: "ppm" }
};

const format = (metric_id, value) => {
    const result = ((value + metrics[metric_id].offset) * metrics[metric_id].step).toFixed(2);
    return result;
}

//const result = parse("16012013314a01d0070041e0");
//console.log(JSON.stringify(result));

const sendDataToClient = (result) => {
    result.LatestTitle = result.DeviceId;
    const postData = JSON.stringify(result);
    var options = {
        hostname: 'tb.bultimate.com.au',
        port: 443,
        path: '/api/v1/integrations/http/d0a87ce2401e64ae859c64d7115c5e93',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    const req = https.request(options, (res) => {
        console.log('Status:', res.statusCode);
        //console.log('Headers:', JSON.stringify(res.headers));
        res.on('data', (d) => {
            //console.log(`Client data: ${d}`);
        });
        res.on('end', () => {
            //console.log('Send data to client finished');
        });
        res.on('error', (e) => {
            console.log('Client error: ${e}');
        });
    });
    req.on('error', (e) => {
        console.error(e);
    });
    console.log(`Data: ${postData}`);
    req.write(postData);
    req.end();
}

const sendDataToRod = (result) => {
    result.LatestTitle = result.DeviceId;
    const hostname = "stream-ingest.senscity.live"; //'a896820780ff811eabb7202399e4506e-1289631439.us-west-2.elb.amazonaws.com';  //hostname: 'aab8923201fae11ea802d06452b2a4e9-2068392276.ap-southeast-2.elb.amazonaws.com',
    const postData = JSON.stringify(result);
    var options = {
        hostname: hostname,
        path: '/21e15dc1',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length,
            'x-api-key': '0rbXFMQfnUzZUCW7hvcXviyRF1d91N4Ori5De3chHKoUKe17Ts626paECq717TS'
        }
    };

    const req = https.request(options, (res) => {
        console.log(`sendDataToRod -> Hostname: ${hostname}, Status: ${res.statusCode}`);
        //console.log('Headers:', JSON.stringify(res.headers));
        res.on('data', (d) => {
            //console.log(`Client data: ${d}`);
        });
        res.on('end', () => {
            //console.log('Send data to client finished');
        });
        res.on('error', (e) => {
            console.log('Client error: ${e}');
        });
    });
    req.on('error', (e) => {
        console.error(e);
    });
    console.log(`Data: ${postData}`);
    req.write(postData);
    req.end();
}

const sendDataToXeQui = (result) => {
    result.LatestTitle = result.DeviceId;
    const postData = JSON.stringify(result);
    var options = {
        hostname: 'd.uboro.io',
        port: 4002,
        path: '/',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    const req = http.request(options, (res) => {
        console.log(`sendDataToXeQui -> Status: ${res.statusCode}`);
        res.on('data', (d) => {
        });
        res.on('end', () => {
        });
        res.on('error', (e) => {
            console.log('Client error: ${e}');
        });
    });
    req.on('error', (e) => {
        console.error(e);
    });
    console.log(`Data: ${postData}`);
    req.write(postData);
    req.end();
}

/**
 * Pass the data to send as `event.data`, and the request options as
 * `event.options`. For more information see the HTTPS module documentation
 * at https://nodejs.org/api/https.html.
 *
 * Will succeed with the response body.
 */
exports.handler = (event, context, callback) => {
    if (event.data) {
        let result = parse(event.data);
        result.DeviceId = event.device;
        result.Time = `${new Date(event.time * 1000).toISOString()}`;
        result.SeqNumber = event.seqNumber;
        console.log(`device id = ${result.DeviceId}`);

        if ((event.device == "410B41") || (event.device == "410CBA")) {
            sendDataToClient(result);
        }
        if ((event.device == "410CBD") || (event.device == "4102C9")) {
            sendDataToRod(result);
        }
        if ((event.device == "4102CA")) {
            console.log(`For ${event.device} we are sending to airtracker.`);
            airtracker.sendData(event);
        }
        if ((event.device == "35201E") || (event.device == "34ECF6")) {
            sendDataToXeQui(result);
        }
        mongo.sendData(result);
    } else {
        console.log(`Received unknown payload ${JSON.stringify(event)}`);
        console.log(`Received headers ${JSON.stringify(event.headers)}`);
    }
    callback(null, JSON.stringify({}));
};

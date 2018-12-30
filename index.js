var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'});

const DATABASE_NAME_DEVICE_CONFIG = "BadgeData";
const DATABASE_NAME_DEVICE_LIST = "BadgeDevices";

const EVENTS = {
    'ERROR': '2000-00-00T00:00:00.000Z',
    'Christmas': '2018-12-25T00:00:00.000Z',
    'Xmas 2019': '2019-12-25T00:00:00.000Z',
    'Boxing Day': '2018-12-26T00:00:00.000Z',
    '2019': '2019-01-01T00:00:00.000Z',
    'Easter': '2019-04-21T00:00:00.000Z',
    'Summit': '2019-01-07T13:30:00.000Z',
    'Synergy': '2019-05-21T13:00:00.000Z',
    'Q-PEC': '2019-02-04T19:00:00.000Z'
};

var dynamodb = new AWS.DynamoDB();

function getDisplayConfig(deviceId) {
    return new Promise(resolve => {
        var params = {
            TableName:DATABASE_NAME_DEVICE_CONFIG,
            Key:{
                "deviceId":{S:deviceId}
            }
        };
        dynamodb.getItem(params, function(err, data) {
            if (err || !data) {
                return resolve(null);
            }
            if (data.Item && data.Item.config && data.Item.config.M) {
                var x = {};
                for (var k in data.Item.config.M) {
                    if (data.Item.config.M[k].S) {
                        x[k] = data.Item.config.M[k].S;
                    }
                }
                return resolve(x);
            }
            return resolve(null);
        });
    });
}

function updateDisplayConfig(deviceId, cfg) {
    return new Promise(resolve => {
        var params = {
            TableName:DATABASE_NAME_DEVICE_CONFIG,
            Key:{
                "deviceId":{S:deviceId}
            },
            ExpressionAttributeValues: {
                ":config": {
                    "M": {}
                }
            },
            UpdateExpression: "SET config = :config"
        };
        for (var k in cfg) {
            params.ExpressionAttributeValues[":config"].M[k] = {S:cfg[k]};
        }
        dynamodb.updateItem(params, function(err, data) {
            console.log(err);
            if (err || !data) {
                return resolve(null);
            }
            return resolve(data);
        });
    });
}

function getMacAddress(deviceNumber) {
    return new Promise(resolve => {
        var params = {
            TableName:DATABASE_NAME_DEVICE_LIST,
            Key:{
                "deviceId":{S:deviceNumber}
            }
        };
        dynamodb.getItem(params, function(err, data) {
            if (err || !data) {
                return resolve(null);
            }
            if (data.Item && data.Item.mac && data.Item.mac.S) {
                var r = {mac:data.Item.mac.S};
                if (data.Item && data.Item.desc && data.Item.desc.S) {
                    r.desc = data.Item.desc.S;
                }
                return resolve(r);
            }
            return resolve(null);
        });
    });
}

function say(x) {
    return {
        'version': '1.0',
        'sessionAttributes': {},
        'response': {
            'outputSpeech': {
                'type': 'PlainText',
                'text': x
            }
        }
    };
}

function extractBestSlotMatch(slot, useId) {
    var ret = slot.value;
    if (slot.resolutions && slot.resolutions.resolutionsPerAuthority) {
        if (slot.resolutions.resolutionsPerAuthority.length > 0) {
            var auth = slot.resolutions.resolutionsPerAuthority[0];
            if (auth.values && (auth.values.length > 0)) {
                if (auth.values[0].value) {
                    if (auth.values[0].value.name && !useId) {
                        ret = auth.values[0].value.name;
                    }
                    if (auth.values[0].value.id && useId) {
                        ret = auth.values[0].value.id;
                    }
                }
            }
        }
    }
    return ret;
}

async function handleIntentRequest(event) {
    switch (event.request.intent.name) {
    case "CountDownIntent":
        var eventName = undefined;
        var mac = undefined;
        var desc = "the device";
        var slots = event.request.intent.slots;
        if (slots["event"]) {
            eventName = extractBestSlotMatch(slots["event"], false);
        }
        if (slots["devicenumber"]) {
            var deviceId = extractBestSlotMatch(slots["devicenumber"], true);
            if (deviceId) {
                var dx = await getMacAddress(deviceId);
                mac = dx.mac;
                if (dx.desc) {
                    desc = dx.desc;
                }
            }
        }
        if (!mac) {
            return say("Sorry, I couldn't determine which device you want me to talk to.");
        }
        var existing = await getDisplayConfig(mac);
        var newConfig = {description:eventName, timestamp:EVENTS[eventName]};
        if (existing) {
            for (var k in existing) {
                if (k.indexOf("cfg") == 0) {
                    newConfig[k] = existing[k];
                }
            }
            if (existing.color) {
                newConfig.color = existing.color;
            }
        }
        if (eventName) {
            var x = await updateDisplayConfig(mac, newConfig);
            return say("OK, " + desc + " will start counting down to " + eventName + " within the next minute.");
        }
        else {
            return say("Sorry, I couldn't determine which event you want me count down to.");
        }
    }
    return say("Oops!");
}

exports.handler = async (event) => {

    if (event && event.request && event.request.type) {
        switch (event.request.type) {
        case "IntentRequest":
            return await handleIntentRequest(event);
            break;
        }
    }

    if (event && event.queryStringParameters && event.queryStringParameters.deviceid) {       
        if (event.httpMethod == "POST") {
            var existing = await getDisplayConfig(event.queryStringParameters.deviceid);
            var newConfig = JSON.parse(event.body);
            if (existing) {
                for (var k in existing) {
                    if (k.indexOf("cfg") == 0) {
                        newConfig[k] = existing[k];
                    }
                }
            }
            var x = await updateDisplayConfig(event.queryStringParameters.deviceid, newConfig);
        }
        var cmd = await getDisplayConfig(event.queryStringParameters.deviceid);
        if (!cmd) {
            const response = {
                statusCode: 500,
                body: JSON.stringify({debug:event})
            };
            return response;
        }
        if (cmd.description == "Q-PEC") {
            cmd.description == "QPEC";
        }
        if (cmd.timestamp) {
            cmd.remaining = (new Date(cmd.timestamp) - new Date())/1000;
            delete cmd.timestamp;
        }
        const response = {
            statusCode: 200,
            body: JSON.stringify(cmd)
        };
        return response;
    }

    const response = {
        statusCode: 404,
        body: "Not found"
    };
    return response;    
};

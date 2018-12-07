var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'});

const DATABASE_NAME_DEVICE_CONFIG = "BadgeData";

const EVENTS = {
    'ERROR': '2000-00-00T00:00:00.000Z',
    'Christmas': '2018-12-25T00:00:00.000Z',
    'Summit': '2019-01-07T13:30:00.000Z',
    'Synergy': '2019-05-21T13:00:00.000Z',
    'Q-PEC': '2019-02-04T19:00:00.000Z'
};

var resourcegroupstaggingapi = new AWS.ResourceGroupsTaggingAPI();
var dynamodb = new AWS.DynamoDB();

function setEventTag(eventName, callback) {
    var params = {
        ResourceARNList: [process.env.MY_ARN],
        Tags: { 'MyEvent': eventName } /* required */
    };
    resourcegroupstaggingapi.tagResources(params, callback);
}

function setTextTag(eventName, callback) {
    var params = {
        ResourceARNList: [process.env.MY_ARN],
        Tags: { 'MyText': eventName } /* required */
    };
    resourcegroupstaggingapi.tagResources(params, callback);
}

function getEventTag(callback) {
    var params = {
        Key: 'MyEvent'
    };
    resourcegroupstaggingapi.getTagValues(params, callback);    
}

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

function getTextTag(callback) {
    var params = {
        Key: 'MyText'
    };
    resourcegroupstaggingapi.getTagValues(params, callback);    
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

function handleIntentRequest(event) {
    switch (event.request.intent.name) {
    case "CountDownIntent":
        var eventName = undefined;
        var slots = event.request.intent.slots;
        if (slots["event"]) {
            var slot = slots["event"];
            if (slot.resolutions && slot.resolutions.resolutionsPerAuthority) {
                if (slot.resolutions.resolutionsPerAuthority.length > 0) {
                    var auth = slot.resolutions.resolutionsPerAuthority[0];
                    if (auth.values && (auth.values.length > 0)) {
                        if (auth.values[0].value && auth.values[0].value.name) {
                            eventName = auth.values[0].value.name;
                        }
                    }
                }
            }
        }
        if (eventName) {
            return new Promise(resolve => {
                setEventTag(eventName, function(err, data) {
                    if (err) {
                        console.log(err, err.stack);
                        resolve(say(err));
                    }
                    else {
                        console.log(data);
                        resolve(say("OK, The Bauble will start counting down to " + eventName + " within the next minute."));
                    }
                });
            });
        }
        else {
            return say("Sorry, I couldn't determine which event you want me count down to.");
        }
    }
    return say("Oops!");
}

function getEventName() {
    return new Promise(resolve => {
        getEventTag(function (err, data) {
            if (err) {
                console.log(err, err.stack);
                resolve("ERROR");
                return;
            }
            if (!data || !data.TagValues || (data.TagValues.length == 0)) {
                console.log("Tag value not found");
                resolve("ERROR");
                return;
            }
            resolve(data.TagValues[0]);
        });
    });
}

function getText() {
    return new Promise(resolve => {
        getTextTag(function (err, data) {
            if (err) {
                console.log(err, err.stack);
                resolve("ERROR");
                return;
            }
            if (!data || !data.TagValues || (data.TagValues.length == 0)) {
                console.log("Tag value not found");
                resolve("ERROR");
                return;
            }
            resolve(data.TagValues[0]);
        });
    });
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
        var cmd = await getDisplayConfig(event.queryStringParameters.deviceid);
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

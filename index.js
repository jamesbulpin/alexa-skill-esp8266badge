var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'});

const EVENTS = {
    'ERROR': '2000-00-00T00:00:00.000Z',
    'Christmas': '2018-12-25T00:00:00.000Z',
    'Summit': '2019-01-07T13:30:00.000Z',
    'Synergy': '2019-05-21T13:00:00.000Z'
};

var resourcegroupstaggingapi = new AWS.ResourceGroupsTaggingAPI();

function setEventTag(eventName, callback) {
    var params = {
        ResourceARNList: ['<my lambda ARN>'],
        Tags: { 'MyEvent': eventName } /* required */
    };
    resourcegroupstaggingapi.tagResources(params, callback);
}

function getEventTag(callback) {
    var params = {
        Key: 'MyEvent'
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

exports.handler = async (event) => {
    
    if (event && event.request && event.request.type) {
        switch (event.request.type) {
        case "IntentRequest":
            return await handleIntentRequest(event);
            break;
        }
    }

    var eventName = await getEventName();    
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            "description":eventName,
            "remaining":(new Date(EVENTS[eventName]) - new Date())/1000
        })
    };    
    return response;
};

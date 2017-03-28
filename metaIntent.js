// metaIntent.js
var superagent = require('superagent');
var querystring = require('querystring');

L_APPID = process.env.LUIS_APP_ID;
L_APPKEY = process.env.LUIS_APP_KEY; // Subscription.

Q_APPID = process.env.QNA_APP_ID;
Q_APPKEY = process.env.QNA_APP_KEY; // Subscription.

function processText(text, callback) {

    processTextLuis(text, function(err, result) {
        if (err) {
            callback(err);
        } else if (result) {
            callback(null, result);
        } else {
            processTextQnA(text, callback);
        }
    });
}

function processTextQnA(text, callback) {
    var kbID = Q_APPID;
    var url = 'https://westus.api.cognitive.microsoft.com/qnamaker/v1.0' +
        '/knowledgebases/' + kbID + '/generateAnswer';

    var jsonBody = {'question': text};
    superagent
        .post(url)
        .set('Ocp-Apim-Subscription-Key', Q_APPKEY)
        .send(jsonBody)
        .end(function(err, response) {
            if (err) {
                return callback(err);
            }
            var result = null;
            if (response.body && response.body.score && response.body.score > 80) {
                result = {
                    'qnaResponse': response.body.answer
                };
            }

            callback(null, result);
        });
}

function processTextLuis(text, callback) {

    var url = 'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/' + L_APPID +
        '?subscription-key=' + L_APPKEY  + '&timezoneOffset=0.0&verbose=true&q=' +
        querystring.escape(text);

    superagent
        .get(url)
        .end(function(err, result) {
            if (err) {
                return callback(err);
            }
            var data = result.body;
            var result = null;

            if (data.intents && data.intents.length > 1) {
                var bestIntent = data.intents[0];
                if (bestIntent.score > 0.8 && bestIntent.intent !== 'None' && data.intents[1].score < 0.3) {
                    result = bestIntent;
                }
            }
            callback(null, result);
        });

}

module.exports.process = processText;

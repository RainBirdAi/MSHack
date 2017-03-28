var restify = require('restify');
var builder = require('botbuilder');
var api = require('yolapi');

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var bot = new builder.UniversalBot(connector);
//bot.set('persistConversationData', true);

//Speaks map locally
//var yolandaSession = new api.session('http://127.0.0.1:3003',
//    'eb09d81c-88de-4dae-93fe-b5be5c418465',
//    '7a60433a-6a4d-4ea8-97e1-7d67c22ba42d'
//);

//Hamilton staging
//var yolandaSession = new api.session('https://staging-api.rainbird.ai',
//    'be632a88-033f-482c-9ff7-66ea6d94db07',
//    '2d875e8c-621d-419e-b414-48ca11834784'
//);



//Hamilton local
//var yolandaSession = new api.session('http://127.0.0.1:3003',
//    'eb09d81c-88de-4dae-93fe-b5be5c418465',
//    'f1055530-7329-40b8-88fd-c44d47c2db5d'
//);


//Hamilton Azure
//var yolandaSession = new api.session('http://127.0.0.1:3003',
//    'eb09d81c-88de-4dae-93fe-b5be5c418465',
//    'f1055530-7329-40b8-88fd-c44d47c2db5d'
//);

//Hamilton App
var yolandaSession = new api.session('https://api.rainbird.ai',
    'e162861e-3fb6-4046-b822-7b6277c9df72',
    '05a6f605-ac0e-4124-b169-15763398be41'
);

//var yolandaQuery = { subject: 'Will', relationship: 'speaks', object: null };
var yolandaQuery = { subject: 'the customer', relationship: 'recommended', object: null };

server.post('/api/messages', connector.listen());

function startYolandaSession(cb){
    yolandaSession.start(function (err){
        if (err){
            return cb('Error calling start..' + err);
        }

        yolandaSession.query(yolandaQuery, function(err, response) {
            if (err) {
                return cb('Error running query..' + err);
            }

            console.log('In start yolanda session');
            cb (null, response);
        });
    });
}

function hasValue(item) {
    return item || item === 0 || item === false;
}

function yolandaResponse(session, answer, cb){
    var rbQuestion = session.privateConversationData.yolandaResponse.question;
    var preparedAnswer = {
        subject: rbQuestion.subject ? rbQuestion.subject : answer,
        relationship: session.privateConversationData.yolandaResponse.question.relationship,
        object: hasValue(rbQuestion.object) ? rbQuestion.object : answer,
        certainty: 100
    };

    yolandaSession.respond({ answers: [ preparedAnswer ] }, function (err, response){
        cb(err, response);
    });
}

bot.dialog('/', [
    function (session, args, next) {
        if (!session.privateConversationData.yolandaSession) {
            session.beginDialog('/start');
        } else {
            session.beginDialog('/rbloop');
            //next();
        }
    }
]);

bot.dialog('/start', [
    function (session) {
        startYolandaSession(function (err, response) {
            if (err) {
                return session.send('Sorry there has been a problem.');
            }

            session.privateConversationData.yolandaSession = yolandaSession.id;
            session.privateConversationData.yolandaResponse = response;
            session.beginDialog('/rbloop');
        });
    }
]);


bot.dialog('/rbloop', [
    function (session) {
        if (!session.privateConversationData.yolandaResponse) {
            session.beginDialog('/');
        } else if (session.privateConversationData.yolandaResponse.question){
            sendRBQuestion(session, session.privateConversationData.yolandaResponse.question);
        } else {
            sendRBResult(session, session.privateConversationData.yolandaResponse.result);
            delete session.privateConversationData.yolandaSession;
            session.endDialog();
        }
    },
    function (session, results) {
        var userAnswer;
        if (results.promptType === 1) { // number
            userAnswer = results.response;
        } else {
            userAnswer = results.response.entity;
        }

        yolandaResponse(session, userAnswer, function (err, response){
            session.privateConversationData.yolandaResponse = response;

            if (!session.privateConversationData.yolandaResponse){
                session.beginDialog('/');
            } else if (session.privateConversationData.yolandaResponse.question){
                session.beginDialog('/rbloop');
            } else {
                sendRBResult(session, session.privateConversationData.yolandaResponse.result);
                delete session.privateConversationData.yolandaSession;
                session.endDialog();
            }

        });
    }
]);

function prepareResponse(response){
    return response.question ? response.question.prompt : JSON.stringify(response.result);
}

function sendRBQuestion(session, rbQuestion) {
    if (rbQuestion.concepts && rbQuestion.concepts.length > 0) {
        var choices = rbQuestion.concepts.map(function(item) {return item.name});
        var styleCode =  builder.ListStyle['button'];
        var config = {'listStyle': styleCode, 'width': '100%'};
        builder.Prompts.choice(session, rbQuestion.prompt, choices, config);
    } else if (rbQuestion.dataType === 'number') {
        builder.Prompts.number(session, rbQuestion.prompt);
    } else {
        throw new Error('Didn\'t know how to ask question!');
    }
}

function sendRBResult(session, rbResult) {
    if (rbResult && rbResult.length > 0) {
        var message = '';
        rbResult.forEach(function(result) {
            message += result.subject + ' ' +result.relationship + ' ' + result.object + ' \t' +
                getEvidenceTreeLink(result.factID) + '\n\n';
        });
        session.send(message);
    } else {
        session.send('Could not find any answers.');
    }
}

function getEvidenceTreeLink (factId){
    return '[Evidence Tree](https://app.rainbird.ai/components/rainbird-analysis-ui/whyAnalysis.html?id=' + factId +
        '?api=https://api.rainbird.ai)';
}

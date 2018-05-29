var restify = require('restify');
var builder = require('botbuilder');
var api = require('yolapi');
var metaIntent = require('./metaIntent');
var azure = require('botbuilder-azure');

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var documentDbOptions = {
    host: process.env.COSMOS_DB_HOST,
    masterKey: process.env.COSMOS_DB_KEY,
    database: 'botdocs',
    collection: 'botdata'
};
var docDbClient = new azure.DocumentDbClient(documentDbOptions);
var cosmosStorage = new azure.AzureBotStorage({ gzipData: false }, docDbClient);

var bot = new builder.UniversalBot(connector);
bot.set('storage', cosmosStorage);

var yolandaSession = new api.session(process.env.RAINBIRD_API_URL,
    process.env.RAINBIRD_API_KEY,
    process.env.RAINBIRD_KMID
);

var yolandaQuery = { subject: process.env.RAINBIRD_QUERY_SUBJECT, relationship: process.env.RAINBIRD_QUERY_RELATIONSHIP,
    object: null };

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

bot.dialog('/', function (session) {
    if (session.message.type === 'message') {
        var text = session.message.text;
        session.sendTyping();
        metaIntent.process(text, function(err, result) {
            if (!result) {
                session.send('Sorry, I didn\'t understand that.  How can I help you?');
            } else if (result.qnaResponse) {
                session.send(result.qnaResponse);
            } else if (result.intent === 'AccountComparison') {
                session.replaceDialog('/prestart');
            }
        });
    }
});

bot.dialog('/prestart', function (session, args, next) {
    if (!session.privateConversationData.yolandaSession) {
        session.replaceDialog('/start');
    } else {
        session.replaceDialog('/rbloop');
    }
});

bot.dialog('/start', function (session) {
    session.sendTyping();
    startYolandaSession(function (err, response) {
        if (err) {
            return session.send('Sorry there has been a problem starting a Rainbird session.');
        }

        session.privateConversationData.yolandaSession = yolandaSession.id;
        session.privateConversationData.yolandaResponse = response;
        session.replaceDialog('/rbloop');
    });
});

bot.dialog('/rbloop', [
    function (session) {
        if (session.privateConversationData.yolandaResponse.question){
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

        session.sendTyping();
        yolandaResponse(session, userAnswer, function (err, response){
            session.privateConversationData.yolandaResponse = response;
            if (session.privateConversationData.yolandaResponse.question){
                session.replaceDialog('/rbloop');
            } else {
                sendRBResult(session, session.privateConversationData.yolandaResponse.result);
                delete session.privateConversationData.yolandaSession;
                session.endDialog();
            }
        });
    }
]).cancelAction('restart', 'No problem, how else can I help you?', {
    matches: /restart/i,
    onSelectAction: function (session, args, next){
        delete session.privateConversationData.yolandaSession;
        next();
    }
});

//Event used to send a welcome message (works with the emulator)
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, '/welcome');
            }
        });
    }
});

//Skype event used to send a welcome message
bot.on('contactRelationUpdate', function (message) {
    if (message.action === 'add') {
        var name = message.user ? message.user.name : null;
        var reply = new builder.Message()
            .address(message.address)
            .text("Hello %s.  Thanks for adding me, how can I help you?", name || 'there');
        bot.send(reply);
    }
});

bot.dialog('/welcome', function (session) {
    session.send('Welcome, how can I help you?');
    session.endDialog();
});

function sendRBQuestion(session, rbQuestion) {
    if (rbQuestion.concepts && rbQuestion.concepts.length > 0) {
        var choices = rbQuestion.concepts.map(function(item) {return item.name});
        builder.Prompts.choice(session, rbQuestion.prompt, choices, { 'listStyle': builder.ListStyle['button'] });
    } else if (rbQuestion.dataType === 'number') {
        builder.Prompts.number(session, rbQuestion.prompt);
    } else if (rbQuestion.dataType === 'date') {
        builder.Prompts.time(session, rbQuestion.prompt);
    }
}

function sendRBResult(session, rbResult) {
    if (rbResult && rbResult.length > 0) {
        var message = '';
        rbResult.forEach(function(result) {
            message += result.object + ' \t' +
                getEvidenceTreeLink(result.factID) + '\n\n';
            result.objectMetadata.en && result.objectMetadata.en.map((metadata) => {
               message += `${metadata.data}\n`;
            });
        });
        session.send(message);
    } else {
        session.send('Could not find any answers.');
    }
}

function getEvidenceTreeLink (factId){
    return '[(?)](' + process.env.RAINBIRD_EVIDENCE_TREE_HOST + '/applications/components/rainbird-analysis-ui/whyAnalysis.html?' +
        'id=' + factId + '?api=' + process.env.RAINBIRD_API_URL + ')';
}

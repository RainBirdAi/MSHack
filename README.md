# Rainbird Chatbot built using the Microsoft Bot Builder Framework

During a Microsoft Hack-a-thon (March 2017), we created a demo Chatbot using Rainbird and the Microsoft Bot Framework.
The bot was deployed in Azure and we were able to easily connect it to a number of channels such as Skype and Slack.

Interactions with the bot combined Rainbird with Microsoft Cognitive Services APIs such as the QnA Maker and LUIS 
(language understanding intelligent service).

We invented a scenario around a banking bot that could answer general questions via QnAMaker and run a more in-depth 
‘consultation’ via Rainbird (having identified the need with a LUIS intent).

The BotConnector’s Dialog system made it very simple to implement this ‘triage’ handling: If LUIS indicated the Rainbird
 intent, we started the Rainbird interaction, If not we checked Q&AMaker for an answer - finally falling back to a basic
  ‘Sorry, I didn’t understand’ as a last resort.  

Both of these integrations went very smoothly, thanks to the simple REST style interfaces to the LUIS and QnAMaker 
services.

### Implementation

The Rainbird API uses the following pattern:

/start - authenticates the user, begins a new inference session and returns a session id.

/query - introduces the actual problem to be solved.

At this point the response will probably contain a question to be answered by the user. 

/respond - accepts the user answer and returns either the next question or the final results.

If the Rainbird knowledge map asks a series of questions, the calling code is effectively in a loop around displaying a 
question, collecting the user’s answer, sending it via /respond and then displaying the next question.

The key implementation point between the bot framework and Rainbird was a waterfall dialog with two steps:

Step 1 - Translate the Rainbird question into the correct built-in prompt. We packaged up this translation, which was 
as simple as:

```
function sendRBQuestion(session, rbQuestion) {
   if (rbQuestion.concepts && rbQuestion.concepts.length > 0) {
       var choices = rbQuestion.concepts.map(function(item) {return item.name});
       builder.Prompts.choice(session, rbQuestion.prompt, choices, {'listStyle': buttonList});
   } else if (rbQuestion.dataType === 'number') {
       builder.Prompts.number(session, rbQuestion.prompt);
   } else if (rbQuestion.dataType === 'date') {
       builder.Prompts.time(session, rbQuestion.prompt);
   }
}
```

Step 2 - Take the user’s response to the prompt, package it up as a Rainbird answer and call /respond.

If the response contains answers, we display them and end the dialog.
If the response contains another question, we go back to step 1.

### Bot Hosting/Configuration

During the Hack-a-thon, we deployed the bot to Azure in a new web-app instance (from the Web/Mobile menu in the portal)
 using the default resource configuration.  We added an automated deployment method using a local Git repository on the 
 new instance.

At this point the bot was registered on the bot framework website, with a Microsoft App ID being generated.

### Required Environment Variables

The following environment variables were added to the Azure instance in order to start the first deployment following
a git push to the remote repository on the Azure instance:

| Variable Name | Description |
| --- | --- |
| MICROSOFT_APP_ID | Created during Bot registration at https://dev.botframework.com/bots/new | 
| MICROSOFT_APP_PASSWORD | " |
| RAINBIRD_EVIDENCE_TREE_HOST | Rainbird host used to in Evidence Tree links | 
| RAINBIRD_API_URL | Rainbird API URL | 
| RAINBIRD_API_KEY | Rainbird API key |
| RAINBIRD_KMID | Rainbird knowledge map ID |
| RAINBIRD_QUERY_SUBJECT | Subject value of Rainbird query |
| RAINBIRD_QUERY_RELATIONSHIP | Relationship used in the Rainbird query |
| COSMOS_DB_HOST | Used for conversation storage, details in Azure |
| COSMOS_DB_KEY | Used for conversation storage, details in Azure |
| LUIS_APP_ID | --- |
| LUIS_APP_KEY | --- |
| QNA_APP_ID | --- |
| QNA_APP_KEY | --- |

### Connecting the Bot to the various channels
 
Within the bot framework portal, we found that the bot was immediately available for testing with Skype and from within 
a web chat interface.  We also chose to add the Bot to Slack as an additional channel and following the configuration 
steps within the Bot Framework and Slack portals, we were quickly able to add the bot to Slack as an 'app' and open a 
direct message in order to interact with it.
 
### Welcome messages

We wanted to add a welcome message to the bot so that you didn't need to enter something before it would interact
with you.  This required a separate implementation for Skype.  There isn't currently an event which can be used to 
support this with the Slack channel.

### Ability to 'start over'

During an interaction, we added the ability to start over.  This is possible by entering: 'restart'.

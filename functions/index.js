const functions = require("firebase-functions");
require('dotenv').config();

//initialize app in firebase
const admin = require('firebase-admin')
admin.initializeApp();

//reference to the db
const dbRef = admin.firestore().doc('tokens/demo');

//twitter API
const TwitterApi = require('twitter-api-v2').default;

//instantiate using the Client Id for the OAuth 2.0
const twitterClient = new TwitterApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET
});

const callbackUrl = 'http://127.0.0.1:5000/tweet-bot-9b6f3/us-central1/callback'


//OpenAI api

const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
    organization: process.env.OPEN_AI_ORG,
    apiKey: process.env.OPEN_AI_KEY
});
const openai = new OpenAIApi(configuration);




// Auth URL
exports.auth = functions.https.onRequest(async (request, response) => {
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
        callbackUrl,
        { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
    );

    // store verifier
    await dbRef.set({ codeVerifier, state });

    response.redirect(url);
});


//Callback url and function for the Auth endpoint
exports.callback = functions.https.onRequest(async (request, response) => {
    //store the data from the url. in this case state and code
    const { state, code } = request.query;

    //get an instance of the db doc
    const dbSnapshot = await dbRef.get();

    //store in constant the code verifier and the state to verify it later
    const { codeVerifier, state: storedState } = dbSnapshot.data();

    //verify the state, if its not the same as in the db, it will return an error
    if (state !== storedState) {
        return response.status(400).send("Stored tokens do not match");
    }

    //if its the same, it will log in with OAuth2.0
    const {
        client: loggedClient,
        accessToken,
        refreshToken
    } = await twitterClient.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri: callbackUrl,
    });

    //update the database
    await dbRef.set({ accessToken, refreshToken });

    //response 200 to tell you everything is ok :)
    response.sendStatus(200);

});


//Tweet function API
exports.tweet = functions.https.onRequest(async (request, response) => {

    //The refresh token is for offline or sleeping user. 
    const { refreshToken } = (await dbRef.get()).data();

    //update the client with new refresh token, which changes every certain amount of time. OAuth2.0 stuff
    const {
        client: refreshedClient,
        accessToken,
        refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);

    //update database with new token
    await dbRef.set({ accessToken, refreshToken: newRefreshToken });

    //prompt the AI openAi to tweet something and store it in newTweet
    const newTweet = await openai.createCompletion('text-davinci-001', {
        prompt: 'tweet something about #ducks',
        max_tokens: 64,
    })


    //Calls the twitter api to tweet the tweet.
    const { data } = await refreshedClient.v2.tweet(
        newTweet.data.choices[0].text
    )

    //respond the data of the tweet and user.
    response.send(data);


});
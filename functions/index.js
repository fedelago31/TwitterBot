const functions = require("firebase-functions");
require('dotenv').config();

//initialize app
const admin = require('firebase-admin')
admin.initializeApp();

//reference to the db
const dbRef = admin.firestore().doc('tokens/demo');

//twitter API
const TwitterApi = require('twitter-api-v2').default;

//instantiate using the Client Id for the OAuth 2.0
const twitterClient = new TwitterApi({
    clientId: 'c1BWNzh1YmduYW1lZDR6azMySzU6MTpjaQ',
    clientSecret: 'ulOfTfq5BkIgiTZ4uD55NhATUc6MPxrEq25QbI2diujkFTkw83'
    // clientId: process.env.CLIENT_ID,
    // clientSecret: process.env.CLIENT_SECRET
});

const callbackUrl = 'http://127.0.0.1:5000/tweet-bot-9b6f3/us-central1/callback'


//OpenAI api

const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
    organization: 'org-WbCZY2VQzvINioIUwv452CjV',
    apiKey: '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'
});
const openai = new OpenAIApi(configuration);




// STEP 1 - Auth URL
exports.auth = functions.https.onRequest(async (request, response) => {
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
        callbackUrl,
        { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
    );

    // store verifier
    await dbRef.set({ codeVerifier, state });

    response.redirect(url);
});


exports.callback = functions.https.onRequest(async (request, response) => {
    const { state, code } = request.query;

    const dbSnapshot = await dbRef.get();

    const { codeVerifier, state: storedState } = dbSnapshot.data();

    if (state !== storedState) {
        return response.status(400).send("Stored tokens do not match");
    }

    const {
        client: loggedClient,
        accessToken,
        refreshToken
    } = await twitterClient.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri: callbackUrl,
    });

    await dbRef.set({ accessToken, refreshToken });

    response.sendStatus(200);

});

exports.tweet = functions.https.onRequest(async (request, response) => {
    const { refreshToken } = (await dbRef.get()).data();

    const {
        client: refreshedClient,
        accessToken,
        refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);

    await dbRef.set({ accessToken, refreshToken: newRefreshToken });

    const newTweet = await openai.createCompletion('text-davinci-001', {
        prompt: 'tweet something about #ducks',
        max_tokens: 64,
    })

    const { data } = await refreshedClient.v2.tweet(
        newTweet.data.choices[0].text
    )

    response.send(data);


});
const admin = require("firebase-admin");

/*
=================================
FIREBASE ADMIN INIT
=================================
*/

try {

  if (!admin.apps.length) {

    admin.initializeApp({

      credential: admin.credential.cert({

        projectId: process.env.FIREBASE_PROJECT_ID,

        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,

        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),

      }),

    });

    console.log("✅ Firebase Admin initialized");

  }

} catch (error) {

  console.error(
    "❌ Firebase Admin initialization failed:",
    error.message
  );

}

/*
=================================
SEND PUSH NOTIFICATION
=================================
*/

const sendPushNotification = async (tokens, payload) => {

  if (!tokens || tokens.length === 0) return;

  const message = {

    notification: {
      title: payload.title,
      body: payload.body,
    },

    data: payload.data || {},

    tokens,

  };

  try {

    const response =
      await admin.messaging().sendEachForMulticast(message);

    console.log(
      `✅ Successfully sent ${response.successCount} messages`
    );

    /*
    =================================
    FAILED TOKENS
    =================================
    */

    if (response.failureCount > 0) {

      const failedTokens = [];

      response.responses.forEach((resp, idx) => {

        if (!resp.success) {

          failedTokens.push(tokens[idx]);

        }

      });

      console.log("❌ Failed tokens:", failedTokens);

    }

  } catch (error) {

    console.error(
      "❌ Error sending push notification:",
      error
    );

  }

};

module.exports = {
  admin,
  sendPushNotification,
};
const admin = require("firebase-admin");

/*
=================================
FIREBASE ADMIN INIT
=================================
*/

try {

  if (!admin.apps.length) {

    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });


    

    console.log("✅ Firebase Admin initialized");
  }

} catch (error) {

  console.error(
    "❌ Firebase Admin initialization failed:",
    error
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

  // Opt-in, additive only — every existing call site that doesn't pass
  // `payload.urgent` keeps sending exactly the message shape it always has.
  // Used for incoming-call pushes (see pushService.js's notifyIncomingCall),
  // where FCM's default priority isn't reliably fast/high-priority enough to
  // wake a backgrounded/Doze-throttled Android device or a backgrounded iOS
  // app in time for the call to still be ringing when it arrives.
  if (payload.urgent) {
    message.android = {
      ...message.android,
      priority: "high",
    };
    message.apns = {
      ...message.apns,
      headers: {
        ...message.apns?.headers,
        "apns-priority": "10",
        "apns-push-type": "alert",
      },
    };
  }

  // Grouping/collapsing — without this, every push (e.g. several chat
  // messages from the same person in a row) lands as its own separate
  // notification banner and stacks up in the shade. Giving repeat
  // notifications from the same source a shared `tag` makes a new one
  // *replace* the previous one on Android instead of piling up; the APNs
  // `apns-collapse-id` header is iOS's equivalent (64-byte limit — Mongo
  // ObjectId-based tags comfortably fit). `payload.tag` is opt-in per call
  // site (see pushService.js) so this only groups where it actually makes
  // sense (e.g. per sender), not indiscriminately across unrelated pushes.
  if (payload.tag) {
    // Merged with (not overwriting) whatever payload.urgent may have already
    // set above — a tagged *and* urgent push (not used today, but a plain
    // reassignment here would silently drop the urgent priority/headers set
    // above if one ever is) needs both to survive.
    message.android = {
      ...message.android,
      notification: { ...message.android?.notification, tag: payload.tag },
    };
    message.apns = {
      ...message.apns,
      headers: { ...message.apns?.headers, "apns-collapse-id": payload.tag.slice(0, 64) },
    };
  }

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

    console.log(
      `❌ Token Failed: ${tokens[idx]}`
    );

    console.log(
      "Reason:",
      resp.error?.code,
      resp.error?.message
    );
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

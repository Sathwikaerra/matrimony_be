// services/chatStreakService.js
// Snapchat-style "both people messaged today" streak, plus running
// interaction milestones, per conversation pair. Deliberately has no cron
// job: a streak's displayed value is computed lazily at read time
// (getDisplayStreak) from `streakUpdatedDate`, so a lapsed streak just
// reads as 0 the next time anyone asks — it doesn't need to be swept.
const ChatStreak = require('../models/ChatStreak');
const { orderedPair } = require('../utils/chatPair');

// Chosen to feel reachable early (day 3) and still mean something much
// later (day 100) without an overwhelming number of banners in between.
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];
// Total combined messages in the conversation (both directions) — a
// simple, always-climbing number that doesn't reset the way a streak can.
const MESSAGE_MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000];

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

// A stored `streak` value only still counts if the pair last completed a
// "both messaged" day either today or yesterday — two days quiet and it's
// dead, even though the row still remembers the old number (kept around
// rather than zeroed out, in case that's ever wanted for stats).
function getDisplayStreak(doc) {
    if (!doc || !doc.streak) return 0;
    if (doc.streakUpdatedDate === todayStr() || doc.streakUpdatedDate === yesterdayStr()) {
        return doc.streak;
    }
    return 0;
}

// Called once per successfully sent message (text or media). Returns the
// pair's fresh streak/message-count state plus any milestones newly
// crossed by *this* message, so the caller can decide whether to tell
// both sides about it.
async function recordMessage(senderId, receiverId) {
    const { userA, userB } = orderedPair(senderId, receiverId);
    const senderIsA = senderId.toString() === userA;
    const today = todayStr();

    let doc = await ChatStreak.findOne({ userA, userB });
    if (!doc) {
        doc = new ChatStreak({ userA, userB });
    }

    doc.totalMessages = (doc.totalMessages || 0) + 1;
    const messagesMilestone = MESSAGE_MILESTONES.includes(doc.totalMessages) ? doc.totalMessages : null;

    if (senderIsA) doc.lastDateA = today;
    else doc.lastDateB = today;

    let streakMilestone = null;
    // Only bump the streak once per day, the first time *both* sides have
    // a message logged today — whichever of the two sends last is the one
    // whose send actually completes the day.
    if (doc.lastDateA === today && doc.lastDateB === today && doc.streakUpdatedDate !== today) {
        doc.streak = doc.streakUpdatedDate === yesterdayStr() ? (doc.streak || 0) + 1 : 1;
        doc.streakUpdatedDate = today;
        if (STREAK_MILESTONES.includes(doc.streak)) streakMilestone = doc.streak;
    }

    await doc.save();

    const milestones = [];
    if (messagesMilestone) milestones.push({ type: 'messages', value: messagesMilestone });
    if (streakMilestone) milestones.push({ type: 'streak', value: streakMilestone });

    return { streak: doc.streak, totalMessages: doc.totalMessages, milestones };
}

// Read-only fetch for chatSettingsController's getChatSettings — the
// streak badge shown in a chat header.
async function getStreakInfo(userId, otherUserId) {
    const { userA, userB } = orderedPair(userId, otherUserId);
    const doc = await ChatStreak.findOne({ userA, userB }).select('streak streakUpdatedDate totalMessages');
    return {
        streak: getDisplayStreak(doc),
        totalMessages: doc?.totalMessages || 0,
    };
}

module.exports = { recordMessage, getStreakInfo, STREAK_MILESTONES, MESSAGE_MILESTONES };

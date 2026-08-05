// utils/storyHighlights.js
// A story that survives 12h without being manually deleted gets promoted
// into the user's permanent "highlights": isHighlight flips true and
// expiresAt is cleared so the TTL index (models/Story.js) stops tracking it
// — it simply stops being deleted, no separate collection needed.
const Story = require('../models/Story');

const HIGHLIGHT_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

const promoteEligibleStories = async () => {
  try {
    const cutoff = new Date(Date.now() - HIGHLIGHT_AFTER_MS);
    const result = await Story.updateMany(
      { isHighlight: false, createdAt: { $lte: cutoff } },
      { $set: { isHighlight: true, expiresAt: null } }
    );
    if (result.modifiedCount > 0) {
      console.log(`⭐ Promoted ${result.modifiedCount} stor${result.modifiedCount === 1 ? 'y' : 'ies'} to highlights`);
    }
  } catch (err) {
    console.error('❌ Highlight promotion failed:', err.message);
  }
};

const startHighlightPromotion = () => {
  const INTERVAL_MS = 15 * 60 * 1000; // check every 15 minutes

  console.log('⭐ Highlight promotion job started');
  setInterval(promoteEligibleStories, INTERVAL_MS);

  promoteEligibleStories(); // run once on startup too, in case the server was down
};

module.exports = { startHighlightPromotion, promoteEligibleStories };

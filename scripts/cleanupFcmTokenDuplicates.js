// scripts/cleanupFcmTokenDuplicates.js
//
// One-off migration helper for the FCMToken schema change (unique index
// moved from {userId, token} to {token} alone — see models/FCMToken.js).
//
// Before that change, the same physical FCM token could end up saved under
// multiple userIds (whoever logged into a shared browser over time), which
// is exactly what was causing notifications meant for one user to show up
// for others. This script finds any `token` value that appears more than
// once, keeps only the most-recently-updated row (the current rightful
// owner), and removes the rest — so the new unique index on `token` can
// actually build.
//
// Safe by default: running it with no flags only REPORTS what it would do.
// Nothing is deleted until you pass --apply.
//
// Usage:
//   node scripts/cleanupFcmTokenDuplicates.js            (dry run — report only)
//   node scripts/cleanupFcmTokenDuplicates.js --apply     (actually delete)

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const FCMToken = require('../models/FCMToken');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected');
  console.log(APPLY ? '⚠️  Running in APPLY mode — duplicates will be deleted.' : 'ℹ️  Running in DRY-RUN mode — nothing will be deleted. Pass --apply to actually clean up.');
  console.log('');

  // Group by token, find any group with more than one row.
  const duplicateGroups = await FCMToken.aggregate([
    {
      $group: {
        _id: '$token',
        count: { $sum: 1 },
        docs: {
          $push: { id: '$_id', userId: '$userId', updatedAt: '$updatedAt' },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicate tokens found. The unique index on `token` can build cleanly as-is.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${duplicateGroups.length} token(s) shared across multiple users:\n`);

  let totalToDelete = 0;
  const idsToDelete = [];

  for (const group of duplicateGroups) {
    // Keep the most recently updated row (the account that most recently
    // logged in and claimed this device) — remove the rest.
    const sorted = [...group.docs].sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
    const keep = sorted[0];
    const remove = sorted.slice(1);

    console.log(`Token ...${group._id.slice(-12)}  (${group.count} rows)`);
    console.log(`  keep   → userId ${keep.userId}  (updated ${keep.updatedAt})`);
    remove.forEach((r) => {
      console.log(`  remove → userId ${r.userId}  (updated ${r.updatedAt})`);
      idsToDelete.push(r.id);
    });
    console.log('');

    totalToDelete += remove.length;
  }

  console.log(`Summary: ${totalToDelete} stale row(s) across ${duplicateGroups.length} token(s).`);

  if (APPLY) {
    const result = await FCMToken.deleteMany({ _id: { $in: idsToDelete } });
    console.log(`🗑️  Deleted ${result.deletedCount} stale row(s).`);
  } else {
    console.log('\nNothing deleted (dry run). Re-run with --apply to remove the rows listed above.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Cleanup script failed:', err);
  process.exit(1);
});

// samplePost.js
// Seeds sample HomePoster documents (see models/HomePoster.js) — slides for
// the mobile Home screen's red-zone hero carousel. Same structure as
// sampleData.js (connect, define an array, insert one by one, exit), just a
// much smaller dataset since this is a handful of admin-curated posters,
// not hundreds of user profiles.

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const HomePoster = require("./models/HomePoster");
const User = require("./models/User");

dotenv.config();

// ========================
// CONNECT DATABASE
// ========================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB Connected");
  })
  .catch((err) => {
    console.log(err);
  });

// ========================
// POSTERS ARRAY
// ========================
// imageUrl values are placeholder Unsplash photos — same convention
// sampleData.js already uses for sample user photos. Swap these for real
// photo URLs (or re-upload through Admin → Home Posters) whenever actual
// content is ready; `order` just controls carousel sequence, lower first.
const posters = [
  {
    imageUrl: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&auto=format&fit=crop&q=80",
    quote: "Every love story is beautiful, but yours is about to begin.",
    order: 0,
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1529636798458-92182e662485?w=800&auto=format&fit=crop&q=80",
    quote: "Two hearts, one journey — find yours here.",
    order: 1,
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=800&auto=format&fit=crop&q=80",
    quote: "Forever starts with a single conversation.",
    order: 2,
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=800&auto=format&fit=crop&q=80",
    quote: "Some journeys are best taken together.",
    order: 3,
  },
];

// ========================
// INSERT POSTERS ONE BY ONE
// ========================
const insertPosters = async () => {
  try {
    // HomePoster.createdBy is required (matches Announcement's own
    // createdBy convention) — attributed to whichever admin account exists
    // first, same as how an admin would actually create these through the
    // app. Fails loudly (not a silent skip) if there's no admin yet, since
    // that's a real setup gap worth knowing about rather than masking.
    const admin = await User.findOne({ role: "admin" });
    if (!admin) {
      console.log("❌ No admin user found — create one first, then re-run this seed.");
      process.exit(1);
    }

    for (const posterData of posters) {
      const poster = await HomePoster.create({
        ...posterData,
        createdBy: admin._id,
      });
      console.log(`✅ Poster inserted: "${poster.quote}"`);
    }

    console.log("================================");
    console.log("✅ All Home Posters Inserted");
    console.log("================================");

    process.exit();
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

insertPosters();

// models/Survey.js
//
// Onboarding matrimony survey — self details + partner preferences, filled
// out as a 6-step wizard (see controllers/surveyController.js). Kept as its
// own collection rather than embedded on User: User is fetched constantly
// across the app (feed, profile drawer, connections...) and this adds a lot
// of optional fields that most of those call sites don't need.
//
// Deliberately does NOT duplicate fields Profile.jsx/authController's
// updateProfile already own — religion, motherTongue, maritalStatus,
// education, occupation, city, state, dateOfBirth, gender. Those stay read
// directly off User; this only holds what the survey newly introduces.
const mongoose = require('mongoose');

const RAASI_VALUES = [
    'Mesham', 'Rishabam', 'Mithunam', 'Kadagam', 'Simham', 'Kanni',
    'Thulam', 'Vrichigam', 'Dhanusu', 'Magaram', 'Kumbam', 'Meenam',
];

const NAKSHATRA_VALUES = [
    'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
    'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
    'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
    'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
    'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

const surveySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },

    // Furthest step reached, 0-indexed — "resume here" on next visit.
    // Never decreases (see surveyController.saveStep).
    currentStep: {
        type: Number,
        default: 0,
    },
    completed: {
        type: Boolean,
        default: false,
    },
    completedAt: Date,

    // ── Step 0: personal / physical ──────────────────────────────────────
    personal: {
        heightCm: Number,
        weightKg: Number,
        bodyType: { type: String, enum: ['slim', 'average', 'athletic', 'heavy'] },
        complexion: { type: String, enum: ['fair', 'wheatish', 'dark'] },
        physicalStatus: { type: String, enum: ['normal', 'physically_challenged'] },
        diet: { type: String, enum: ['vegetarian', 'non_vegetarian', 'eggetarian', 'vegan'] },
        drinkingHabit: { type: String, enum: ['no', 'occasionally', 'yes'] },
        smokingHabit: { type: String, enum: ['no', 'occasionally', 'yes'] },
    },

    // ── Step 1: religious / astrological ─────────────────────────────────
    religious: {
        caste: String,
        subCaste: String,
        gothram: String,
        raasi: { type: String, enum: RAASI_VALUES },
        nakshatra: { type: String, enum: NAKSHATRA_VALUES },
        dosham: { type: String, enum: ['none', 'manglik', 'chevvai', 'not_sure'], default: 'not_sure' },
    },

    // ── Step 2: education / career ────────────────────────────────────────
    career: {
        employedIn: { type: String, enum: ['private', 'government', 'business', 'not_working', 'defence'] },
        annualIncome: { type: String, enum: ['below_2l', '2_5l', '5_10l', '10_20l', '20_50l', 'above_50l'] },
        workLocation: String,
    },

    // ── Step 3: family ──────────────────────────────────────────────────
    family: {
        familyType: { type: String, enum: ['nuclear', 'joint'] },
        familyStatus: { type: String, enum: ['middle_class', 'upper_middle_class', 'rich', 'affluent'] },
        familyValues: { type: String, enum: ['orthodox', 'traditional', 'moderate', 'liberal'] },
        fatherOccupation: String,
        motherOccupation: String,
        brothers: Number,
        sisters: Number,
    },

    // ── Step 4: about ───────────────────────────────────────────────────
    about: {
        aboutMe: { type: String, maxlength: 1000 },
        hobbies: [String],
    },

    // ── Step 5: partner preferences ─────────────────────────────────────
    partnerPreferences: {
        ageRange: { min: Number, max: Number },
        heightRange: { min: Number, max: Number },
        maritalStatus: [String],
        religion: [String],
        caste: [String],
        motherTongue: [String],
        education: [String],
        occupation: [String],
        incomeRange: { min: Number, max: Number },
        locations: [String],
        dietPreference: [String],
        doshamAcceptable: { type: String, enum: ['yes', 'no', 'doesnt_matter'], default: 'doesnt_matter' },
    },
}, { timestamps: true });

const TOTAL_STEPS = 6;
const STEP_KEYS = ['personal', 'religious', 'career', 'family', 'about', 'partnerPreferences'];

module.exports = mongoose.model('Survey', surveySchema);
module.exports.TOTAL_STEPS = TOTAL_STEPS;
module.exports.STEP_KEYS = STEP_KEYS;
module.exports.RAASI_VALUES = RAASI_VALUES;
module.exports.NAKSHATRA_VALUES = NAKSHATRA_VALUES;

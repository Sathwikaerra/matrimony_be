// utils/calculateMatchScore.js
//
// Rewritten to score off real, actually-populated fields — the previous
// version scored `hobbies`/`interests`/`favoriteFoods`/`personalityType`,
// none of which were ever added to the User schema, so it always scored 0
// against real data. Now pulls from User (religion, motherTongue,
// maritalStatus, education, occupation, city, dateOfBirth) plus the
// viewer's own Survey (models/Survey.js) for caste/height/income/etc. and
// their stated partner preferences.
//
// Every factor is skip-if-missing — an incomplete survey on either side
// just contributes 0 for that factor rather than disqualifying the match,
// so results never go empty just because someone hasn't finished onboarding.
//
// Note: raasi/nakshatra/dosham compatibility here is a simple acceptability
// flag (does the target's dosham match what the viewer said they're OK
// with), not real Vedic "porutham" astrological calculation — that's a deep
// domain-specific ruleset intentionally out of scope.

function ageFromDOB(dob) {
    if (!dob) return null;
    const diffMs = Date.now() - new Date(dob).getTime();
    return Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

// Survey.annualIncome is a bucketed enum ('5_10l', ...), but partner
// preferences store a numeric {min, max} range (in lakhs/year) — this maps
// each bucket to a representative midpoint so the two can be range-compared.
const INCOME_BUCKET_MIDPOINT_LAKHS = {
    below_2l: 1, '2_5l': 3.5, '5_10l': 7.5, '10_20l': 15, '20_50l': 35, above_50l: 60,
};

function inRange(value, range) {
    if (value == null || !range) return false;
    const { min, max } = range;
    if (min != null && value < min) return false;
    if (max != null && value > max) return false;
    return true;
}

function inList(value, list) {
    if (!value || !Array.isArray(list) || list.length === 0) return false;
    return list.some((v) => String(v).toLowerCase() === String(value).toLowerCase());
}

// viewerUser/targetUser: Mongoose User docs (or .toObject()'d).
// viewerSurvey/targetSurvey: Survey docs or null (may not exist yet).
const calculateMatchScore = (viewerUser, viewerSurvey, targetUser, targetSurvey) => {
    let score = 0;
    const prefs = viewerSurvey?.partnerPreferences || {};
    const targetPersonal = targetSurvey?.personal || {};
    const targetReligious = targetSurvey?.religious || {};
    const targetCareer = targetSurvey?.career || {};
    const viewerReligious = viewerSurvey?.religious || {};

    // Religion — direct match between the two profiles
    if (viewerUser.religion && viewerUser.religion === targetUser.religion) {
        score += 20;
    }

    // Caste — direct match, plus a bonus if it's explicitly on the viewer's
    // preferred-caste list
    if (viewerReligious.caste && targetReligious.caste
        && viewerReligious.caste.toLowerCase() === targetReligious.caste.toLowerCase()) {
        score += 15;
    }
    if (inList(targetReligious.caste, prefs.caste)) {
        score += 10;
    }

    // Mother tongue
    if (viewerUser.motherTongue && viewerUser.motherTongue === targetUser.motherTongue) {
        score += 10;
    }

    // Age within viewer's preferred range
    const targetAge = ageFromDOB(targetUser.dateOfBirth);
    if (inRange(targetAge, prefs.ageRange)) {
        score += 15;
    }

    // Height within viewer's preferred range
    if (inRange(targetPersonal.heightCm, prefs.heightRange)) {
        score += 10;
    }

    // Marital status in viewer's preferred list
    if (inList(targetUser.maritalStatus, prefs.maritalStatus)) {
        score += 5;
    }

    // Education — direct match or in preferred list
    if (viewerUser.education && viewerUser.education === targetUser.education) {
        score += 10;
    } else if (inList(targetUser.education, prefs.education)) {
        score += 10;
    }

    // Occupation — direct match or in preferred list
    if (viewerUser.occupation && viewerUser.occupation === targetUser.occupation) {
        score += 5;
    } else if (inList(targetUser.occupation, prefs.occupation)) {
        score += 5;
    }

    // Income bracket — compare the target's bucket midpoint against the
    // viewer's numeric preferred range
    const targetIncomeMidpoint = INCOME_BUCKET_MIDPOINT_LAKHS[targetCareer.annualIncome];
    if (targetIncomeMidpoint != null && inRange(targetIncomeMidpoint, prefs.incomeRange)) {
        score += 5;
    }

    // Location — target's city in viewer's preferred locations
    if (inList(targetUser.city, prefs.locations)) {
        score += 10;
    }

    // Diet preference
    if (inList(targetPersonal.diet, prefs.dietPreference)) {
        score += 5;
    }

    // Dosham compatibility — simple acceptability flag, not real porutham
    if (prefs.doshamAcceptable === 'doesnt_matter' || !prefs.doshamAcceptable) {
        score += 5;
    } else if (prefs.doshamAcceptable === 'yes') {
        score += 5;
    } else if (prefs.doshamAcceptable === 'no' && (!targetReligious.dosham || targetReligious.dosham === 'none')) {
        score += 5;
    }

    if (score > 100) score = 100;
    return score;
};

module.exports = calculateMatchScore;

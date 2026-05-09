const calculateMatchScore = (currentUser, targetUser) => {

    let score = 0;

    // Religion
    if (
        currentUser.religion &&
        currentUser.religion === targetUser.religion
    ) {
        score += 20;
    }

    // City
    if (
        currentUser.city &&
        currentUser.city === targetUser.city
    ) {
        score += 15;
    }

    // Mother tongue
    if (
        currentUser.motherTongue &&
        currentUser.motherTongue === targetUser.motherTongue
    ) {
        score += 15;
    }

    // Education
    if (
        currentUser.education &&
        currentUser.education === targetUser.education
    ) {
        score += 10;
    }

    // Occupation
    if (
        currentUser.occupation &&
        currentUser.occupation === targetUser.occupation
    ) {
        score += 10;
    }

    // Hobbies
    const commonHobbies =
        currentUser.hobbies?.filter(h =>
            targetUser.hobbies?.includes(h)
        ) || [];

    score += commonHobbies.length * 5;

    // Interests
    const commonInterests =
        currentUser.interests?.filter(i =>
            targetUser.interests?.includes(i)
        ) || [];

    score += commonInterests.length * 5;

    // Foods
    const commonFoods =
        currentUser.favoriteFoods?.filter(f =>
            targetUser.favoriteFoods?.includes(f)
        ) || [];

    score += commonFoods.length * 2;

    // Personality
    if (
        currentUser.personalityType &&
        currentUser.personalityType === targetUser.personalityType
    ) {
        score += 8;
    }

    // Cap score
    if (score > 100) score = 100;

    return score;
};

module.exports = calculateMatchScore;
// controllers/surveyController.js
const Survey = require('../models/Survey');
const { TOTAL_STEPS, STEP_KEYS } = Survey;

// Form fields arrive as '' for "left blank" (controlled inputs default to
// empty string, not undefined) — but '' isn't a valid member of any of this
// schema's enums, so saving it as-is would throw a Mongoose ValidationError
// on a field the user simply didn't touch. Recursively drops '' / undefined
// (one level of nesting covers every sub-object here — ageRange, etc.);
// arrays and everything else pass through untouched.
function stripEmpty(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
        const cleaned = {};
        for (const [k, v] of Object.entries(value)) {
            if (v === '' || v === undefined) continue;
            cleaned[k] = stripEmpty(v);
        }
        return cleaned;
    }
    return value;
}

// =========================
// GET SURVEY (full document — hydrates the wizard on load/resume)
// =========================
const getSurvey = async (req, res) => {
    try {
        let survey = await Survey.findOne({ user: req.user._id });
        if (!survey) {
            // No doc yet — hand back an empty-shape object rather than 404,
            // so the wizard can render step 0 immediately without a branch
            // for "survey doesn't exist yet".
            return res.status(200).json({
                success: true,
                survey: { currentStep: 0, completed: false, totalSteps: TOTAL_STEPS },
            });
        }
        res.status(200).json({ success: true, survey: { ...survey.toObject(), totalSteps: TOTAL_STEPS } });
    } catch (error) {
        console.error('getSurvey error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET SURVEY STATUS (lightweight — for the reminder banner)
// =========================
const getSurveyStatus = async (req, res) => {
    try {
        const survey = await Survey.findOne({ user: req.user._id }).select('currentStep completed');
        res.status(200).json({
            success: true,
            status: {
                completed: survey?.completed || false,
                currentStep: survey?.currentStep || 0,
                totalSteps: TOTAL_STEPS,
            },
        });
    } catch (error) {
        console.error('getSurveyStatus error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// SAVE STEP (upsert + advance)
// =========================
// PATCH /api/survey/step/:stepIndex — body is that step's fields, merged
// into the matching sub-document. currentStep only ever moves forward
// (Math.max) so going back to edit an earlier, already-passed step and
// re-saving it doesn't push the user's resume point backwards.
const saveStep = async (req, res) => {
    try {
        const stepIndex = Number(req.params.stepIndex);
        if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= TOTAL_STEPS) {
            return res.status(400).json({ success: false, message: 'Invalid step index' });
        }
        const stepKey = STEP_KEYS[stepIndex];

        let survey = await Survey.findOne({ user: req.user._id });
        if (!survey) {
            survey = new Survey({ user: req.user._id });
        }

        survey[stepKey] = { ...(survey[stepKey]?.toObject?.() || survey[stepKey] || {}), ...stripEmpty(req.body) };
        survey.currentStep = Math.max(survey.currentStep || 0, stepIndex + 1);

        const isLastStep = stepIndex === TOTAL_STEPS - 1;
        if (isLastStep && !survey.completed) {
            survey.completed = true;
            survey.completedAt = new Date();
        }

        await survey.save();

        res.status(200).json({
            success: true,
            survey: { ...survey.toObject(), totalSteps: TOTAL_STEPS },
        });
    } catch (error) {
        console.error('saveStep error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSurvey,
    getSurveyStatus,
    saveStep,
};

// routes/surveyRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getSurvey, getSurveyStatus, saveStep } = require('../controllers/surveyController');

// Guard — catches undefined imports before Express does (same pattern as lockerRoutes.js)
[getSurvey, getSurveyStatus, saveStep].forEach((fn, i) => {
    if (typeof fn !== 'function') throw new Error(`surveyController export #${i} is not a function`);
});

// GET   /api/survey            (full document — hydrates the wizard)
router.get('/', protect, getSurvey);

// GET   /api/survey/status     (lightweight — for the reminder banner)
router.get('/status', protect, getSurveyStatus);

// PATCH /api/survey/step/:stepIndex   (save one step's fields + advance)
router.patch('/step/:stepIndex', protect, saveStep);

module.exports = router;

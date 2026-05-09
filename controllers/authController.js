const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const SocketService = require('../services/socketService');
const { notifyProfileViewed } = require('../services/pushService'); // ← ADDED

// =========================
// SIGNUP USER
// =========================
const registerUser = async (req, res) => {
    console.log("hirtttt signup")
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please fill all fields"
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists"
            });
        }

        const user = await User.create({ name, email, password });
        const token = generateToken(user._id);

        SocketService.emitNewUserRegistration(user);

        res.status(201).json({
            success: true,
            message: "Signup Successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// LOGIN USER
// =========================
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please fill all fields"
            });
        }

        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid Email"
            });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid Password"
            });
        }

        const token = generateToken(user._id);

        SocketService.emitUserLogin(user);

        res.status(200).json({
            success: true,
            message: "Login Successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                photos: user.photos,
                city: user.city,
                occupation: user.occupation
            }
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET ALL USERS (with pagination)
// =========================
const getAllUsers = async (req, res) => {
    try {
        const page  = Number(req.query.page)  || 1;
        const limit = Number(req.query.limit) || 5;
        const skip  = (page - 1) * limit;

        const users      = await User.find().skip(skip).limit(limit);
        const totalUsers = await User.countDocuments();

        res.status(200).json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            totalUsers,
            users
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// SEARCH USERS
// =========================
const searchUsers = async (req, res) => {
    try {

        console.log("search hitttt")
        const search = req.query.search || "";

        const users = await User.find({
            $or: [
                { name:  { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ]
        }).limit(5);

        res.status(200).json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET SINGLE PROFILE  ← NEW
// Notifies the profile owner when someone else views their profile
// =========================
const getProfile = async (req, res) => {
    try {
       const { id: profileId } = req.params;  // rename id → profileId inside controller

        console.log("search uer hitttttttttttttt")

        const profile = await User.findById(profileId).select('-password');

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // ── Push notification: tell owner their profile was viewed ──────
        // Only fires when a logged-in user views someone else's profile
        if (req.user && req.user._id.toString() !== profileId) {
            const viewer = await User.findById(req.user._id).select('name');
            if (viewer) {
                notifyProfileViewed(
                    profileId,                  // profile owner to notify
                    viewer.name,                // "X viewed your profile"
                    req.user._id.toString()     // click → go to viewer's profile
                );
            }
        }
        // ────────────────────────────────────────────────────────────────

        res.status(200).json({ success: true, profile });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// UPDATE PROFILE
// =========================
const updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;

        const {
            name, phoneNumber, gender, dateOfBirth,
            religion, motherTongue, maritalStatus,
            education, occupation, city, state
        } = req.body;

        const updated = await User.findByIdAndUpdate(
            userId,
            {
                name, phoneNumber, gender, dateOfBirth,
                religion, motherTongue, maritalStatus,
                education, occupation, city, state
            },
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json({ success: true, user: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// PHOTO MANAGEMENT
// =========================
const { cloudinary } = require('../config/cloudinary');

const uploadPhoto = async (req, res) => {
    try {
        console.log("upload potosss hittt");
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const user = await User.findById(req.user._id);
        user.photos.push(req.file.path);
        await user.save();

        res.status(200).json({ success: true, photos: user.photos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const deletePhoto = async (req, res) => {
    try {
        const { photoUrl } = req.body;
        const user = await User.findById(req.user._id);

        const publicId = photoUrl.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);

        user.photos = user.photos.filter(p => p !== photoUrl);
        await user.save();

        res.status(200).json({ success: true, photos: user.photos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const reorderPhotos = async (req, res) => {
    try {
        const { photos } = req.body;
        const user = await User.findById(req.user._id);
        user.photos = photos;
        await user.save();
        res.status(200).json({ success: true, photos: user.photos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getAllUsers,
    searchUsers,
    getProfile,       // ← NEW — add this to your userRoutes.js too
    updateProfile,
    uploadPhoto,
    deletePhoto,
    reorderPhotos
};
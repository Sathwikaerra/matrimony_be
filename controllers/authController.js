const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const SocketService = require('../services/socketService');
const { notifyProfileViewed } = require('../services/pushService'); // ← ADDED

// =========================
// SIGNUP USER
// =========================
const bcrypt = require("bcryptjs");

const registerUser = async (req, res) => {

    try {

        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please fill all fields"
            });
        }

        // Check existing user
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists"
            });
        }

        // ─── HASH PASSWORD ─────────────────────

        const salt = await bcrypt.genSalt(10);

        const hashedPassword = await bcrypt.hash(
            password,
            salt
        );

        // ─── CREATE USER ───────────────────────

        const user = await User.create({
            name,
            email,
            password: hashedPassword
        });

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

        res.status(500).json({
            success: false,
            message: error.message
        });
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

        // Get user with password
        const user = await User.findOne({ email })
            .select("+password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid Email"
            });
        }

        // Compare hashed password
        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

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

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// =========================
// GET ALL USERS (with pagination)
// =========================
const calculateMatchScore = require("../utils/calculateMatchScore");

const getAllUsers = async (req, res) => {

    try {

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        // ─── CURRENT LOGGED USER ─────────────────────
        const currentUser = await User.findById(req.user._id);

        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: "Current user not found"
            });
        }

        // ─── FETCH USERS ─────────────────────────────
        const users = await User.find({
            _id: { $ne: currentUser._id },
            gender: { $ne: currentUser.gender }
        })
        .populate("comments.user", "name photos")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        // ─── CALCULATE MATCH SCORE + SOCIAL DATA ─────
        const usersWithScore = users.map((user) => {

            const matchScore = calculateMatchScore(currentUser, user);

            const isLiked = user.likes?.some(
                (id) => id.toString() === currentUser._id.toString()
            );

            return {
                ...user.toObject(),
                matchScore,
                likesCount:      user.likes?.length || 0,
                isLiked,
                likes:           user.likes || [],
                commentsCount:   user.comments?.length || 0,
                comments:        user.comments || [],
                latestComments:  user.comments?.slice(-3).reverse() || [],
            };
        });

        // ─── FILTER OUT ZERO SCORE USERS ─────────────  ← ADDED
        const filteredUsers = usersWithScore.filter(
            (user) => user.matchScore > 0
        );

        // ─── SORT BY MATCH SCORE DESC ─────────────────
        filteredUsers.sort((a, b) => b.matchScore - a.matchScore);

        // ─── TOTAL USERS ─────────────────────────────
        const totalUsers = await User.countDocuments({
            _id: { $ne: currentUser._id },
            gender: { $ne: currentUser.gender }
        });

        // ─── RESPONSE ────────────────────────────────
        res.status(200).json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            totalUsers,
            users: filteredUsers                        // ← was usersWithScore
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
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




const likeUser = async (req, res) => {

    try {

        const targetUserId = req.params.userId;

        const currentUserId = req.user._id;

        // Cannot like own profile
        if (
            targetUserId === currentUserId.toString()
        ) {
            return res.status(400).json({
                success: false,
                message: "You cannot like yourself"
            });
        }

        const targetUser = await User.findById(
            targetUserId
        );

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Check already liked
        const alreadyLiked =
            targetUser.likes.some(
                (id) =>
                    id.toString() ===
                    currentUserId.toString()
            );

        // ─── UNLIKE ───────────────────────────────

        if (alreadyLiked) {

            targetUser.likes =
                targetUser.likes.filter(
                    (id) =>
                        id.toString() !==
                        currentUserId.toString()
                );

            await targetUser.save();

            return res.status(200).json({
                success: true,
                liked: false,
                message: "User unliked",
                likesCount: targetUser.likes.length
            });
        }

        // ─── LIKE ONLY ONCE ───────────────────────

        targetUser.likes.push(currentUserId);

        await targetUser.save();

        res.status(200).json({
            success: true,
            liked: true,
            message: "User liked",
            likesCount: targetUser.likes.length
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



const addComment = async (req, res) => {
  try {
    const { text } = req.body;

    const targetUserId = req.params.userId;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Comment text required',
      });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    targetUser.comments.push({
      user: req.user._id,
      text,
    });

    await targetUser.save();

    const updatedUser = await User.findById(targetUserId)
      .populate('comments.user', 'name photos');

    res.status(200).json({
      success: true,
      comments: updatedUser.comments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const deleteComment = async (req, res) => {
  try {
    const { userId, commentId } = req.params;

    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const comment = targetUser.comments.id(commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Only comment owner can delete

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    targetUser.comments.pull(commentId);

    await targetUser.save();

    res.status(200).json({
      success: true,
      message: 'Comment deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const getUserComments = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('comments.user', 'name photos');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      comments: user.comments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
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
    reorderPhotos,
    likeUser,
    addComment,
    deleteComment,
    getUserComments
};
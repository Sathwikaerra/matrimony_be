const User = require("../models/User");
const Notification = require("../models/Notification");
const generateToken = require("../utils/generateToken");
const SocketService = require("../services/socketService");
const {
  notifyProfileViewed,
  notifyInterestReceived,
  sendPushToUser,
} = require("../services/pushService"); // ← UPDATED
const { createNotification } = require("../services/notificationStore");
const { admin: firebaseAdmin } = require("../config/firebaseAdmin");

// =========================
// SIGNUP USER
// =========================
const bcrypt = require("bcryptjs");

// OTP is now the actual signup gate, not an optional add-on verified after
// the account already exists (that was the old verify-phone-after-signup
// flow — still kept below for re-verifying a changed number later, but
// signup itself requires proof up front). The frontend completes the
// Firebase Phone Auth round-trip itself and hands us the resulting ID
// token; we verify it server-side and derive the phone number from IT,
// never from a client-submitted phoneNumber field — so what's stored is
// guaranteed to be the number that was actually OTP-verified.
// const registerUser = async (req, res) => {

//   try {

//     const {
//       name,
//       email,
//       password,
//       role = "user",
//       idToken,
//       accountFor,
//       marriageInfo,
//     } = req.body;

//     if (!name || !email || !password) {
//       return res.status(400).json({
//         success: false,
//         message: "Please fill all fields"
//       });
//     }

//     if (!idToken) {
//       return res.status(400).json({
//         success: false,
//         message: "Phone verification is required to create an account"
//       });
//     }

//     let verifiedPhone;
//     try {
//       const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
//       verifiedPhone = decoded.phone_number;
//     } catch (err) {
//       console.error('registerUser idToken verify error:', err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Invalid or expired phone verification — please verify your number again"
//       });
//     }
//     if (!verifiedPhone) {
//       return res.status(400).json({
//         success: false,
//         message: "Verification token has no phone number attached"
//       });
//     }

//     // Check existing user — by email, and separately by the verified phone
//     // number (no schema-level unique index on phoneNumber, since existing
//     // rows may already have blank/duplicate values; this is an
//     // application-level check instead).
//     const existingUser = await User.findOne({ email });

//     if (existingUser) {
//       return res.status(400).json({
//         success: false,
//         message: "User already exists"
//       });
//     }

//     const existingPhone = await User.findOne({ phoneNumber: verifiedPhone });
//     if (existingPhone) {
//       return res.status(400).json({
//         success: false,
//         message: "An account already exists with this phone number — try logging in instead"
//       });
//     }

//     // ─── HASH PASSWORD ─────────────────────

//     const salt = await bcrypt.genSalt(10);

//     const hashedPassword = await bcrypt.hash(
//       password,
//       salt
//     );

//     // ─── CREATE USER ───────────────────────

//     const user = await User.create({
//       name,
//       email,
//       password: hashedPassword,
//       role,
//       phoneNumber: verifiedPhone,
//       phoneVerified: true,
//       accountFor,
//       marriageInfo,
//     });

//     const token = generateToken(user._id);

//     SocketService.emitNewUserRegistration(user);

//     res.status(201).json({
//       success: true,
//       message: "Signup Successful",
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         role: user.role
//       }
//     });

//   } catch (error) {

//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = "user",
      phoneNumber,
      accountFor,
      marriageInfo,
      gender, // ← added
    } = req.body;

    if (!name || !email || !password || !phoneNumber || !gender) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    // TEMPORARY:
    // Firebase phone verification is bypassed during development.
    // Mobile app verifies the test OTP 123456 locally.
    const verifiedPhone = phoneNumber;

    // Check existing user by email
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Check existing user by phone
    const existingPhone = await User.findOne({
      phoneNumber: verifiedPhone,
    });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message:
          "An account already exists with this phone number — try logging in instead",
      });
    }

    // HASH PASSWORD
    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(password, salt);

    // CREATE USER
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      phoneNumber: verifiedPhone,
      phoneVerified: true,
      accountFor,
      marriageInfo,
      gender, // ← added
    });

    const token = generateToken(user._id);

    SocketService.emitNewUserRegistration(user);

    return res.status(201).json({
      success: true,
      message: "Signup Successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("registerUser error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
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
        message: "Please fill all fields",
      });
    }

    // `email` doubles as "identifier" — after the mobile+OTP signup flow,
    // login is by mobile number + password just as often as by email, so
    // whatever was typed is matched against either field.
    const user = await User.findOne({
      $or: [{ email }, { phoneNumber: email }],
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Phone Number",
      });
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid Password",
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
        occupation: user.occupation,
        role: user.role,
      },
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =========================
// VERIFY PHONE (Firebase Phone Auth)
// =========================
// The frontend does the actual OTP round-trip itself via the Firebase
// client SDK (signInWithPhoneNumber) — no SMS is sent from this backend.
// This endpoint just verifies the resulting Firebase ID token server-side
// (never trust a client-asserted "yes I verified it") and confirms the
// phone number on the token matches the number this account claims,
// before marking it trusted. Now mainly used for re-verifying a *changed*
// number later (from Settings) — signup itself verifies idToken directly
// in registerUser above, since there's no logged-in account yet at that
// point for this protect-gated endpoint to attach to.
const verifyPhone = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res
        .status(400)
        .json({ success: false, message: "idToken is required" });
    }

    const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
    const verifiedPhone = decoded.phone_number; // e.g. "+919876543210"
    if (!verifiedPhone) {
      return res.status(400).json({
        success: false,
        message: "Token has no verified phone number",
      });
    }

    // Loose match — stored phoneNumber may or may not include the country
    // code depending on what the signup form collected; compare on the
    // digits only so "+919876543210" still matches "9876543210".
    const digitsOnly = (s) => (s || "").replace(/\D/g, "");
    const storedDigits = digitsOnly(req.user.phoneNumber);
    if (!storedDigits || !digitsOnly(verifiedPhone).endsWith(storedDigits)) {
      return res.status(400).json({
        success: false,
        message: "Verified number does not match this account",
      });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { phoneVerified: true },
      { new: true },
    ).select("-password");

    res.status(200).json({ success: true, user: updated });
  } catch (error) {
    console.error("verifyPhone error:", error.message);
    res.status(400).json({
      success: false,
      message: "Invalid or expired verification token",
    });
  }
};

// =========================
// GET ALL USERS (with pagination) — real match scoring
// =========================
// Previously showed every other user regardless of gender, sorted only by
// signup recency, with a dead `matchScore` field the frontend replaced with
// Math.random(). Now: filters to the opposite gender (only when both are
// set, so accounts that haven't filled in gender yet don't just vanish from
// everyone's feed), and scores + sorts by calculateMatchScore using the
// viewer's Survey (see models/Survey.js) against each candidate's Survey.
// Survey docs are batch-fetched (one query for the whole page), not N+1.
const calculateMatchScore = require("../utils/calculateMatchScore");
const Survey = require("../models/Survey");
const getAllUsers = async (req, res) => {
  try {
    // ✅ Pagination
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 5;

    const currentUser = req.user;

    const filter = { _id: { $ne: currentUser._id } };
    if (currentUser.gender) {
      if (currentUser.gender === "Male") {
        filter.gender = "Female";
      } else if (currentUser.gender === "Female") {
        filter.gender = "Male";
      } else {
        filter.gender = {
          $ne: currentUser.gender,
          $nin: ["", null],
          $exists: true,
        };
      }
    }

    // ✅ Score + sort ALL matching candidates, then slice the page — a true
    // "best matches first" feed needs the ranking done before pagination
    // cuts it up, not per-page (which would only reorder within whatever
    // createdAt-window happened to land on this page). Matrimony-app scale
    // (hundreds–low-thousands of candidates, not social-network scale)
    // makes fetching the full filtered set here reasonable.
    const allCandidates = await User.find(filter).populate(
      "comments.user",
      "name photos",
    );

    const viewerSurvey = await Survey.findOne({ user: currentUser._id });
    const candidateSurveys = await Survey.find({
      user: { $in: allCandidates.map((u) => u._id) },
    });
    const surveyByUserId = new Map(
      candidateSurveys.map((s) => [s.user.toString(), s]),
    );

    const scoredUsers = allCandidates.map((user) => {
      const likesCount = user.likes.length;

      const isLiked = user.likes.some(
        (id) => id.toString() === req.user._id.toString(),
      );

      const matchScore = calculateMatchScore(
        currentUser,
        viewerSurvey,
        user,
        surveyByUserId.get(user._id.toString()),
      );

      return {
        ...user.toObject(),

        likesCount,

        isLiked,

        matchScore,
      };
    });

    // Highest match first; createdAt desc as the tiebreaker for equal scores
    // (e.g. everyone still at score 0 pre-survey) so the order stays stable
    // and matches the old "newest first" behavior in that case.
    scoredUsers.sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        new Date(b.createdAt) - new Date(a.createdAt),
    );

    const totalUsers = scoredUsers.length;
    const skip = (page - 1) * limit;
    const modifiedUsers = scoredUsers.slice(skip, skip + limit);

    // ✅ Response
    res.status(200).json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
      users: modifiedUsers,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =========================
// SEARCH USERS
// =========================
const searchUsers = async (req, res) => {
  try {
    console.log("search hitttt");
    const search = req.query.search || "";

    const users = await User.find({
      _id: { $ne: req.user?._id },
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
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
    const { id: profileId } = req.params; // rename id → profileId inside controller

    console.log("search uer hitttttttttttttt");

    const profile = await User.findById(profileId).select("-password");

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ── Push notification: tell owner their profile was viewed ──────
    // Only fires when a logged-in user views someone else's profile.
    //
    // Deduped against any still-unread "X viewed your profile" from this
    // same viewer — without this, a single logical profile view could
    // create several rows (React StrictMode double-invokes effects in dev;
    // a drawer/page re-render, a revisit within the same browsing session,
    // or simple network retries can all hit this endpoint more than once
    // for what the user experiences as *one* view). Once the existing
    // notification is read/cleared, the next view creates a fresh one —
    // this isn't a time-based cooldown, it's "don't pile up duplicates of
    // the same still-pending notification".
    if (req.user && req.user._id.toString() !== profileId) {
      const viewer = await User.findById(req.user._id).select("name");
      if (viewer) {
        const alreadyNotified = await Notification.exists({
          recipient: profileId,
          sender: req.user._id,
          type: "view",
          isRead: false,
        });
        if (!alreadyNotified) {
          notifyProfileViewed(
            profileId, // profile owner to notify
            viewer.name, // "X viewed your profile"
            req.user._id.toString(), // click → go to viewer's profile
          );
          createNotification({
            recipient: profileId,
            sender: req.user._id,
            type: "view",
            message: `${viewer.name} viewed your profile`,
            data: { url: `/profile/${req.user._id}` },
          });
        }
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
      name,
      phoneNumber,
      gender,
      dateOfBirth,
      religion,
      motherTongue,
      maritalStatus,
      education,
      occupation,
      city,
      state,
    } = req.body;

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        name,
        phoneNumber,
        gender,
        dateOfBirth,
        religion,
        motherTongue,
        maritalStatus,
        education,
        occupation,
        city,
        state,
      },
      { new: true, runValidators: true },
    ).select("-password");

    res.status(200).json({ success: true, user: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// PHOTO MANAGEMENT
// =========================
const { cloudinary } = require("../config/cloudinary");

const uploadPhoto = async (req, res) => {
  try {
    console.log("upload potosss hittt");
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });

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

    const publicId = photoUrl.split("/").slice(-2).join("/").split(".")[0];
    await cloudinary.uploader.destroy(publicId);

    user.photos = user.photos.filter((p) => p !== photoUrl);
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
    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot like yourself",
      });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check already liked
    const alreadyLiked = targetUser.likes.some(
      (id) => id.toString() === currentUserId.toString(),
    );

    // ─── UNLIKE ───────────────────────────────

    if (alreadyLiked) {
      targetUser.likes = targetUser.likes.filter(
        (id) => id.toString() !== currentUserId.toString(),
      );

      await targetUser.save();

      return res.status(200).json({
        success: true,
        liked: false,
        message: "User unliked",
        likesCount: targetUser.likes.length,
      });
    }

    // ─── LIKE ONLY ONCE ───────────────────────

    targetUser.likes.push(currentUserId);
    await targetUser.save();

    // ── Real-time notification ──────────────────────────────────────────
    SocketService.emitLikeNotification(req.user, targetUserId);

    // Push notification
    notifyInterestReceived(
      targetUserId,
      req.user.name,
      currentUserId.toString(),
    );

    createNotification({
      recipient: targetUserId,
      sender: currentUserId,
      type: "like",
      message: `${req.user.name} liked your profile`,
      data: { url: `/profile/${currentUserId}` },
    });
    // ──────────────────────────────────────────────────────────────────

    res.status(200).json({
      success: true,
      liked: true,
      message: "User liked",
      likesCount: targetUser.likes.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
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
        message: "Comment text required",
      });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    targetUser.comments.push({
      user: req.user._id,
      text,
    });

    await targetUser.save();

    // ── Real-time notification ──────────────────────────────────────────
    SocketService.emitCommentNotification(req.user, targetUserId, text);

    // Push notification
    sendPushToUser(targetUserId, {
      title: `💬 New comment from ${req.user.name}`,
      body: text.length > 60 ? text.slice(0, 60) + "…" : text,
      type: "message",
      senderId: req.user._id,
      data: { url: `/profile/${targetUserId}` },
    });

    createNotification({
      recipient: targetUserId,
      sender: req.user._id,
      type: "comment",
      message: `${req.user.name} commented: "${text.length > 60 ? text.slice(0, 60) + "…" : text}"`,
      data: { url: `/profile/${req.user._id}` },
    });
    // ──────────────────────────────────────────────────────────────────

    const updatedUser = await User.findById(targetUserId).populate(
      "comments.user",
      "name photos",
    );

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
        message: "User not found",
      });
    }

    const comment = targetUser.comments.id(commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Only comment owner can delete

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    targetUser.comments.pull(commentId);

    await targetUser.save();

    res.status(200).json({
      success: true,
      message: "Comment deleted",
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
    const user = await User.findById(req.params.userId).populate(
      "comments.user",
      "name photos",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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
  verifyPhone,
  getAllUsers,
  searchUsers,
  getProfile, // ← NEW — add this to your userRoutes.js too
  updateProfile,
  uploadPhoto,
  deletePhoto,
  reorderPhotos,
  likeUser,
  addComment,
  deleteComment,
  getUserComments,
};

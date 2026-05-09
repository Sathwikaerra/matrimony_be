            const User = require('../models/User');

            const generateToken = require('../utils/generateToken');

            const SocketService = require('../services/socketService');



            // =========================
            // SIGNUP USER
            // =========================

            const registerUser = async (req, res) => {

                console.log("hirtttt signup")

                try {

                    const {
                            name,
                            email,
                            password
                    } = req.body;



                    // Check empty fields
                    if (!name || !email || !password) {

                        return res.status(400).json({
                            success: false,
                            message: "Please fill all fields"   
                        });

                    }



                    // Check user already exists
                    const existingUser = await User.findOne({ email });

                    if (existingUser) {

                        return res.status(400).json({
                            success: false,
                            message: "User already exists"
                        });

                    }



                    // Create user
                    const user = await User.create({
                        name,
                        email,
                        password
                    });



                    // Generate JWT Token
                    const token = generateToken(user._id);



                    // Socket Event
                    SocketService.emitNewUserRegistration(user);



                    // Response
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

            // =========================
            // LOGIN USER
            // =========================

            const loginUser = async (req, res) => {

                try {

                    const {
                        email,
                        password
                    } = req.body;



                    // =========================
                    // VALIDATION
                    // =========================

                    if (!email || !password) {

                        return res.status(400).json({

                            success: false,

                            message: "Please fill all fields"

                        });

                    }



                    // =========================
                    // FIND USER
                    // =========================

                    const user = await User
                        .findOne({ email })
                        .select('+password');



                    // =========================
                    // USER NOT FOUND
                    // =========================

                    if (!user) {

                        return res.status(401).json({

                            success: false,

                            message: "Invalid Email"

                        });

                    }



                    // =========================
                    // COMPARE PASSWORD
                    // =========================

                    const isMatch = await user.comparePassword(
                        password
                    );



                    // =========================
                    // PASSWORD WRONG
                    // =========================

                    if (!isMatch) {

                        return res.status(401).json({

                            success: false,

                            message: "Invalid Password"

                        });

                    }



                    // =========================
                    // GENERATE JWT TOKEN
                    // =========================

                    const token = generateToken(user._id);



                    // =========================
                    // SOCKET EVENT
                    // =========================

                    SocketService.emitUserLogin(user);



                    // =========================
                    // SUCCESS RESPONSE
                    // =========================

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
            // GET ALL USERS
            // =========================

            // GET USERS WITH PAGINATION

            const getAllUsers = async (req, res) => {

                try {

                    // Page Number
                    const page = Number(req.query.page) || 1;

                    // Limit Per Request
                    const limit = Number(req.query.limit) || 5;

                    // Skip
                    const skip = (page - 1) * limit;



                    // Fetch Users
                    const users = await User.find()
                        .skip(skip)
                        .limit(limit);



                    // Total Count
                    const totalUsers = await User.countDocuments();



                    res.status(200).json({

                        success: true,

                        currentPage: page,

                        totalPages: Math.ceil(
                            totalUsers / limit
                        ),

                        totalUsers,

                        users

                    });

                } catch (error) {

                    res.status(500).json({

                        success: false,

                        message: error.message

                    });

                }

            };

            // SEARCH USERS

            const searchUsers = async (req, res) => {

                try {

                    const search = req.query.search || "";



                    const users = await User.find({

                        $or: [

                            {
                                name: {
                                    $regex: search,
                                    $options: "i"
                                }
                            },

                            {
                                email: {
                                    $regex: search,
                                    $options: "i"
                                }
                            }

                        ]

                    })

                    .limit(5);



                    res.status(200).json({

                        success: true,

                        users

                    });

                } catch (error) {

                    res.status(500).json({

                        success: false,

                        message: error.message

                    });

                }

            };

            // controllers/authController.js — add this

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


// controllers/authController.js — add these

const { cloudinary } = require('../config/cloudinary');

// Upload a photo — adds to photos array
const uploadPhoto = async (req, res) => {
    try {

        console.log("upload potosss hittt")
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const user = await User.findById(req.user._id);
        user.photos.push(req.file.path);   // Cloudinary URL string
        await user.save();

        res.status(200).json({ success: true, photos: user.photos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a photo by URL
const deletePhoto = async (req, res) => {
    try {
        const { photoUrl } = req.body;
        const user = await User.findById(req.user._id);

        // Extract public_id from Cloudinary URL and delete from cloud
        const publicId = photoUrl.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);

        user.photos = user.photos.filter(p => p !== photoUrl);
        await user.save();

        res.status(200).json({ success: true, photos: user.photos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Reorder photos — index 0 becomes profile pic
const reorderPhotos = async (req, res) => {
    try {
        const { photos } = req.body;  // full reordered array of URLs
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
                updateProfile,
                uploadPhoto, deletePhoto, reorderPhotos
            };
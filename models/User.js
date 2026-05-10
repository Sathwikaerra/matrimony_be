const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');


const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    phoneNumber: String,
    password: {
        type: String,
        select: false
    },
      photos: [
        {
            type: String
        }
    ],
    gender: String,
    dateOfBirth: Date,
    religion: String,
    motherTongue: String,
    maritalStatus: String,
    education: String,
    occupation: String,
    city: String,
    state: String,
    // ───────── Likes ─────────

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // ───────── Comments ─────────

    comments: [commentSchema],

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  }, {
    timestamps: true
});



module.exports = mongoose.model('User', userSchema);

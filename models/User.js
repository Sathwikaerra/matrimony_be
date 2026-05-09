const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.comparePassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

// seeders/deleteUsers.js

const mongoose = require("mongoose");

const dotenv = require("dotenv");

const User = require("./models/User");

dotenv.config();



// =========================
// CONNECT DATABASE
// =========================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB Connected");
  })
  .catch((err) => {
    console.log(err);
  });



// =========================
// DELETE ALL USERS
// =========================

const deleteUsers = async () => {

  try {

    const result = await User.deleteMany({});



    console.log("================================");
    console.log("🗑️ All Users Deleted");
    console.log("================================");



    console.log(
      `Deleted Count: ${result.deletedCount}`
    );



    process.exit();

  } catch (error) {

    console.log(error);

    process.exit(1);

  }

};



deleteUsers();
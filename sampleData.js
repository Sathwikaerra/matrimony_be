// seeders/userSeeder.js

const mongoose = require("mongoose");

const dotenv = require("dotenv");

const bcrypt = require("bcryptjs");

const User = require("./models/User");

dotenv.config();



// ========================
// CONNECT DATABASE
// ========================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB Connected");
  })
  .catch((err) => {
    console.log(err);
  });



// ========================
// USERS ARRAY
// ========================

// USERS ARRAY

// HIGH QUALITY 50 MATRIMONY USERS

const users = [

{
  name: "Rahul Sharma",
  email: "rahul1@gmail.com",
  phoneNumber: "9876543201",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d",
    "https://images.unsplash.com/photo-1504593811423-6dd665756598"
  ],

  gender: "Male",
  dateOfBirth: "1998-01-01",
  religion: "Hindu",
  motherTongue: "Hindi",
  maritalStatus: "Never Married",
  education: "B.Tech",
  occupation: "Software Engineer",
  city: "Hyderabad",
  state: "Telangana"
},

{
  name: "Priya Reddy",
  email: "priya2@gmail.com",
  phoneNumber: "9876543202",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1"
  ],

  gender: "Female",
  dateOfBirth: "1999-02-10",
  religion: "Hindu",
  motherTongue: "Telugu",
  maritalStatus: "Never Married",
  education: "MBA",
  occupation: "HR Manager",
  city: "Bangalore",
  state: "Karnataka"
},

{
  name: "Arjun Kumar",
  email: "arjun3@gmail.com",
  phoneNumber: "9876543203",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
    "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7",
    "https://images.unsplash.com/photo-1504257432389-52343af06ae3"
  ],

  gender: "Male",
  dateOfBirth: "1997-03-11",
  religion: "Hindu",
  motherTongue: "Tamil",
  maritalStatus: "Never Married",
  education: "M.Tech",
  occupation: "Developer",
  city: "Chennai",
  state: "Tamil Nadu"
},

{
  name: "Sneha Patel",
  email: "sneha4@gmail.com",
  phoneNumber: "9876543204",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1517841905240-472988babdf9",
    "https://images.unsplash.com/photo-1491349174775-aaafddd81942",
    "https://images.unsplash.com/photo-1521119989659-a83eee488004"
  ],

  gender: "Female",
  dateOfBirth: "2000-07-12",
  religion: "Hindu",
  motherTongue: "Gujarati",
  maritalStatus: "Never Married",
  education: "B.Com",
  occupation: "Accountant",
  city: "Ahmedabad",
  state: "Gujarat"
},

{
  name: "Karthik",
  email: "karthik5@gmail.com",
  phoneNumber: "9876543205",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
    "https://images.unsplash.com/photo-1511367461989-f85a21fda167"
  ],

  gender: "Male",
  dateOfBirth: "1996-11-18",
  religion: "Hindu",
  motherTongue: "Kannada",
  maritalStatus: "Never Married",
  education: "B.Tech",
  occupation: "UI Designer",
  city: "Mysore",
  state: "Karnataka"
},

{
  name: "Ananya",
  email: "ananya6@gmail.com",
  phoneNumber: "9876543206",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df"
  ],

  gender: "Female",
  dateOfBirth: "1998-08-22",
  religion: "Hindu",
  motherTongue: "Malayalam",
  maritalStatus: "Never Married",
  education: "B.Sc",
  occupation: "Teacher",
  city: "Kochi",
  state: "Kerala"
},

{
  name: "Sathwik",
  email: "sathwik7@gmail.com",
  phoneNumber: "9876543207",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
    "https://images.unsplash.com/photo-1504257432389-52343af06ae3"
  ],

  gender: "Male",
  dateOfBirth: "1995-05-05",
  religion: "Hindu",
  motherTongue: "Telugu",
  maritalStatus: "Never Married",
  education: "B.Tech",
  occupation: "Backend Developer",
  city: "Hyderabad",
  state: "Telangana"
}

];



// ===================================
// ADD MORE USERS TILL 50
// ===================================

for (let i = 8; i <= 50; i++) {

  users.push({

    name: `User ${i}`,

    email: `user${i}@gmail.com`,

    phoneNumber: `9876543${100 + i}`,

    password: "123456",

    photos: [

      i % 2 === 0
        ? "https://images.unsplash.com/photo-1494790108377-be9c29b29330"
        : "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",

      i % 2 === 0
        ? "https://images.unsplash.com/photo-1524504388940-b1c1722653e1"
        : "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7",

      i % 2 === 0
        ? "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df"
        : "https://images.unsplash.com/photo-1504257432389-52343af06ae3"

    ],

    gender: i % 2 === 0
      ? "Female"
      : "Male",

    dateOfBirth: "1998-01-01",

    religion: "Hindu",

    motherTongue: "Telugu",

    maritalStatus: "Never Married",

    education: "B.Tech",

    occupation: "Software Engineer",

    city: "Hyderabad",

    state: "Telangana"

  });

}



// ========================
// INSERT USERS ONE BY ONE
// ========================

const insertUsers = async () => {

  try {

    for (const userData of users) {

      // Hash Password
      const salt = await bcrypt.genSalt(10);

      const hashedPassword = await bcrypt.hash(
        userData.password,
        salt
      );



      // Replace Password
      userData.password = hashedPassword;



      // Insert User
      const user = await User.create(userData);



      console.log(
        `✅ ${user.name} Inserted`
      );

    }



    console.log("================================");
    console.log("✅ All Users Inserted");
    console.log("================================");



    process.exit();

  } catch (error) {

    console.log(error);

    process.exit(1);

  }

};



insertUsers();
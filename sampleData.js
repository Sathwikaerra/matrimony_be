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
  email: "rahul@gmail.com",
  phoneNumber: "9876543210",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d"
  ],

  gender: "Male",
  dateOfBirth: "1997-05-14",

  religion: "Hindu",
  motherTongue: "Hindi",
  maritalStatus: "Never Married",

  education: "B.Tech",
  occupation: "Software Engineer",

  city: "Hyderabad",
  state: "Telangana",

  bio: "Looking for a caring and understanding life partner.",

  hobbies: ["Travel", "Music", "Gym"],
  favoriteFoods: ["Biryani", "Pizza"],
  favoriteColor: "Blue",
  interests: ["Movies", "Technology", "Fitness"],

  personalityType: "Introvert",

  height: 175,
  annualIncome: 1200000,

  drinking: "Occasionally",
  smoking: "No",

  languagesKnown: ["Hindi", "English", "Telugu"],

  partnerPreferences: {
    ageMin: 22,
    ageMax: 28,
    religions: ["Hindu"],
    cities: ["Hyderabad", "Bangalore"],
    occupations: ["Engineer", "Doctor"]
  }
},

{
  name: "Priya Reddy",
  email: "priya@gmail.com",
  phoneNumber: "9876543211",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1"
  ],

  gender: "Female",
  dateOfBirth: "1999-03-11",

  religion: "Hindu",
  motherTongue: "Telugu",
  maritalStatus: "Never Married",

  education: "MBA",
  occupation: "HR Manager",

  city: "Bangalore",
  state: "Karnataka",

  bio: "Family-oriented girl who loves traditions and travel.",

  hobbies: ["Cooking", "Music", "Reading"],
  favoriteFoods: ["Dosa", "Pasta"],
  favoriteColor: "Pink",
  interests: ["Travel", "Dance", "Fashion"],

  personalityType: "Extrovert",

  height: 162,
  annualIncome: 900000,

  drinking: "No",
  smoking: "No",

  languagesKnown: ["Telugu", "English"],

  partnerPreferences: {
    ageMin: 25,
    ageMax: 32,
    religions: ["Hindu"],
    cities: ["Hyderabad", "Bangalore"],
    occupations: ["Software Engineer", "Manager"]
  }
},

{
  name: "Arjun Kumar",
  email: "arjun@gmail.com",
  phoneNumber: "9876543212",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7"
  ],

  gender: "Male",
  dateOfBirth: "1995-08-20",

  religion: "Hindu",
  motherTongue: "Tamil",
  maritalStatus: "Never Married",

  education: "M.Tech",
  occupation: "Backend Developer",

  city: "Chennai",
  state: "Tamil Nadu",

  bio: "Simple person with modern values.",

  hobbies: ["Cricket", "Photography"],
  favoriteFoods: ["Idli", "Chicken Curry"],
  favoriteColor: "Black",
  interests: ["Coding", "Gaming"],

  personalityType: "Ambivert",

  height: 178,
  annualIncome: 1500000,

  drinking: "Occasionally",
  smoking: "No",

  languagesKnown: ["Tamil", "English"],

  partnerPreferences: {
    ageMin: 22,
    ageMax: 30,
    religions: ["Hindu"],
    cities: ["Chennai", "Bangalore"],
    occupations: ["Teacher", "Engineer"]
  }
},

{
  name: "Sneha Patel",
  email: "sneha@gmail.com",
  phoneNumber: "9876543213",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1517841905240-472988babdf9"
  ],

  gender: "Female",
  dateOfBirth: "2000-01-15",

  religion: "Hindu",
  motherTongue: "Gujarati",
  maritalStatus: "Never Married",

  education: "B.Com",
  occupation: "Accountant",

  city: "Ahmedabad",
  state: "Gujarat",

  bio: "Positive minded and cheerful person.",

  hobbies: ["Yoga", "Shopping", "Cooking"],
  favoriteFoods: ["Gujarati Thali", "Ice Cream"],
  favoriteColor: "Purple",
  interests: ["Travel", "Fitness"],

  personalityType: "Extrovert",

  height: 160,
  annualIncome: 700000,

  drinking: "No",
  smoking: "No",

  languagesKnown: ["Gujarati", "Hindi", "English"],

  partnerPreferences: {
    ageMin: 24,
    ageMax: 31,
    religions: ["Hindu"],
    cities: ["Ahmedabad", "Mumbai"],
    occupations: ["Business", "Engineer"]
  }
},

{
  name: "Karthik R",
  email: "karthik@gmail.com",
  phoneNumber: "9876543214",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1504257432389-52343af06ae3"
  ],

  gender: "Male",
  dateOfBirth: "1996-11-09",

  religion: "Hindu",
  motherTongue: "Kannada",
  maritalStatus: "Never Married",

  education: "B.Tech",
  occupation: "UI UX Designer",

  city: "Mysore",
  state: "Karnataka",

  bio: "Creative and calm personality.",

  hobbies: ["Drawing", "Travel"],
  favoriteFoods: ["Burger", "South Indian"],
  favoriteColor: "Green",
  interests: ["Art", "Technology"],

  personalityType: "Introvert",

  height: 173,
  annualIncome: 1100000,

  drinking: "No",
  smoking: "No",

  languagesKnown: ["Kannada", "English"],

  partnerPreferences: {
    ageMin: 22,
    ageMax: 29,
    religions: ["Hindu"],
    cities: ["Mysore", "Bangalore"],
    occupations: ["Designer", "Engineer"]
  }
},

{
  name: "Ananya Nair",
  email: "ananya@gmail.com",
  phoneNumber: "9876543215",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df"
  ],

  gender: "Female",
  dateOfBirth: "1998-07-18",

  religion: "Hindu",
  motherTongue: "Malayalam",
  maritalStatus: "Never Married",

  education: "B.Sc",
  occupation: "Teacher",

  city: "Kochi",
  state: "Kerala",

  bio: "Traditional values with modern thinking.",

  hobbies: ["Reading", "Music", "Travel"],
  favoriteFoods: ["Kerala Meals", "Chocolate"],
  favoriteColor: "White",
  interests: ["Education", "Nature"],

  personalityType: "Ambivert",

  height: 164,
  annualIncome: 600000,

  drinking: "No",
  smoking: "No",

  languagesKnown: ["Malayalam", "English"],

  partnerPreferences: {
    ageMin: 25,
    ageMax: 32,
    religions: ["Hindu"],
    cities: ["Kochi", "Bangalore"],
    occupations: ["Engineer", "Doctor"]
  }
},

{
  name: "Vikram Singh",
  email: "vikram@gmail.com",
  phoneNumber: "9876543216",
  password: "123456",

  photos: [
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e"
  ],

  gender: "Male",
  dateOfBirth: "1994-12-05",

  religion: "Hindu",
  motherTongue: "Punjabi",
  maritalStatus: "Never Married",

  education: "MBA",
  occupation: "Business Analyst",

  city: "Delhi",
  state: "Delhi",

  bio: "Ambitious and family-loving person.",

  hobbies: ["Gym", "Cricket"],
  favoriteFoods: ["Butter Chicken", "Paneer"],
  favoriteColor: "Navy Blue",
  interests: ["Finance", "Sports"],

  personalityType: "Extrovert",

  height: 180,
  annualIncome: 1800000,

  drinking: "Occasionally",
  smoking: "No",

  languagesKnown: ["Hindi", "Punjabi", "English"],

  partnerPreferences: {
    ageMin: 23,
    ageMax: 30,
    religions: ["Hindu"],
    cities: ["Delhi", "Noida"],
    occupations: ["Manager", "Teacher"]
  }
}

];



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
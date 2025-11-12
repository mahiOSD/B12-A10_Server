require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const port = process.env.PORT || 3000;
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let usersCollection;
let coursesCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db('onlineLearning');
    usersCollection = db.collection('users');
    coursesCollection = db.collection('courses');
    console.log("Connected to MongoDB successfully!");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err);
  }
}
run();


async function uploadToImgBB(base64Image) {
  const formData = new URLSearchParams();
  formData.append("key", process.env.IMGBB_API_KEY);
  formData.append("image", base64Image);

  const response = await axios.post("https://api.imgbb.com/1/upload", formData);
  return response.data.data.url;
}


app.post('/register', async (req, res) => {
  try {
    const { name, email, photoURL, password } = req.body;

    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ message: "Password must include at least one uppercase letter." });
    }
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ message: "Password must include at least one lowercase letter." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists. Please log in." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { name, email, photoURL, password: hashedPassword };
    await usersCollection.insertOne(newUser);

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "Registration successful!", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});


app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ message: "No user found with this email." });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(400).json({ message: "Incorrect password." });

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(200).json({ message: "Login successful!", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});


app.post('/google-login', async (req, res) => {
  try {
    const { name, email, photoURL } = req.body;
    let user = await usersCollection.findOne({ email });

    if (!user) {
      user = { name, email, photoURL, fromGoogle: true };
      await usersCollection.insertOne(user);
    }

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(200).json({ message: "Google login successful!", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});


app.get('/courses', async (req, res) => {
  try {
    const { category } = req.query;
    const query = category ? { category } : {};
    const courses = await coursesCollection.find(query).toArray();
    res.status(200).json(courses);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});


app.post('/courses', async (req, res) => {
  try {
    const { title, description, category, price, instructor, imageBase64 } = req.body;

    if (!title || !description || !category || !price || !instructor || !imageBase64) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    const imageUrl = await uploadToImgBB(imageBase64);

    const newCourse = {
      title,
      description,
      category,
      price,
      instructor,
      image: imageUrl,
      createdAt: new Date(),
    };

    await coursesCollection.insertOne(newCourse);
    res.status(201).json({ message: "Course added successfully!", course: newCourse });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});


app.put('/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedCourse = { $set: req.body };
    await coursesCollection.updateOne({ _id: new ObjectId(id) }, updatedCourse);
    res.status(200).json({ message: "Course updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});


app.delete('/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await coursesCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json({ message: "Course deleted successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});


app.get('/', (req, res) => {
  res.send('Online Learning Platform API is running...');
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

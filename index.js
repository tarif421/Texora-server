const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRETE);
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

// Firebase Admin Initialization
try {
  const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
  const serviceAccount = JSON.parse(decoded);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
} catch (error) {
  console.error("Firebase Admin Init Error:", error);
}

// Middleware
app.use(express.json());
app.use(cors());

// Verify Token Middleware
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token || !token.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    console.error("Firebase token verification error:", error);
    return res.status(401).send({ message: "unauthorized access" });
  }
};

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9aos02c.mongodb.net/Texora-DB?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// 
let productCollection, userCollection, orderCollection;

async function connectDB() {
  try {
    //
    if (!productCollection) {
      await client.connect();
      const db = client.db("Texora-DB");
      productCollection = db.collection("all-products");
      userCollection = db.collection("users");
      orderCollection = db.collection("orders");
      console.log("Successfully connected to MongoDB!");
    }
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}

//
app.use(async (req, res, next) => {
  await connectDB();
  next();
});



// Payment related APIs
app.post("/create-checkout-session", async (req, res) => {
  const paymentInfo = req.body;
  const amount = Math.round(parseFloat(paymentInfo.totalPrice) * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: paymentInfo.productTitle },
        },
        quantity: 1,
      },
    ],
    customer_email: paymentInfo.email,
    mode: "payment",
    metadata: { orderId: paymentInfo.orderId },
    success_url: `${process.env.SITE_DOMAIN}/dashboard/my-orders?success=true&orderId=${paymentInfo.orderId}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/my-orders?canceled=true`,
  });

  res.send({ url: session.url });
});

app.patch("/orders/pay/:id", async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { paymentStatus: "paid", status: "pending" } };
  const result = await orderCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// Users API
app.post("/users", async (req, res) => {
  const user = req.body;
  user.role = "user";
  user.createdAt = new Date();
  const email = user.email;
  const userExists = await userCollection.findOne({ email });

  if (userExists) {
    return res.send({ message: "user exists" });
  }

  const result = await userCollection.insertOne(user);
  res.send(result);
});

app.get("/users", verifyFBToken, async (req, res) => {
  const result = await userCollection.find().toArray();
  res.send(result);
});

app.get("/users/:email/role", async (req, res) => {
  const email = req.params.email;
  const user = await userCollection.findOne({ email });
  if (!user) return res.status(404).send({ message: "User not found" });
  res.send({ role: user.role, status: user.status || "active" });
});

app.patch("/users/:id", verifyFBToken, async (req, res) => {
  const id = req.params.id;
  const { role, status } = req.body;
  const filter = { _id: new ObjectId(id) };
  const updatedDoc = { $set: { role, status } };
  const result = await userCollection.updateOne(filter, updatedDoc);
  res.send(result);
});

// Products API
app.post("/all-products", async (req, res) => {
  const product = req.body;
  const result = await productCollection.insertOne(product);
  res.send(result);
});

// 
app.get("/latestProducts", async (req, res) => {
  try {
    const result = await productCollection.find().sort({ _id: -1 }).limit(8).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Error loading latest products" });
  }
});

app.get("/all-products", async (req, res) => {
  const result = await productCollection.find().toArray();
  res.send(result);
});

app.delete("/all-products/:id", async (req, res) => {
  const result = await productCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

app.get("/productsDetails/:id", async (req, res) => {
  const details = await productCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.json(details);
});

app.patch("/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = { ...req.body };
    delete updateData._id;
    const result = await productCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Update failed" });
  }
});

// Orders API
app.post("/orders", verifyFBToken, async (req, res) => {
  const result = await orderCollection.insertOne(req.body);
  res.send(result);
});

app.get("/orders/:email", verifyFBToken, async (req, res) => {
  const result = await orderCollection.find({ email: req.params.email }).toArray();
  res.send(result);
});

app.get("/all-orders", async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    if (status && status !== "All") query.status = { $regex: `^${status}$`, $options: "i" };
    if (search) { try { query._id = new ObjectId(search); } catch {} }
    const result = await orderCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Error fetching orders" });
  }
});

app.delete("/all-orders/:id", async (req, res) => {
  const result = await orderCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

app.get("/order/:id", async (req, res) => {
  const result = await orderCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

app.delete("/users/:id", async (req, res) => {
  const result = await userCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

app.get("/products/manager-only", verifyFBToken, async (req, res) => {
  const email = req.query.email;
  const search = req.query.search || "";
  let query = { managerEmail: email };
  if (search) query.productName = { $regex: search, $options: "i" };
  const result = await productCollection.find(query).toArray();
  res.send(result);
});

app.get("/products/:id", async (req, res) => {
  const product = await productCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.send(product);
});

app.get("/pending-orders", async (req, res) => {
  try {
    const result = await orderCollection.find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to load pending orders" });
  }
});

app.patch("/orders/:id/approve", async (req, res) => {
  try {
    const result = await orderCollection.updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      { $set: { status: "Approved", approvedAt: new Date(), updatedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to approve order" });
  }
});

app.patch("/orders/:id/reject", async (req, res) => {
  const result = await orderCollection.updateOne(
    { _id: new ObjectId(req.params.id), status: "pending" },
    { $set: { status: "rejected", rejectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
  );
  res.send(result);
});

app.get("/approved-orders", verifyFBToken, async (req, res) => {
  try {
    const result = await orderCollection.find({ status: "Approved" }).sort({ approvedAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to load approved orders" });
  }
});

app.post("/orders/:id/tracking", verifyFBToken, async (req, res) => {
  try {
    const tracking = req.body;
    const newTracking = {
      location: tracking.location,
      note: tracking.note,
      status: tracking.status,
      createdAt: new Date(),
    };
    const result = await orderCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $push: { trackingHistory: newTracking } });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Tracking update failed" });
  }
});

app.get("/orders/:id/tracking", verifyFBToken, async (req, res) => {
  try {
    const order = await orderCollection.findOne({ _id: new ObjectId(req.params.id) });
    res.send(order?.trackingHistory || []);
  } catch (error) {
    res.status(500).send({ message: "Tracking load failed" });
  }
});

app.get("/my-order/:email", verifyFBToken, async (req, res) => {
  try {
    const result = await orderCollection.find({ email: req.params.email }).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to load orders" });
  }
});

app.patch("/orders/:id/cancel", async (req, res) => {
  try {
    const result = await orderCollection.updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      { $set: { status: "cancelled", cancelledAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Cancel failed" });
  }
});

// Root Endpoint
app.get("/", (req, res) => {
  res.send("Texora Server is Running Perfectly!");
});


if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

module.exports = app;
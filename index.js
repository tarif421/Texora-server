const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRETE);
const port = process.env.PORT || 3000;

//  middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9aos02c.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("Texora-DB");
    const productCollection = db.collection("all-products");
    const userCollection = db.collection("users");
    const orderCollection = db.collection("orders");

    // payment related APIs
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;

      //TotalPrice কে সেন্টে রূপান্তর ($1 = 100 cents)
      const amount = Math.round(parseFloat(paymentInfo.totalPrice) * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount, // ডাইনামিক এমাউন্ট
              product_data: {
                name: paymentInfo.productTitle,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.email,
        mode: "payment",
        metadata: {
          orderId: paymentInfo.orderId, // database এ সেভ হওয়া অর্ডারের আইডি
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/my-orders?success=true`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/my-orders?canceled=true`,
      });

      res.send({ url: session.url });
    });
    // users api
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

    //  admin route apis
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // ///////////////////////////

    // get single userrole
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;

      const user = await userCollection.findOne({
        email,
      });

      if (!user) {
        return res.status(404).send({
          message: "User not found",
        });
      }

      res.send({
        role: user.role,
        status: user.status || "active",
      });
    });

    // update user role + status
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;

      const { role, status } = req.body;

      const filter = {
        _id: new ObjectId(id),
      };

      const updatedDoc = {
        $set: {
          role,
          status,
        },
      };

      const result = await userCollection.updateOne(filter, updatedDoc);

      res.send(result);
    });
    // //////
    // //// All Products
    // add  product api
    app.post("/all-products", async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    //  latest product api
    app.get("/latestProducts", async (req, res) => {
      const result = await productCollection
        .find()
        .sort({ _id: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    //all products api
    app.get("/all-products", async (req, res) => {
      const product = productCollection.find();
      const result = await product.toArray();
      res.send(result);
    });

    // prduct details
    app.get("/productsDetails/:id", async (req, res) => {
      const details = await productCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.json(details);
    });

    ////////////////////////////////////
    //  booking page
    app.post("/orders", async (req, res) => {
      const buyerOrders = req.body;
      const result = await orderCollection.insertOne(buyerOrders);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hello world");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

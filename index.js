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

      const amount = Math.round(parseFloat(paymentInfo.totalPrice) * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
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
          orderId: paymentInfo.orderId,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/my-orders?success=true&orderId=${paymentInfo.orderId}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/my-orders?canceled=true`,
      });

      res.send({ url: session.url });
    });
    // payment update
    app.patch("/orders/pay/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { paymentStatus: "paid", status: "processing" },
      };
      const result = await orderCollection.updateOne(filter, updateDoc);
      res.send(result);
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
    // //////////////////////////  Admin
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

    //  booking page
    app.post("/orders", async (req, res) => {
      const buyerOrders = req.body;
      const result = await orderCollection.insertOne(buyerOrders);
      res.send(result);
    });
    // my orders
    app.get("/orders/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { email: userEmail }; // আপনার ডাটাবেসে ইমেইল ফিল্ডের নাম যা দিয়েছেন
      const result = await orderCollection.find(query).toArray();
      res.send(result);
    });
    //  all orders

    app.get("/all-orders", async (req, res) => {
      try {
        const { status, search } = req.query;
        let query = {};

        // Status
        if (status && status !== "All") {
          query.status = status;
        }

        // Search
        if (search) {
          query._id = search;
        }

        const result = await orderCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching orders", error });
      }
    });
    // Get specific order details by ID
    app.get("/order/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await orderCollection.findOne(query);
      res.send(result);
    });
    //  toggle product
    // app.patch("/products/toggle-home/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const { showOnHome } = req.body;
    //   const query = { _id: new ObjectId(id) };
    //   const updateDoc = {
    //     $set: { showOnHome: showOnHome },
    //   };
    //   const result = await productCollection.updateOne(query, updateDoc);
    //   res.send(result);
    // });
    app.delete(`/users/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // /////////////////////////////// Manager route
    //  1
    app.get("/products/manager-only", async (req, res) => {
      const email = req.query.email; // ফ্রন্টএন্ড থেকে পাঠানো ইমেইল
      const search = req.query.search || "";

      // কুয়েরিতে managerEmail ফিল্ডটি চেক করা হচ্ছে যা আপনি একটু আগে অ্যাড করলেন
      let query = { managerEmail: email };

      // যদি সার্চ বক্সে কিছু লিখে থাকেন, তবে সার্চ লজিক যোগ হবে
      if (search) {
        query.productName = { $regex: search, $options: "i" };
      }

      const result = await productCollection.find(query).toArray();
      res.send(result);
    });
    2;
    app.get("/pending-orders", async (req, res) => {
      try {
        const query = {
          status: "pending",
        };

        const result = await orderCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Pending orders error:", error);
        res.status(500).send({ message: "Failed to load pending orders" });
      }
    });
    app.get("/orders/pending", async (req, res) => {
      const pending = req.query.e;
    });
    // 3. Update order status (Approve / Reject)
    app.patch("/orders/:id/approve", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await orderCollection.updateOne(
          {
            _id: new ObjectId(id),
            status: "pending",
          },
          {
            $set: {
              status: "Approved",
              approvedAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );

        res.send(result);
      } catch (error) {
        console.error("Approve order error:", error);
        res.status(500).send({ message: "Failed to approve order" });
      }
    });
    // 4
    app.patch("/orders/:id/reject", async (req, res) => {
      const id = req.params.id;

      const result = await orderCollection.updateOne(
        {
          _id: new ObjectId(id),
          status: "pending",
        },
        {
          $set: {
            status: "rejected",
            rejectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      );

      res.send(result);
    });
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

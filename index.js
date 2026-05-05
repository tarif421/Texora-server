const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

    // users api
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";

      const result = await userCollection.insertOne(user);
      res.send(result)
    });

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
    //  all products api
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

const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 8000;

app.use(
   cors({
      origin: ["http://localhost:5173", "https://assignment-12-74919.web.app", "https://assignment-12-74919.firebaseapp.com", "http://localhost:8000"],
   })
);
app.use(express.json());

// console.log(process.env.DB_SECRET_PASS);
// console.log(process.env.DB_SECRET_USER);

const uri = `mongodb+srv://${process.env.DB_SECRET_USER}:${process.env.DB_SECRET_PASS}@cluster0.gv1gxa1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
      // await client.connect();

      const usersCollection = client.db("diagnosis").collection("users");
      const servicesCollection = client.db("diagnosis").collection("services");
      const bookingCollection = client.db("diagnosis").collection("booking");
      const paymentCollection = client.db("diagnosis").collection("payment");
      const offersCollection = client.db("diagnosis").collection("offers");

      const verifyToken = (req, res, next) => {
         if (!req.headers.authorization) {
            return res.status(401).send({ message: "forbidden access" });
         }
         const token = req.headers.authorization.split(" ")[1];
         jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
               return res.status(401).send({ message: "forbidden access" });
            }
            req.decoded = decoded;
            next();
         });
      };

      const verifyAdmin = async (req, res, next) => {
         const email = req.decoded.email;
         const query = { email: email };
         const user = await usersCollection.findOne(query);

         const isAdmin = user?.role === "admin";

         if (!isAdmin) {
            return res.status(403).send({ message: "forbidden access" });
         }
         next();
      };

      app.post("/jwt", async (req, res) => {
         const user = req.body;
         const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
         res.send({ token });
      });
      // user api
      app.post("/users", async (req, res) => {
         const user = req.body;
         const query = { email: user.email };
         const existingUser = await usersCollection.findOne(query);
         if (existingUser) {
            return res.send({ message: "user already exist", insertedId: null });
         }
         const result = await usersCollection.insertOne(user);
         res.send(result);
      });

      // admin Api
      app.get("/users/admin/:email", verifyToken, verifyAdmin, async (req, res) => {
         const email = req.params.email;
         if (email !== req.decoded.email) {
            return res.status(403).send("unauthorized access");
         }
         const query = { email: email };
         const user = await usersCollection.findOne(query);
         let admin = false;
         if (user) {
            admin = user?.role === "admin";
         }
         res.send({ admin });
      });
      app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
         const result = await usersCollection.find().toArray();
         res.send(result);
      });

      app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
         const id = req.params.id;
         const query = { _id: new ObjectId(id) };
         const result = await usersCollection.deleteOne(query);
         res.send(result);
      });

      app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
         const id = req.params.id;
         const filter = { _id: new ObjectId(id) };
         const updateDoc = {
            $set: {
               role: "admin",
            },
         };
         const result = await usersCollection.updateOne(filter, updateDoc);
         res.send(result);
      });
      // Offers Api
      app.post("/offers", async (req, res) => {
         const offer = req.body;
         const result = await offersCollection.insertOne(offer);
         res.send(result);
      });

      app.get("/offers", async (req, res) => {
         const result = await offersCollection.find().toArray();
         res.send(result);
      });

      // booking api
      app.post("/bookings", async (req, res) => {
         const user = req.body;
         const result = await bookingCollection.insertOne(user);
         res.send(result);
      });

      app.get("/bookingsAll", async (req, res) => {
         const result = await bookingCollection.find().toArray();
         res.send(result);
      });
      app.get("/bookings", verifyToken, async (req, res) => {
         const email = req.query.email;
         const query = { email: email };
         const result = await bookingCollection.find(query).toArray();
         res.send(result);
      });
      app.delete("/bookings/:id", verifyToken, async (req, res) => {
         const id = req.params.id;
         const query = { _id: new ObjectId(id) };
         const result = await bookingCollection.deleteOne(query);
         res.send(result);
      });
      //   services api
      app.get("/service", async (req, res) => {
         const result = await servicesCollection.find().toArray();
         res.send(result);
      });

      app.get("/service/:id", async (req, res) => {
         const id = req.params.id;
         const query = { _id: new ObjectId(id) };
         const result = await servicesCollection.findOne(query);
         res.send(result);
      });
      // payment api
      app.post("/create-payment-intent", async (req, res) => {
         const { price } = req.body;
         const amount = parseInt(price * 100);
         const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            payment_method_types: ["card"],
         });
         console.log("ami achi re", paymentIntent);

         res.send({
            clientSecret: paymentIntent.client_secret,
         });
      });
      app.post("/payment", async (req, res) => {
         const payment = req.body;
         const result = await paymentCollection.insertOne(payment);
         console.log(payment, "payment box");
         const query = {
            _id: {
               $in: payment.bookingId.map((id) => new ObjectId(id)),
            },
         };
         console.log(query, "i am is query");

         const deleteResult = await bookingCollection.deleteMany(query);

         res.send({ result, deleteResult });
      });

      app.get("/payment/:email", verifyToken, async (req, res) => {
         const email = { email: req.params.email };
         if (req.params.email !== req.decoded.email) {
            return res.status(403).send({ message: "forbidden access" });
         }
         const result = await paymentCollection.find(email).toArray();
         res.send(result);
      });

      // Send a ping to confirm a successful connection
      // await client.db("admin").command({ ping: 1 });
      // console.log("Pinged your deployment. You successfully connected to MongoDB!");
   } finally {
      // Ensures that the client will close when you finish/error
      // await client.close();
   }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
   res.send("Assignment 12 server");
});

app.listen(port, () => {
   console.log(`assignment sever 12 POST ${port}`);
});

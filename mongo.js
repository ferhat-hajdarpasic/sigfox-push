const MongoClient = require('mongodb').MongoClient;

const sendData = async (result) => {
  try {
    if (process.env.MONGODBADMIN_PASSWORD) {
      const uri = `mongodb+srv://mongodbadmin:${process.env.MONGODBADMIN_PASSWORD}@cluster0-5vszl.mongodb.net/test?retryWrites=true&w=majority`;
      const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
      try {
        await client.connect();

        const records = client.db("airtracker").collection("records");
        await records.insertOne(result);
      } finally {
        client.close();
      }
    } else {
      console.log("Mongo password is not set.");
    }
  } catch (e) {
    console.log(e);
  }
}

module.exports = { sendData };
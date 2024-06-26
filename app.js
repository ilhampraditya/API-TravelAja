require("dotenv").config();
const express = require("express");
const app = express();
const logger = require("morgan");
const cors = require("cors");
const port = process.env.PORT || 3000;
const router = require("./routes/v1");
require("./libs/node-cron");

app.use(logger("dev"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(router);

app.use((err, req, res, next) => {
  res.status(500).json({
    status: false,
    message: err.message,
    data: null,
  });
});

app.use((req, res, next) => {
  res.status(404).json({
    status: false,
    message: `are you lost? ${req.method} ${req.url} is not registered!`,
    data: null,
  });
});

module.exports = app;

app.listen(port, () => {
  console.log(`Server is runing at port ${port}`);
});

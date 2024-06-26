const express = require("express");
const router = express.Router();
const User = require("../v1/user.routes");
const Airport = require("../v1/airport.routes");
const Airlines = require("../v1/airlines.routes");
const Flight = require("../v1/flights.routes");
const Promotion = require("../v1/promotion.routes");
const Seatclass = require("../v1/seatclass.routes");
const Seat = require("../v1/seat.routes");
const Payment = require("../v1/payment.routes");
const Passenger = require("../v1/passenger.routes");
const Booking = require("../v1/booking.routes");
const Notification = require("../v1/notification.routes");
const Ticket = require("../v1/tickets.route");

const swaggerUI = require("swagger-ui-express");
const YAML = require("yaml");
const fs = require("fs");
const path = require("path");

const swagger_path = path.resolve(__dirname, "../../docs/openapi.yaml");
const file = fs.readFileSync(swagger_path, "utf-8");

const swaggerDocument = YAML.parse(file);
router.use(
  "/api/v1/api-docs",
  swaggerUI.serve,
  swaggerUI.setup(swaggerDocument)
);

router.use(
  "/api/v1",
  User,
  Airport,
  Airlines,
  Flight,
  Promotion,
  Seatclass,
  Seat,
  Payment,
  Passenger,
  Booking,
  Notification,
  Ticket
);

module.exports = router;

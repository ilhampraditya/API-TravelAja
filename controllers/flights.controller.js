const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  getAllFlights: async (req, res, next) => {
    try {
      const flights = await prisma.flights.findMany({
        include: {
          airlines: true,
          arrival_airport: true,
          destination_airport: true,
          promotion: true,
        },
      });

      return res.status(200).json({
        status: true,
        message: "Data penerbangan berhasil diambil",
        data: flights,
      });
    } catch (error) {
      next(error);
    }
  },

  getFlightById: async (req, res, next) => {
    const id = req.params.id;
    try {
      const flight = await prisma.flights.findUnique({
        where: { flight_code: id },
        include: {
          airlines: true,
          arrival_airport: true,
          destination_airport: true,
          promotion: true,
        },
      });

      if (!flight) {
        return res.status(404).json({
          status: false,
          message: "Penerbangan tidak ditemukan",
          data: null,
        });
      }

      res.status(200).json({
        status: true,
        message: "Data penerbangan berhasil diambil",
        data: flight,
      });
    } catch (error) {
      next(error);
    }
  },

  createFlight: async (req, res, next) => {
    const {
      flight_id,
      price,
      date,
      departure_time,
      arrival_time,
      airline_id,
      arrival_airport_id,
      destination_airport_id,
      promotion_id
    } = req.body;

    try {

      const airlineExists = await prisma.airlines.findUnique({
        where: { airline_id: airline_id },
      });

      if (!airlineExists) {
        return res.status(400).json({
          status: false,
          message: "Airline tidak ditemukan",
          data: null,
        });
      }

      const flightExist = await prisma.flights.findUnique({ where: { flight_id } })

      if (flightExist) {
        return res.status(400).json({
          status: false,
          message: "Kode penerbangan sudah ada, silahkan coba yang lain!",
          data: null,
        });
      }

      const arrivalAirportExists = await prisma.airport.findUnique({
        where: { id: arrival_airport_id },
      });

      const destinationAirportExists = await prisma.airport.findUnique({
        where: { id: destination_airport_id },
      });

      if (!arrivalAirportExists || !destinationAirportExists) {
        return res.status(400).json({
          status: false,
          message: "Salah satu atau kedua bandara tidak ditemukan",
          data: null,
        });
      }

      if (arrival_airport_id == destination_airport_id) {
        return res.status(400).json({
          status: false,
          message: "Bandara awal dan tujuan tidak boleh sama",
          data: null,
        });
      }

      if (promotion_id) {
        const promotion = await prisma.promotion.findUnique({ where: { promotion_id } })
        const flight = await prisma.flights.create({
          data: {
            flight_id,
            price,
            total_price: (price - (price * (promotion.discount / 100))),
            date,
            departure_time,
            arrival_time,
            arrival_airport_id,
            destination_airport_id,
            airline_id,
            promotion_id
          },
        });

        return res.status(201).json({
          status: true,
          message: "Penerbangan berhasil dibuat",
          data: flight,
        });

      } else {
        const flight = await prisma.flights.create({
          data: {
            flight_id,
            price,
            total_price: price,
            date,
            departure_time,
            arrival_time,
            arrival_airport_id,
            destination_airport_id,
            airline_id
          },
        });

        return res.status(201).json({
          status: true,
          message: "Penerbangan berhasil dibuat",
          data: flight,
        });
      }
    } catch (error) {
      next(error);
    }
  },
};

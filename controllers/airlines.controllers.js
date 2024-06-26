const sharp = require("sharp");
const path = require("path");
const imagekit = require("../libs/imagekit");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  getAllAirlines: async (req, res, next) => {
    try {
      const airlines = await prisma.airlines.findMany();
      return res.status(200).json({
        status: true,
        message: "Data maskapai penerbangan berhasil diambil",
        data: airlines,
      });
    } catch (error) {
      next(error);
    }
  },

  createAirline: async (req, res, next) => {
    const { role } = req.user;
    let { airline_id, airline_name, baggage, cabin_baggage } = req.body;

    try {
      if (role !== "admin") {
        return res.status(400).json({
          status: true,
          message: "Anda bukan admin!",
          data: null,
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: false,
          message: "file tidak ada!",
          data: null,
        });
      }

      const resizedBuffer = await sharp(req.file.buffer)
        .resize(300, 300)
        .toFormat("jpeg")
        .jpeg({ quality: 90 })
        .toBuffer();

      let strFile = resizedBuffer.toString("base64");

      let { url } = await imagekit.upload({
        fileName: Date.now() + path.extname(req.file.originalname),
        file: strFile,
      });

      const airline = await prisma.airlines.create({
        data: {
          airline_id,
          airline_name,
          baggage,
          cabin_baggage,
          url_logo: url,
        },
      });

      return res.status(201).json({
        status: true,
        message: "Maskapai penerbangan berhasil dibuat",
        data: airline,
      });
    } catch (error) {
      next(error);
    }
  },
  updateAirline: async (req, res, next) => {
    const { role } = req.user;
    const { airline_id } = req.params;
    const { airline_name, baggage, cabin_baggage } = req.body;

    try {
      if (role !== "admin") {
        return res.status(400).json({
          status: true,
          message: "Anda bukan admin!",
          data: null,
        });
      }

      if (req.file) {
        const resizedBuffer = await sharp(req.file.buffer)
          .resize(300, 300)
          .toFormat("jpeg")
          .jpeg({ quality: 90 })
          .toBuffer();

        let strFile = resizedBuffer.toString("base64");

        let { url } = await imagekit.upload({
          fileName: Date.now() + path.extname(req.file.originalname),
          file: strFile,
        });

        const updatedAirline = await prisma.airlines.update({
          where: { airline_id },
          data: { airline_name, baggage, cabin_baggage, url_logo: url },
        });

        return res.status(200).json({
          status: true,
          message: "Maskapai penerbangan berhasil diupdate",
          data: updatedAirline,
        });
      }
    } catch (error) {
      next(error);
    }
  },
};

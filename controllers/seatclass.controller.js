const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  getAllSeatClasses: async (req, res, next) => {
    try {
        const { search } = req.query;
        const searchConditions = search
            ? {
                OR: [
                    { seat_class_ty: { contains: search, mode: "insensitive" } },
                    { seat_class_code: { contains: search, mode: "insensitive" } }
                ]
            }
            : {};

        const seatClass = await prisma.seatClass.findMany({
            where: searchConditions,
        });
      return res.status(200).json({
        status: true,
        message: "Data kelas kursi berhasil diambil",
        data: seatClass,
      });
    } catch(error) {
      next(error);
    }
  },

  

  createSeatClass: async (req, res, next) => {
    const { seat_class_code, seat_class_name } = req.body;
    try {
      const seatClass = await prisma.seatClass.create({
        data: {
          seat_class_code,
          seat_class_name,
        },
      });
      return res.status(201).send({
        status: true,
        message: "Kelas kursi berhasil dibuat",
        data: seatClass,
      });
    } catch (error) {
      next(error);
    }
  },
};

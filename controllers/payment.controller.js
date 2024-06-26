const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { MIDTRANS_SERVER_KEY, FRONT_END_URL, MIDTRANS_APP_URL } = process.env;
const crypto = require("crypto");
const imagekit = require("../libs/imagekit");
const QRCode = require("qrcode");

module.exports = {
  getPayment: async (req, res, next) => {
    try {
      const payment = await prisma.payment.findMany();
      return res.status(200).json({
        status: true,
        message: "Data pembayaran berhasil diambil",
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  createPaymentMidtrans: async (req, res, next) => {
    let { booking_code } = req.body;

    try {
      const booking = await prisma.booking.findUnique({
        where: { booking_code },
      });

      const user = await prisma.user.findUnique({
        where: { user_id: booking.user_id },
      });

      const flight = await prisma.flights.findUnique({
        where: {
          flight_id: booking.flight_id,
        },
      });

      pricePerTicket = flight.price;

      const passengers = await prisma.passenger.findMany({
        where: {
          booking_id: booking.booking_id,
        },
      });

      for (const passenger of passengers) {
        const ticket = await prisma.ticket.findUnique({
          where: { passenger_id: passenger.passenger_id },
        });

        await prisma.seat.update({
          where: { seat_id: ticket.seat_id },
          data: { status: "CHECK_AGAIN_LATER" },
        });
      }

      const passengerTotal = Number(passengers.length);

      total_price = pricePerTicket * passengerTotal;

      transaction_id = booking_code;
      gross_amount = total_price;

      const authString = btoa(`${MIDTRANS_SERVER_KEY}:`);

      const payload = {
        transaction_details: {
          order_id: transaction_id,
          gross_amount,
        },
        customer_details: {
          first_name: user.name,
          email: user.email,
        },
        callbacks: {
          finish: `${FRONT_END_URL}/booking-status?booking_code=${booking_code}`,
          error: `${FRONT_END_URL}/booking-status?booking_code=${booking_code}`,
          pending: `${FRONT_END_URL}/booking-status?booking_code=${booking_code}`,
        },
      };

      const response = await fetch(
        `https://app.sandbox.midtrans.com/snap/v1/transactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${authString}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (response.status !== 201) {
        return res.status(500).json({
          status: "error",
          message: "Gagal membuat transaksi!",
        });
      }

      const payment = await prisma.payment.create({
        data: {
          total_price,
        },
      });

      const updatedBooking = await prisma.booking.update({
        where: { booking_code },
        data: {
          snap_token: data.token,
          snap_redirect_url: data.redirect_url,
          payment_id: payment.payment_id,
        },
      });

      res.status(200).json({
        status: "true",
        message: "success",
        data: updatedBooking,
      });
    } catch (error) {
      next(error);
    }
  },

  webhookNotification: async (req, res, next) => {
    const data = req.body;

    try {
      if (!data) {
        res.status(400).json({
          status: "error",
          message: "field dibutuhkan!",
          data: null,
        });
      }

      const booking = await prisma.booking.findUnique({
        where: { booking_code: data.order_id },
      });
      if (booking) {
        const hash = crypto
          .createHash("sha512")
          .update(
            `${booking.booking_code}${data.status_code}${data.gross_amount}${MIDTRANS_SERVER_KEY}`
          )
          .digest("hex");
        if (data.signature_key !== hash) {
          return {
            status: "error",
            message: "invalid signature key!",
          };
        }

        const flight = await prisma.flights.findUnique({
          where: { flight_id: booking.flight_id },
        });

        let responseData = null;
        let transactionStatus = data.transaction_status;
        let fraudStatus = data.fraud_status;

        if (transactionStatus == "capture") {
          if (fraudStatus == "accept") {
            let payment = await prisma.payment.update({
              where: { payment_id: booking.payment_id },
              data: { status: "PAID" },
            });
            responseData = payment;
            await prisma.notification.create({
              data: {
                title: "Pembayaran Berhasil",
                message: `Pembayaran untuk booking dengan kode ${booking.booking_code} berhasil.`,
                user_id: booking.user_id,
              },
            });
            const passengers = await prisma.passenger.findMany({
              where: { booking_id: booking.booking_id },
            });

            for (const passenger of passengers) {
              const ticket = await prisma.ticket.findUnique({
                where: { passenger_id: passenger.passenger_id },
              });

              const seat = await prisma.seat.update({
                where: { seat_id: ticket.seat_id },
                data: { status: "BOOKED" },
              });

              const updatedTicket = await prisma.ticket.update({
                where: { passenger_id: passenger.passenger_id },
                data: { isActive: true },
              });
              let QRContent = `TICKET_ID:${updatedTicket.ticket_id}\nDEPARTURE_CODE:${flight.arrival_airport_id}\nDESTINATION_CODE:${flight.destination_airport_id}\nSEAT_NUMBER:${seat.seat_number}\nPASSENGER_NAME:${passenger.fullname}`;
              const qrCodeDataURL = await QRCode.toDataURL(QRContent);
              const base64Data = qrCodeDataURL.replace(
                /^data:image\/png;base64,/,
                ""
              );
              const buffer = Buffer.from(base64Data, "base64");
              let { url } = await imagekit.upload({
                fileName: Date.now() + ".png",
                file: buffer,
              });

              await prisma.ticket.update({
                where: { passenger_id: passenger.passenger_id },
                data: { url_qrcode: url },
              });
            }
          }
        } else if (transactionStatus == "settlement") {
          let payment = await prisma.payment.update({
            where: { payment_id: booking.payment_id },
            data: { status: "PAID" },
          });
          responseData = payment;

          await prisma.notification.create({
            data: {
              title: "Pembayaran Berhasil",
              message: `Pembayaran untuk booking dengan kode ${booking.booking_code} berhasil.`,
              user_id: booking.user_id,
            },
          });

          const passengers = await prisma.passenger.findMany({
            where: { booking_id: booking.booking_id },
          });

          for (const passenger of passengers) {
            const ticket = await prisma.ticket.findUnique({
              where: { passenger_id: passenger.passenger_id },
            });

            const seat = await prisma.seat.update({
              where: { seat_id: ticket.seat_id },
              data: { status: "BOOKED" },
            });

            const updatedTicket = await prisma.ticket.update({
              where: { passenger_id: passenger.passenger_id },
              data: { isActive: true },
            });
            let QRContent = `TICKET_ID:${updatedTicket.ticket_id}\nDEPARTURE_CODE:${flight.arrival_airport_id}\nDESTINATION_CODE:${flight.destination_airport_id}\nSEAT_NUMBER:${seat.seat_number}\nPASSENGER_NAME:${passenger.fullname}`;
            const qrCodeDataURL = await QRCode.toDataURL(QRContent);
            const base64Data = qrCodeDataURL.replace(
              /^data:image\/png;base64,/,
              ""
            );
            const buffer = Buffer.from(base64Data, "base64");
            let { url } = await imagekit.upload({
              fileName: Date.now() + ".png",
              file: buffer,
            });

            await prisma.ticket.update({
              where: { passenger_id: passenger.passenger_id },
              data: { url_qrcode: url },
            });
          }
        } else if (
          transactionStatus == "cancel" ||
          transactionStatus == "deny" ||
          transactionStatus == "expire"
        ) {
          let payment = await prisma.payment.update({
            where: { payment_id: booking.payment_id },
            data: { status: "CANCELED" },
          });
          responseData = payment;
          await prisma.notification.create({
            data: {
              title: "Pembayaran Gagal",
              message: `Pembayaran untuk booking dengan kode ${booking.booking_code} gagal.`,
              user_id: booking.user_id,
            },
          });

          const passengers = await prisma.passenger.findMany({
            where: { booking_id: booking.booking_id },
          });

          for (const passenger of passengers) {
            const ticket = await prisma.ticket.findUnique({
              where: { passenger_id: passenger.passenger_id },
            });

            await prisma.seat.update({
              where: { seat_id: ticket.seat_id },
              data: { status: "AVAILABLE" },
            });

            await prisma.ticket.delete({
              where: { ticket_id: ticket.ticket_id },
            });
          }
        } else if (transactionStatus == "pending") {
          let payment = prisma.payment.update({
            where: { payment_id: booking.payment_id },
            data: { status: "PENDING_PAYMENT" },
          });
          responseData = payment;
        }
      }

      res.status(200).json({
        status: "success",
        message: "OK",
      });
    } catch (error) {
      next(error);
    }
  },
};

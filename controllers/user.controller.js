require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { JWT_SECRET_KEY, FRONT_END_URL } = process.env;
const nodemailer = require("../libs/nodemailer");
const { getHTML, sendMail } = require("../libs/nodemailer");
const { generateOTP } = require("../libs/otpGenerator");
const { generateRandomString } = require("../libs/passGenerator");

module.exports = {
  register: async (req, res, next) => {
    try {
      const { name, email, no_telp, password } = req.body;

      if (!name || !email || !no_telp || !password) {
        return res.status(400).json({
          status: false,
          message: "Nama, email, no_telp, dan password dibutuhkan!",
          data: null,
        });
      }

      const emailExist = await prisma.user.findUnique({ where: { email } });

      if (emailExist && !emailExist.isVerified) {
        await prisma.user.delete({
          where: { user_id: emailExist.user_id },
        });
      } else if (emailExist) {
        return res.status(401).json({
          status: false,
          message: "Email telah digunakan!",
          data: null,
        });
      }

      const noTelpExist = await prisma.user.findUnique({ where: { no_telp } });

      if (noTelpExist && !noTelpExist.isVerified) {
        await prisma.user.delete({
          where: { id: noTelpExist.id },
        });
      } else if (noTelpExist) {
        return res.status(401).json({
          status: false,
          message: "No. Telp telah digunakan!",
          data: null,
        });
      }

      const encryptedPassword = await bcrypt.hash(password, 10);
      const otp = generateOTP();
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          no_telp,
          password: encryptedPassword,
          otp,
          otpExpiration,
          role: "user",
          isVerified: false,
        },
      });

      const subject = "Verifikasi OTP";

      const emailContent = await getHTML("otp-email.ejs", { otp });

      await sendMail(user.email, subject, emailContent);

      const token = jwt.sign(
        {
          user_id: user.user_id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET_KEY,
        {
          expiresIn: "1d",
        }
      );

      return res.status(201).json({
        status: true,
        message:
          "User telah berhasil terdaftar. Silakan periksa email Anda untuk OTP.",
        data: { token: token },
      });
    } catch (error) {
      next(error);
    }
  },

  renewOTP: async (req, res, next) => {
    try {
      const { email } = req.body;

      const user = await prisma.user.findFirst({
        where: { email },
      });

      if (!user) {
        return res.status(400).json({
          status: false,
          message: "Token verifikasi tidak valid",
          data: null,
        });
      }

      if (user.isVerified) {
        return res.status(400).json({
          status: false,
          message:
            "Pengguna sudah diverifikasi dan tidak dapat memperbarui OTP",
          data: null,
        });
      }

      if (user.email !== email) {
        return res.status(400).json({
          status: false,
          message: "Email tidak cocok dengan pengguna yang terdaftar",
          data: null,
        });
      }

      const otp = generateOTP();

      await prisma.user.update({
        where: { user_id: user.user_id },
        data: {
          otp: otp,
          otpExpiration: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      const subject = "Verifikasi OTP Baru";
      const emailContent = await getHTML("otp-email.ejs", { otp });

      await sendMail(user.email, subject, emailContent);

      return res.status(200).json({
        status: true,
        message:
          "OTP telah berhasil diperbarui. Silakan periksa email Anda untuk OTP yang baru.",
        data: null,
      });
    } catch (error) {
      next(error);
    }
  },

  verifyOtp: async (req, res, next) => {
    try {
      const { user_id } = req.user;
      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({
          status: false,
          message: "OTP diperlukan!",
          data: null,
        });
      }

      const user = await prisma.user.findUnique({
        where: { user_id },
      });

      if (user.otp !== otp) {
        return res.status(401).json({
          status: false,
          message: "OTP tidak valid atau telah kedaluwarsa!",
          data: null,
        });
      }

      await prisma.user.update({
        where: { user_id: user.user_id },
        data: {
          isVerified: true,
          otp: null,
          otpExpiration: null,
        },
      });

      await prisma.notification.create({
        data: {
          title: "Registrasi Berhasil",
          message: `Hi! ${user.name} Akun Anda telah berhasil dibuat`,
          user_id: user.user_id,
        },
      });

      return res.status(200).json({
        status: true,
        message: "User berhasil diverifikasi",
        data: null,
      });
    } catch (error) {
      next(error);
    }
  },

  login: async (req, res, next) => {
    try {
      const { emailOrNoTelp, password } = req.body;

      if (!emailOrNoTelp || !password) {
        return res.status(400).json({
          status: false,
          message: "Email atau No. Telp dan password harus diisi!",
          data: null,
        });
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ email: emailOrNoTelp }, { no_telp: emailOrNoTelp }],
        },
      });

      if (!user) {
        return res.status(404).json({
          status: false,
          message: "Email atau nomor telepon tidak valid!",
          data: null,
        });
      }

      const isPasswordCorrect = await bcrypt.compare(password, user.password);
      if (!isPasswordCorrect) {
        return res.status(401).json({
          status: false,
          message: "Password tidak valid!",
          data: null,
        });
      }
      if (!user.isVerified) {
        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: emailOrNoTelp }, { no_telp: emailOrNoTelp }],
          },
        });

        await prisma.user.delete({
          where: { user_id: user.user_id },
        });

        return res.status(403).json({
          status: false,
          message: "Akun Belum terverifikasi, silahkan register ulang!",
          data: null,
        });
      }
      delete user.password;
      const token = jwt.sign(
        { user_id: user.user_id, email: user.email, role: user.role },
        JWT_SECRET_KEY,
        { expiresIn: "1d" }
      );

      return res.status(200).json({
        status: true,
        message: "Login berhasil",
        data: { ...user, token },
      });
    } catch (error) {
      next(error);
    }
  },

  getAllUsers: async (req, res, next) => {
    try {
      const users = await prisma.user.findMany();
      return res.status(200).json({
        status: true,
        message: "Data pengguna berhasil diambil",
        data: users,
      });
    } catch (error) {
      next(error);
    }
  },

  auth: async (req, res, next) => {
    try {
      return res.status(200).json({
        status: true,
        message: "OK",
        data: req.user,
      });
    } catch (error) {
      next(error);
    }
  },

  forgotPassword: async (req, res, next) => {
    try {
      let { email } = req.body;
      const findUser = await prisma.user.findUnique({ where: { email } });

      if (!findUser) {
        return res.status(404).json({
          status: false,
          message: "Email tidak ditemukan",
        });
      }
      const token = jwt.sign(
        { user_id: findUser.user_id, email: findUser.email },
        JWT_SECRET_KEY
      );

      const html = await nodemailer.getHTML("email-reset-password.ejs", {
        name: findUser.name,
        url: `${FRONT_END_URL}/reset?token=${token}`,
      });

      try {
        await nodemailer.sendMail(email, "Email Forget Password", html);
        return res.status(200).json({
          status: true,
          message: "Sukses kirim Email Forget Password",
        });
      } catch (error) {
        return res.status(500).json({
          status: false,
          message: "gagal mengirim email",
        });
      }
    } catch (error) {
      next(error);
    }
  },

  verifyResetToken: async (req, res, next) => {
    const { token } = req.query;

    jwt.verify(token, JWT_SECRET_KEY, (err, decoded) => {
      if (err) {
        return res.status(400).json({
          status: false,
          message: "Invalid or expired token",
        });
      }

      res.status(200).json({
        status: true,
        message: "Token is valid",
        data: { email: decoded.email },
      });
    });
  },

  resetPassword: async (req, res, next) => {
    try {
      let { user_id } = req.user;
      let { password, confirmPassword } = req.body;

      if (!password || !confirmPassword) {
        return res.status(400).json({
          status: false,
          message: "Password dan Konfirmasi password harus diisi",
          data: null,
        });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({
          status: false,
          message: "Pastikan Password dan konfirmasi Password cocok!",
          data: null,
        });
      }

      const user = await prisma.user.findUnique({
        where: { email: req.user.email },
        select: { password: true },
      });

      if (!user) {
        return res.status(404).json({
          status: false,
          message: "Pengguna tidak ditemukan",
          data: null,
        });
      }
      const isSamePassword = await bcrypt.compare(password, user.password);
      if (isSamePassword) {
        return res.status(400).json({
          status: false,
          message: "Password baru tidak boleh sama dengan Password lama!",
          data: null,
        });
      }

      let encryptedPassword = await bcrypt.hash(password, 10);
      const updateUser = await prisma.user.update({
        where: { email: req.user.email },
        data: { password: encryptedPassword },
        select: { user_id: true, email: true, password: true },
      });

      await prisma.notification.create({
        data: {
          title: "Password anda telah berubah",
          message: "Password akun Anda telah berhasil diubah",
          user_id: updateUser.user_id,
        },
      });

      res.status(200).json({
        status: true,
        message: "Berhasil mengatur ulang password pengguna!",
        data: updateUser,
      });
    } catch (err) {
      next(err);
    }
  },

  getuserbyid: async (req, res, next) => {
    try {
      let { user_id } = req.user;
      user_id = Number(user_id);
      const user = await prisma.user.findUnique({ where: { user_id } });

      if (!user) {
        return res.status(400).json({
          status: false,
          message: "User tidak ditemukan!",
          data: null,
        });
      }

      return res.status(200).json({
        status: true,
        message: "Data pengguna berhasil diambil",
        data: {
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          no_telp: user.no_telp,
          avatar_url: user.avatar_url,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  updateuserbyid: async (req, res, next) => {
    try {
      let { user_id } = req.user;
      let { name, no_telp } = req.body;
      user_id = Number(user_id);
      const user = await prisma.user.findUnique({ where: { user_id } });

      if (!user) {
        return res.status(401).json({
          status: false,
          message: "User tidak ditemukan!",
          data: null,
        });
      }

      if (name) {
        await prisma.user.update({
          where: { user_id },
          data: { name },
        });
      }

      if (no_telp) {
        const noTelpExist = await prisma.user.findUnique({
          where: { no_telp },
        });

        if (noTelpExist) {
          return res.status(400).json({
            status: false,
            message: "No. Telp telah digunakan!",
            data: null,
          });
        }

        await prisma.user.update({
          where: { user_id },
          data: { no_telp },
        });
      }

      const userProfile = await prisma.user.findUnique({ where: { user_id } });

      return res.status(200).json({
        status: true,
        message: "User profile berhasil diupdate!",
        data: {
          user_id: userProfile.user_id,
          name: userProfile.name,
          no_telp: userProfile.no_telp,
          avatar_url: userProfile.avatar_url,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  googleOauth2: async (req, res) => {
    const user = req.user;
    let token = jwt.sign({ user_id: user.user_id }, JWT_SECRET_KEY);

    const userExist = await prisma.user.findUnique({
      where: { user_id: user.user_id },
    });

    if (userExist && !userExist.password) {
      const password = generateRandomString();
      const encryptedPassword = await bcrypt.hash(password, 10);
      const updatedUser = await prisma.user.update({
        where: { user_id: user.user_id },
        data: { password: encryptedPassword },
      });

      const subject = "Kredensial Akun TravelAja";
      const emailContent = await getHTML("random-password.ejs", {
        email: updatedUser.email,
        password,
      });
      await sendMail(updatedUser.email, subject, emailContent);

      await prisma.notification.create({
        data: {
          title: "Login dengan google pertama kali berhasil",
          message: `Silahkan Cek Email anda untuk kredensial akun, silahkan ubah password sesuai keinginan!`,
          user_id: user.user_id,
        },
      });

      link = `${FRONT_END_URL}/?token=${token}`;

      return res.redirect(link);
    }

    link = `${FRONT_END_URL}/?token=${token}`;

    return res.redirect(link);
  },
  changePassword: async (req, res, next) => {
    try {
      let { user_id } = req.user;
      let { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          status: false,
          message: "field dibutuhkan!",
          data: null,
        });
      }

      const user = await prisma.user.findUnique({ where: { user_id } });

      const isSamePassword = await bcrypt.compare(oldPassword, user.password);

      if (!isSamePassword) {
        return res.status(401).json({
          status: false,
          message: "Password lama tidak sesuai!",
          data: null,
        });
      }

      let encryptedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { user_id },
        data: { password: encryptedPassword },
      });

      return res.status(200).json({
        status: true,
        message: "Password berhasil diubah!",
        data: null,
      });
    } catch (error) {
      next(error);
    }
  },
};

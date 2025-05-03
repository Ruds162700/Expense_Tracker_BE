const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");


router.post("/login", authController.login);

router.post("/signup", authController.register);


router.post("/verify_otp", authController.verifyOTP);

router.post("/resend_otp", authController.resendOTP);

router.post("/add_password", authController.addPassword);

router.post("/checkandaddpass", authController.checkAndAddPass);

router.get("/google", authController.googleAuth);

router.get("/google/callback", authController.googleCallback);


module.exports = router;

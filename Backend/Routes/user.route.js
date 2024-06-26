
const express = require("express");

const { URL } = require('../Config/backend-url');

const { UserModel } = require("../Models/user.model")

const bcrypt = require("bcrypt");

const nodemailer = require("nodemailer");

require("dotenv").config()
const jwt = require("jsonwebtoken");

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const { client } = require("../Config/redis");
const { passport } = require("../Config/google-oauth")
const { blackmodel } = require("../Models/blackmodel");

const { middleware } = require("../Middlewares/auth.middleware");


const userroute = express.Router()


userroute.get("/", (req, res) => {
    res.send("user route")
})

/**
 * @swagger
 * components:
 *   schemas:
 *     userSchema:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         Name:
 *           type: string
 *         Email:
 *           type: string
 *         Password:
 *           type: string
 *         Address:
 *           type: string
 *         Gender:
 *           type: string
 *           enum: [Male, Female, Other]
 *         Role:
 *           type: string
 *           enum: [Admin, User, Guest]
 */

/**
 * @swagger
 * /user/register:
 *  post:
 *      summary: To add a new user to the database
 *      tags: [posts]
 *      requestBody:
 *          required: true
 *          content:
 *              application/json:
 *                  schema:
 *                      $ref: '#/components/schemas/userSchema'
 *      responses:
 *          200:
 *              description: User Registration Successfull. Please verify Your Email Address.
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/userSchema'
 *          500:
 *              description: Some server error
 */
userroute.post("/register", async (req, res) => {
    try {
        console.log("here,", req.body )
        let { Name, Email, Password, Address, Gender } = req.body
        let user = await UserModel.findOne({ Email });

        console.log('print user => ', user)

        if (user) {
            return res.status(400).send({ "msg": "Your Accound Already Exits. Please Login." })
        }

        let hashpasswod = bcrypt.hashSync(Password, 6)

        let newuser = new UserModel({ Name, Email, Password: hashpasswod, Address, Gender, Role: "User" })
        newuser.ismailverified = false
        let dbnewuser = await newuser.save()

        console.log("new user for db => ", dbnewuser)

        let userid = dbnewuser._id;

        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'pradhansaman2017@gmail.com',
                pass: process.env.googlepassword
            }
        });

        const BaseUrl_Backend = `https://qr-code-insights.onrender.com`

        let mailOptions = {
            from: 'pradhansaman2017@gmail.com',
            to: Email,
            subject: 'Email For User Verification',
            html: `<p>Hi ${Name} <br> Welcome To QR-insight. <br/> Please click here to <a href="${BaseUrl_Backend}/user/verify?id=${userid}">verify</a>  your Email. </p>`
        };

        console.log('mailOptions => ', mailOptions)

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                console.log('email sent failed')
                return res.status(500).send({ "msg": "Something Went Wrong. Try After Some Time" })
            } else {
                console.log('Email sent: ' + info.response);
                console.log('email sent successfully')
                return res.status(200).send({ "msg": "User registered successfully. Please Verify Your Email Address." })
            }
        });



    } catch (error) {
        console.log('error while register => ', error)
        return res.status(500).send({ "msg": error.message })

    }
})


// verify mail route 
/**
 * @swagger
 *   /user/verify:
 *   get:
 *     summary: This route will verified the mail and give the acces to login
 *     tags: [get]
 *     responses:
 *       200:
 *         description: vefified the mail.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               items:
 *                 $ref: '#/components/schemas/userSchema'
 */
userroute.get("/verify", async (req, res) => {
    try {
        let { id } = req.query
        let userverify = await UserModel.findOne({ _id: id })

        if (!userverify) {
            return res.status(400).send({ "msg": "Kindly Enter Valid Email Address." })
        }

        userverify.ismailverified = true
        await userverify.save()
        res.status(200).send({ "msg": "User Email Verified Successfully." })

    } catch (error) {
        res.status(200).send({ "msg": error.message })
    }
})

/**
 * @swagger
 * /user/login:
 *  post:
 *      summary: To login with thw website
 *      tags: [posts]
 *      requestBody:
 *          required: true
 *          content:
 *              application/json:
 *                  schema:
 *                      $ref: '#/components/schemas/userSchema'
 *      responses:
 *          200:
 *              description: Login sucessfull
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/userSchema'
 *          500:
 *              description: Some server error
 */
// login route with mail and password
userroute.post("/login", async (req, res) => {
    try {
        let { Email, Password } = req.body

        let user = await UserModel.findOne({ Email })

        if (!user) {
            return res.status(400).send({ "msg": "Kindly Register First." })
        }

        if (user.ismailverified == false) {
            return res.status(400).send({ "msg": "Please Verify Your Email." })
        }

        let decrupt = await bcrypt.compare(Password, user.Password)
        console.log(decrupt)

        if (!decrupt) {
            return res.status(400).send({ "msg": "Invalid Password" })
        }

        let token = jwt.sign({ id: user._id, verified: user.ismailverified, role: user.Role }, process.env.secretkey, { expiresIn: "6hr" })
        let refreshtoken = jwt.sign({ id: user._id, verified: user.ismailverified, role: user.Role }, process.env.secretkey, { expiresIn: "1d" })

        client.set('token', token, 'EX', 21600);
        client.set('refreshtoken', refreshtoken, 'EX', 86400);

        res.status(200).send({ "msg": "Login Successfull", "userdetails": user })

    } catch (error) {
        res.status(400).send({ msg: error.message })
    }
})







//google auth

userroute.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));


userroute.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    function (req, res) {
        // Successful authentication, redirect home.
        console.log(req.user)

        const user = req.user

        let token = jwt.sign({ id: user._id, verified: user.ismailverified, role: user.Role }, process.env.secretkey, { expiresIn: "6hr" })
        let refreshtoken = jwt.sign({ id: user._id, verified: user.ismailverified, role: user.Role }, process.env.secretkey, { expiresIn: "1d" })

        client.set('token', token, 'EX', 21600);
        client.set('refreshtoken', refreshtoken, 'EX', 86400);

        const frontendURL = `https://glistening-kringle-f6d59c.netlify.app`

        res.send(`
                <a href="${frontendURL}?userid=${user._id}" id="myid" style="display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #222222; margin: 0; padding: 0; overflow: scroll;">
                    <img src="https://i.pinimg.com/originals/2e/9c/68/2e9c6878eae5bbcdaa2d07ed4dbd79b8.gif" alt="">
                </a>
                <script>
                    let a = document.getElementById('myid')
                    setTimeout(()=>{
                        a.click()
                    },4000)
                    console.log(a)
                </script>
        `)

    });


/**
 * @swagger
 *   /user/getdata:
 *   get:
 *     summary: This route will get the data by userid
 *     tags: [get]
 *     responses:
 *       200:
 *         description: userdetails.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               items:
 *                 $ref: '#/components/schemas/userSchema'
 */
userroute.get("/getdata", async (req, res) => {
    try {
        let { _id } = req.query

        let user = await UserModel.findOne({ _id })
        res.send({ "userdetails": user })

    } catch (error) {
        console.log(error)
        res.status(400).send({ error: error.message })
    }
})



//find data =======================================
/**
 * @swagger
 * /user/forgetpass:
 *  post:
 *      summary: this route will send you the otp for password update
 *      tags: [posts]
 *      requestBody:
 *          required: true
 *          content:
 *              application/json:
 *                  schema:
 *                      $ref: '#/components/schemas/userSchema'
 *      responses:
 *          200:
 *              description: send you the userdetails and otp to mail
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/userSchema'
 *          500:
 *              description: Some server error
 */
userroute.post("/forgetpass", async (req, res) => {
    try {
        let { Email } = req.body
        let user = await UserModel.findOne({ Email })
        console.log(user);
        if (user) {
            let OTP = "";
            for (let i = 0; i < 6; i++) {
                OTP += Math.floor(Math.random() * 10);
            }
            console.log("OTP ===> ", OTP)

            client.set('OTP', OTP, 'EX', 3600);

            console.log('function call for send otp mail =>', user.Name, user.Email, OTP)

            // const anssendotpfunc = await sendotpmail(user.Name, user.Email, OTP)

            // **************************************************************************************


            
            let Name = user.Name
            let otp = OTP



            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'pradhansaman2017@gmail.com',
                    pass: process.env.googlepassword
                }
            });

            let mailOptions = {
                from: 'pradhansaman2017@gmail.com',
                to: Email,
                subject: 'Email For OTP Verifecation',
                html: `<p>Hi ${Name} <br> Please use this OTP to update your password.<br> ${otp} </p>`
            };

            console.log('mailOptions for send otp ==> ', mailOptions)

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                    console.log('error while sending otp on mail. email sent failed')

                    return res.status(200).send({"userdetails": user})

                } else {
                    console.log('Email sent: ' + info.response);
                    console.log('email sent successfull for otp')
                    return res.status(200).send({"userdetails": user})

                }
            });


            // ******************************************************************************************

           

        }else{
            console.log('This Case Work When User is Not Found in DB');
            res.status(400).send({error:"Something Went Wrong. Try After Some Time"})
        }
        // res.send({ "userdetails": user })
    } catch (error) {
        console.log(error)
        res.status(400).send({
            error: error.message
        })
    }
})

/**
 * @swagger
 * /user/verifyotp:
 *  post:
 *      summary: this route will verify your mail
 *      tags: [posts]
 *      requestBody:
 *          required: true
 *          content:
 *              application/json:
 *                  schema:
 *                      $ref: '#/components/schemas/userSchema'
 *      responses:
 *          200:
 *              description: send you the massage for conformation of otp
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/userSchema'
 *          500:
 *              description: Some server error
 */
userroute.post("/verifyotp", async (req, res) => {
    try {
        let { OTP } = req.body
        let otp = await client.get('OTP')

        console.log('OTP from user ', OTP)
        console.log('otp from redis', otp)

        if (OTP == otp) {
            res.status(200).send({ "msg": "OTP verified Successfully" })
        } else {
            res.status(400).send({ "msg": "Invalid OTP" })
        }

    } catch (error) {
        console.log(error)
        res.status(400).send({
            error: error.message,
            msg: error.message
        })
    }
})

/**
 * @swagger
 * /user/updatepass:
 *   put:
 *     summary: To update user password in the database
 *     tags: [put]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/userSchema'
 *     responses:
 *       200:
 *         description: password update successfully please login
 *         content:
 *           application/json:
 *             schema:
 *              $ref: '#/components/schemas/userSchema'
 *       404:
 *         description: The specified user ID does not exist.
 *       500:
 *         description: Some server error
 */
userroute.put("/updatepass", async (req, res) => {
    try {
        let { id } = req.query
        let { password } = req.body

        let hashpass = bcrypt.hashSync(password, 7)
        let user = await UserModel.findById({ _id: id })

        user.Password = hashpass

        await user.save();

        console.log(user)

        res.send({ "msg": "Your Password Successfully Updated." });

    } catch (error) {
        res.send({
            error: error.message
        })
    }
})

/**
 * @swagger
 *   /user/logout:
 *   get:
 *     summary: This route will logout the user from website
 *     tags: [get]
 *     responses:
 *       200:
 *         description: userdetails.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               items:
 *                 $ref: '#/components/schemas/userSchema'
 */
//logout
userroute.get("/logout", async (req, res) => {
    try {

        let usertoken = await client.get('token');

        let userrefreshtoken = await client.get('refreshtoken');

        let blacklisttoken1 = new blackmodel({ token: usertoken });
        let blacklisttoken2 = new blackmodel({ token: userrefreshtoken });

        await blacklisttoken1.save();
        await blacklisttoken2.save();

        //console.log(usertoken,userrefreshtoken,blacklisttoken)

        res.send({ "msg": "Logout successfull" })

    } catch (error) {
        console.log(error)
        res.send({
            error: error.message,
            msg: "Something went wrong"
        })
    }

})








/**
 * @swagger
 *   /user/getallusers:
 *   get:
 *     summary: This route will return all the user 
 *     tags: [get]
 *     responses:
 *       200:
 *         description: only admin can access.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               items:
 *                 $ref: '#/components/schemas/userSchema'
 */

userroute.get('/getallusers', middleware, async (req, res) => {
    const Role = req.qr.role;

    console.log(req.qr);

    const user = await UserModel.findById({ _id: req.qr.id })

    console.log(user);

    if (Role !== 'Admin') {
        const user = []
        return res.status(400).send({ msg: "Only Admin Can Access. UnAuthorized Access", users: user })
    }

    try {
        const users = await UserModel.find()
        return res.status(200).send({
            msg: "All Users Details",
            users: users
        })

    } catch (error) {
        return res.status(400).send({ msg: error.message })
    }
})


userroute.get('/checkAccessToken', middleware, (req, res) => {
    res.status(200).send({
        isValidToken: true
    })
})


userroute.put('/updateRole/:userid', middleware, async (req, res) => {
    const Role = req.qr.role;
    if (Role !== 'Admin') {
        return res.status(400).send({
            isError: true,
            msg: "You can't change the role. (Unauthorized Access)"
        })
    }
    try {
        const { userid } = req.params;
        const user = await UserModel.findById({ _id: userid });

        if (user.Email == 'admin@qrinsight.com') {
            return res.status(400).send({
                isError: true,
                msg: "You can't change the role of this account. (Contact to Manager)."
            })
        } else {
            if (user.Role === 'Admin') {
                user.Role = 'User'
            } else {
                user.Role = 'Admin'
            }

            await user.save()

            return res.status(200).send({
                isError: false,
                msg: "User Role Successfully Updated",
                user
            })

        }

    } catch (error) {
        return res.status(400).send({
            isError: true,
            msg: error.message
        })
    }
})


module.exports = {
    userroute
}

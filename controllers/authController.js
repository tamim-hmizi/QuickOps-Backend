const User = require("../models/User");

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password required." });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        if (!user.active) {
            return res.status(403).json({ message: "Account is not active." });
        }

        res.json({
            user: {
                _id: user._id,
                email: user.email,
                active: user.active
            },
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Server error during login." });
    }
};

exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password required." });
        }

        const existing = await User.findOne({ email: email.trim().toLowerCase() });
        if (existing) {
            return res.status(409).json({ message: "User already exists." });
        }

        const user = await User.create({
            email: email.trim().toLowerCase(),
            password,
        });

        res.status(201).json({
            user: {
                _id: user._id,
                email: user.email,
            },
        });

    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: "Server error during registration." });
    }
};

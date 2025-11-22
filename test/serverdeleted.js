// --- Auth Middleware (Original) --- line 130 to 189 deleted ---
const authMiddleware = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // ---- Ensure user ID exists in decoded token
        if (!decoded.user || !decoded.user.id) {
            throw new Error('Invalid token structure');
        }
        const user = await User.findById(decoded.user.id).select('username role membership pageAccess');

        if (!user) {
             return res.status(401).json({ success: false, message: 'Invalid token: User not found.' });
        }

        // ---- Attach user info to request object
        req.user = {
            id: user._id,
            username: user.username,
            role: user.role,
            membership: user.membership,
            pageAccess: user.pageAccess
        };
        next(); // ---- Proceed to the next middleware or route handler
    } catch (ex) {
         // ---- Handle specific errors like TokenExpiredError or JsonWebTokenError
        if (ex.name === 'TokenExpiredError') {
             return res.status(401).json({ success: false, message: 'Token expired.' });
        }
        console.error('Auth Middleware Error:', ex.message); // --- Log other errors
        res.status(401).json({ success: false, message: 'Invalid token.' }); //---- General invalid token message
    }
};

// ----- Admin Auth Middleware (Original) ---
const adminAuthMiddleware = (req, res, next) => {
    // ----Check if user is attached by authMiddleware and has the correct role
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next(); // ----- User is admin or superadmin, proceed
    } else {
         // ----- User is not authenticated or not an admin
        res.status(403).json({ success: false, message: 'Forbidden: Requires Admin privileges.' });
    }
};

// --- Super Admin Auth Middleware (Original) ---
const superAdminAuthMiddleware = (req, res, next) => {
    // ---- Check if user is attached and is a superadmin
    if (req.user && req.user.role === 'superadmin') {
        next(); // ---- User is superadmin, proceed
    } else {
        // ----- User is not authenticated or not a superadmin
        res.status(403).json({ success: false, message: 'Forbidden: Requires Super Admin privileges.' });
    }
}; // deleted end 130 to 189----

// *** START: NEW 52-WEEK LOW API ROUTE *** deleted from server.js - line 907 to 
/**
 * @route   GET /api/stocks/52-week-low
 * @desc    Get stocks trading near their 52-week low.
 * @access  Private (requires auth)
 */
app.get('/api/stocks/52-week-low', authMiddleware, async (req, res) => {
    console.log(`[${new Date().toISOString()}] Received request for /api/stocks/52-week-low`);

    if (!YAHU_RAPIDAPI_KEY) {
        console.error("FATAL ERROR: YAHU_RAPIDAPI_KEY is not set.");
        return res.status(500).json({ success: false, message: "Server API key not configured." });
    }

    // --- In a real app, this list would come from a larger DB or screener ---
    // Using a sample list of 20 diverse tickers for demonstration
    const tickersToScan = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'JPM', 'PFE', 'DIS', 'BA', 'INTC', 'T', 
        'VZ', 'NKE', 'KO', 'MCD', 'XOM', 'CVX', 'META', 'NVDA', 'TSLA', 'PYPL'
    ];

    const isNumber = (val) => typeof val === 'number' && !isNaN(val);

    // API Rate Limit Settings (same as watchlist)
    const CHUNK_SIZE = 5; // 5 calls
    const DELAY_MS = 1000; // per 1 second

    // We need 'price', 'summaryDetail' (for 52w low/high), and 'summaryProfile' (for sector)
    const url = `https://${YAHU_RAPIDAPI_HOST}/stock/get-fundamentals`;
    const optionsTemplate = {
        method: 'GET',
        url: url,
        params: { 
            symbol: '', 
            modules: 'price,summaryDetail,summaryProfile', // <-- Added modules
            region: 'US',
            lang: 'en-US'
        },
        headers: {
            'x-rapidapi-key': YAHU_RAPIDAPI_KEY,
            'x-rapidapi-host': YAHU_RAPIDAPI_HOST
        }
    };

    let allResults = [];
    let filteredStocks = [];

    try {
        // Loop through tickers in chunks
        for (let i = 0; i < tickersToScan.length; i += CHUNK_SIZE) {
            const chunk = tickersToScan.slice(i, i + CHUNK_SIZE);
            console.log(`[${new Date().toISOString()}] 52W-LOW: Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.join(',')}`);

            const chunkPromises = chunk.map(ticker => {
                const options = { ...optionsTemplate, params: { ...optionsTemplate.params, symbol: ticker } };
                return axios.request(options);
            });

            const chunkResponses = await Promise.allSettled(chunkPromises);
            allResults.push(...chunkResponses);

            // If this is not the last chunk, wait
            if (i + CHUNK_SIZE < tickersToScan.length) {
                await new Promise(res => setTimeout(res, DELAY_MS));
            }
        }

        // Process all results
        allResults.forEach((response, index) => {
            const ticker = tickersToScan[index];
            if (response.status === 'fulfilled' && response.value.data?.quoteSummary?.result?.[0]) {
                const quote = response.value.data.quoteSummary.result[0];
                
                // Extract all necessary data
                const priceData = quote.price;
                const detailData = quote.summaryDetail;
                const profileData = quote.summaryProfile;

                if (priceData && detailData) {
                    const currentPrice = priceData.regularMarketPrice?.raw;
                    const low52 = detailData.fiftyTwoWeekLow?.raw;
                    const high52 = detailData.fiftyTwoWeekHigh?.raw;

                    // --- The Core Filter Logic ---
                    if (isNumber(currentPrice) && isNumber(low52) && low52 > 0) {
                        const proximity = (currentPrice - low52) / low52;
                        
                        // Keep if it's within 5% (proximity < 0.05)
                        if (proximity >= 0 && proximity < 0.05) {
                            filteredStocks.push({
                                ticker: ticker,
                                name: priceData.longName || priceData.shortName || 'N/A',
                                sector: profileData?.sector || 'N/A',
                                currentPrice: currentPrice.toFixed(2),
                                low52: low52.toFixed(2),
                                high52: isNumber(high52) ? high52.toFixed(2) : 'N/A',
                                proximityPct: (proximity * 100).toFixed(2) // % above low
                            });
                        }
                    }
                }
            } else if (response.status === 'rejected') {
                console.warn(`[${new Date().toISOString()}] 52W-LOW: Failed to fetch data for ${ticker}. Reason: ${response.reason?.message}`);
            }
        });

        // Sort by proximity to the low (closest first)
        filteredStocks.sort((a, b) => parseFloat(a.proximityPct) - parseFloat(b.proximityPct));

        res.json({ success: true, data: filteredStocks });

    } catch (err) {
        let errorMessage = `Server error during 52-week-low scan.`;
        let statusCode = 500;
        console.error(`[${new Date().toISOString()}] ERROR during 52W-LOW processing:`, err.message);
        if (axios.isAxiosError(err) && err.response) {
            statusCode = err.response.status;
            errorMessage = err.response.data?.message || `Error from external API (${statusCode})`;
        }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// *** END: NEW 52-WEEK LOW API ROUTE ***

// --- deleted
        // ----start Forgot Password Route ------
        /**
        * @route   POST /api/auth/forgot-password
        * @desc    Generates a reset token, saves it to DB, and sends the email.
        * @access  Public
         */
        app.post('/api/auth/forgot-password', async (req, res) => {
        try {
        const { email } = req.body;
        // NOTE: User model must be defined higher up
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Send a generic success message even if the user isn't found for security reasons
            return res.status(200).json({ success: true, message: 'If an account exists, a password reset link has been sent to your email.' });
        }

        // 1. Generate a unique token (Requires 'crypto' module)
        const token = crypto.randomBytes(20).toString('hex');
        
        // 2. Set token and expiration time (1 hour)
        // NOTE: UserSchema must have resetPasswordToken and resetPasswordExpires fields
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
        await user.save();

        // 3. Construct the reset URL (!!! CHANGE 'https://yourdomain.com' to your actual deployed URL !!!)
        const resetUrl = `https://yourdomain.com/reset-password.html?token=${token}`; 

        // 4. Send Email (Requires 'nodemailer' and 'transporter' setup higher up)
        const mailOptions = {
            to: user.email,
            from: process.env.SMTP_USER,
            subject: 'Think Money Tree Password Reset Request',
            html: `
                <p>Hello,</p>
                <p>You recently requested to reset the password for your Think Money Tree account.</p>
                <p>Please click the link below to set a new password:</p>
                <p><a href="${resetUrl}" style="background-color: #00A99D; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
                <p>This link will expire in one hour.</p>
                <p>If you did not request a password reset, please ignore this email.</p>
                <br>
                <p>The Think Money Tree Team</p>
            `
        };

        // NOTE: This call relies on the global 'transporter' object you set up
        await transporter.sendMail(mailOptions); 

        res.status(200).json({ success: true, message: 'Password reset link sent successfully.' });

        } catch (err) {
        console.error('Forgot Password Process Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error processing password reset.' });
        }
        });
        // ----END Forgot Password Route ------
        // ----START Reset Password Route ------
        /**
        * @route   POST /api/auth/reset-password
        * @desc    Validates token and updates user's password.
        * @access  Public (Requires valid token in body)
        */
        app.post('/api/auth/reset-password', async (req, res) => {
        const { token, newPassword } = req.body;

        // 1. Basic validation
        if (!token || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Invalid request: Token and a password of at least 8 characters are required.' });
        }

        try {
        // 2. Find user by token and ensure token is not expired
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } // Check if expiration date is greater than now
        });

        if (!user) {
            // Token is invalid, expired, or was already used
            return res.status(400).json({ success: false, message: 'Password reset link is invalid or has expired.' });
        }

        // 3. Hash the new password and clear token fields
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ success: true, message: 'Password has been successfully reset. You may now log in.' });

        } catch (err) {
        console.error('Password Reset Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during password reset.' });
        }
        });
        // ----END Reset Password Route ------
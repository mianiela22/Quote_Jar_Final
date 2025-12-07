const express = require('express');
const { engine } = require('express-handlebars');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Session middleware - FIXED for production
app.use(session({
    secret: process.env.SESSION_SECRET || 'quotebox-secret-key-2024',
    resave: false,
    saveUninitialized: true,  // Changed to true
    cookie: {
        secure: false,  // Changed to false
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'  // Added this
    }
}));

// Handlebars setup
app.engine('hbs', engine({ 
    extname: '.hbs',
    defaultLayout: 'main',
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true
    }
}));
app.set('view engine', 'hbs');
app.set('views', './views');

// Database setup - works for both local and production
const sequelize = process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        }
    })
    : new Sequelize({
        dialect: 'sqlite',
        storage: './quotebox.sqlite'
    });

// Test database connection
sequelize.authenticate()
    .then(() => console.log('Database connected successfully'))
    .catch(err => console.error('Unable to connect to database:', err));

// Define User model
const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    }
});

// Define Quote model
const Quote = sequelize.define('Quote', {
    quoteText: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    personName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    location: {
        type: DataTypes.STRING,
        allowNull: true
    },
    date: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

// Set up relationships
Quote.belongsTo(User);
User.hasMany(Quote);

// Sync database
sequelize.sync({ alter: process.env.NODE_ENV !== 'production' })
    .then(() => console.log('Database synced'))
    .catch(err => console.error('Database sync error:', err));

// ==================== ROUTES ====================

// Middleware to check if user is logged in
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    next();
}

// LANDING PAGE
app.get('/', (req, res) => {
    // If already logged in, redirect to home
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('landing', { 
        title: 'Welcome',
        layout: false  // No nav bar on landing page
    });
});

// LOGIN/CREATE USER
app.post('/login', async (req, res) => {
    try {
        const { username } = req.body;
        
        console.log('Login attempt for username:', username); // DEBUG
        
        // Find or create user
        let user = await User.findOne({ where: { username: username } });
        
        if (!user) {
            user = await User.create({ username: username });
            console.log('Created new user:', user.username); // DEBUG
        } else {
            console.log('Found existing user:', user.username); // DEBUG
        }
        
        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        
        console.log('Session set:', req.session); // DEBUG
        
        // Save session explicitly before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).send('Session error');
            }
            console.log('Session saved, redirecting to /home'); // DEBUG
            res.redirect('/home');
        });
        
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Error logging in');
    }
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// HOME PAGE - Display all quotes for logged-in user
app.get('/home', requireLogin, async (req, res) => {
    try {
        const quotes = await Quote.findAll({
            where: { UserId: req.session.userId },
            order: [['createdAt', 'DESC']]
        });
        res.render('home', { 
            title: 'Home',
            quotes: quotes,
            username: req.session.username
        });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).send('Error loading quotes');
    }
});

// ADD QUOTE PAGE - Show the form
app.get('/add-quote', requireLogin, (req, res) => {
    res.render('add-quote', { 
        title: 'Add New Quote',
        username: req.session.username
    });
});

// ADD QUOTE - Process the form
app.post('/add-quote', requireLogin, async (req, res) => {
    try {
        const { quoteText, personName, location, date } = req.body;
        
        await Quote.create({
            quoteText: quoteText,
            personName: personName,
            location: location || null,
            date: date || null,
            UserId: req.session.userId
        });
        
        res.redirect('/home');
    } catch (error) {
        console.error('Error creating quote:', error);
        res.status(500).send('Error adding quote');
    }
});

// DELETE QUOTE
app.post('/quotes/:id/delete', requireLogin, async (req, res) => {
    try {
        await Quote.destroy({
            where: { 
                id: req.params.id,
                UserId: req.session.userId  // Only delete if it belongs to this user
            }
        });
        res.redirect('/home');
    } catch (error) {
        console.error('Error deleting quote:', error);
        res.status(500).send('Error deleting quote');
    }
});

// EDIT QUOTE PAGE - Show edit form
app.get('/quotes/:id/edit', requireLogin, async (req, res) => {
    try {
        const quote = await Quote.findOne({
            where: { 
                id: req.params.id,
                UserId: req.session.userId
            }
        });
        if (!quote) {
            return res.status(404).send('Quote not found');
        }
        res.render('edit-quote', { 
            title: 'Edit Quote',
            quote: quote,
            username: req.session.username
        });
    } catch (error) {
        console.error('Error fetching quote:', error);
        res.status(500).send('Error loading quote');
    }
});

// EDIT QUOTE - Process the edit
app.post('/quotes/:id/edit', requireLogin, async (req, res) => {
    try {
        const { quoteText, personName, location, date } = req.body;
        
        await Quote.update({
            quoteText: quoteText,
            personName: personName,
            location: location || null,
            date: date || null
        }, {
            where: { 
                id: req.params.id,
                UserId: req.session.userId
            }
        });
        
        res.redirect('/home');
    } catch (error) {
        console.error('Error updating quote:', error);
        res.status(500).send('Error updating quote');
    }
});

// STATS PAGE - Show visualizations for user's quotes
app.get('/stats', requireLogin, async (req, res) => {
    try {
        const quotes = await Quote.findAll({
            where: { UserId: req.session.userId }
        });
        res.render('stats', { 
            title: 'Statistics',
            quotesJSON: JSON.stringify(quotes),
            username: req.session.username
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).send('Error loading stats');
    }
});

// GAME PAGE - Quiz mode for user's quotes
app.get('/game', requireLogin, async (req, res) => {
    try {
        const quotes = await Quote.findAll({
            where: { UserId: req.session.userId }
        });
        
        if (quotes.length < 2) {
            return res.render('game', { 
                title: 'Quiz Game',
                error: 'You need at least 2 quotes to play the game!',
                quotes: [],
                username: req.session.username
            });
        }
        
        res.render('game', { 
            title: 'Quiz Game',
            quotesJSON: JSON.stringify(quotes),
            error: null,
            username: req.session.username
        });
    } catch (error) {
        console.error('Error loading game:', error);
        res.status(500).send('Error loading game');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Quotebox server running on http://localhost:${PORT}`);
});
const express = require('express');
const { engine } = require('express-handlebars');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

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

// Database setup
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './quotebox.sqlite'
});

// Test database connection
sequelize.authenticate()
    .then(() => console.log('Database connected successfully'))
    .catch(err => console.error('Unable to connect to database:', err));

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

// Sync database
sequelize.sync();

// ==================== ROUTES ====================

// HOME PAGE - Display all quotes
app.get('/', async (req, res) => {
    try {
        const quotes = await Quote.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.render('home', { 
            title: 'Home',
            quotes: quotes
        });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).send('Error loading quotes');
    }
});

// ADD QUOTE PAGE - Show the form
app.get('/add-quote', (req, res) => {
    res.render('add-quote', { 
        title: 'Add New Quote'
    });
});

// ADD QUOTE - Process the form
app.post('/add-quote', async (req, res) => {
    try {
        const { quoteText, personName, location, date } = req.body;
        
        await Quote.create({
            quoteText: quoteText,
            personName: personName,
            location: location || null,
            date: date || null
        });
        
        res.redirect('/');
    } catch (error) {
        console.error('Error creating quote:', error);
        res.status(500).send('Error adding quote');
    }
});

// DELETE QUOTE
app.post('/quotes/:id/delete', async (req, res) => {
    try {
        await Quote.destroy({
            where: { id: req.params.id }
        });
        res.redirect('/');
    } catch (error) {
        console.error('Error deleting quote:', error);
        res.status(500).send('Error deleting quote');
    }
});

// EDIT QUOTE PAGE - Show edit form
app.get('/quotes/:id/edit', async (req, res) => {
    try {
        const quote = await Quote.findByPk(req.params.id);
        if (!quote) {
            return res.status(404).send('Quote not found');
        }
        res.render('edit-quote', { 
            title: 'Edit Quote',
            quote: quote
        });
    } catch (error) {
        console.error('Error fetching quote:', error);
        res.status(500).send('Error loading quote');
    }
});

// EDIT QUOTE - Process the edit
app.post('/quotes/:id/edit', async (req, res) => {
    try {
        const { quoteText, personName, location, date } = req.body;
        
        await Quote.update({
            quoteText: quoteText,
            personName: personName,
            location: location || null,
            date: date || null
        }, {
            where: { id: req.params.id }
        });
        
        res.redirect('/');
    } catch (error) {
        console.error('Error updating quote:', error);
        res.status(500).send('Error updating quote');
    }
});

// STATS PAGE - Show visualizations
app.get('/stats', async (req, res) => {
    try {
        const quotes = await Quote.findAll();
        res.render('stats', { 
            title: 'Statistics',
            quotesJSON: JSON.stringify(quotes)
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).send('Error loading stats');
    }
});

// GAME PAGE - Quiz mode
app.get('/game', async (req, res) => {
    try {
        const quotes = await Quote.findAll();
        
        if (quotes.length < 2) {
            return res.render('game', { 
                title: 'Quiz Game',
                error: 'You need at least 2 quotes to play the game!',
                quotes: []
            });
        }
        
        res.render('game', { 
            title: 'Quiz Game',
            quotesJSON: JSON.stringify(quotes),
            error: null
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
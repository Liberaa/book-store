const express = require('express')
const session = require('express-session')
const bcrypt = require('bcrypt')
const db = require('./db')

const app = express()
const PORT = 3000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

app.use(session({
  secret: 'bookstore-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}))

// Validation helper functions
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

function validateZip(zip) {
  return /^\d{5}$/.test(zip.toString())
}

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { fname, lname, address, city, zip, phone, email, password } = req.body
    
    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }
    
    // Validate zip code
    if (!validateZip(zip)) {
      return res.status(400).json({ error: 'Zip code must be 5 digits' })
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    
    // Check if email exists
    const [existing] = await db.query('SELECT * FROM members WHERE email = ?', [email])
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' })
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)
    
    // Insert user
    await db.query(
      'INSERT INTO members (fname, lname, address, city, zip, phone, email, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [fname, lname, address, city, parseInt(zip), phone, email, hashedPassword]
    )
    
    res.json({ success: true, message: 'Account created successfully' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body
    
    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }
    
    const [users] = await db.query('SELECT * FROM members WHERE email = ?', [email])
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    
    const user = users[0]
    const validPassword = await bcrypt.compare(password, user.password)
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    
    req.session.userId = user.userid
    req.session.userName = user.fname
    
    res.json({ success: true, name: user.fname })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Get current user
app.get('/api/user', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, name: req.session.userName, userId: req.session.userId })
  } else {
    res.json({ loggedIn: false })
  }
})

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy()
  res.json({ success: true })
})

// Get all subjects
app.get('/api/subjects', async (req, res) => {
  try {
    const [subjects] = await db.query('SELECT DISTINCT subject FROM books ORDER BY subject')
    res.json(subjects)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch subjects' })
  }
})

// Search books by subject with pagination
app.get('/api/books/subject/:subject', async (req, res) => {
  try {
    const { subject } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 5
    const offset = (page - 1) * limit
    
    const [books] = await db.query(
      'SELECT * FROM books WHERE subject = ? LIMIT ? OFFSET ?',
      [subject, limit, offset]
    )
    
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM books WHERE subject = ?',
      [subject]
    )
    
    res.json({
      books,
      total: countResult[0].total,
      page,
      totalPages: Math.ceil(countResult[0].total / limit)
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch books' })
  }
})

// Search books by author (case-insensitive, starts with)
app.get('/api/books/author/:author', async (req, res) => {
  try {
    const { author } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 5
    const offset = (page - 1) * limit
    
    // Case-insensitive search, author first name starts with
    const [books] = await db.query(
      'SELECT * FROM books WHERE LOWER(author) LIKE LOWER(?) LIMIT ? OFFSET ?',
      [author + '%', limit, offset]
    )
    
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM books WHERE LOWER(author) LIKE LOWER(?)',
      [author + '%']
    )
    
    res.json({
      books,
      total: countResult[0].total,
      page,
      totalPages: Math.ceil(countResult[0].total / limit)
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch books' })
  }
})

// Search books by title (case-insensitive, contains)
app.get('/api/books/title/:title', async (req, res) => {
  try {
    const { title } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 5
    const offset = (page - 1) * limit
    
    // Case-insensitive search, title contains word
    const [books] = await db.query(
      'SELECT * FROM books WHERE LOWER(title) LIKE LOWER(?) LIMIT ? OFFSET ?',
      ['%' + title + '%', limit, offset]
    )
    
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM books WHERE LOWER(title) LIKE LOWER(?)',
      ['%' + title + '%']
    )
    
    res.json({
      books,
      total: countResult[0].total,
      page,
      totalPages: Math.ceil(countResult[0].total / limit)
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch books' })
  }
})

// Add to cart (handles duplicates by updating quantity)
app.post('/api/cart', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' })
    }
    
    const { isbn, qty } = req.body
    const userId = req.session.userId
    
    // Validate quantity
    if (!qty || qty < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' })
    }
    
    // Check if book already in cart
    const [existing] = await db.query(
      'SELECT * FROM cart WHERE userid = ? AND isbn = ?',
      [userId, isbn]
    )
    
    if (existing.length > 0) {
      // Update quantity (add to existing)
      await db.query(
        'UPDATE cart SET qty = qty + ? WHERE userid = ? AND isbn = ?',
        [parseInt(qty), userId, isbn]
      )
    } else {
      // Insert new
      await db.query(
        'INSERT INTO cart (userid, isbn, qty) VALUES (?, ?, ?)',
        [userId, isbn, parseInt(qty)]
      )
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to add to cart' })
  }
})

// Get cart
app.get('/api/cart', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' })
    }
    
    const [cartItems] = await db.query(
      `SELECT c.isbn, c.qty, b.title, b.price, (c.qty * b.price) as total
       FROM cart c
       JOIN books b ON c.isbn = b.isbn
       WHERE c.userid = ?`,
      [req.session.userId]
    )
    
    res.json(cartItems)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch cart' })
  }
})

// Checkout
app.post('/api/checkout', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' })
    }
    
    const userId = req.session.userId
    
    // Get user details
    const [users] = await db.query('SELECT * FROM members WHERE userid = ?', [userId])
    const user = users[0]
    
    // Get cart items
    const [cartItems] = await db.query(
      `SELECT c.isbn, c.qty, b.price
       FROM cart c
       JOIN books b ON c.isbn = b.isbn
       WHERE c.userid = ?`,
      [userId]
    )
    
    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' })
    }
    
    // Create order with current date and user's registered address
    const [orderResult] = await db.query(
      'INSERT INTO orders (userid, created, shipAddress, shipCity, shipZip) VALUES (?, CURDATE(), ?, ?, ?)',
      [userId, user.address, user.city, user.zip]
    )
    
    const orderId = orderResult.insertId
    
    // Insert order details (amount = qty * price)
    for (const item of cartItems) {
      const amount = item.qty * item.price
      await db.query(
        'INSERT INTO odetails (ono, isbn, qty, amount) VALUES (?, ?, ?, ?)',
        [orderId, item.isbn, item.qty, amount]
      )
    }
    
    // Clear cart
    await db.query('DELETE FROM cart WHERE userid = ?', [userId])
    
    res.json({ success: true, orderId })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Checkout failed' })
  }
})

// Get order details
app.get('/api/order/:orderId', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' })
    }
    
    const { orderId } = req.params
    
    const [orders] = await db.query(
      `SELECT o.*, m.fname, m.lname
       FROM orders o
       JOIN members m ON o.userid = m.userid
       WHERE o.ono = ? AND o.userid = ?`,
      [orderId, req.session.userId]
    )
    
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' })
    }
    
    const [details] = await db.query(
      `SELECT od.*, b.title
       FROM odetails od
       JOIN books b ON od.isbn = b.isbn
       WHERE od.ono = ?`,
      [orderId]
    )
    
    res.json({ order: orders[0], details })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch order' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
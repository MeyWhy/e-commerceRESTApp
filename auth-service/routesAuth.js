const express= require('express');
const bcrypt = require('bcrypt');
const jwt =require('jsonwebtoken');
const { check } = require('express-validator');
const db =require('./db.js');
const logger = require('./logger.js');
const {authenticate, authorize, authorizeOwnerOrAdmin }= require('./middleware/auth.js');
const { handleValidation } = require('./middleware/validate.js');
const metrics = require('./metrics');

const router = express.Router();


//get all customers | OK FOR ADMIN
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
    const [rows] = await db.query('SELECT id, name, username, email, address, role FROM users');

    logger.info(`Admin ${req.user.userId} fetched all users`, {
        service: "auth-service",
        action: "GET_ALL_USERS",
        count: rows.length
    });

    res.json(rows);
});


// get specific customer TODO test FOR OWNER | OK FOR ADMIN
router.get('/:id', authenticate, authorizeOwnerOrAdmin(async (req) => parseInt(req.params.id)), async(req, res)=>{
    const [rows]= await db.query('SELECT id, name, username, email, address, role FROM users WHERE id= ?', [req.params.id])
if (rows.length === 0) {
    logger.warn(`User not found`, {
        service: "auth-service",
        action: "GET_USER",
        userId: req.params.id
    });

    return res.status(404).json({ error: "User not found" });
}
  logger.info(`User ${req.params.id} fetched`, {
    service: "auth-service",
    action: "GET_USER",
    requestedBy: req.user?.userId
});

    res.json(rows[0]);
})


//TODO might modify more than name
router.put('/:id', authenticate, authorizeOwnerOrAdmin(async (req) => parseInt(req.params.id)), async (req, res) => {
  const { name } = req.body;
  const [result] = await db.query('UPDATE users SET name = ? WHERE id = ?', [name, req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
  logger.info(`User ${req.params.id} updated`, {
    service: "auth-service",
    action: "UPDATE_USER",
    updatedBy: req.user.userId
});

  res.json({ message: 'user updated' });
});


// post /auth/login | OK
router.post('/login', [
  check('username').trim().notEmpty().withMessage('Username is required'),
  check('password').notEmpty().withMessage('Password is required'),
  handleValidation
], async (req, res) => {
  const { username, password } = req.body;
  metrics.loginAttempts.inc();

  try {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
    metrics.loginFailed.inc();

    logger.warn(`Failed login attempt`, {
    service: "auth-service",
    action: "LOGIN",
    username: username
});
return res.status(401).json({ error: "Invalid credentials" });}
metrics.loginSuccess.inc();

    // create jwt
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'test',
      { expiresIn: "1h" }
    );
    logger.info(`User ${user.username} logged in`, {
    service: "auth-service",
    action: "LOGIN",
    userId: user.id
});

    res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      address: user.address,
      role: user.role
    }});

  } catch (err) {
logger.error("Login error", {
    service: "auth-service",
    action: "LOGIN",
    error: err.message
});
    res.status(500).json({ error: "Internal server error" });
  }
});

//register | OK
router.post('/register', [
  check('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  check('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  check('name').trim().notEmpty().withMessage('Name is required'),
  check('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  check('address').trim().notEmpty().withMessage('Address is required'),
  handleValidation
], async (req, res) => {
  const { username, password, name, email, address } = req.body;

  try {
    // hash password
    const hashed = await bcrypt.hash(password, 12);

    // insert user in users table
    const [result] = await db.query(
      'INSERT INTO users (name, username, password,email, address, role) VALUES (?, ?, ?, ? , ?, ?)',
      [name, username, hashed, email, address, 'customer']
    );

    const createdUserId =result.insertId;
    logger.info(`New user registered`, {
    service: "auth-service",
    action: "REGISTER",
    userId: createdUserId,
    username
});
    metrics.usersRegistered.inc();

    // send success response
    res.status(201).json({
      message: 'User registered successfully',
      user: { id: createdUserId, username, address }
    });

  } catch (error) {
   logger.error("Registration error", {
    service: "auth-service",
    action: "REGISTER",
    error: error.message
});


    if (error.code === 'ER_DUP_ENTRY') {
      logger.warn("Duplicate username attempt", {
    service: "auth-service",
    action: "REGISTER",
    username
});

      return res.status(400).json({ error: 'Username already exists' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

//called by order 
router.get('/validate/:userId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, username, email, address, role FROM users WHERE id = ?',
      [req.params.userId]
    );

    if (rows.length === 0){
      logger.warn("User not found during validation", {
    service: "auth-service",
    action: "VALIDATE_USER",
    userId: req.params.userId
});
      return res.status(404).json({ valid: false, message: 'User not found' });
    }
    
    logger.info("User validated successfully", {
    service: "auth-service",
    action: "VALIDATE_USER",
    userId: req.params.userId
});

    res.json({ valid: true, user: rows[0] });

  } catch (err) {
  logger.error("Validation error", {
    service: "auth-service",
    action: "VALIDATE_USER",
    userId: req.params.userId,
    error: err.message
});
    res.status(500).json({ error: 'Database error during validation' });
  }
});



// admin-only: delete a user account
router.delete('/user/:id', authenticate, authorize(['admin']), async (req, res) => {
  const userId = req.params.id;

  if(userId==1){
    logger.warn("Attempt to delete protected user", {
    service: "auth-service",
    action: "DELETE_USER",
    userId
});

    return res.status(403).json({error : "Forbidden deletion"})
  }
  try {
    // check if the user exists
    const [rows] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // delete user from auth-db
    await db.query(
      "DELETE FROM users WHERE id = ?",
      [userId]
    );
    logger.info("User deleted successfully", {
    service: "auth-service",
    action: "DELETE_USER",
    userId
});

    return res.status(200).json({ message: "User deleted successfully" });

  } catch (err) {
logger.error("Delete user error", {
    service: "auth-service",
    action: "DELETE_USER",
    userId,
    error: err.message
});
    return res.status(500).json({ error: "Internal server error" });
  }
});




module.exports=router;

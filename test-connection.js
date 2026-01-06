const db = require('./db')

async function testConnection() {
  try {
    console.log('Testing database connection...')
    
    const [rows] = await db.query('SELECT COUNT(*) as count FROM books')
    
    console.log('✅ Connection successful!')
    console.log(`Found ${rows[0].count} books in database`)
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Connection failed:', error.message)
    process.exit(1)
  }
}

testConnection()
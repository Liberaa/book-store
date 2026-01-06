const mysql = require('mysql2')

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root', 
  password: 'abb419abb',  
  database: 'book_store',
  waitForConnections: true,
  connectionLimit: 10
})

module.exports = pool.promise()
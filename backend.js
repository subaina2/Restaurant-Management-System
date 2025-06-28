const mssql = require('mssql');
const express = require('express');
const app = express();
app.use(express.json());
const cors =require('cors');
app.use(cors());


const config = {
    user: 'sa',
    password: '12345678',
    server: 'localhost', // Ensure this matches my SQL Server instance
    database: 'ab',
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};


// Database Connection Function
async function connectToDatabase() {
  try {
      let pool = await mssql.connect(config);
      console.log('Connected to SQL Server');
      app.locals.db = pool;

      // ✅ Start server only after DB is ready
      const PORT = 5001;
      app.listen(PORT, () => {
          console.log(`✅ Server is running on port ${PORT}...`);
      });

  } catch (err) {
      console.error('❌ Database Connection Failed! Error:', err.message);
      process.exit(1); // Stop the server if DB connection fails
  }
}


connectToDatabase();

// Define a basic route
app.get('/', (req, res) => {
    res.send('Welcome to the RMS API!'); // response is coming from node api
});

// Define a test API route
app.get('/test', (req, res) => {
    res.json({ message: 'API is working!' });
});

// Add this route for frontend test
app.get('/api/message', (req, res) => {
    res.json({ message: 'Hello from backend!' });
});

/*
For viewing on postman:
1. Reservations: /reservations
2. Orders: /orders
3. Customers: /customers
4. Menu: /menu
5. Tables: /tabless
6. Employee: /employees
7. Delivery: /deliveries
8. Orderitems: /orderitems
9. Payments: /payments
10. Reviews: /reviews
*/

// ========================
// RESERVATIONS ROUTES
// ========================

function isValidTime(time) {
  // Parse the time string (format: HH:MM)
  const [hours, minutes] = time.split(':').map(Number);
  
  // Define restaurant operating hours (adjust as needed)
  const openingHour = 10; // 10:00 AM
  const closingHour = 22; // 10:00 PM
  
  // Check if time is within operating hours
  return hours >= openingHour && hours < closingHour;
}



// TO GET ALL RESERVATIONS
app.get("/reservations", async (req, res) => {
    try {
      const pool = app.locals.db;
      const sql = "SELECT * FROM Reservations";
      const result = await pool.request().query(sql);
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching reservations:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
 
  // TO GET SPECIFIC RESERVATIONS
app.get("/reservations/:id", async (req, res) => {
    try {
        const { id } = req.params;  // Get the reservation ID from the URL
        console.log('Fetching reservation with ID:', id);  // Debugging line
        const pool = app.locals.db;
        const sql = "SELECT * FROM Reservations WHERE reservation_id = @id";

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .query(sql);
        
        console.log('Query result:', result.recordset);  // Debugging line
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Reservation not found" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error fetching reservation:", err);
        res.status(500).json({ error: "Database error" });
    }
});


// CREATE A NEW RESERVATION
app.post("/reservations", async (req, res) => {
  try {
    const { customer_id, reservation_date, reservation_time, guest_count, location, special_requests, status } = req.body;

    // Validate time
    if (!isValidTime(reservation_time)) {
      return res.status(400).json({ 
        error: "Invalid reservation time. Our operating hours are 10:00 AM to 10:00 PM." 
      });
    }

    const pool = app.locals.db;

    // 🟢 Now filtering based on location too!
    const availableTableQuery = `
      SELECT table_id
      FROM tabless
      WHERE capacity >= @guest_count
      AND location = @location
      AND table_id NOT IN (
        SELECT table_id FROM Reservations 
        WHERE reservation_date = @reservation_date 
        AND reservation_time = @reservation_time
        AND status = 'confirmed'
      )
      ORDER BY table_id ASC
      OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY;
    `;

    const tableResult = await pool.request()
      .input("guest_count", mssql.Int, guest_count)
      .input("location", mssql.VarChar, location)
      .input("reservation_date", mssql.Date, reservation_date)
      .input("reservation_time", mssql.VarChar, reservation_time)
      .query(availableTableQuery);

    if (tableResult.recordset.length === 0) {
      return res.status(400).json({
        error: `No available ${location} table for the selected time and guest count.`
      });
    }

    const table_id = tableResult.recordset[0].table_id;

    // Insert reservation
    const insertSql = `
      DECLARE @InsertedReservation AS TABLE (reservation_id INT);
      INSERT INTO Reservations (customer_id, table_id, reservation_date, reservation_time, guest_count, special_requests, status)
      OUTPUT INSERTED.reservation_id INTO @InsertedReservation
      VALUES (@customer_id, @table_id, @reservation_date, @reservation_time, @guest_count, @special_requests, @status);
      SELECT reservation_id FROM @InsertedReservation;
    `;

    const result = await pool.request()
      .input("customer_id", mssql.Int, customer_id)
      .input("table_id", mssql.Int, table_id)
      .input("reservation_date", mssql.Date, reservation_date)
      .input("reservation_time", mssql.VarChar, reservation_time)
      .input("guest_count", mssql.Int, guest_count)
      .input("special_requests", mssql.VarChar, special_requests || '')
      .input("status", mssql.VarChar, status || 'pending')
      .query(insertSql);

    res.json({ 
      message: "Reservation created successfully", 
      id: result.recordset[0].reservation_id 
    });
  } catch (err) {
    console.error("Reservation error:", {
      error: err.message,
      receivedTime: req.body?.reservation_time,
      stack: err.stack
    });
    res.status(500).json({ 
      error: "Failed to create reservation",
      details: err.message 
    });
  }
});

  // UPDATE RESERVATION 
  app.put("/reservations/:id", async (req, res) => {
    try {
        const { customer_id, table_id, reservation_date, reservation_time, guest_count, status, special_requests } = req.body;
        const { id } = req.params;

        // Validate time format
        if (!validateTime(reservation_time)) {
            return res.status(400).json({ error: "Invalid time format. Please use HH:mm or HH:mm:ss" });
        }

        let formattedTime = reservation_time;
        if (formattedTime.split(':').length === 2) {
            formattedTime += ':00';
        }

        const pool = app.locals.db;
        const sql = `
            DECLARE @UpdatedRes AS TABLE (reservation_id INT);
            UPDATE Reservations
            SET customer_id = @customer_id, table_id = @table_id, reservation_date = @reservation_date,
                reservation_time = @reservation_time, guest_count = @guest_count, status = @status, special_requests = @special_requests
            OUTPUT INSERTED.reservation_id INTO @UpdatedRes
            WHERE reservation_id = @id;
            SELECT reservation_id FROM @UpdatedRes;
        `;

        const result = await pool.request()
            .input("customer_id", mssql.Int, customer_id)
            .input("table_id", mssql.Int, table_id)
            .input("reservation_date", mssql.Date, reservation_date)
            .input("reservation_time", mssql.Time, formattedTime)
            .input("guest_count", mssql.Int, guest_count)
            .input("status", mssql.VarChar, status)
            .input("special_requests", mssql.VarChar, special_requests)
            .input("id", mssql.Int, id)
            .query(sql);

        res.json({ message: "Reservation updated", id: result.recordset[0].reservation_id });
    } catch (err) {
        console.error("Error updating reservation:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// DELETE RESERVATION
app.delete("/reservations/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = app.locals.db;
        const sql = `
            DECLARE @DeletedRes AS TABLE (reservation_id INT);
            DELETE FROM Reservations
            OUTPUT DELETED.reservation_id INTO @DeletedRes
            WHERE reservation_id = @id;
            SELECT reservation_id FROM @DeletedRes;
        `;

        const result = await pool.request().input("id", mssql.Int, id).query(sql);
        if (result.recordset.length > 0) {
            res.json({ message: "Reservation deleted", id: result.recordset[0].reservation_id });
        } else {
            res.status(404).json({ message: "Reservation not found" });
        }
    } catch (err) {
        console.error("Error deleting reservation:", err);
        res.status(500).json({ error: "Database error" });
    }
});
// ========================
// ORDERS ROUTES
// ========================

// TO GET ALL ORDERS
app.get("/orders", async (req, res) => {
  try {
      const pool = app.locals.db;
      const sql = "SELECT * FROM Orders";
      const result = await pool.request().query(sql);
      res.json(result.recordset);
  } catch (err) {
      console.error("Error fetching orders:", err);
      res.status(500).json({ error: "Database error" });
  }
});

// TO GET SPECIFIC ORDER BY ID
app.get("/orders/:id", async (req, res) => {
  try {
      const { id } = req.params;  // Get the order ID from the URL
      const pool = app.locals.db;
      const sql = "SELECT * FROM Orders WHERE order_id = @id";

      const result = await pool.request()
          .input("id", mssql.Int, id)
          .query(sql);

      if (result.recordset.length === 0) {
          return res.status(404).json({ message: "Order not found" });
      }

      res.json(result.recordset[0]);
  } catch (err) {
      console.error("Error fetching order:", err);
      res.status(500).json({ error: "Database error" });
  }
});


//CREATE A NEW ORDER
app.post("/orders", async (req, res) => {
  try {
      const { customer_name, delivery_address, total_amount } = req.body;

      if (!customer_name) {
          return res.status(400).json({ message: "Customer name is required." });
      }

      const nameParts = customer_name.trim().split(" ");

      if (nameParts.length < 2) {
          return res.status(400).json({ message: "Please enter both first and last name." });
      }

      const first_name = nameParts[0];  // First name
      const last_name = nameParts.slice(1).join(" ");  // Last name (supports middle names)

      const pool = app.locals.db;

      // Lookup customer_id based on name
      const customerResult = await pool.request()
          .input("first_name", mssql.VarChar, first_name)
          .input("last_name", mssql.VarChar, last_name)
          .query(`SELECT customer_id FROM Customers WHERE first_name = @first_name AND last_name = @last_name`);

      if (customerResult.recordset.length === 0) {
          return res.status(404).json({ message: "Customer not found." });
      }

      const customer_id = customerResult.recordset[0].customer_id;

      // Insert order with default values for order_type and order_status
      const insertOrderResult = await pool.request()
          .input("customer_id", mssql.Int, customer_id)
          .input("order_type", mssql.VarChar, 'home-delivery')    // default order type
          .input("delivery_address", mssql.VarChar, delivery_address)
          .input("total_amount", mssql.Decimal(10, 2), total_amount)
          .input("order_status", mssql.VarChar, 'pending')  // default order status
          .query(`
              DECLARE @InsertedOrder AS TABLE (order_id INT);
              INSERT INTO Orders (customer_id, order_type, delivery_address, total_amount, order_status)
              OUTPUT INSERTED.order_id INTO @InsertedOrder
              VALUES (@customer_id, @order_type, @delivery_address, @total_amount, @order_status);
              SELECT order_id FROM @InsertedOrder;
          `);

      res.json({ message: "Order added", id: insertOrderResult.recordset[0].order_id });

  } catch (err) {
      console.error("Error adding order:", err);
      res.status(500).json({ error: err.message });
  }
});


// UPDATE ORDER
app.put("/orders/:order_id", async (req, res) => {
  try {
      const { order_id } = req.params; // Get the order_id from the URL parameter
      const { customer_id, order_type, delivery_address, total_amount, order_status } = req.body;

      // Input validation (you can expand as needed)
      if (!customer_id || !order_type || !delivery_address || !total_amount) {
          return res.status(400).json({ error: "All fields are required: customer_id, order_type, delivery_address, total_amount" });
      }

      // Check if the order type is valid (since it's only allowed 'home-delivery')
      if (order_type !== 'home-delivery') {
          return res.status(400).json({ error: "Invalid order type. Only 'home-delivery' is allowed." });
      }

      // Check if the order status is valid (optional)
      const validStatuses = ['pending', 'out-for-delivery', 'delivered', 'cancelled'];
      const status = order_status && validStatuses.includes(order_status) ? order_status : 'pending';

      // SQL query to update the order
      const pool = app.locals.db;
      const sql = `
          UPDATE orders
          SET customer_id = @customer_id,
              order_type = @order_type,
              delivery_address = @delivery_address,
              total_amount = @total_amount,
              order_status = @order_status
          WHERE order_id = @order_id;

          -- To check if the update was successful
          SELECT order_id FROM orders WHERE order_id = @order_id;
      `;

      // Execute the SQL query
      const result = await pool.request()
          .input("order_id", mssql.Int, order_id)
          .input("customer_id", mssql.Int, customer_id)
          .input("order_type", mssql.VarChar, order_type)
          .input("delivery_address", mssql.VarChar, delivery_address)
          .input("total_amount", mssql.Decimal, total_amount)
          .input("order_status", mssql.VarChar, status)
          .query(sql);

      // If no order with the given ID exists, return an error
      if (result.recordset.length === 0) {
          return res.status(404).json({ error: "Order not found" });
      }

      // If everything is successful, respond with success message
      res.json({
          message: "Order updated successfully!",
          order_id: result.recordset[0].order_id
      });
  } catch (err) {
      console.error("❌ Error updating order:", err.message);
      console.error("❌ Detailed error:", err); // Print the entire error object for debugging
      res.status(500).json({ error: "Database error", details: err.message });
  }
});


app.patch("/orders/:order_id", async (req, res) => {
  try {
      const { order_id } = req.params;
      const { order_status } = req.body;

      // Only allow valid status changes
      const validStatuses = ['pending', 'out-for-delivery', 'delivered', 'cancelled'];
      if (!order_status || !validStatuses.includes(order_status)) {
          return res.status(400).json({ error: "Invalid or missing order_status" });
      }

      const pool = app.locals.db;
      const sql = `
          UPDATE Orders
          SET order_status = @order_status
          WHERE order_id = @order_id;

          SELECT order_id FROM Orders WHERE order_id = @order_id;
      `;

      const result = await pool.request()
          .input("order_id", mssql.Int, order_id)
          .input("order_status", mssql.VarChar, order_status)
          .query(sql);

      if (result.recordset.length === 0) {
          return res.status(404).json({ error: "Order not found" });
      }

      res.json({
          message: "Order status updated successfully!",
          order_id: result.recordset[0].order_id
      });
  } catch (err) {
      console.error("❌ Error updating order status:", err.message);
      res.status(500).json({ error: "Database error", details: err.message });
  }
});

// DELETE ORDER
app.delete("/orders/:id", async (req, res) => {
  try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = `
          DECLARE @DeletedOrder AS TABLE (order_id INT);
          DELETE FROM Orders
          OUTPUT DELETED.order_id INTO @DeletedOrder
          WHERE order_id = @id;
          SELECT order_id FROM @DeletedOrder;
      `;

      const result = await pool.request().input("id", mssql.Int, id).query(sql);
      if (result.recordset.length > 0) {
          res.json({ message: "Order deleted", id: result.recordset[0].order_id });
      } else {
          res.status(404).json({ message: "Order not found" });
      }
  } catch (err) {
      console.error("Error deleting order:", err);
      res.status(500).json({ error: "Database error" });
  }
});



// ========================
// CUSTOMERS ROUTES
// ========================

// GET ALL CUSTOMERS
app.get("/customers", async (req, res) => {
    try {
        const pool = app.locals.db;
        const sql = "SELECT * FROM Customers";
        const result = await pool.request().query(sql);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching customers:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET A SPECIFIC CUSTOMER
app.get("/customers/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = app.locals.db;
        const sql = "SELECT * FROM Customers WHERE customer_id = @id";

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .query(sql);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error fetching customer:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// CREATE A NEW CUSTOMER
app.post("/customers", async (req, res) => {
  try {
      const { first_name, last_name, phone_number, email } = req.body;

      const pool = app.locals.db;
      
      // Check if the customer already exists based on first_name and last_name
      const checkQuery = `
          SELECT customer_id 
          FROM Customers 
          WHERE first_name = @first_name AND last_name = @last_name;
      `;
      
      const checkResult = await pool.request()
          .input("first_name", mssql.VarChar, first_name)
          .input("last_name", mssql.VarChar, last_name)
          .query(checkQuery);

      if (checkResult.recordset.length > 0) {
          // Customer already exists, return their ID
          const existingCustomerId = checkResult.recordset[0].customer_id;
          return res.json({ exists: true, id: existingCustomerId, message: "Customer already exists." });
      }

      // If the customer doesn't exist, insert the new customer
      const insertQuery = `
          DECLARE @InsertedCustomer AS TABLE (customer_id INT);
          INSERT INTO Customers (first_name, last_name, phone_number, email)
          OUTPUT INSERTED.customer_id INTO @InsertedCustomer
          VALUES (@first_name, @last_name, @phone_number, @email);
          SELECT customer_id FROM @InsertedCustomer;
      `;
      
      const result = await pool.request()
          .input("first_name", mssql.VarChar, first_name)
          .input("last_name", mssql.VarChar, last_name)
          .input("phone_number", mssql.VarChar, phone_number)
          .input("email", mssql.VarChar, email)
          .query(insertQuery);

      // Return the result to the client (new customer ID)
      res.json({ exists: false, id: result.recordset[0].customer_id, message: "Customer added successfully." });
  } catch (err) {
      console.error("Error adding customer:", err);
      res.status(500).json({ error: "Database error" });
  }
});


// UPDATE CUSTOMER
app.put("/customers/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, phone_number, email } = req.body;

        const pool = app.locals.db;
        const sql = `
            DECLARE @UpdatedCustomer AS TABLE (customer_id INT);
            UPDATE Customers
            SET first_name = @first_name, last_name = @last_name, phone_number = @phone_number, email = @email
            OUTPUT INSERTED.customer_id INTO @UpdatedCustomer
            WHERE customer_id = @id;
            SELECT customer_id FROM @UpdatedCustomer;
        `;

        const result = await pool.request()
            .input("first_name", mssql.VarChar, first_name)
            .input("last_name", mssql.VarChar, last_name)
            .input("phone_number", mssql.VarChar, phone_number)
            .input("email", mssql.VarChar, email)
            .input("id", mssql.Int, id)
            .query(sql);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Customer not found or not updated" });
        }

        res.json({ message: "Customer updated", id: result.recordset[0].customer_id });
    } catch (err) {
        console.error("Error updating customer:", err);
        res.status(500).json({ error: "Database error" });
    }
});


// DELETE CUSTOMER
app.delete("/customers/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = app.locals.db;
        const sql = `
            DECLARE @DeletedCustomer AS TABLE (customer_id INT);
            DELETE FROM Customers
            OUTPUT DELETED.customer_id INTO @DeletedCustomer
            WHERE customer_id = @id;
            SELECT customer_id FROM @DeletedCustomer;
        `;

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .query(sql);

        if (result.recordset.length > 0) {
            res.json({ message: "Customer deleted", id: result.recordset[0].customer_id });
        } else {
            res.status(404).json({ message: "Customer not found" });
        }
    } catch (err) {
        console.error("Error deleting customer:", err);
        res.status(500).json({ error: "Database error" });
    }
});


// ===============================
// MENU ROUTES
// ===============================

// GET all menu items
app.get("/menu", async (req, res) => {
    try {
      const pool = app.locals.db;
      const result = await pool.request().query("SELECT * FROM menu");
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching menu items:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // GET a specific menu item
  app.get("/menu/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = "SELECT * FROM menu WHERE menu_id = @id";
      const result = await pool.request().input("id", mssql.Int, id).query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Menu item not found" });
      }
  
      res.json(result.recordset[0]);
    } catch (err) {
      console.error("Error fetching menu item:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // POST a new menu item
  app.post("/menu", async (req, res) => {
    try {
      const { name, description, price, category, availability } = req.body;
      const pool = app.locals.db;
      const sql = `
        DECLARE @InsertedMenu AS TABLE (menu_id INT);
        INSERT INTO menu (name, description, price, category, availability)
        OUTPUT INSERTED.menu_id INTO @InsertedMenu
        VALUES (@name, @description, @price, @category, @availability);
        SELECT menu_id FROM @InsertedMenu;
      `;
  
      const result = await pool.request()
        .input("name", mssql.VarChar(100), name)
        .input("description", mssql.NVarChar, description || null)
        .input("price", mssql.Decimal(10, 2), price)
        .input("category", mssql.VarChar(50), category)
        .input("availability", mssql.Bit, availability ?? 1)
        .query(sql);
  
      res.json({ message: "Menu item added", id: result.recordset[0].menu_id });
    } catch (err) {
      console.error("Error adding menu item:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // PUT to update menu item
  app.put("/menu/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, price, category, availability } = req.body;
      const pool = app.locals.db;
      const sql = `
        DECLARE @UpdatedMenu AS TABLE (menu_id INT);
        UPDATE menu
        SET name = @name, description = @description, price = @price,
            category = @category, availability = @availability
        OUTPUT INSERTED.menu_id INTO @UpdatedMenu
        WHERE menu_id = @id;
        SELECT menu_id FROM @UpdatedMenu;
      `;
  
      const result = await pool.request()
        .input("name", mssql.VarChar(100), name)
        .input("description", mssql.NVarChar, description)
        .input("price", mssql.Decimal(10, 2), price)
        .input("category", mssql.VarChar(50), category)
        .input("availability", mssql.Bit, availability)
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Menu item not found" });
      }
  
      res.json({ message: "Menu item updated", id: result.recordset[0].menu_id });
    } catch (err) {
      console.error("Error updating menu item:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // DELETE a menu item
  app.delete("/menu/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = `
        DECLARE @DeletedMenu AS TABLE (menu_id INT);
        DELETE FROM menu
        OUTPUT DELETED.menu_id INTO @DeletedMenu
        WHERE menu_id = @id;
        SELECT menu_id FROM @DeletedMenu;
      `;
  
      const result = await pool.request().input("id", mssql.Int, id).query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Menu item not found" });
      }
  
      res.json({ message: "Menu item deleted", id: result.recordset[0].menu_id });
    } catch (err) {
      console.error("Error deleting menu item:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
// ========================
// TABLESSS ROUTES
// ========================

 // GET ALL TABLES
app.get("/tabless", async (req, res) => {
    try {
        const pool = app.locals.db;
      const sql = "SELECT * FROM Tabless";
      const result = await pool.request().query(sql);
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching reservations:", err);
      res.status(500).json({ error: "Database error" });
    }
  });


// GET SPECIFIC TABLE BY ID
app.get("/tabless/:id", async (req, res) => {
    try {
        const { id } = req.params;  // Get the reservation ID from the URL
        console.log('Fetching reservation with ID:', id);  // Debugging line
        const pool = app.locals.db;
        const sql = "SELECT * FROM tabless WHERE table_id = @id";

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .query(sql);
        
        console.log('Query result:', result.recordset);  // Debugging line
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Table not found" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error fetching table:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// CREATE A NEW TABLE
// CREATE A NEW TABLE ENTRY
app.post("/tabless", async (req, res) => {
    try {
        const { reservation_id, table_number, capacity, location, status } = req.body;
    
        const pool = app.locals.db;
        const sql = `
            DECLARE @InsertedTable AS TABLE (table_id INT);
            INSERT INTO tabless (reservation_id, table_number, capacity, location, status)
            OUTPUT INSERTED.table_id INTO @InsertedTable
            VALUES (@reservation_id, @table_number, @capacity, @location, @status);
            SELECT table_id FROM @InsertedTable;
        `;

        const result = await pool.request()
            .input("reservation_id", mssql.Int, reservation_id || null)  // Handle null for optional field
            .input("table_number", mssql.VarChar, table_number)
            .input("capacity", mssql.Int, capacity)
            .input("location", mssql.VarChar, location)
            .input("status", mssql.VarChar, status || "available")  // Default to 'available' if not provided
            .query(sql);

        console.log("✅ Table Added: ", result.recordset);

        res.json({ message: "Table added", id: result.recordset[0].table_id });
    } catch (err) {
        console.error("❌ Database error:", err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE TABLE
app.put("/tabless/:id", async (req, res) => {
    try {
        const { reservation_id, table_number, capacity, location, status } = req.body;
        const { id } = req.params;  // Get table_id from URL parameter

        const pool = app.locals.db;
        const sql = `
            DECLARE @UpdatedTable AS TABLE (table_id INT);
            UPDATE tabless
            SET reservation_id = @reservation_id, 
                table_number = @table_number, 
                capacity = @capacity, 
                location = @location, 
                status = @status
            OUTPUT INSERTED.table_id INTO @UpdatedTable
            WHERE table_id = @id;
            SELECT table_id FROM @UpdatedTable;
        `;

        const result = await pool.request()
            .input("reservation_id", mssql.Int, reservation_id || null) // Can be null if no reservation is set
            .input("table_number", mssql.VarChar, table_number)
            .input("capacity", mssql.Int, capacity)
            .input("location", mssql.VarChar, location)
            .input("status", mssql.VarChar, status || "available") // Default status if not provided
            .input("id", mssql.Int, id) // The table ID to update
            .query(sql);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Table not found" });
        }

        res.json({ message: "Table updated", table_id: result.recordset[0].table_id });
    } catch (err) {
        console.error("Error updating Table:", err);
        res.status(500).json({ error: "Database error" });
    }
});


//DELET TABLE

app.delete("/tabless/:id", async (req, res) => {
    try {
        const { id } = req.params;  // Get the table ID from the URL params
        const pool = app.locals.db; // Assuming you're using a global db connection pool

        const sql = `
            DECLARE @DeletedTable AS TABLE (table_id INT);
            DELETE FROM tabless
            OUTPUT DELETED.table_id INTO @DeletedTable
            WHERE table_id = @id;
            SELECT table_id FROM @DeletedTable;
        `;

        // Execute the query
        const result = await pool.request()
            .input("id", mssql.Int, id)
            .query(sql);

        // If a table was deleted, return the table_id in the response
        if (result.recordset.length > 0) {
            res.json({ message: "Table deleted", table_id: result.recordset[0].table_id });
        } else {
            res.status(404).json({ message: "Table not found" });
        }
    } catch (err) {
        console.error("Error deleting table:", err);
        res.status(500).json({ error: "Database error" });
    }
});


// ========================
// EMPLOYEES ROUTES
// ========================

// GET ALL EMPLOYEES
app.get("/employees", async (req, res) => {
    try {
      const pool = app.locals.db;
      const sql = "SELECT * FROM employees";
      const result = await pool.request().query(sql);
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching employees:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // GET A SPECIFIC EMPLOYEE
  app.get("/employees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = "SELECT * FROM employees WHERE employee_id = @id";
  
      const result = await pool.request()
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Employee not found" });
      }
  
      res.json(result.recordset[0]);
    } catch (err) {
      console.error("Error fetching employee:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // CREATE A NEW EMPLOYEE
  app.post("/employees", async (req, res) => {
    try {
      const { first_name, last_name, role, phone_number, email, hire_date, salary } = req.body;
  
      // Input validation
      if (!first_name || !last_name || !role || !phone_number || !email || !hire_date || !salary) {
        return res.status(400).json({ error: "All fields are required" });
      }
  
      // Validate role
      const validRoles = ['manager', 'waiter', 'chef', 'delivery agent'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be one of: manager, waiter, chef, delivery agent" });
      }
  
      const pool = app.locals.db;
      const sql = `
        DECLARE @InsertedEmployee AS TABLE (employee_id INT);
        INSERT INTO employees (first_name, last_name, role, phone_number, email, hire_date, salary)
        OUTPUT INSERTED.employee_id INTO @InsertedEmployee
        VALUES (@first_name, @last_name, @role, @phone_number, @email, @hire_date, @salary);
        SELECT employee_id FROM @InsertedEmployee;
      `;
  
      const result = await pool.request()
        .input("first_name", mssql.VarChar, first_name)
        .input("last_name", mssql.VarChar, last_name)
        .input("role", mssql.VarChar, role)
        .input("phone_number", mssql.VarChar, phone_number)
        .input("email", mssql.VarChar, email)
        .input("hire_date", mssql.Date, hire_date)
        .input("salary", mssql.Decimal(10, 2), salary)
        .query(sql);
  
      res.json({ message: "Employee added", id: result.recordset[0].employee_id });
    } catch (err) {
      console.error("Error adding employee:", err);
      res.status(500).json({ error: "Database error", details: err.message });
    }
  });
  
  // UPDATE EMPLOYEE
  app.put("/employees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { first_name, last_name, role, phone_number, email, hire_date, salary } = req.body;
  
      // Validate role if provided
      if (role) {
        const validRoles = ['manager', 'waiter', 'chef', 'delivery agent'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: "Invalid role. Must be one of: manager, waiter, chef, delivery agent" });
        }
      }
  
      const pool = app.locals.db;
      const sql = `
        DECLARE @UpdatedEmployee AS TABLE (employee_id INT);
        UPDATE employees
        SET first_name = @first_name, 
            last_name = @last_name, 
            role = @role, 
            phone_number = @phone_number, 
            email = @email, 
            hire_date = @hire_date, 
            salary = @salary
        OUTPUT INSERTED.employee_id INTO @UpdatedEmployee
        WHERE employee_id = @id;
        SELECT employee_id FROM @UpdatedEmployee;
      `;
  
      const result = await pool.request()
        .input("first_name", mssql.VarChar, first_name)
        .input("last_name", mssql.VarChar, last_name)
        .input("role", mssql.VarChar, role)
        .input("phone_number", mssql.VarChar, phone_number)
        .input("email", mssql.VarChar, email)
        .input("hire_date", mssql.Date, hire_date)
        .input("salary", mssql.Decimal(10, 2), salary)
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Employee not found" });
      }
  
      res.json({ message: "Employee updated", id: result.recordset[0].employee_id });
    } catch (err) {
      console.error("Error updating employee:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // DELETE EMPLOYEE
  app.delete("/employees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = `
        DECLARE @DeletedEmployee AS TABLE (employee_id INT);
        DELETE FROM employees
        OUTPUT DELETED.employee_id INTO @DeletedEmployee
        WHERE employee_id = @id;
        SELECT employee_id FROM @DeletedEmployee;
      `;
  
      const result = await pool.request()
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Employee not found" });
      }
  
      res.json({ message: "Employee deleted", id: result.recordset[0].employee_id });
    } catch (err) {
      console.error("Error deleting employee:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // ========================
  // DELIVERY ROUTES
  // ========================
  
  // GET ALL DELIVERIES
  app.get("/deliveries", async (req, res) => {
    try {
      const pool = app.locals.db;
      const sql = "SELECT * FROM delivery";
      const result = await pool.request().query(sql);
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching deliveries:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // GET A SPECIFIC DELIVERY
  app.get("/deliveries/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = "SELECT * FROM delivery WHERE delivery_id = @id";
  
      const result = await pool.request()
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Delivery not found" });
      }
  
      res.json(result.recordset[0]);
    } catch (err) {
      console.error("Error fetching delivery:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // CREATE A NEW DELIVERY
  app.post("/deliveries", async (req, res) => {
    try {
      const { order_id, delivery_agent_id, estimated_time, delivered_time, delivery_status } = req.body;
  
      // Input validation
      if (!order_id || !delivery_agent_id || !estimated_time) {
        return res.status(400).json({ error: "Required fields: order_id, delivery_agent_id, estimated_time" });
      }
  
      // Validate delivery status if provided
      if (delivery_status) {
        const validStatuses = ['pending', 'out-for-delivery', 'delivered', 'failed'];
        if (!validStatuses.includes(delivery_status)) {
          return res.status(400).json({ 
            error: "Invalid delivery status. Must be one of: pending, out-for-delivery, delivered, failed" 
          });
        }
      }
  
      const pool = app.locals.db;
      const sql = `
        DECLARE @InsertedDelivery AS TABLE (delivery_id INT);
        INSERT INTO delivery (order_id, delivery_agent_id, estimated_time, delivered_time, delivery_status)
        OUTPUT INSERTED.delivery_id INTO @InsertedDelivery
        VALUES (@order_id, @delivery_agent_id, @estimated_time, @delivered_time, @delivery_status);
        SELECT delivery_id FROM @InsertedDelivery;
      `;
  
      const result = await pool.request()
        .input("order_id", mssql.Int, order_id)
        .input("delivery_agent_id", mssql.Int, delivery_agent_id)
        .input("estimated_time", mssql.DateTime2, estimated_time)
        .input("delivered_time", mssql.DateTime2, delivered_time || null)
        .input("delivery_status", mssql.VarChar, delivery_status || 'pending')
        .query(sql);
  
      res.json({ message: "Delivery added", id: result.recordset[0].delivery_id });
    } catch (err) {
      console.error("Error adding delivery:", err);
      res.status(500).json({ error: "Database error", details: err.message });
    }
  });
  
  // UPDATE DELIVERY
  app.put("/deliveries/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { order_id, delivery_agent_id, estimated_time, delivered_time, delivery_status } = req.body;
  
      // Validate delivery status if provided
      if (delivery_status) {
        const validStatuses = ['pending', 'out-for-delivery', 'delivered', 'failed'];
        if (!validStatuses.includes(delivery_status)) {
          return res.status(400).json({ 
            error: "Invalid delivery status. Must be one of: pending, out-for-delivery, delivered, failed" 
          });
        }
      }
  
      const pool = app.locals.db;
      const sql = `
        DECLARE @UpdatedDelivery AS TABLE (delivery_id INT);
        UPDATE delivery
        SET order_id = @order_id,
            delivery_agent_id = @delivery_agent_id,
            estimated_time = @estimated_time,
            delivered_time = @delivered_time,
            delivery_status = @delivery_status
        OUTPUT INSERTED.delivery_id INTO @UpdatedDelivery
        WHERE delivery_id = @id;
        SELECT delivery_id FROM @UpdatedDelivery;
      `;
  
      const result = await pool.request()
        .input("order_id", mssql.Int, order_id)
        .input("delivery_agent_id", mssql.Int, delivery_agent_id)
        .input("estimated_time", mssql.DateTime2, estimated_time)
        .input("delivered_time", mssql.DateTime2, delivered_time)
        .input("delivery_status", mssql.VarChar, delivery_status)
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Delivery not found" });
      }
  
      res.json({ message: "Delivery updated", id: result.recordset[0].delivery_id });
    } catch (err) {
      console.error("Error updating delivery:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // DELETE DELIVERY
  app.delete("/deliveries/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = `
        DECLARE @DeletedDelivery AS TABLE (delivery_id INT);
        DELETE FROM delivery
        OUTPUT DELETED.delivery_id INTO @DeletedDelivery
        WHERE delivery_id = @id;
        SELECT delivery_id FROM @DeletedDelivery;
      `;
  
      const result = await pool.request()
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Delivery not found" });
      }
  
      res.json({ message: "Delivery deleted", id: result.recordset[0].delivery_id });
    } catch (err) {
      console.error("Error deleting delivery:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // ========================
  // ORDER ITEMS ROUTES
  // ========================
  
  // GET ALL ORDER ITEMS
  app.get("/orderitems", async (req, res) => {
    try {
      const pool = app.locals.db;
      const sql = "SELECT * FROM order_items";
      const result = await pool.request().query(sql);
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching order items:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // GET ORDER ITEMS BY ORDER ID
  app.get("/orders/:orderId/items", async (req, res) => {
    try {
      const { orderId } = req.params;
      const pool = app.locals.db;
      const sql = `
        SELECT oi.*, m.name, m.category
        FROM order_items oi
        JOIN menu m ON oi.menu_id = m.menu_id
        WHERE oi.order_id = @orderId
      `;
  
      const result = await pool.request()
        .input("orderId", mssql.Int, orderId)
        .query(sql);
  
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching order items:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // GET SPECIFIC ORDER ITEM
  app.get("/orderitems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      const sql = "SELECT * FROM order_items WHERE order_item_id = @id";
  
      const result = await pool.request()
        .input("id", mssql.Int, id)
        .query(sql);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Order item not found" });
      }
  
      res.json(result.recordset[0]);
    } catch (err) {
      console.error("Error fetching order item:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // CREATE A NEW ORDER ITEM
  app.post("/orderitems", async (req, res) => {
    try {
      const { order_id, menu_id, quantity, price } = req.body;
  
      // Input validation
      if (!order_id || !menu_id || !quantity || !price) {
        return res.status(400).json({ error: "All fields are required: order_id, menu_id, quantity, price" });
      }
  
      const pool = app.locals.db;
      const sql = `
        DECLARE @InsertedOrderItem AS TABLE (order_item_id INT);
        INSERT INTO order_items (order_id, menu_id, quantity, price)
        OUTPUT INSERTED.order_item_id INTO @InsertedOrderItem
        VALUES (@order_id, @menu_id, @quantity, @price);
        SELECT order_item_id FROM @InsertedOrderItem;
      `;
  
      const result = await pool.request()
        .input("order_id", mssql.Int, order_id)
        .input("menu_id", mssql.Int, menu_id)
        .input("quantity", mssql.Int, quantity)
        .input("price", mssql.Decimal(10, 2), price)
        .query(sql);
  
      // Update total amount in the orders table
      const updateOrderSql = `
        UPDATE orders
        SET total_amount = (
          SELECT SUM(price * quantity) 
          FROM order_items 
          WHERE order_id = @order_id
        )
        WHERE order_id = @order_id
      `;
  
      await pool.request()
        .input("order_id", mssql.Int, order_id)
        .query(updateOrderSql);
  
      res.json({ message: "Order item added", id: result.recordset[0].order_item_id });
    } catch (err) {
      console.error("Error adding order item:", err);
      res.status(500).json({ error: "Database error", details: err.message });
    }
  });
  
  // UPDATE ORDER ITEM
  app.put("/orderitems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { order_id, menu_id, quantity, price } = req.body;
  
      const pool = app.locals.db;
      
      // First check if the order item exists
      const checkSql = "SELECT order_id FROM order_items WHERE order_item_id = @id";
      const checkResult = await pool.request()
        .input("id", mssql.Int, id)
        .query(checkSql);
      
      if (checkResult.recordset.length === 0) {
        return res.status(404).json({ message: "Order item not found" });
      }
      
      // Get the current order_id before update (for updating total amount later)
      const currentOrderId = checkResult.recordset[0].order_id;
      
      // Update the order item
      const sql = `
        DECLARE @UpdatedOrderItem AS TABLE (order_item_id INT);
        UPDATE order_items
        SET order_id = @order_id,
            menu_id = @menu_id,
            quantity = @quantity,
            price = @price
        OUTPUT INSERTED.order_item_id INTO @UpdatedOrderItem
        WHERE order_item_id = @id;
        SELECT order_item_id FROM @UpdatedOrderItem;
      `;
  
      const result = await pool.request()
        .input("order_id", mssql.Int, order_id)
        .input("menu_id", mssql.Int, menu_id)
        .input("quantity", mssql.Int, quantity)
        .input("price", mssql.Decimal(10, 2), price)
        .input("id", mssql.Int, id)
        .query(sql);
  
      // Update total amount for both the old and new order (if changed)
      const updateOrderSql = `
        UPDATE orders
        SET total_amount = (
          SELECT SUM(price * quantity) 
          FROM order_items 
          WHERE order_id = @order_id
        )
        WHERE order_id = @order_id
      `;
  
      await pool.request()
        .input("order_id", mssql.Int, order_id)
        .query(updateOrderSql);
  
      // If order_id changed, update the old order's total as well
      if (currentOrderId !== order_id) {
        await pool.request()
          .input("order_id", mssql.Int, currentOrderId)
          .query(updateOrderSql);
      }
  
      res.json({ message: "Order item updated", id: result.recordset[0].order_item_id });
    } catch (err) {
      console.error("Error updating order item:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // DELETE ORDER ITEM
  app.delete("/orderitems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pool = app.locals.db;
      
      // First get the order_id for this item
      const getOrderSql = "SELECT order_id FROM order_items WHERE order_item_id = @id";
      const orderResult = await pool.request()
        .input("id", mssql.Int, id)
        .query(getOrderSql);
      
      if (orderResult.recordset.length === 0) {
        return res.status(404).json({ message: "Order item not found" });
      }
      
      const orderId = orderResult.recordset[0].order_id;
      
      // Delete the order item
      const sql = `
        DECLARE @DeletedOrderItem AS TABLE (order_item_id INT);
        DELETE FROM order_items
        OUTPUT DELETED.order_item_id INTO @DeletedOrderItem
        WHERE order_item_id = @id;
        SELECT order_item_id FROM @DeletedOrderItem;
      `;
  
      const result = await pool.request()
        .input("id", mssql.Int, id)
        .query(sql);
  
      // Update the total amount in the orders table
      const updateOrderSql = `
        UPDATE orders
        SET total_amount = ISNULL((
          SELECT SUM(price * quantity) 
          FROM order_items 
          WHERE order_id = @order_id
        ), 0)
        WHERE order_id = @order_id
      `;
  
      await pool.request()
        .input("order_id", mssql.Int, orderId)
        .query(updateOrderSql);
  
      res.json({ message: "Order item deleted", id: result.recordset[0].order_item_id });
    } catch (err) {
      console.error("Error deleting order item:", err);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  // Add batch order items
  app.post("/orders/:orderId/items", async (req, res) => {
    try {
      const { orderId } = req.params;
      const orderItems = req.body; // Expecting an array of items
      
      if (!Array.isArray(orderItems) || orderItems.length === 0) {
        return res.status(400).json({ error: "Request body must be an array of order items" });
      }
      
      const pool = app.locals.db;
      const results = [];
      
      // Begin a transaction to ensure all items are added successfully or none at all
      const transaction = new mssql.Transaction(pool);
      await transaction.begin();
      
      try {
        for (const item of orderItems) {
          const { menu_id, quantity, price } = item;
          
          // Validate required fields
          if (!menu_id || !quantity || !price) {
            throw new Error("Each item must contain menu_id, quantity, and price");
          }
          
          const sql = `
            DECLARE @InsertedOrderItem AS TABLE (order_item_id INT);
            INSERT INTO order_items (order_id, menu_id, quantity, price)
            OUTPUT INSERTED.order_item_id INTO @InsertedOrderItem
            VALUES (@order_id, @menu_id, @quantity, @price);
            SELECT order_item_id FROM @InsertedOrderItem;
          `;
          
          const request = new mssql.Request(transaction);
          const result = await request
            .input("order_id", mssql.Int, orderId)
            .input("menu_id", mssql.Int, menu_id)
            .input("quantity", mssql.Int, quantity)
            .input("price", mssql.Decimal(10, 2), price)
            .query(sql);
          
          results.push({
            order_item_id: result.recordset[0].order_item_id,
            menu_id,
            quantity,
            price
          });
        }
        
        // Update total amount in the orders table
        const updateOrderSql = `
          UPDATE orders
          SET total_amount = (
            SELECT SUM(price * quantity) 
            FROM order_items 
            WHERE order_id = @order_id
          )
          WHERE order_id = @order_id
        `;
        
        await new mssql.Request(transaction)
          .input("order_id", mssql.Int, orderId)
          .query(updateOrderSql);
        
        // Commit the transaction if all operations are successful
        await transaction.commit();
        
        res.json({ 
          message: `Added ${results.length} items to order ${orderId}`, 
          items: results 
        });
      } catch (err) {
        // Roll back the transaction if there's an error
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error("Error adding order items:", err);
      res.status(500).json({ error: "Database error", details: err.message });
    }
  });


// ========================
// PAYMENTS ROUTES
// ========================

// GET ALL PAYMENTS
app.get("/payments", async (req, res) => {
    try {
        const pool = app.locals.db;
        const sql = "SELECT * FROM Payments";
        const result = await pool.request().query(sql);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching payments:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET A SPECIFIC PAYMENT
app.get("/payments/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = app.locals.db;
        const sql = "SELECT * FROM Payments WHERE payment_id = @id";

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .query(sql);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Payment not found" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error fetching payment:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// CREATE A NEW PAYMENT
app.post("/payments", async (req, res) => {
    try {
        const { order_id, amount, payment_method, status } = req.body;

        const pool = app.locals.db;
        const sql = `
            DECLARE @InsertedPayment AS TABLE (payment_id INT);
            INSERT INTO Payments (order_id, payment_method, amount, status)
            OUTPUT INSERTED.payment_id INTO @InsertedPayment
            VALUES (@order_id, @payment_method, @amount, @status);
            SELECT payment_id FROM @InsertedPayment;
        `;

        const result = await pool.request()
            .input("order_id", mssql.Int, order_id)
            .input("payment_method", mssql.VarChar, payment_method)
            .input("amount", mssql.Decimal(10, 2), amount)
            .input("status", mssql.VarChar, status || 'pending')
            .query(sql);

        res.json({ message: "Payment added", id: result.recordset[0].payment_id });
    } catch (err) {
        console.error("Error adding payment:", err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE PAYMENT
app.put("/payments/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { order_id, amount, payment_method, status } = req.body;

        const pool = app.locals.db;
        const sql = `
            UPDATE Payments
            SET order_id = @order_id, payment_method = @payment_method, amount = @amount,
                 status = @status
            WHERE payment_id = @id;

            SELECT payment_id FROM Payments WHERE payment_id = @id;
        `;

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .input("order_id", mssql.Int, order_id)
            .input("payment_method", mssql.VarChar, payment_method)
            .input("amount", mssql.Decimal(10, 2), amount)
            .input("status", mssql.VarChar, status)
            .query(sql);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Payment not found" });
        }

        res.json({ message: "Payment updated", id: result.recordset[0].payment_id });
    } catch (err) {
        console.error("Error updating payment:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// DELETE PAYMENT
app.delete("/payments/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = app.locals.db;
        const sql = `
            DECLARE @DeletedPayment AS TABLE (payment_id INT);
            DELETE FROM Payments
            OUTPUT DELETED.payment_id INTO @DeletedPayment
            WHERE payment_id = @id;
            SELECT payment_id FROM @DeletedPayment;
        `;

        const result = await pool.request().input("id", mssql.Int, id).query(sql);

        if (result.recordset.length > 0) {
            res.json({ message: "Payment deleted", id: result.recordset[0].payment_id });
        } else {
            res.status(404).json({ message: "Payment not found" });
        }
    } catch (err) {
        console.error("Error deleting payment:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// ========================
// REVIEWS ROUTES
// ========================

// GET ALL REVIEWS
app.get("/reviews", async (req, res) => {
    try {
        const pool = app.locals.db;
        const sql = "SELECT * FROM Reviews";
        const result = await pool.request().query(sql);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching reviews:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET SPECIFIC REVIEW
app.get("/reviews/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = app.locals.db;
        const sql = "SELECT * FROM Reviews WHERE review_id = @id";

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .query(sql);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Review not found" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error fetching review:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// CREATE NEW REVIEW
app.post("/reviews", async (req, res) => {
    try {
        const { customer_id, order_id, reservation_id , rating, comment,} = req.body;

        const pool = app.locals.db;
        const sql = `
            DECLARE @InsertedReview AS TABLE (review_id INT);
            INSERT INTO Reviews (customer_id,order_id, rating, comment, reservation_id)
            OUTPUT INSERTED.review_id INTO @InsertedReview
            VALUES (@customer_id,@order_id, @rating, @comment, @reservation_id);
            SELECT review_id FROM @InsertedReview;
        `;

        const result = await pool.request()
            .input("customer_id", mssql.Int, customer_id)
            .input("order_id", mssql.Int, order_id)
            .input("rating", mssql.Int, rating)
            .input("comment", mssql.VarChar, comment)
            .input("reservation_id", mssql.Int, reservation_id)
            .query(sql);

        res.json({ message: "Review added", id: result.recordset[0].review_id });
    } catch (err) {
        console.error("Error adding review:", err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE REVIEW
app.put("/reviews/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_id, order_id, reservation_id,rating, comment } = req.body;

        const pool = app.locals.db;
        const sql = `
            UPDATE Reviews
            SET customer_id = @customer_id, rating = @rating, comment = @comment, order_id = @order_id,
                reservation_id = @reservation_id 
            WHERE review_id = @id;

            SELECT review_id FROM Reviews WHERE review_id = @id;
        `;

        const result = await pool.request()
            .input("id", mssql.Int, id)
            .input("customer_id", mssql.Int, customer_id)
            .input("order_id", mssql.Int, order_id)
            .input("rating", mssql.Int, rating)
            .input("comment", mssql.VarChar, comment)
            .input("reservation_id", mssql.Int, reservation_id)
            .query(sql);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Review not found" });
        }

        res.json({ message: "Review updated", id: result.recordset[0].review_id });
    } catch (err) {
        console.error("Error updating review:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// DELETE REVIEW
app.delete("/reviews/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = app.locals.db;
        const sql = `
            DECLARE @DeletedReview AS TABLE (review_id INT);
            DELETE FROM Reviews
            OUTPUT DELETED.review_id INTO @DeletedReview
            WHERE review_id = @id;
            SELECT review_id FROM @DeletedReview;
        `;

        const result = await pool.request().input("id", mssql.Int, id).query(sql);

        if (result.recordset.length > 0) {
            res.json({ message: "Review deleted", id: result.recordset[0].review_id });
        } else {
            res.status(404).json({ message: "Review not found" });
        }
    } catch (err) {
        console.error("Error deleting review:", err);
        res.status(500).json({ error: "Database error" });
    }
});



setInterval(async () => {
  const pool = app.locals.db;  // the connected MSSQL pool from app.locals
  try {
    // 1. Update orders older than 2 minutes to 'out-for-delivery' and set status_updated_at
    await pool.request().query(`
      UPDATE orders
      SET order_status = 'out-for-delivery',
          status_updated_at = GETDATE()
      WHERE order_status NOT IN ('out-for-delivery', 'delivered')
        AND created_at <= DATEADD(minute, -2, GETDATE())
    `);

    // 2. Update corresponding delivery.status to 'out-for-delivery'
    await pool.request().query(`
      UPDATE d
      SET d.delivery_status = 'out-for-delivery'
      FROM delivery d
      JOIN orders o ON d.order_id = o.id
      WHERE o.order_status = 'out-for-delivery'
        AND d.delivery_status <> 'out-for-delivery'
    `);

    // 3. Update orders that have been 'out-for-delivery' for 2+ minutes to 'delivered'
    await pool.request().query(`
      UPDATE orders
      SET order_status = 'delivered',
          status_updated_at = GETDATE()
      WHERE order_status = 'out-for-delivery'
        AND status_updated_at <= DATEADD(minute, -2, GETDATE())
    `);

    // 4. Update delivery.status to 'delivered' and set delivered_time
    await pool.request().query(`
      UPDATE d
      SET 
        d.delivery_status = 'delivered',
        d.delivered_time = GETDATE()
      FROM delivery d
      JOIN orders o ON d.order_id = o.id
      WHERE o.order_status = 'delivered'
        AND d.delivery_status <> 'delivered'
    `);

    console.log('Scheduler: Updated order and delivery statuses.');
  } catch (err) {
    console.error('Scheduler error:', err);
  }
}, 60 * 1000);  // run every 60 seconds = 1 minute
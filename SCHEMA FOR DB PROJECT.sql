create database r;
go

use r;
go

-- customers table
create table customers (
    customer_id int primary key identity(1,1),
    first_name varchar(50) not null,
    last_name varchar(50) not null,
    phone_number varchar(20) unique not null,
    email varchar(100) unique not null,
    created_at datetime2 default getdate()
);
go

-- orders table
create table orders (
    order_id int primary key identity(1,1),
    customer_id int not null,
    order_type varchar(20) check (order_type in ('home-delivery')),
    delivery_name varchar(255) not null,  -- Customer's name for this order
    delivery_phone varchar(15) not null,  -- Customer's phone number
    delivery_address varchar(255) not null, -- Delivery address
    total_amount decimal(10,2) not null,
    order_status varchar(20) check (order_status in ('pending', 'out-for-delivery', 'delivered', 'cancelled')) default 'pending',
    created_at datetime2 default getdate(),
    foreign key (customer_id) references customers(customer_id)
);



-- reservations table
-- according to this schema, 1 customer can make multiple reservations
-- require customers to create multiple reservation records if they need to reserve multiple tables
create table reservations (
    reservation_id int primary key identity(1,1),
    customer_id int not null,
    table_id int null,
    reservation_date date not null,
    reservation_time time not null,
    guest_count int not null,
    status varchar(20) check (status in ('pending', 'confirmed', 'cancelled', 'completed')) default 'pending',
    special_requests nvarchar(max) null,
    foreign key (customer_id) references customers(customer_id)
);
go

-- tables (for reservations)
create table tabless (
    table_id int primary key identity(1,1),
    reservation_id int null, -- multiple tables can be reserved under the same reservation so not unique
    table_number varchar(10) unique not null,
    capacity int not null,
    location varchar(50) check (location in ('indoor', 'outdoor', 'vip')),
    status varchar(20) check (status in ('available', 'reserved', 'occupied')) default 'available',
    foreign key (reservation_id) references reservations(reservation_id) on delete set null,
);
go

-- Check for table capacities in your database
SELECT table_id, location, capacity
FROM tabless;


-- Add foreign key from Reservations to Tables now that both tables exist ( can not add before because error occurs as table baad mein banay)
alter table Reservations
add constraint FK_Reservations_Tables
foreign key (table_id) references Tabless(table_id) on delete set null;
go
 ALTER TABLE reservations DROP CONSTRAINT FK_Reservations_Tables;


-- menu table
create table menu (
    menu_id int primary key identity(1,1),
    name varchar(100) not null,
    description nvarchar(max) null,
    price decimal(10,2) not null,
    category varchar(50) not null,
	availability bit default 1 -- availability 1 means "available" and 0 means " not available"
);
go



-- order items table (many-to-many relation between orders & menu)
create table order_items (
    order_item_id int primary key identity(1,1),
    order_id int not null,
    menu_id int not null,
    quantity int not null,
    price decimal(10,2) not null,
    foreign key (order_id) references orders(order_id) on delete cascade,
    foreign key (menu_id) references menu(menu_id) on delete cascade
);
go

-- payments table
create table payments (
    payment_id int primary key identity(1,1),
    order_id int not null,
    amount decimal(10,2) not null,
    payment_method varchar(20) check (payment_method in ('cash', 'credit_card', 'debit_card', 'online')),
    status varchar(20) check (status in ('pending', 'completed', 'failed', 'refunded')) default 'pending',
    transaction_date datetime2 default getdate(),
    foreign key (order_id) references orders(order_id) on delete cascade
);
go

-- employees table (includes waiters, chefs, managers, and delivery agents)
create table employees (
    employee_id int primary key identity(1,1),
    first_name varchar(50) not null,
    last_name varchar(50) not null,
    role varchar(20) check (role in ('manager', 'waiter', 'chef', 'delivery agent')),
    phone_number varchar(20) unique not null,
    email varchar(100) unique not null,
    hire_date date not null,
    salary decimal(10,2) not null
);
go

-- delivery table (tracking home deliveries)
create table delivery (
    delivery_id int primary key identity(1,1),
    order_id int not null,
    delivery_agent_id int not null,
    estimated_time datetime2 not null,
    delivered_time datetime2 null,
    delivery_status varchar(20) check (delivery_status in ('pending', 'out-for-delivery', 'delivered', 'failed')) default 'pending',
    foreign key (order_id) references orders(order_id) on delete cascade,
    foreign key (delivery_agent_id) references employees(employee_id)  on delete cascade 
);
go


-- reviews table (dine-in & delivery reviews)
create table reviews (
    review_id int primary key identity(1,1),
    customer_id int not null,
    order_id int null,  -- null if only reviewing reservation experience
    reservation_id int null,  -- null if only reviewing a delivery order
    rating int check (rating between 1 and 5),
    comment nvarchar(max) null,
    review_date datetime2 default getdate(),
    foreign key (customer_id) references customers(customer_id),
    foreign key (order_id) references orders(order_id) on delete set null,
    foreign key (reservation_id) references reservations(reservation_id) on delete set null
);
go

-- INSERTION

insert into customers (first_name, last_name, phone_number, email, created_at)
values
('hamna', 'waseem', '1234567890', 'hamna@example.com', '2025-03-27 10:15:00'),
('mehreen', 'zaka', '0987654321', 'mehreen@example.com', '2025-03-27 10:20:00'),
('subaina', 'pervaiz', '5678901234', 'subaina@example.com', '2025-03-27 10:25:00');

ALTER TABLE orders
DROP COLUMN delivery_name;

Alter table orders
drop column delivery_phone;

INSERT INTO orders (customer_id, order_type, delivery_address, total_amount)
VALUES
  (1, 'home-delivery', '1234 Elm St, Springfield, IL', 99.99),
  (2, 'home-delivery', '5678 Oak St, Springfield, IL', 49.50),
  (3, 'home-delivery', '9101 Pine St, Springfield, IL', 150.75);

insert into reservations (customer_id,table_id, reservation_date, reservation_time, guest_count, status, special_requests)
values
(1, 1,'2025-04-01', '18:30', 2, 'confirmed', 'window seat preferred'),
(2, 2,'2025-04-02', '20:00', 4, 'pending', 'birthday celebration'),
(3, 3,'2025-04-03', '19:45', 3, 'cancelled', null);

insert into tabless (table_number, capacity, location, status)
values
('t101', 4, 'indoor', 'available'),
('t102', 6, 'outdoor', 'reserved'),
('t103', 2, 'vip', 'available');


insert into menu (name, description, price, category, availability) -- availability 1 means "available" and 0 means " not available"
values
('Margherita Pizza', 'Classic pizza with fresh tomato sauce and mozzarella', 2800, 'Pizza', 1),
('Pepperoni Pizza', 'Pizza topped with spicy pepperoni slices and mozzarella cheese', 3600, 'Pizza', 1),
('BBQ Chicken Pizza', 'Grilled chicken, BBQ sauce, onions, and cheddar cheese', 3900, 'Pizza', 1),
('Veggie Delight Pizza', 'Tomato sauce, mushrooms, bell peppers, olives, and mozzarella', 3400, 'Pizza', 1),

('Classic Cheeseburger', 'Beef patty with cheddar cheese, lettuce, tomato, and house sauce', 2500, 'Burger', 1),
('Bacon Burger', 'Juicy beef patty with crispy bacon, cheese, and BBQ sauce', 2300, 'Burger', 1),
('Spicy Chicken Burger', 'Crispy chicken fillet with spicy mayo, lettuce, and pickles', 2200, 'Burger', 1),

('Spaghetti Bolognese', 'Traditional Italian pasta with slow-cooked beef and tomato sauce', 3000, 'Pasta', 1),
('Chicken Alfredo', 'Creamy Alfredo sauce with grilled chicken over fettuccine pasta', 2800, 'Pasta', 1),
('Penne Arrabbiata', 'Penne pasta tossed in a spicy tomato garlic sauce', 2600, 'Pasta', 1),

('Caesar Salad', 'Fresh romaine lettuce, Caesar dressing, croutons, and parmesan cheese', 1500, 'Salad', 1),
('Greek Salad', 'Cucumber, tomatoes, olives, feta cheese, and lemon-olive oil dressing', 1600, 'Salad', 1),

('Mozzarella Sticks', 'Crispy fried mozzarella cheese sticks served with marinara sauce', 1500, 'Appetizer', 1),
('Garlic Bread', 'Toasted bread with garlic butter and herbs', 1300, 'Appetizer', 1),
('Buffalo Wings', 'Spicy buffalo chicken wings with ranch dip', 1000, 'Appetizer', 1),

('Coca-Cola', 'Chilled Coca-Cola soft drink (500ml)', 600, 'Beverage', 1),
('Fresh Lemonade', 'Homemade lemonade with fresh lemons and mint', 1000, 'Beverage', 1),
('Espresso', 'Strong and bold espresso shot', 800, 'Beverage', 1),

('Chocolate Cake', 'Rich and moist chocolate cake with fudge frosting', 1600, 'Dessert', 1),
('Cheesecake', 'Classic New York-style cheesecake with a graham cracker crust', 1800, 'Dessert', 1),
('Tiramisu', 'Italian coffee-flavored dessert with mascarpone and cocoa', 2000, 'Dessert', 1);



insert into order_items (order_id, menu_id, quantity, price)
values
(1, 1, 2, 12.99),
(2, 2, 1, 18.50),
(3, 3, 3, 7.99);

insert into payments (order_id, amount, payment_method, status)
values
(1, 25.99, 'credit_card', 'completed'),
(2, 38.75, 'online', 'pending'),
(3, 15.99, 'cash', 'completed');

insert into employees (first_name, last_name, role, phone_number, email, hire_date, salary)
values
('anosha', 'aamer', 'manager', '9876543210', 'anosha@example.com', '2022-01-15', 5000.00),
('sobia', 'asif', 'chef', '8765432109', 'sobia@example.com', '2021-06-20', 4000.00),
('hanan', 'tiwana', 'delivery agent', '7654321098', 'hanan@example.com', '2023-03-10', 2500.00);

insert into delivery (order_id, delivery_agent_id, estimated_time, delivered_time, delivery_status)
values
(2, 3, '2025-03-27 18:00:00', null, 'out-for-delivery'),
(3, 3, '2025-03-27 19:00:00', null, 'pending');

insert into reviews (customer_id, order_id, reservation_id, rating, comment)
values
(1, 1, null, 5, 'fantastic food and great service!'),
(2, 2, null, 4, 'delivery was a bit late, but the food was good.'),
(3, null, 1, 3, 'reservation process was smooth, but the table was not clean.');



-- QUERIES / VIEWS FOR OUR PROJECT FUNCTIONALITIES ( TOTAL 8 QUERIES AND 3 VIEWS)

-- TO REGISTER A CUSTOMER ( Customer Registration )  , we will simple insert customer data into customers table

-- authenticate customer / login
select customer_id, first_name, last_name 
from customers 
where email = 'hamna@example.com' and phone_number = '1234567890';

-- reset password (update phone number for login)
update customers 
set phone_number = '0987654421' 
where email = 'hamna@example.com';

-- check available tables for a specific date and time
select * from tabless 
where table_id not in (
    select table_id from reservations 
    where reservation_date = '2025-04-01' 
    and reservation_time between '18:00:00' and '20:00:00'
) and status = 'available';

-- prevent double booking
select * from reservations 
where table_id = 5 
and reservation_date = '2025-04-01' 
and reservation_time = '19:00:00';

-- edit an existing reservation
update reservations 
set table_id = 4, reservation_time = '21:00:00', status = 'confirmed' 
where reservation_id = 10;

-- view all booked tables for a date
select t.table_number, r.reservation_time, r.guest_count, c.first_name, c.last_name
from reservations r
join customers c on r.customer_id = c.customer_id
join tabless t on r.table_id = t.table_id
where r.reservation_date = '2025-04-01'
order by r.reservation_time;

-- view available tables for a date
select table_number, capacity, location 
from tabless
where table_id not in (
    select table_id from reservations 
    where reservation_date = '2025-04-01'
) and status = 'available';

-- highlight scheduling conflicts
select r1.reservation_id, r1.table_id, r1.reservation_time, r2.reservation_time 
from reservations r1
join reservations r2 on r1.table_id = r2.table_id
and r1.reservation_date = r2.reservation_date
and r1.reservation_time = r2.reservation_time
and r1.reservation_id <> r2.reservation_id;

-- summary of reservations
create view SummaryOfReservations as
select reservation_date, count(*) as total_reservations
from reservations 
group by reservation_date ;

-- retrieve full menu
create view MenuView as
select * from menu;

-- find all reserved tables for today
create view ReservedTablesForToday as
select t.table_number, r.reservation_time, r.guest_count, c.first_name, c.last_name
from reservations r
join customers c on r.customer_id = c.customer_id
join tabless t on r.table_id = t.table_id
where r.reservation_date = cast(getdate() as date);



-- ONE-TO-MANY RELATIONSHIPS:
--One customer can make multiple reservations  (Customers -> Reservations)
--One customer can place multiple orders (Customers -> Orders)
--One customer can make multiple payments (Customers -> Payments)
--One reservation can be linked to multiple orders (Reservations -> Orders)
--One order contains multiple order items (Orders -> Order_Items)

--MANY-TO-ONE RELATIONSHIPS:
--Many reservations belong to one customer (Reservations -> Customers)
--Many orders belong to one customer (Orders -> Customers)
--Many order items belong to one order (Order_Items -> Orders)


select table_id, location, capacity
from tabless
   ALTER TABLE orders ADD status_updated_at DATETIME NULL;

   select order_id , order_status, created_at , status_updated_at from orders;
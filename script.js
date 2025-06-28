// JS FILE FOR RESTAURANT MANAGEMENT SYSTEM
window.addEventListener("DOMContentLoaded", () => {
  const BASE_URL = "http://localhost:5001";



  // TEST CONNECTION FETCH
  fetch(`${BASE_URL}/api/message`)
    .then(response => response.json())
    .then(data => {
      console.log(data.message);
    })
    .catch(error => console.error('Error:', error));

  // PAGE NAVIGATION
  function navigate(sectionId) {
    document.querySelectorAll("section").forEach(section => {
      section.classList.add("hidden");
    });
    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
      selectedSection.classList.remove("hidden");
      selectedSection.scrollIntoView({ behavior: "smooth" });
  
      // Load reviews if navigating to the reviews section
      if (sectionId === "reviews") {
        loadReviews();
      }
    }
  }
  

  
// ADD CUSTOMER
document.getElementById("customerForm")?.addEventListener("submit", function(e) {
  e.preventDefault();

  const data = {
      first_name: document.getElementById("first_name").value,
      last_name: document.getElementById("last_name").value,
      phone_number: document.getElementById("phone_number").value,
      email: document.getElementById("email").value
  };

  fetch(`${BASE_URL}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(res => {

      const popup = document.createElement('div');
      popup.className = 'customer-popup';

      if (res.exists) {
          popup.innerHTML = `
              <div class="popup-content">
                  <h3>Customer Already Exists!</h3>
                  <p>The customer data already exists in our records.</p>
                  ${res.id ? `<p>Customer ID: <strong>${res.id}</strong></p>` : ''}
                  <p>Note: Do remember your ID or take a screenshot for further use!</p>
                  <button onclick="this.parentElement.parentElement.remove()">OK</button>
              </div>
          `;
      } else if (res.id) {
          popup.innerHTML = `
              <div class="popup-content">
                  <h3>Customer Added Successfully!</h3>
                  <p>Customer ID: <strong>${res.id}</strong></p>
                  <p>Note: Do remember your ID or take a screenshot for further use!</p>
                  <button onclick="this.parentElement.parentElement.remove()">OK</button>
              </div>
          `;
      } else {
          popup.innerHTML = `
              <div class="popup-content">
                  <h3>Something went wrong!</h3>
                  <p>Could not process the request. Please check your data and try again.</p>
                  <button onclick="this.parentElement.parentElement.remove()">OK</button>
              </div>
          `;
      }

      document.body.appendChild(popup);
      document.getElementById("customerForm").reset();
  })
  .catch(err => {
      console.error(err);
      alert("Failed to add customer. Please try again.");
  });
});



  // ADD RESERVATION
document.getElementById("reservationForm")?.addEventListener("submit", function(e) {
  e.preventDefault();

  const customerId = parseInt(document.getElementById("customerId").value);
  const date = document.getElementById("date").value;
  const time = document.getElementById("time").value;
  const guests = parseInt(document.getElementById("guests").value);
  const location = document.getElementById("location").value;
  const specialRequests = document.getElementById("specialRequests").value;

  // ✅ FORM VALIDATION
  if (!customerId || !date || !time || !guests || !location) {
    alert("Please fill all required fields correctly.");
    return;
  }

  const data = {
    customer_id: customerId,
    reservation_date: date,
    reservation_time: time,
    guest_count: guests,
    location: location,  // ⬅️ added location
    special_requests: specialRequests,
    status: "pending"
  };

  fetch(`${BASE_URL}/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    })
    .then(res => {
      const confirmationMessage = document.getElementById("confirmationMessage");
      confirmationMessage.innerHTML = `
        Thank you for your reservation!<br>
        Reservation ID: ${res.id}<br>
        Date: ${data.reservation_date} at ${data.reservation_time}
      `;
      document.getElementById("reservationForm").reset();
    })
    .catch(err => {
      console.error("Reservation Error:", err.message);
      alert("Reservation failed: " + err.message);
    });
});

 
  // SHOPPING CART FUNCTIONALITY
  let cart = [];
  let cartTotal = 0;

  function addToCart(itemName, price) {
    cart.push({ name: itemName, price: price });
    cartTotal += price;
    updateCartDisplay();
  }

  function updateCartDisplay() {
    const cartItemsElement = document.getElementById("cartItems");
    const cartTotalElement = document.getElementById("cartTotal");

    cartItemsElement.innerHTML = '';
    cart.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.name} - $${item.price.toFixed(2)}`;
      cartItemsElement.appendChild(li);
    });

    cartTotalElement.textContent = cartTotal.toFixed(2);
  }

  function showDeliveryForm() {
    if (cart.length === 0) {
      alert("Your cart is empty. Please add items before proceeding.");
      return;
    }
    document.getElementById("deliveryFormContainer").classList.remove("hidden");
    document.getElementById("cartDisplay").querySelector("button").style.display = "none";
  }

function placeOrder(event) {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const address = document.getElementById("address").value.trim();
    const phone = document.getElementById("phone").value.trim();

    if (!name || !address || !phone) {
        alert("Please fill in all fields.");
        return;
    }

    fetch(`${BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customer_name: name,  // Send full name (first and last)
            delivery_address: address,
            total_amount: cartTotal  // From your cart logic
        })
    })
    .then(res => res.json())
    .then(res => {
        if (res.message === "Order added") {
            document.getElementById("orderConfirmation").classList.remove("hidden");
            // Reset cart and form
            event.target.reset();
            cart = [];
            cartTotal = 0;
            updateCartDisplay();
        } else {
            alert("Failed to place order. Please try again.");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Failed to place order. Please try again.");
    });
}
//

  
  // REVIEWS FUNCTIONALITY
  let currentRating = 0;

  // The only part that needs to be fixed is the loadReviews function and related logic
// Add this updated code to your script.js file

// Updated loadReviews function to properly fetch from your database
function loadReviews() {
  console.log("loadReviews function called");
  
  // Make the reviews section visible
  document.querySelectorAll("section").forEach(section => {
    section.classList.add("hidden");
  });
  const reviewsSection = document.getElementById("reviews");
  if (reviewsSection) {
    reviewsSection.classList.remove("hidden");
    reviewsSection.scrollIntoView({ behavior: "smooth" });
  }

  const reviewsList = document.getElementById("reviewsList");
  reviewsList.innerHTML = "<div class='loading'>Loading reviews...</div>";

  // Try multiple potential API endpoints
  const endpoints = [
    `${BASE_URL}/api/reviews`,
    `${BASE_URL}/reviews`,
    `${BASE_URL}/api/review`
  ];
  
  // Function to attempt fetching from each endpoint
  function tryFetchingReviews(index) {
    if (index >= endpoints.length) {
      // All endpoints failed, show error
      reviewsList.innerHTML = `
        <div class="error-message">
          <p>Could not connect to the reviews database.</p>
          <p>Please check your server connection or try again later.</p>
        </div>
      `;
      return;
    }
    
    const endpoint = endpoints[index];
    console.log(`Attempting to fetch reviews from: ${endpoint}`);
    
    fetch(endpoint)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(reviews => {
        console.log("Reviews data received:", reviews);
        
        // Check if the response has the expected structure
        if (Array.isArray(reviews) || reviews.data) {
          const reviewsData = Array.isArray(reviews) ? reviews : reviews.data;
          displayReviews(reviewsData, reviewsList);
        } else {
          throw new Error("Unexpected API response format");
        }
      })
      .catch(error => {
        console.error(`Error fetching from ${endpoint}:`, error);
        // Try the next endpoint
        tryFetchingReviews(index + 1);
      });
  }
  
  // Start trying endpoints
  tryFetchingReviews(0);
}

function displayReviews(reviews, reviewsList) {
  if (!reviews || reviews.length === 0) {
    reviewsList.innerHTML = "<div class='no-reviews'>No reviews yet. Be the first to review!</div>";
    return;
  }

  reviewsList.innerHTML = '';
  
  reviews.forEach(review => {
    const reviewCard = document.createElement('div');
    reviewCard.className = 'review-card';
    
    // Ensure we have a valid date - use current date if not provided
    const reviewDate = review.review_date ? 
      new Date(review.review_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }) : 
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

    // Handle potential different property names
    const rating = review.rating || review.stars || 5;
    const comment = review.comment || review.content || review.text || "Great experience!";
    const customerId = review.customer_id || review.customerId || review.user_id || 1;
    
    // Create star rating display
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      starsHtml += i <= rating ? '★' : '☆';
    }

    // Determine review type
    let reviewType = '';
    if (review.order_id || review.orderId) reviewType = 'Online Order';
    if (review.reservation_id || review.reservationId) reviewType = 'Dining Experience';

    reviewCard.innerHTML = `
      <div class="review-header">
        <span class="reviewer-name">Customer #${customerId}</span>
        <span class="review-date">${reviewDate}</span>
      </div>
      <div class="review-meta">
        <span class="review-type">${reviewType}</span>
        <span class="review-rating">${starsHtml}</span>
      </div>
      <p class="review-comment">"${comment}"</p>
    `;

    reviewsList.appendChild(reviewCard);
  });
}

// SUBMIT REVIEW
document.getElementById("reviewForm")?.addEventListener("submit", function(e) {
  e.preventDefault();

  const rating = parseInt(document.querySelector('input[name="rating"]:checked')?.value);
  const comment = document.getElementById("reviewComment")?.value.trim();
  const customerId = parseInt(document.getElementById("reviewCustomerId")?.value);
  const orderId = parseInt(document.getElementById("reviewOrderId")?.value) || null;
  const reservationId = parseInt(document.getElementById("reviewReservationId")?.value) || null;

  if (!rating || !comment || !customerId) {
    alert("Please fill in all required fields!");
    return;
  }

  const data = {
    rating,
    comment,
    customer_id: customerId,
    order_id: orderId,
    reservation_id: reservationId
  };

  fetch(`${BASE_URL}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
  .then(res => {
    if (!res.ok) {
      throw new Error("Failed to submit review.");
    }
    return res.json();
  })
  .then(res => {
    alert("✅ Review submitted successfully!");
    document.getElementById("reviewForm").reset();
    loadReviews(); // Refresh reviews list
  })
  .catch(err => {
    console.error("Review submission error:", err);
    alert("❌ Failed to submit review. Please try again.");
  });
});



  // GLOBAL FUNCTIONS - This is the key fix! Expose functions to window object
  window.navigate = navigate;
  window.addToCart = addToCart;
  window.showDeliveryForm = showDeliveryForm;
  window.placeOrder = placeOrder;
  window.loadReviews = loadReviews;







});



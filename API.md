# MoneyMap API Documentation

Welcome to the MoneyMap API documentation! All endpoints are base-routed at `/api` and require JSON payload content. 

For protected routes, you must provide a valid JSON Web Token (JWT) in the request headers:
`Authorization: Bearer <your-jwt-token>`

---

## 1. Authentication Routes

### POST `/api/auth/register`
Registers a new user profile.
* **Payload**:
  ```json
  {
    "name": "Aisha",
    "email": "aisha@mail.com",
    "password": "password123"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "user": {
      "id": "u-uuid-1",
      "email": "aisha@mail.com",
      "name": "Aisha"
    },
    "token": "jwt-token-string"
  }
  ```

### POST `/api/auth/login`
Authenticates a user and returns a token.
* **Payload**:
  ```json
  {
    "email": "aisha@mail.com",
    "password": "password123"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "u-uuid-1",
      "email": "aisha@mail.com",
      "name": "Aisha"
    },
    "token": "jwt-token-string"
  }
  ```

### GET `/api/auth/me`
Retrieves the logged-in user's profile details. **(Protected)**
* **Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "u-uuid-1",
      "email": "aisha@mail.com",
      "name": "Aisha"
    }
  }
  ```

---

## 2. Group Routes

### POST `/api/groups/create`
Creates a new expense group and sets the creator as the group admin. **(Protected)**
* **Payload**:
  ```json
  {
    "name": "Roommates 402",
    "description": "Splitting groceries, utilities, and room rent"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "g-uuid-1",
    "name": "Roommates 402",
    "description": "Splitting groceries, utilities, and room rent",
    "inviteCode": "7X9B1Y",
    "createdAt": "2026-06-14T06:00:00.000Z"
  }
  ```

### POST `/api/groups/join`
Joins an existing group using its unique invite code. **(Protected)**
* **Payload**:
  ```json
  {
    "inviteCode": "7X9B1Y"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "message": "Successfully joined group",
    "group": {
      "id": "g-uuid-1",
      "name": "Roommates 402",
      "description": "Splitting groceries, utilities, and room rent",
      "inviteCode": "7X9B1Y"
    }
  }
  ```

### GET `/api/groups/my-groups`
Retrieves all groups the logged-in user belongs to, including active and departed states. **(Protected)**
* **Response (200 OK)**:
  ```json
  [
    {
      "id": "g-uuid-1",
      "name": "Roommates 402",
      "description": "Splitting groceries, utilities, and room rent",
      "inviteCode": "7X9B1Y",
      "joinedAt": "2026-06-14T06:00:00.000Z",
      "leftAt": null,
      "isActiveMember": true,
      "memberCount": 3
    }
  ]
  ```

### GET `/api/groups/:groupId/members`
Lists active and past members belonging to the group. **(Protected)**
* **Response (200 OK)**:
  ```json
  [
    {
      "id": "membership-uuid-1",
      "userId": "u-uuid-1",
      "groupId": "g-uuid-1",
      "joinedAt": "2026-06-14T06:00:00.000Z",
      "leftAt": null,
      "user": {
        "id": "u-uuid-1",
        "name": "Aisha",
        "email": "aisha@mail.com"
      }
    }
  ]
  ```

### PUT `/api/groups/leave/:groupId`
Sets a departure timestamp for the user's membership. This revokes editing permissions but keeps historical split math intact. **(Protected)**
* **Response (200 OK)**:
  ```json
  {
    "message": "Successfully left the group"
  }
  ```

### GET `/api/groups/:groupId/report`
Downloads a complete CSV summary report. Contains group details, member timelines, balance sheets, split-wise expense ledgers, documented settlements, and optimal suggested settlements. **(Protected)**
* **Response (200 OK)**: Raw CSV text attachment (`Content-Type: text/csv`).

---

## 3. Expense Routes

### POST `/api/expenses/create`
Records a group expense with split allocations. The `category` value must match one of the 17 standard strings from the Centralized Expense Categories Module. **(Protected)**
* **Payload (Equal Split)**:
  ```json
  {
    "groupId": "g-uuid-1",
    "description": "Supermarket veggies",
    "category": "Food & Grocery",
    "originalAmount": 1200,
    "currency": "INR",
    "splitType": "EQUAL",
    "payerId": "u-uuid-1",
    "splits": [
      { "userId": "u-uuid-1" },
      { "userId": "u-uuid-2" },
      { "userId": "u-uuid-3" }
    ]
  }
  ```
* **Payload (Percentage Split with Currency Conversion)**:
  ```json
  {
    "groupId": "g-uuid-1",
    "description": "Internet router config",
    "category": "Internet & Mobile Recharge",
    "originalAmount": 50,
    "currency": "USD",
    "exchangeRate": 84.0,
    "splitType": "PERCENTAGE",
    "payerId": "u-uuid-1",
    "splits": [
      { "userId": "u-uuid-1", "percentage": 50 },
      { "userId": "u-uuid-2", "percentage": 50 }
    ]
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "e-uuid-1",
    "groupId": "g-uuid-1",
    "payerId": "u-uuid-1",
    "description": "Supermarket veggies",
    "category": "Food & Grocery",
    "originalAmount": 1200.00,
    "currency": "INR",
    "exchangeRate": 1.0000,
    "baseAmountINR": 1200.00,
    "splitType": "EQUAL",
    "status": "APPROVED",
    "splits": [
      { "id": "s-1", "amountOwed": 400.00, "percentage": 33.33, "user": { "name": "Aisha" } }
    ]
  }
  ```

### GET `/api/expenses/group/:groupId`
Retrieves all expenses recorded within a specific group, listing their split breakdowns. **(Protected)**
* **Response (200 OK)**:
  ```json
  [
    {
      "id": "e-uuid-1",
      "description": "Supermarket veggies",
      "category": "Food & Grocery",
      "originalAmount": 1200.00,
      "currency": "INR",
      "status": "APPROVED",
      "payer": { "name": "Aisha" },
      "splits": [
        { "amountOwed": 400.00, "user": { "name": "Aisha" } }
      ]
    }
  ]
  ```

---

## 4. Balance & Settlement Routes

### GET `/api/balances/group/:groupId`
Calculates total paid, total owed, offset balances, and net positions (debts vs. credits) for all group members in INR. **(Protected)**
* **Response (200 OK)**:
  ```json
  [
    {
      "userId": "u-uuid-1",
      "name": "Aisha",
      "email": "aisha@mail.com",
      "totalPaid": 1200.00,
      "totalOwed": 400.00,
      "settlementsPaid": 0.00,
      "settlementsReceived": 400.00,
      "netBalance": 800.00
    }
  ]
  ```

### GET `/api/settlement-suggestions/group/:groupId`
Runs the Greedy Matchmaking Solver to suggest the absolute minimum number of payments to settle all outstanding balances in the group. **(Protected)**
* **Response (200 OK)**:
  ```json
  [
    {
      "fromUser": { "id": "u-uuid-2", "name": "Rohan", "email": "rohan@mail.com" },
      "toUser": { "id": "u-uuid-1", "name": "Aisha", "email": "aisha@mail.com" },
      "amount": 400.00
    }
  ]
  ```

### POST `/api/settlements/create`
Logs a direct peer-to-peer settlement payment. **(Protected)**
* **Payload**:
  ```json
  {
    "groupId": "g-uuid-1",
    "payerId": "u-uuid-2",
    "payeeId": "u-uuid-1",
    "amount": 400
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "setl-uuid-1",
    "groupId": "g-uuid-1",
    "payerId": "u-uuid-2",
    "payeeId": "u-uuid-1",
    "amount": 400.00,
    "date": "2026-06-14T06:00:00.000Z"
  }
  ```

---

## 5. CSV Import Routes

### POST `/api/import/csv`
Uploads and parses a transaction sheet, running the 12-rule anomaly check. **(Protected)**
* **Payload**: `multipart/form-data`
  - `groupId`: "g-uuid-1"
  - `file`: (CSV Attachment)
* **Response (200 OK)**:
  ```json
  {
    "report": {
      "id": "rep-uuid-1",
      "fileName": "room_expenses.csv",
      "totalRows": 5,
      "importedRows": 4,
      "failedRows": 1
    },
    "anomalies": [
      {
        "type": "DUPLICATE_EXPENSE",
        "description": "Possible duplicate: Groceries log detected twice in a 1-hour window.",
        "rowDesc": "Groceries",
        "status": "IMPORTED_PENDING"
      }
    ]
  }
  ```

---

## 6. Personal Transaction Routes

Manage private transactions inside your personal workspace ledger ("My Wallet").

### POST `/api/personal-transactions`
Logs a new personal income or expense entry. **(Protected)**
* **Payload**:
  ```json
  {
    "type": "EXPENSE",
    "category": "Home & Room Rent",
    "amount": 15000,
    "currency": "INR",
    "description": "June flat rent",
    "date": "2026-06-14T00:00:00.000Z"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "pt-uuid-1",
    "userId": "u-uuid-1",
    "type": "EXPENSE",
    "category": "Home & Room Rent",
    "amount": 15000.00,
    "currency": "INR",
    "exchangeRate": 1.00,
    "baseAmountINR": 15000.00,
    "description": "June flat rent",
    "date": "2026-06-14T00:00:00.000Z"
  }
  ```

### GET `/api/personal-transactions`
Retrieves personal transactions with optional query filters and a summary sheet of net balances. **(Protected)**
* **Query Parameters**:
  - `type`: Either `EXPENSE` or `INCOME`
  - `category`: Matches specific strings (e.g. `Salary, Savings & Investments`)
  - `startDate`/`endDate`: Filters by transaction date (e.g. `2026-06-01`)
* **Response (200 OK)**:
  ```json
  {
    "transactions": [
      {
        "id": "pt-uuid-1",
        "type": "EXPENSE",
        "category": "Home & Room Rent",
        "amount": 15000.00,
        "currency": "INR",
        "baseAmountINR": 15000.00,
        "description": "June flat rent",
        "date": "2026-06-14T00:00:00.000Z"
      }
    ],
    "summary": {
      "totalIncomeINR": 45000.00,
      "totalExpenseINR": 15000.00,
      "netBalanceINR": 30000.00
    }
  }
  ```

### PUT `/api/personal-transactions/:id`
Updates an existing personal wallet transaction. **(Protected)**
* **Payload**:
  ```json
  {
    "amount": 16000,
    "description": "Rent update with maintenance"
  }
  ```
* **Response (200 OK)**: Returns the updated transaction object.

### DELETE `/api/personal-transactions/:id`
Deletes a personal wallet transaction. **(Protected)**
* **Response (200 OK)**:
  ```json
  {
    "message": "Transaction successfully deleted"
  }
  ```

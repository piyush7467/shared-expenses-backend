# MoneyMap CSV Import Anomaly Report

This report outlines the results of importing transaction histories from the file `expenses_import.csv` into the MoneyMap group workspace. It lists the validation result for each row in the CSV, indicating any anomalies detected and the actions taken.

---

## 1. Import Run Metadata
* **Filename**: `expenses_import.csv`
* **Import Time**: `2026-06-14T12:59:47.882Z`
* **Total Rows Parsed**: `9`
* **Rows Imported (Approved or Pending)**: `4`
* **Rows Rejected (Critical Failures)**: `5`

---

## 2. Row-by-Row Anomaly Log

Below is the verification grid showing every row, the anomaly identified, the severity class, and the final action taken by the parser.

| Row # | Transaction Description | Amount & Currency | Payer Email | Anomaly Type | Severity | Action Taken | Rationale & Description |
|---|---|---|---|---|---|---|---|
| **1** | Uber Ride | `500 INR` | `aisha@mail.com` | *None* | Valid | **APPROVED** | Imported directly into the group ledger with active balance offsets. |
| **2** | Groceries | `1000 INR` | `aisha@mail.com` | `DUPLICATE_EXPENSE` | Warning | **IMPORTED (PENDING)** | Duplicate expense logged within 1 hour of another `Groceries` entry. Kept in pending state for human review. |
| **3** | Settle lunch bill | `400 INR` | `rohan@mail.com` | `SETTLEMENT_AS_EXPENSE` | Warning | **IMPORTED (PENDING)** | Description keywords indicate this is a debt settlement repayment rather than a standard split expense. |
| **4** | Hostel WiFi | `800 INR` | `priya@mail.com` | `EXPENSE_AFTER_LEFT` | Warning | **IMPORTED (PENDING)** | Payer Priya left the group on May 1st, 2026, but the expense date is June 10th, 2026. |
| **5** | Refund | `-100 INR` | `aisha@mail.com` | `NEGATIVE_AMOUNT` | Critical | **REJECTED** | Expense amounts must be strictly positive. The transaction was blocked from entering the database. |
| **6** | Snacks | `300 INR` | `rohan@mail.com` | `INVALID_DATE` | Critical | **REJECTED** | The date value `invalid-date` could not be parsed. Row was blocked. |
| **7** | Coffee | `20 EUR` | `priya@mail.com` | `INVALID_CURRENCY` | Critical | **REJECTED** | MoneyMap only supports `INR` and `USD` transactions. The `EUR` transaction was blocked. |
| **8** | Juice | `100 INR` | `stranger@mail.com` | `UNKNOWN_USERS` | Critical | **REJECTED** | The payer email `stranger@mail.com` is not registered in the system database. |
| **9** | Chips | `100 INR` | `aisha@mail.com` | `INVALID_SPLIT_PERCENTAGE` | Critical | **REJECTED** | Custom percentage split values sum up to 80% (50 + 30) instead of the required 100%. |

---

## 3. Explanations of Severity Actions

### Action: APPROVED
* **Condition**: The transaction passed all 12 validation rules perfectly.
* **Effect**: Automatically incorporated into the group ledger. Group balances, net offsets, and payment suggestion engines recalculate immediately.

### Action: IMPORTED (PENDING)
* **Condition**: Triggered warning-level anomalies (such as duplicate entries, potential settlement keywords, or transactions logged outside membership start/end timelines).
* **Effect**: The row is saved in the database but flagged with a status of `PENDING`. These warning entries are displayed to group members in the dashboard with alert tags. They do **not** affect balance sheets until a group member manually approves them.

### Action: REJECTED
* **Condition**: Triggered critical database or arithmetic errors (negative amounts, invalid dates, unsupported currencies, unregistered users, or invalid split weights).
* **Effect**: The transaction is blocked entirely from database entry. The parser logs the failure details on the import report but discards the row, protecting the ledger from corruption.

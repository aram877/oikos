# The output should be deterministic and implementation-ready, not conceptual.

## Requirements:

Classify transactions into:

- income

- expense

transfer (important: Savings and invesments are NOT expenses)

Explain how transfers can be heuristically detected.

Generate these report sections:

## A) Cash Flow Summary

total income

total expenses

net result (savings / deficit)

## B) Expense Breakdown

expenses grouped by category

percentage of total spending per category

## C) Fixed vs Variable Expenses

Provide logic to infer:

fixed recurring payments (rent, subscriptions, insurance, etc.)

variable spending

## D) Recurring Payments Detection

Define algorithm to detect recurring charges using only transaction history.

## E) Merchant Analysis

top merchants by spending

grouping logic for messy bank descriptions

## F) Anomaly Detection

Define rules for identifying unusual transactions without ML training.

Important Constraints:

No machine learning training allowed

Only rule-based / heuristic logic

Must work with noisy bank descriptions

Must be realistic for an MVP

Deliverables:

Provide:

Clear algorithms / heuristics

Edge cases to consider

Example output JSON structure for the report

Pseudocode or TypeScript-style implementation logic

Avoid generic explanations.
Focus on practical decision logic that could be implemented directly.

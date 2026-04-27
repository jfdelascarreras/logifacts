# 📦 LogiFacts – Shipment Intelligence

## Product Requirements Document (PRD)

---

## 🟦 1. Overview

**Product:** LogiFacts Shipment Intelligence
**Type:** SaaS Web Application

**Goal:** Provide companies with visibility, insights, and optimization opportunities for shipping costs.

---

## 🧱 2. Core Pages

### 1. Landing Page

**Purpose:** Convert visitors into users

**Key Elements:**

* Value proposition (clear, simple)
* Product explanation (what LogiFacts does)
* Visual preview of dashboard
* Pricing section (Stripe integration)
* Call-to-action (Sign up / Start free trial)

---

### 2. Authentication (Auth)

**Purpose:** Manage user access

**Features:**

* Sign up / Log in
* Password reset
* Session management
* User roles (future)

**Notes:**

* Implemented via Supabase Auth

---

### 3. Dashboard (Protected Area)

**Purpose:** Core product experience

**Access:** Requires authentication

**Key Features:**

#### KPI Overview

* Total Cost
* Cost per Package (CPP)
* Cost structure (% breakdown)

#### Analytics

* Trends (cost, CPP, volume)
* Cost drivers (category, service, carrier, zone)
* Efficiency (weight gap)

#### Visuals

* Line charts
* Decomposition trees
* Heatmaps
* Tables (period comparisons)

#### AI Insights

* Explain trends and anomalies
* Highlight cost drivers
* Suggest optimization opportunities

---

### 4. Guided Tour

**Purpose:** Onboard new users

**Features:**

* Step-by-step walkthrough of dashboard
* Highlights key metrics and features
* Triggered on first login
* Option to replay

---

## ⚙️ 3. Tech Stack

### Frontend

* Next.js (App Router)
* Tailwind CSS

### Backend / Database

* Supabase (Postgres + Auth)

### Payments

* Stripe (subscriptions, billing)

### Messaging / Email

* Loops (user lifecycle emails)

### AI / Intelligence

* OpenAI (insights generation)
* ElevenLabs (optional voice insights – future)

### Infrastructure

* Vercel (deployment + hosting)

---

## 🧠 4. Core Functionality

### Data Handling

* Users upload or connect shipment data
* Data is stored and processed in Supabase
* Data is normalized for analysis

### Metrics Engine

* Calculate KPIs (Cost, CPP, % breakdowns)
* Support time comparisons (WoW, MoM, YTD)

### AI Layer

* Generate insights from metrics
* Explain drivers and trends
* Keep outputs simple and actionable

---

## 💳 5. Monetization

* Subscription-based model (Stripe)
* Free trial (optional)
* Tiered pricing (future)

---

## 🔐 6. Permissions & Access

* Dashboard is protected
* Only authenticated users can access data
* Each user is scoped to their own dataset

---

## 📏 7. Constraints & Assumptions

* Minimum data: more than 3 invoices per client
* Data quality depends on uploaded invoices
* Initial benchmarks based on internal data (TBD refinement)

---

## 🚀 8. Future Enhancements

* Forecasting (cost prediction)
* Savings recommendations
* Multi-carrier optimization
* Voice insights (ElevenLabs)
* Advanced benchmarking

---

## ✅ 9. Definition of Done

* Users can sign up and log in
* Users can access dashboard securely
* Dashboard displays key KPIs and visuals
* AI insights are generated and visible
* Payments flow works via Stripe
* App is deployed on Vercel

---

# ⚡ NexusFleet / NexusHealth Command Engine
## Autonomous Edge Triage, Real-Time Resource Balancing & Dynamic Routing System

---

## 📌 Executive Summary

Modern dynamic operations—whether in Emergency Medical Response or Commercial EV Fleet Logistics—face severe bottlenecks due to static routing, manual triage delays, and unmanaged resource overloads. 

**Nexus Command** is a closed-loop, full-stack orchestration engine designed to automate real-time intake, prioritize urgency via Edge-AI, dynamically rebalance infrastructure (ICU beds/chargers/staff/vehicles), and handle end-to-end dispatch and notifications.

---

## 🏗️ System Architecture & Data Flow

```text
                     ┌────────────────────────────────────────┐
                     │          Edge-AI Ingestion             │
                     │  • Twilio WhatsApp Webhook (Audio/GPS) │
                     │  • Google Auth / Web Intake Portal     │
                     └───────────────────┬────────────────────┘
                                         │
                                         ▼
                     ┌────────────────────────────────────────┐
                     │         AI Processing & Triage         │
                     │  • Groq Whisper-Large-v3 (Audio->Text) │
                     │  • Groq LLaMA-3.1-8B (JSON Extraction) │
                     │  • Haversine Geodesic Math Engine      │
                     └───────────────────┬────────────────────┘
                                         │
                                         ▼
                     ┌────────────────────────────────────────┐
                     │     Real-Time State Synchronization    │
                     │  • Cloud Firestore Live Event Streams  │
                     └───────────────────┬────────────────────┘
                                         │
         ┌───────────────────────────────┴───────────────────────────────┐
         ▼                                                               ▼
┌──────────────────────────────────┐          ┌──────────────────────────────────┐
│     Executive Command Center     │          │    Assigned Responders Portal    │
│ • Live Intake & Priority Queue   │          │ • Secure Role-Based Dashboards   │
│ • Haversine ETA & Distance Math  │          │ • Emergency Code-Red Audio Alerts│
│ • Dynamic Power/Bed Reallocation │          │ • Time-Slot Scheduling & Confirm │
│ • Automated Load Balancing Logs  │          │ • Interactive Leaflet Live Maps  │
└────────────────┬─────────────────┘          └────────────────┬─────────────────┘
                 │                                             │
                 └───────────────────────┬─────────────────────┘
                                         │
                                         ▼
                     ┌────────────────────────────────────────┐
                     │      Automated Dispatch Loop           │
                     │  • Nodemailer Transactional Receipts   │
                     │  • WhatsApp Dynamic ETA Dispatch Reply │
                     └────────────────────────────────────────┘
```

---

## 🔬 Core Mathematical Formulations & Algorithms

### 1. Haversine Spherical Geodesic Distance
To compute the exact surface distance between the base coordinates $(\text{lat}_1, \text{lon}_1)$ and the incoming client $(\text{lat}_2, \text{lon}_2)$ on a spherical Earth:

$$\Delta\text{lat} = (\text{lat}_2 - \text{lat}_1) \times \frac{\pi}{180}$$

$$\Delta\text{lon} = (\text{lon}_2 - \text{lon}_1) \times \frac{\pi}{180}$$

$$a = \sin^2\left(\frac{\Delta\text{lat}}{2}\right) + \cos\left(\text{lat}_1 \times \frac{\pi}{180}\right) \cdot \cos\left(\text{lat}_2 \times \frac{\pi}{180}\right) \cdot \sin^2\left(\frac{\Delta\text{lon}}{2}\right)$$

$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right)$$

$$d = R \cdot c \quad (\text{where } R = 6371\text{ km})$$

### 2. Dynamic ETA Estimation
Estimated arrival time is derived from the calculated Haversine distance relative to average urban transit speeds plus a fixed dispatch delay ($\Delta t_{\text{buffer}}$):

$$\text{ETA (Minutes)} = \left\lceil \frac{d}{v_{\text{urban}}} \times 60 \right\rceil + \Delta t_{\text{buffer}}$$

### 3. Dynamic Capacity Balancing & Overflow Throttling
When high-priority units exceed the initial base capacity ($C_{\text{critical}}$), the allocator dynamically scales high-demand infrastructure in discrete blocks ($k$) while throttling general standard lines to protect system stability:

$$k = \left\lceil \frac{\text{Used}_{\text{critical}} - C_{\text{critical}}}{\text{Block Size}} \right\rceil$$

$$C_{\text{critical}}^{\text{new}} = C_{\text{critical}} + (k \times \text{Step}_{\text{alloc}})$$

$$C_{\text{standard}}^{\text{new}} = C_{\text{standard}} - (k \times \text{Step}_{\text{throttle}})$$

---

## 🛠️ Key Capabilities

| Feature | Technical Implementation | Description |
| :--- | :--- | :--- |
| **Multimodal Edge Intake** | Twilio API + Groq Whisper-Large-v3 | Ingests voice notes, streams audio binaries directly to Whisper for multilingual translation into diagnostic text. |
| **Edge-AI Triage** | Groq LLaMA-3.1-8B-Instant | Evaluates severity, extracts symptom/telemetry keywords, and outputs a normalized $P_1 - P_5$ criticality score. |
| **Live Dispatch Sync** | Firebase Firestore (`onSnapshot`) | WebSocket-backed real-time document listeners updating intake queues and floor matrices with zero refresh. |
| **Interactive Map Engine** | Leaflet + React-Leaflet | Real-time map rendering with custom dynamic coordinate pins, charging/trauma badges, and Haversine vectors. |
| **Surge Protocol Handler** | State-driven load balancing | Detects concurrent high-criticality intake, rerouting lower-priority queues and triggering staff drafting across wings. |
| **Closed-Loop Receipts** | Nodemailer (SMTP) | Fires automated verified receipts, routing itineraries, and emergency confirmations upon task discharge. |

---

## 💻 Tech Stack

- **Framework**: Next.js (App Router, Server Components & Route Handlers)
- **Styling & UI**: Tailwind CSS v4, Lucide React, Glassmorphism design system
- **Edge AI & Models**: Groq SDK (`llama-3.1-8b-instant`, `whisper-large-v3`)
- **Database & Auth**: Firebase Firestore, Firebase Authentication (Google Identity Provider)
- **Messaging & Telephony**: Twilio WhatsApp Messaging API
- **Geospatial & Visuals**: Leaflet, React-Leaflet, Recharts
- **Notifications**: Nodemailer (SMTP Gateway)

---

## 📁 Repository Structure

```text
.
├── public/                     # Static assets and SVG icons
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   └── page.tsx        # Central Command Dashboard (Resource balancer & queue)
│   │   ├── api/
│   │   │   ├── send-email/
│   │   │   │   └── route.ts    # Nodemailer automated dispatch endpoint
│   │   │   └── whatsapp/
│   │   │       └── route.ts    # Twilio Webhook + Whisper + LLaMA-3 Triage
│   │   ├── doctor/
│   │   │   └── page.tsx        # Assigned Staff Caseload, Audio Alarms & Scheduling
│   │   ├── patient/
│   │   │   └── page.tsx        # Google Auth Patient/Client intake form
│   │   ├── layout.tsx          # Root layout with Geist font optimization
│   │   ├── page.tsx            # Web intake and public routing portal
│   │   └── globals.css         # Tailwind v4 imports and custom glassmorphism styles
│   └── lib/
│       └── firebase.ts         # Firebase App, Firestore DB, and Auth initialization
├── package.json                # Project dependencies and execution scripts
├── tsconfig.json               # TypeScript configuration
└── next.config.ts              # Next.js configuration
```

### Key Workspace Files
*   **Command Center UI**: [src/app/admin/page.tsx](file:///e:/hospital-resource-balancer/src/app/admin/page.tsx)
*   **Dispatch Webhook**: [src/app/api/send-email/route.ts](file:///e:/hospital-resource-balancer/src/app/api/send-email/route.ts)
*   **WhatsApp / Triage API**: [src/app/api/whatsapp/route.ts](file:///e:/hospital-resource-balancer/src/app/api/whatsapp/route.ts)
*   **Doctor Panel UI**: [src/app/doctor/page.tsx](file:///e:/hospital-resource-balancer/src/app/doctor/page.tsx)
*   **Patient Intake UI**: [src/app/patient/page.tsx](file:///e:/hospital-resource-balancer/src/app/patient/page.tsx)
*   **Root Layout**: [src/app/layout.tsx](file:///e:/hospital-resource-balancer/src/app/layout.tsx)
*   **Home Page**: [src/app/page.tsx](file:///e:/hospital-resource-balancer/src/app/page.tsx)
*   **Global Styles**: [src/app/globals.css](file:///e:/hospital-resource-balancer/src/app/globals.css)
*   **Firebase Initializer**: [src/lib/firebase.ts](file:///e:/hospital-resource-balancer/src/lib/firebase.ts)
*   **Manifest & Configs**: [package.json](file:///e:/hospital-resource-balancer/package.json) | [tsconfig.json](file:///e:/hospital-resource-balancer/tsconfig.json) | [next.config.ts](file:///e:/hospital-resource-balancer/next.config.ts)

---

## ⚙️ Environment Variables & Setup

Create a `.env.local` file in the root directory:

```ini
# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Groq Cloud API (LLaMA 3.1 & Whisper)
GROQ_API_KEY=gsk_your_groq_api_key

# Twilio Credentials (WhatsApp Sandbox)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# Central Base Coordinates (Default: GMC Nagpur)
NEXT_PUBLIC_HOSPITAL_LAT=21.1255
NEXT_PUBLIC_HOSPITAL_LNG=79.0984

# Nodemailer Automated Dispatch
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_16_character_app_password
```

---

## 🚀 Quickstart Guide

### 1. Installation
Clone the repository and install all required dependencies:

```bash
git clone <repository_url>
cd <repository_name>
npm install
```

### 2. Run Local Development

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the portal.

### 3. Expose Webhook for WhatsApp Voice Telemetry
In a separate terminal window, establish an Ngrok tunnel:

```bash
ngrok http 3000
```

Copy your assigned forwarding URL (e.g., `https://xxxx.ngrok-free.app`) and configure your Twilio Sandbox incoming webhook URL:

```text
https://xxxx.ngrok-free.app/api/whatsapp
```

---

## 🧭 Live Demo & Validation Script

1. **Edge Voice Note Ingestion**: Send an audio message on WhatsApp stating critical distress/battery status.
2. **Audio Transcription & Triage**: Whisper-Large-v3 transcribes audio into text; LLaMA-3.1 assigns a $P_1$ priority score and requests live GPS location.
3. **Geodesic Positioning**: Share WhatsApp Live Location; backend calculates distance via Haversine and returns an accurate ETA.
4. **Command Balancing**: Inspect the `/admin` dashboard. Observe real-time dynamic bed/charger allocation and surge warnings.
5. **Staff/Driver Confirmation**: Access `/doctor` (or driver portal), review the incoming case, and confirm allocation.
6. **Closed-Loop Dispatch**: Confirming an allocation automatically dispatches an HTML notification receipt via SMTP.

<div align="center">

# UTRYON

<p>
  <strong>UTRYON</strong> is a browser-based digital fitting room that uses computer vision to turn front and side full-body photos into a personalized body measurement profile.
</p>

</div>

---

## About

UTRYON guides users through a real-time camera scan and uses **Google MediaPipe Pose** to validate posture, framing, orientation, and stability.

Once the scan is complete, UTRYON generates a detailed measurement summary with **13+ body measurements**, including chest, waist, hips, shoulder width, arm length, inseam, and more.

The goal is to make online clothing shopping more personalized by helping users better understand their body measurements and potential garment fit.

---

## Features

<table>
<tr>
<td width="50%">

### Guided Scanning

* Front + side camera scanning
* Real-time scan guidance
* Voice-guided instructions
* Photo upload mode

</td>
<td width="50%">

### Computer Vision

* 33-point MediaPipe Pose tracking
* Posture validation
* Framing validation
* Orientation validation
* Stability detection

</td>
</tr>

<tr>
<td>

### Measurement Profile

* 13+ body measurements
* Metric & imperial units
* Detailed measurement summary
* Interactive fit profile

</td>
<td>

### Fit Intelligence

* Garment ease calculations
* Personalized fit information
* Backend measurement processing
* Client-side fallback for network failures

</td>
</tr>
</table>

---

## How It Works

<div align="center">

```text
┌──────────────────────┐
│   Front + Side Photos │
│    Camera / Upload    │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   MediaPipe Pose     │
│  33-Point Tracking   │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│  Scan Quality Check  │
│ Posture • Framing    │
│ Orientation • Stability│
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ Measurement Provider │
│     Backend API      │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   Body Measurements  │
│       13+ Metrics    │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ 3D Fit Profile +     │
│   Garment Ease       │
└──────────────────────┘
```

</div>

---

## Measurement Profile

UTRYON generates a detailed body measurement summary from the captured photos.

Measurements include:

* Chest
* Waist
* Hips
* Shoulder width
* Neck
* Upper arm
* Arm length
* Wrist
* Thigh
* Inseam
* Outseam
* Torso length
* Height
* And additional fit-related measurements

---

## Tech Stack

<table>
<tr>
<th>Category</th>
<th>Technology</th>
</tr>

<tr>
<td><strong>Frontend</strong></td>
<td>HTML5 · Vanilla JavaScript (ES6+) · CSS3</td>
</tr>

<tr>
<td><strong>Computer Vision</strong></td>
<td>Google MediaPipe Pose</td>
</tr>

<tr>
<td><strong>Browser APIs</strong></td>
<td>Camera · Canvas · Web Speech · Web Audio</td>
</tr>

<tr>
<td><strong>Backend</strong></td>
<td>Node.js · Express.js · REST APIs</td>
</tr>

<tr>
<td><strong>Data</strong></td>
<td>JSON persistence</td>
</tr>

<tr>
<td><strong>Production API</strong></td>
<td>Bodygram REST API</td>
</tr>

</table>

---

## Architecture

```text
Camera / Upload
       │
       ▼
MediaPipe Pose
       │
       ▼
Scan Quality Validation
       │
       ▼
Front + Side Photos
       │
       ▼
Backend Measurement Provider
       │
       ▼
Body Measurements
       │
       ▼
3D Fit Profile + Garment Ease
```

---

## Getting Started

### Clone the repository

```bash
git clone https://github.com/SriB101010/AI-body-scan.git
cd AI-body-scan
```

### Install dependencies

```bash
npm install
```

### Start the application

```bash
npm start
```

Then open the local development URL in your browser.

---


Two photos. 13+ measurements. A smarter way to understand clothing fit.
UTRYON is a browser-based digital fitting room that uses computer vision to turn front and side full-body photos into a personalized body measurement profile.
The application guides users through a real-time camera scan, validates posture, framing, orientation, and stability using Google MediaPipe Pose, and generates measurements such as chest, waist, hips, shoulders, arm length, inseam, and more.
Features
Guided front + side camera scanning
Real-time pose and posture validation
33-point MediaPipe Pose tracking
13+ body measurements
Voice-guided scanning
Photo upload mode
Client-side fallback for network failures
Garment ease calculations
Interactive fit profile with metric/imperial units
Tech Stack
Frontend: HTML5, Vanilla JavaScript (ES6+), CSS3
Computer Vision: Google MediaPipe Pose
Browser APIs: Camera, Canvas, Web Speech, Web Audio
Backend: Node.js, Express.js, REST APIs
Data: JSON persistence
Production API: Bodygram REST API
Architecture:
Camera / Upload > MediaPipe Pose > Scan Quality Validation > Front + Side Photos > Backend Measurement Provider > Body Measurements > 3D Fit Profile + Garment Ease



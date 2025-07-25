## Computer Graphics - Exercise 6, Interactive Basketball Shooting Game with Physics

## Getting Started
1. Clone this repository to your local machine
2. Make sure you have Node.js installed
3. Start the local web server: `node index.js`
4. Open your browser and go to http://localhost:8000

## Group Members - name sand id

- GILAD AMOS, 208250969
- DANIEL SEGAL, 208256636
- TOMER MENASHE, 208640557

## Implemented Controls
← → : Move basketball left/right

↑ ↓ : Move basketball forward/backward

W / S : Increase/decrease shot power (0%–100%)

Spacebar : Shoot basketball toward nearest hoop

R : Reset ball to center court

T : Toggle timed mode (60 seconds)

Y : Toggle real game mode (4 quarters)

B : Toggle auto-camera tracking (starts ON)

O : Toggle orbit camera controls

Press T or Y twice to start/stop each mode

## Physics System Implementation

### 1. Gravity and Trajectory

- A constant downward force of `-9.8 m/s²` (`GRAVITY = -9.8`) is applied to the basketball's Y-axis velocity during flight.
- The shot trajectory follows a **parabolic arc** based on initial velocity and direction.
- Initial velocity is calculated using:
  - Shot **direction vector** from the ball to the closest hoop
  - Shot **power percentage** (0–100%), scaled to produce appropriate arc height and distance
- The shot arc is tuned to clear the rim height (`RIM_H = 3.05`), ensuring a natural and realistic flight path.

### 2. Collision Detection and Bouncing

- **Ground Collision**:
  - When the ball reaches floor level (`FLOOR_Y + BALL_RAD`), it bounces.
  - Y-velocity is inverted and reduced (`×0.6`) to simulate energy loss (coefficient of restitution).
  - X and Z velocities are dampened (`×0.8`) to simulate horizontal friction.
  - After several bounces, if velocity falls below a small threshold, the ball comes to rest.
  
- **Rim Collision**:
  - Collision with the rim is detected by checking the ball's position relative to hoop dimensions.
  - Velocity is modified to simulate deflection and partial energy loss.
  - Rim contact is also used to distinguish between **swish shots** and regular made shots.

- **Backboard Collision**:
  - The system checks bounding box overlap with the backboard's position and dimensions.
  - If hit, the ball reflects off the surface and loses energy.

### 3. Shot Mechanics

- Shot power is adjusted in real-time using `W/S` keys and stored as a percentage (`shotPower`).
- Pressing `Spacebar` initiates a shot:
  - A direction vector to the nearest hoop is computed.
  - Velocity components are calculated from this direction and the current power.
  - The result is a lifelike upward-forward motion.
- Shots must **descend through the hoop's vertical center** to be scored.
- The system rejects invalid shots that don't pass below the rim or that bounce away.

## Additional features
implemented all the advanced features (Bonus section) 

## External assets
there is a court_texture.jpeg which was used and is located in:
src/textures/court_texture.jpeg


export const PadState = {
  idle: 'idle',
  queued: 'queued',
  playing: 'playing',
  // Game mode states
  demo: 'demo',       // Pad highlighted during demonstration phase
  correct: 'correct', // User got it right (green flash)
  incorrect: 'incorrect', // User got it wrong (red flash)
};

export const GamePhase = {
  inactive: 'inactive',       // Not in game mode
  ready: 'ready',             // Game mode active, waiting to start
  demonstrating: 'demonstrating', // Showing sequence to player
  waitingForInput: 'waitingForInput', // Player's turn
  success: 'success',         // Level completed
  gameOver: 'gameOver',       // Game ended
};

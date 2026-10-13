const storeConfig = require('./store.config.json');

// Keep the review contact's phone number out of version control.
module.exports = {
  ...storeConfig,
  apple: {
    ...storeConfig.apple,
    ...(process.env.PEWPEW_APP_REVIEW_PHONE ? {
      review: {
        firstName: 'Muhammed',
        lastName: 'Saeed',
        email: 'support@pewpew.saeed.sh',
        phone: process.env.PEWPEW_APP_REVIEW_PHONE,
        notes: 'No login is required. Tap PLAY, choose level 1, and drag to steer. Shooting is automatic. Clear levels to unlock the next level. The pause button opens the pause menu. Music and sound effects have separate switches in Settings.\n\nGame Center is optional: the game is fully playable without signing in. Leaderboards record level scores only; there is no multiplayer.\n\nThe app uses Expo Updates to download compatible JavaScript and asset updates. It includes an embedded game bundle for offline play.',
      },
    } : {}),
  },
};

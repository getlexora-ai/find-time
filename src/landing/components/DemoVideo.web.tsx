import * as React from 'react';

/**
 * The pre-rendered product walkthrough (dashboard → ADD TASK → NEW TIME BLOCK
 * dialog → "Plan my German learning today" → APPLY PLAN → the calendar reshuffles).
 * Recorded from the standalone HTML build; the source files live in `public/`.
 *
 * Web-only: a raw <video> under react-native-web. Autoplays muted + looped, so it
 * needs no controls and never blocks on user gesture. Poster shows before the
 * first frame decodes. 960×558 source; scales to its container.
 */
export function DemoVideo() {
  return React.createElement(
    'video',
    {
      poster: '/find-time-walkthrough-poster.jpg',
      autoPlay: true,
      muted: true,
      loop: true,
      playsInline: true,
      preload: 'metadata',
      'aria-label':
        'Find Time walkthrough: asking the assistant to plan German learning, and the calendar rescheduling to fit it',
      style: {
        display: 'block',
        width: '100%',
        height: 'auto',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 24px 60px -12px rgba(0,0,0,0.6)',
        backgroundColor: '#141d43',
      },
    },
    React.createElement('source', { src: '/find-time-walkthrough.webm', type: 'video/webm' }),
    React.createElement('source', { src: '/find-time-walkthrough.mp4', type: 'video/mp4' }),
  );
}

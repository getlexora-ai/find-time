import { Image, StyleSheet } from 'react-native';

/**
 * The pre-rendered product walkthrough: dashboard → ADD TASK → NEW TIME BLOCK
 * dialog → "Plan my German learning today" → APPLY PLAN → the calendar
 * reschedules Admin batch and slots the German blocks in.
 *
 * Shipped as a looping GIF (`public/find-time-walkthrough.gif`, ~4 MB, 760px,
 * 13 fps) so it needs no <video> element, autoplay policy, or JS — an <img> that
 * loops on its own. `public/` is served at the web root by `expo export`.
 * The .mp4 / .webm next to it are the lighter alternative if the GIF weight
 * becomes a problem.
 */
export function DemoVideo() {
  return (
    <Image
      source={{ uri: '/find-time-walkthrough.gif' }}
      style={styles.media}
      resizeMode="contain"
      accessibilityLabel="Find Time walkthrough: asking the assistant to plan German learning, and the calendar rescheduling to fit it"
    />
  );
}

const styles = StyleSheet.create({
  media: {
    width: '100%',
    aspectRatio: 760 / 442, // matches the recorded frame (960×558 scaled)
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#141d43',
  },
});

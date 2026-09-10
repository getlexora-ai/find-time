/**
 * The pre-rendered product walkthrough: dashboard → ADD TASK → NEW TIME BLOCK
 * dialog → "Plan my German learning today" → APPLY PLAN → the calendar
 * reschedules Admin batch and slots the German blocks in.
 *
 * Plain DOM <video> (this screen is web-only): autoplay + loop + muted +
 * playsInline so it plays on its own with no controls, no JS, and no border /
 * "boundary box". webm first, mp4 fallback for Safari. Files live in `public/`,
 * served at the web root by `expo export`.
 */
export function DemoVideo() {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      poster="/find-time-walkthrough-poster.jpg"
      aria-label="Find Time walkthrough: asking the assistant to plan German learning, and the calendar rescheduling to fit it"
      style={{
        width: '100%',
        aspectRatio: '760 / 442',
        borderRadius: 20,
        display: 'block',
        objectFit: 'contain',
        background: '#141d43',
      }}>
      <source src="/find-time-walkthrough-hq.webm" type="video/webm" />
      <source src="/find-time-walkthrough-hq.mp4" type="video/mp4" />
    </video>
  );
}

/**
 * The pre-rendered product walkthrough: dashboard → ADD TASK → NEW TIME BLOCK
 * dialog → "Plan my German learning today" → APPLY PLAN → the calendar
 * reschedules Admin batch and slots the German blocks in.
 *
 * Plain DOM <video> (this screen is web-only): loop + muted + playsInline, no
 * controls and no border / "boundary box". webm (VP9) with an mp4 (H.264)
 * fallback; files live in `public/`, served at the web root by `expo export`.
 *
 * The `ref` kicks off playback on mount: the `autoPlay` attribute alone doesn't
 * survive hydration here — React commits the <source> children a beat after the
 * <video>, so the browser's first autoplay attempt aborts with no source and
 * never retries. One `.play()` once the element (and its sources) are in the
 * DOM starts it cleanly; it's muted, so no autoplay-policy block.
 */
export function DemoVideo() {
  return (
    <video
      ref={(el) => {
        el?.play().catch(() => {});
      }}
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

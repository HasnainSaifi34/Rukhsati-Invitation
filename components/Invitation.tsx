'use client';
 
import { useEffect, useMemo, useRef, useState } from 'react';
 
const mapsUrl = 'https://www.google.com/maps/place/Welcome+Hall/@19.0582007,72.9152806,1064m/data=!3m1!1e3!4m6!3m5!1s0x3be7c613a502d7db:0x58025090a24caf7d!8m2!3d19.0582125!4d72.9189531!16s%2Fg%2F11dfwyn33b?entry=ttu&g_ep=EgoyMDI2MDkyMi4wIKXMDSoASAFQAw%3D%3D';
const targetMs = Date.parse('2026-09-27T19:00:00+05:30');
const mapsEmbedUrl = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3770.091187168042!2d72.9152806152609!3d19.058200749999996!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3be7c613a502d7db%3A0x58025090a24caf7d!2sWelcome%20Hall!5e0!3m2!1sen!2sin!4v1695799054796!5m2!1sen!2sin';
function buildCalendarDays() {
  const firstDay = new Date(2026, 8, 1).getDay();
  const daysInMonth = new Date(2026, 9, 0).getDate();
  return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
}
 
/** Clamp a number between 0 and 1. */
function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
 
/** Smooth 0 -> 1 ramp between a and b (eases in and out, so scenes don't start or stop abruptly). */
function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
 
/**
 * Temporary development logging for the auto-scroll lifecycle.
 *   - `next dev`: always on.
 *   - production build: silent, unless the page is opened with `?debugScroll`
 *     (handy for checking a real device without redeploying).
 * Per-frame logging is throttled, so it never floods the console. To strip it
 * out completely, delete these two helpers and every scrollLog(...) call.
 */
function scrollDebugOn() {
  if (typeof window === 'undefined') return false;
  return process.env.NODE_ENV !== 'production' || /[?&]debugScroll\b/.test(window.location.search);
}
function scrollLog(...args: unknown[]) {
  if (scrollDebugOn()) console.log('[invitation:autoscroll]', ...args);
}
 
/**
 * One full-bleed artwork "scene". Scenes are stacked with position: sticky (see
 * invitation.css), so each one pins to the top of the screen while the next
 * scene slides up over it. The scroll loop below writes three custom
 * properties on this element:
 *   --p      0 -> 1 across the scene's whole life (arrive, hold, get covered) -> Ken Burns motion
 *   --enter  0 -> 1 while the scene rises into place                          -> soft top-edge veil
 *   --cover  0 -> 1 while the NEXT scene rises over this one                  -> dims the outgoing artwork
 * `motion` picks the per-scene pacing class (motion-hero / -lively / -slow / -still).
 * The artwork is drawn twice: a blurred copy fills any letterbox space, and
 * the sharp copy is fitted inside the screen so no baked-in text is ever cropped.
 */
function ArtScene({ id, z, motion, src, alt }: { id?: string; z: number; motion: string; src: string; alt: string }) {
  return (
    <section className={`static-page scene ${motion}`} id={id} data-scene="art" style={{ zIndex: z }}>
      <div className="scene-media">
        <img className="scene-plate" src={src} alt="" aria-hidden="true" decoding="async" />
        <img className="scene-art" src={src} alt={alt} decoding="async" />
      </div>
    </section>
  );
}
 
export default function Invitation() {
  // 'cover' -> guest hasn't tapped yet. 'opening' -> cover is unmounted,
  // interstitial artwork is covering the screen while the Nasheed starts.
  // 'in' -> interstitial has faded away, the invitation proper is visible.
  const [stage, setStage] = useState<'cover' | 'opening' | 'in'>('cover');
  const [interstitialFading, setInterstitialFading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState({ days: '--', hours: '--', minutes: '--', seconds: '--', after: false });
  // Which section (0-based) is currently "on stage", and how many there are.
  // Drives the "1 / 9" progress pill and the first-screen "Scroll to continue"
  // cue. Both are plain navigation aids that render in every motion mode and
  // don't depend on auto-scroll in any way.
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionTotal, setSectionTotal] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoScrollRef = useRef<number | null>(null);
  const autoScrollCancelledRef = useRef(false);
  const calendarDays = useMemo(buildCalendarDays, []);
 
  useEffect(() => {
    const audio = audioRef.current;
 
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    }), { threshold: 0.16 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
 
    const update = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) {
        setCountdown({ days: '--', hours: '--', minutes: '--', seconds: '--', after: true });
        return;
      }
      const total = Math.floor(diff / 1000);
      setCountdown({
        days: String(Math.floor(total / 86400)),
        hours: String(Math.floor((total % 86400) / 3600)).padStart(2, '0'),
        minutes: String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
        seconds: String(total % 60).padStart(2, '0'),
        after: false,
      });
    };
    update();
    const timer = window.setInterval(update, 1000);
    const onEnded = () => setPlaying(false);
    if (audio) audio.addEventListener('ended', onEnded);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      if (audio) audio.removeEventListener('ended', onEnded);
    };
  }, [stage]);
 
  useEffect(() => {
    scrollLog('invitation stage →', stage);
  }, [stage]);
 
  // ---- Auto-scroll: an enhancement, never a dependency ---------------------
  // Manual scrolling is always native and always works. This loop only nudges
  // the page forward for guests who have NOT asked for reduced motion.
  //
  // Lifecycle:  stage 'in' -> startup timer -> startAutoScroll() -> ONE rAF
  // loop -> scrollTop grows -> scenes progress (scroll listener in the
  // choreography effect) -> maxScroll reached -> cancelAutoScroll('reached-bottom').
  // Every way out of the loop goes through cancelAutoScroll(reason), which is
  // also where the stop reason gets logged.
  const getScrollingElement = () => document.scrollingElement || document.documentElement;
 
  // Scrollable distance, re-measured on every frame (never computed once and
  // trusted), so the loop stays correct if the page height changes mid-scroll
  // (images finishing layout, a font swap, an orientation change) and can
  // never overshoot the true bottom. scrollHeight - clientHeight is the
  // spec's definition of the largest legal scroll offset.
  const getMaxScroll = () => {
    const el = getScrollingElement();
    return Math.max(0, el.scrollHeight - el.clientHeight);
  };
 
  const cancelAutoScroll = (reason: string) => {
    const wasRunning = autoScrollRef.current !== null;
    if (autoScrollRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    autoScrollCancelledRef.current = true;
    // Hand scroll-behavior back to the stylesheet (see startAutoScroll).
    document.documentElement.style.removeProperty('scroll-behavior');
    if (wasRunning && scrollDebugOn()) {
      scrollLog('STOP —', reason, { scrollTop: Math.round(getScrollingElement().scrollTop), maxScroll: getMaxScroll() });
    }
  };
 
  // Each frame nudges the page by setting `scrollTop` directly. Two details
  // matter:
  //  1. scrollTop writes are NOT exempt from CSS `scroll-behavior`. This page
  //     sets `html{scroll-behavior:smooth}` (when the guest hasn't asked for
  //     reduced motion), and measured in Chromium that makes every per-frame
  //     write restart a smooth-scroll animation: the loop crawls and stutters
  //     (~90-170px/s instead of 220). So for the life of the loop
  //     `scroll-behavior:auto` is applied inline on <html>, and removed again
  //     by cancelAutoScroll().
  //  2. The loop keeps its own fractional position (`pos`) instead of
  //     re-reading scrollTop every frame, because browsers round scrollTop to
  //     device pixels and a sub-pixel nudge could otherwise round away to
  //     nothing on high-refresh screens. It also doubles as the "did somebody
  //     else move the page?" check: if scrollTop isn't where the loop left it
  //     (scrollbar drag, find-in-page, an anchor jump…) the guest is in
  //     control and the loop steps aside rather than fighting them.
  // The per-frame delta is clamped so that if the tab was backgrounded and
  // rAF paused for a while, resuming doesn't snap the page a huge distance.
  const startAutoScroll = () => {
    if (typeof window === 'undefined') return;
 
    // One loop, ever. Never stack a second requestAnimationFrame chain.
    if (autoScrollRef.current !== null) {
      scrollLog('startAutoScroll() ignored — a loop is already running');
      return;
    }
 
    const el = getScrollingElement();
    const pxPerSecond = 220; // full first-to-last pass in roughly 30-40s depending on content height
    const tolerance = 3; // px of disagreement allowed between `pos` and the real scrollTop
    let pos = el.scrollTop;
    let last = performance.now();
    let frames = 0;
    let lastLoggedAt = -Infinity;
 
    autoScrollCancelledRef.current = false;
    document.documentElement.style.scrollBehavior = 'auto';
    scrollLog('startAutoScroll()', { scrollTop: Math.round(pos), maxScroll: getMaxScroll(), pxPerSecond });
 
    const tick = (now: number) => {
      if (autoScrollCancelledRef.current) return;
 
      if (Math.abs(el.scrollTop - pos) > tolerance) {
        cancelAutoScroll('page moved by something else (scrollbar / find / anchor jump)');
        return;
      }
 
      const dt = Math.min(Math.max(now - last, 0), 100) / 1000;
      last = now;
 
      const maxScroll = getMaxScroll();
      pos = Math.min(pos + pxPerSecond * dt, maxScroll);
      el.scrollTop = pos;
      frames += 1;
 
      if (scrollDebugOn() && (frames <= 3 || now - lastLoggedAt >= 500)) {
        lastLoggedAt = now;
        scrollLog('frame', frames, { scrollTop: Math.round(el.scrollTop), maxScroll });
      }
 
      if (pos < maxScroll - 0.5) {
        autoScrollRef.current = window.requestAnimationFrame(tick);
      } else {
        cancelAutoScroll('reached-bottom');
      }
    };
 
    autoScrollRef.current = window.requestAnimationFrame(tick);
  };
 
  useEffect(() => {
    if (stage !== 'in') return;
 
    // Reduced motion is a *user request*, so it is honoured for auto-scroll:
    // guests who ask for it never get the page moved for them. Nothing else
    // about the invitation depends on this — the "Scroll to continue" cue and
    // the section progress pill are always shown, and manual scrolling is
    // fully native, so these guests explore every section normally.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let startTimer: number | undefined;
    scrollLog('invitation open — arming auto-scroll', { stage, reducedMotion: reduce.matches });
 
    // Stops auto-scroll for good: cancels a running loop AND a startup timer
    // that hasn't fired yet (otherwise the timer would start scrolling under a
    // guest who is already scrolling).
    const disarm = (reason: string) => {
      if (startTimer !== undefined) {
        window.clearTimeout(startTimer);
        startTimer = undefined;
        scrollLog('startup timer cancelled —', reason);
      }
      cancelAutoScroll(reason);
    };
 
    // Any deliberate pointer/touch/wheel input pauses auto-scroll and never
    // restarts it on its own — the guest is now in control. Note this does
    // NOT listen for the 'scroll' event itself, since auto-scroll causes
    // scroll events too; listening for the gestures that cause scrolling
    // (not scrolling itself) is what keeps this from immediately cancelling
    // its own programmatic scroll.
    const onWheel = () => disarm('guest wheel input');
    const onTouch = () => disarm('guest touch');
    const onPointer = () => disarm('guest pointer input');
    // Keyboard input pauses auto-scroll the same as any other interaction;
    // normal browser keyboard scrolling (arrows, space, Page Up/Down) is
    // left alone so it keeps working exactly as guests expect.
    const onKey = () => disarm('guest keyboard input');
    // Turning reduced motion on mid-way also ends auto-scroll immediately.
    const onReduceChange = () => {
      scrollLog('reduced-motion changed →', reduce.matches);
      if (reduce.matches) disarm('reduced motion switched on');
    };
 
    // A brief pause on section 1 before the cinematic auto-scroll begins,
    // so it reads as "the invitation is about to guide you" rather than
    // the page moving out from under the guest the instant it appears.
    // The preference is read when the timer fires, not when it is armed.
    startTimer = window.setTimeout(() => {
      startTimer = undefined;
      const scrollTop = getScrollingElement().scrollTop;
      scrollLog('startup timer fired', { reducedMotion: reduce.matches, scrollTop: Math.round(scrollTop) });
      if (reduce.matches) {
        scrollLog('auto-scroll NOT started — reduced motion requested; cue + progress + manual scrolling only');
        return;
      }
      if (scrollTop > 48) {
        scrollLog('auto-scroll NOT started — guest has already scrolled');
        return;
      }
      startAutoScroll();
    }, 1200);
    scrollLog('startup timer armed', { delayMs: 1200 });
 
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('keydown', onKey);
    reduce.addEventListener('change', onReduceChange);
 
    return () => {
      if (startTimer !== undefined) window.clearTimeout(startTimer);
      cancelAutoScroll('effect cleanup (unmount or stage change)');
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      reduce.removeEventListener('change', onReduceChange);
    };
  }, [stage]);
 
  // Scene choreography. Reads where every scene sits on screen and publishes
  // --p / --enter / --cover on the artwork scenes (see ArtScene). It only
  // *reads* scroll position; it never intercepts wheel/touch events and never
  // moves the page, so scrolling stays fully native. Every value is a pure
  // function of the current rects, so fast flicks and scrolling back up can't
  // leave a scene stuck half-faded.
  //
  // The same pass also works out which section is "current" for the progress
  // pill. That part runs in EVERY motion mode (reduced motion included, where
  // the scenes are laid out sequentially instead of pinned) and reuses the
  // rects already being read, so there is no extra listener or rAF loop.
  useEffect(() => {
    if (stage === 'cover') return;
    const scenes = Array.from(document.querySelectorAll<HTMLElement>('main > [data-scene]'));
    if (scenes.length === 0) return;
 
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const written = new WeakMap<HTMLElement, string>();
    let dwell: number[] = [];
    let frame = 0;
    let shownSection = -1;
    setSectionTotal(scenes.length);
 
    // Each scene's margin-bottom is its "hold": scroll distance during which it
    // stays pinned and perfectly still before the next scene starts to rise.
    const measure = () => {
      dwell = scenes.map((el) => parseFloat(getComputedStyle(el).marginBottom) || 0);
    };
 
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      // Read every rect first, then write, so the browser lays out once per frame.
      const rects = scenes.map((el) => el.getBoundingClientRect());
 
      // Current section = the last one whose top edge has risen past mid-screen.
      // Pinned scenes report top 0, so this works for the sticky stack and for
      // the sequential reduced-motion layout alike. At the very bottom of the
      // page it is always the last section.
      let current = 0;
      rects.forEach((r, i) => { if (r.top <= vh * 0.5) current = i; });
      if (getMaxScroll() - getScrollingElement().scrollTop <= 2) current = scenes.length - 1;
      if (current !== shownSection) {
        shownSection = current;
        setSectionIndex(current);
        scrollLog('section', `${current + 1} / ${scenes.length}`);
      }
 
      if (reduce.matches) return; // reduced motion: no scene animation, just the layout
 
      scenes.forEach((el, i) => {
        if (el.dataset.scene !== 'art') return; // live sections (.event/.venue) only act as covers
        const { top, height } = rects[i];
        const next = rects[i + 1];
 
        // Rising into place: top edge travels from the bottom of the screen to y = 0.
        const enter = clamp01((vh - top) / vh);
        // The next scene rising over this one: same travel, measured on the next scene.
        const rise = next ? clamp01((vh - next.top) / vh) : 0;
        // Pinned and still, waiting for the next scene to come into view.
        const holdSpan = next ? Math.max(0, height + dwell[i] - vh) : 0;
        const hold = next && holdSpan > 0 ? clamp01((height + dwell[i] - next.top) / holdSpan) : 0;
 
        // Whole-life progress: arrive + hold + get covered, weighted by scroll distance.
        // The first scene has no arrival (it is already in place under the intro).
        const wEnter = i === 0 ? 0 : vh;
        const wCover = next ? vh : 0;
        const total = wEnter + holdSpan + wCover;
        const p = total > 0 ? (enter * wEnter + hold * holdSpan + rise * wCover) / total : 0;
 
        // The outgoing artwork only starts dimming once the next scene is visibly
        // sliding in, and is done before it is fully covered (no wasted fade
        // while it is mostly hidden).
        const cover = smoothstep(0.04, 0.85, rise);
 
        const key = `${p.toFixed(3)}|${enter.toFixed(3)}|${cover.toFixed(3)}`;
        if (written.get(el) !== key) {
          written.set(el, key);
          el.style.setProperty('--p', p.toFixed(3));
          el.style.setProperty('--enter', enter.toFixed(3));
          el.style.setProperty('--cover', cover.toFixed(3));
        }
        // Only scenes near the screen get promoted to their own compositor layer.
        el.toggleAttribute('data-active', enter > 0 && rise < 1);
      });
    };
 
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      schedule();
    };
 
    measure();
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('pageshow', schedule); // back/forward cache restores
    reduce.addEventListener('change', onResize); // layout switches sticky <-> sequential, so re-measure
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pageshow', schedule);
      reduce.removeEventListener('change', onResize);
    };
  }, [stage]);
 
  const startAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.loop = false;
    audio.volume = 0.22;
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };
 
  // Tapping the cover immediately removes it from the page (no leftover
  // blank space) and shows the "opening" artwork as a fixed overlay while
  // the Nasheed begins, then fades that overlay away to reveal the hero
  // section which is already sitting underneath.
  const openInvitation = () => {
    if (stage !== 'cover') return;
    setStage('opening');
    window.setTimeout(() => { void startAudio(); }, 1300);
    window.setTimeout(() => setInterstitialFading(true), 1600);
    window.setTimeout(() => setStage('in'), 2300);
  };
 
  const toggleMusic = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = 0;
      audio.loop = false;
      try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };
 
const addToCalendar = () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Saniya & Hasnain//Rukhsati Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:saniya-hasnain-rukhsati-20260927@rukhsati-invitation',
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    'DTSTART:20260927T133000Z',
    'DTEND:20260927T163000Z',
    'SUMMARY:Rukhsati — Saniya & Hasnain',
    'LOCATION:Welcome Hall, Govandi East, Mumbai, Maharashtra 400043',
    'DESCRIPTION:Rukhsati of Saniya Nadeem Sayyed & Hasnain Furqan Saifi.',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob(
    [ics],
    { type: 'text/calendar;charset=utf-8' }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'Saniya-Hasnain-Rukhsati.ics';

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
 
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div className="topbar">
        <button className="icon-btn music-btn" onClick={toggleMusic} aria-label={playing ? 'Pause music' : 'Play music'}>{playing ? 'Ⅱ' : '♪'}</button>
      </div>
 
      <main>
        {stage === 'cover' && (
          <button
            type="button"
            className="static-page cover-page"
            onClick={openInvitation}
            aria-label="Enter invitation — Rukhsati of Saniya and Hasnain, 27 September 2026"
          >
            <img src="/assets/pages/cover.jpg" alt="With the blessings and love of their families, you are cordially invited to the Rukhsati of Saniya &amp; Hasnain. Tap Enter Invitation." />
          </button>
        )}
 
        {stage !== 'cover' && (
          <>
            <ArtScene id="hero" z={1} motion="motion-hero fit-cover" src="/assets/pages/hero.jpg"
              alt="Saniya and Hasnain — Two hearts, one beautiful destination. With the blessings and love of their families." />
 
            <ArtScene id="quran78" z={2} motion="motion-still" src="/assets/pages/quran-78.jpg"
              alt="Qur'an 78:8 — And We created you in pairs. A connection written by Allah, a journey blessed by dua, a future built on love and faith." />
 
            <ArtScene z={3} motion="motion-lively" src="/assets/pages/story-celebration.jpg"
              alt="Moments that made our story — Saniya and Hasnain amid sparklers at their Nikkah. From Nikkah to a new chapter... Alhamdulillah." />
 
            <ArtScene z={4} motion="motion-slow" src="/assets/pages/story-detail.jpg"
              alt="Two hands, one journey, always together — mehndi-adorned hands with a flower bouquet." />
 
            <section className="event reveal" id="event" data-scene="live" style={{ zIndex: 5 }}>
              <div className="event-inner">
                <div className="ornament">✦</div>
                <p className="section-label">SAVE THE DATE</p>
                <div className="divider-flourish" />
                <div className="calendar-card">
                  <div className="calendar-head">SEPTEMBER <b>2026</b></div>
                  <div className="weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
                  <div className="days">{calendarDays.map((day, i) => day === null ? <span className="day muted" key={`blank-${i}`} /> : <span className={`day ${day === 27 ? 'active' : ''}`} key={day}>{day}</span>)}</div>
                  <div className="event-date-line">SUNDAY, 27 SEPTEMBER 2026</div>
                  <div className="event-time-line">7:00 PM</div>
                </div>
                <div className="countdown-card">
                  <span className="section-label">COUNTING DOWN TO RUKHSATI</span>
                  <div className={`countdown ${countdown.after ? 'after-event' : ''}`} aria-live="polite">
                    {countdown.after ? (
                      <div className="after-message"><strong>ALHAMDULILLAH</strong><span>THE DAY HAS ARRIVED 🤍</span></div>
                    ) : (
                      <>
                        <div><strong>{countdown.days}</strong><span>DAYS</span></div>
                        <div><strong>{countdown.hours}</strong><span>HOURS</span></div>
                        <div><strong>{countdown.minutes}</strong><span>MINUTES</span></div>
                        <div><strong>{countdown.seconds}</strong><span>SECONDS</span></div>
                      </>
                    )}
                  </div>
                </div>
                <p className="rsvp-note">“Your presence will make our special day even more meaningful.”</p>
              </div>
            </section>
 
            <ArtScene id="families" z={6} motion="motion-still" src="/assets/pages/families.jpg"
              alt="With the blessings and love of their families. Bride's family: Nadeem Sayyed (father), Saira Sayyed (mother), Hamid Jamadar (nana), Raziya Jamadar (nani), Nahid Akhtar Sayyed (dadi), Naim Sayyed (dada). Groom's family: Furqan Saifi (father), Rabiya Saifi (mother), Nisar Saifi (dada), Nilofer Saifi (dadi), Razzak Shaikh (nana), Shabana Shaikh (nani). May Allah bless our families and keep them united always." />
 
            <section className="venue reveal" id="venue" data-scene="live" style={{ zIndex: 7 }}>
              <div className="venue-inner">
                <p className="section-label">THE VENUE</p>
                <h2>Welcome HALL</h2>
                <div className="venue-copy">
                  <p>Deonar Police Sta Rd, <br/> behind Cement factory, <br/> Govandi Slums, Bhim Nagar,<br/> Govandi East, Mumbai, Maharashtra 400043</p>
                </div>
                <div className="landmark"><span>📍 LANDMARK</span><strong>Opposite Rafiq Pan Shop </strong></div>
                <div className="map-card">
                  <iframe title="Map showing Welcome Hall, Govandi West, Mumbai" loading="lazy" src={mapsEmbedUrl} />
                </div>
                <div className="actions">
                  <a className="action-btn outline" target="_blank" rel="noopener noreferrer" href={mapsUrl}>OPEN IN GOOGLE MAPS ↗</a>
                  <button className="action-btn solid" onClick={addToCalendar}>＋ ADD TO CALENDAR</button>
                </div>
              </div>
            </section>
 
            <ArtScene id="dua" z={8} motion="motion-still" src="/assets/pages/dua-30-21.jpg"
              alt="A dua for their journey — Surah Ar-Rum 30:21: And of His signs is that He created for you from yourselves mates that you may find tranquillity in them, and He placed between you affection and mercy. Indeed, in that are signs for a people who give thought." />
 
            <ArtScene z={9} motion="motion-still" src="/assets/pages/closing.jpg"
              alt="Thank you, Saniya &amp; Hasnain, 27.09.2026. With love and duas for our beautiful journey ahead. Jazakallahu khairan for being a part of our story." />
          </>
        )}
      </main>
 
      {/* Navigation aids. Both are self-contained and independent of
          auto-scroll: they render in every motion mode, so the invitation
          always reads as a multi-section experience and can always be
          explored by hand. */}
      {stage === 'in' && sectionTotal > 0 && (
        <div className="section-progress">
          <span aria-hidden="true">{sectionIndex + 1} / {sectionTotal}</span>
          <span className="sr-only">Section {sectionIndex + 1} of {sectionTotal}</span>
        </div>
      )}
 
      {stage === 'in' && (
        <div className={`scroll-cue${sectionIndex === 0 ? '' : ' is-hidden'}`} aria-hidden="true">
          <span className="scroll-cue-chevron">↓</span>
          <span className="scroll-cue-text">Scroll to continue</span>
        </div>
      )}
 
      {stage === 'opening' && (
        <div className={`interstitial visible ${interstitialFading ? 'fade-out' : ''}`} aria-hidden="true">
          <img src="/assets/pages/opening.jpg" alt="" />
        </div>
      )}
 
      <audio ref={audioRef} preload="metadata" src="/assets/audio/nasheed.mp3" />
    </>
  );
}
 
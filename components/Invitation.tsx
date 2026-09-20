'use client';
 
import { useEffect, useMemo, useRef, useState } from 'react';
 
const mapsUrl = 'https://www.google.com/maps/place/Raza+hall/@19.061649,72.9148915,1066m/data=!3m1!1e3!4m6!3m5!1s0x3be7c7d956555e75:0x735251cffa68dbaf!8m2!3d19.06094!4d72.91452!16s%2Fg%2F11rnk6cxgz?entry=ttu&g_ep=EgoyMDI2MDkxNi4wIKXMDSoASAFQAw%3D%3D';
const targetMs = Date.parse('2026-09-27T19:00:00+05:30');

// The 9 invitation sections, in document order. Each id must match a real
// element in the JSX below. This is the single source of truth for section
// count/order used by the progress dots, the "1 / 9" cue and keyboard nav —
// so navigation never depends on hard-coded pixel positions.
const sectionIds = ['hero', 'quran78', 'celebration', 'detail', 'event', 'families', 'venue', 'dua', 'closing'];
 
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
  // Which of the 9 sections is currently on screen (0-based). Drives the
  // progress dots, the "1 / 9" hero cue, and where keyboard nav jumps
  // to/from. Kept in a ref too so the auto-scroll/keyboard effect (which
  // intentionally only re-runs on `stage`, not on every section change)
  // always reads the latest value without re-attaching its listeners.
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoScrollRef = useRef<number | null>(null);
  const autoScrollCancelledRef = useRef(false);
  const calendarDays = useMemo(buildCalendarDays, []);

  // Scrolls to a given section by id (clamped to a valid index) instead of a
  // calculated pixel offset, so it stays correct regardless of viewport
  // size, address-bar collapsing, or content reflow. Used by the progress
  // dots and by keyboard navigation. Treated as a deliberate user action:
  // it always cancels any in-progress auto-scroll first.
  const goToSection = (index: number) => {
    const clamped = Math.max(0, Math.min(sectionIds.length - 1, index));
    cancelAutoScroll();
    const el = document.getElementById(sectionIds[clamped]);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
 
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
 
  // Scene choreography. Reads where every scene sits on screen and publishes
  // --p / --enter / --cover on the artwork scenes (see ArtScene). It only
  // *reads* scroll position; it never intercepts wheel/touch events and never
  // moves the page, so scrolling stays fully native. Every value is a pure
  // function of the current rects, so fast flicks and scrolling back up can't
  // leave a scene stuck half-faded.
  const cancelAutoScroll = () => {
    if (autoScrollRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    autoScrollCancelledRef.current = true;
  };

  // Auto-scroll is a pure enhancement: constant speed (not a fixed total
  // duration), and it recomputes the scrollable distance on every frame
  // instead of once at the start. That means it keeps working correctly
  // even if the page's height changes mid-scroll (images finishing layout,
  // a font swap, an orientation change) and it degrades gracefully if a
  // frame is skipped — it just covers less distance that frame instead of
  // jumping. The per-frame delta is clamped so that if the tab was
  // backgrounded/throttled and rAF pauses for a while, resuming doesn't
  // suddenly snap the page a huge distance.
  const startAutoScroll = () => {
    if (typeof window === 'undefined') return;

    autoScrollCancelledRef.current = false;
    const pxPerSecond = 46; // gentle, cinematic pace — tuned for the ~35s full-page pass this replaces
    let last = performance.now();

    const tick = (now: number) => {
      if (autoScrollCancelledRef.current) return;
      const dt = Math.min(now - last, 100) / 1000;
      last = now;

      const maxScroll = Math.max(0, document.body.scrollHeight - window.innerHeight);
      const nextY = Math.min(window.scrollY + pxPerSecond * dt, maxScroll);
      window.scrollTo({ top: nextY, behavior: 'auto' });

      if (nextY < maxScroll) {
        autoScrollRef.current = window.requestAnimationFrame(tick);
      } else {
        autoScrollRef.current = null;
      }
    };

    if (autoScrollRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRef.current);
    }
    autoScrollRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (stage !== 'in') return;

    // Any deliberate pointer/touch/wheel input pauses auto-scroll and never
    // restarts it on its own — the guest is now in control. Note this does
    // NOT listen for the 'scroll' event itself, since auto-scroll causes
    // scroll events too; listening for the gestures that cause scrolling
    // (not scrolling itself) is what keeps this from immediately cancelling
    // its own programmatic scroll.
    const handlePointerInteraction = () => cancelAutoScroll();

    // Keyboard acts as real navigation, not just a pause: arrow/page keys
    // move between the 9 sections by id, same as tapping a progress dot.
    const handleKeyNav = (event: KeyboardEvent) => {
      cancelAutoScroll();
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        goToSection(activeIndexRef.current + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        goToSection(activeIndexRef.current - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        goToSection(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToSection(sectionIds.length - 1);
      }
    };

    // A brief pause on section 1 before the cinematic auto-scroll begins,
    // so it reads as "the invitation is about to guide you" rather than
    // the page moving out from under the guest the instant it appears.
    // Reduced-motion guests never get auto-scroll at all — for them the
    // progress dots and cue below are the only (fully sufficient) way
    // through the 9 sections.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const startTimer = window.setTimeout(() => {
      if (!reduce.matches) startAutoScroll();
    }, 1200);

    window.addEventListener('wheel', handlePointerInteraction, { passive: true });
    window.addEventListener('touchstart', handlePointerInteraction, { passive: true });
    window.addEventListener('pointerdown', handlePointerInteraction, { passive: true });
    window.addEventListener('keydown', handleKeyNav);

    return () => {
      window.clearTimeout(startTimer);
      cancelAutoScroll();
      window.removeEventListener('wheel', handlePointerInteraction);
      window.removeEventListener('touchstart', handlePointerInteraction);
      window.removeEventListener('pointerdown', handlePointerInteraction);
      window.removeEventListener('keydown', handleKeyNav);
    };
  }, [stage]);

  useEffect(() => {
    if (stage === 'cover') return;
    const scenes = Array.from(document.querySelectorAll<HTMLElement>('main > [data-scene]'));
    if (scenes.length === 0) return;
 
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const written = new WeakMap<HTMLElement, string>();
    let dwell: number[] = [];
    let frame = 0;
 
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

      // Which section is "current" for the progress dots / hero cue / keyboard
      // nav: the last one whose top has crossed the upper half of the screen.
      // Computed from the same rects as the crossfade math below (no extra
      // scroll listener or IntersectionObserver needed) and kept even when
      // reduced motion skips the animation writes further down, so the dots
      // still work for those guests.
      let currentIndex = 0;
      rects.forEach((r, i) => { if (r.top <= vh * 0.5) currentIndex = i; });
      if (activeIndexRef.current !== currentIndex) {
        activeIndexRef.current = currentIndex;
        setActiveIndex(currentIndex);
      }

      if (reduce.matches) return;

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
    reduce.addEventListener('change', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pageshow', schedule);
      reduce.removeEventListener('change', schedule);
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
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Saniya Hasnain Rukhsati//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:saniya-hasnain-rukhsati-20260927@invitation.local', 'DTSTAMP:20260101T000000Z',
      'DTSTART;TZID=Asia/Kolkata:20260927T190000',
      'SUMMARY:Rukhsati — Saniya & Hasnain',
      'LOCATION:Raza Hall, Surey No. 3, P.L., Plot No. 96, PL Lokhande Marg, Gautam Nagar, Govandi West, Mumbai, Maharashtra 400043',
      'DESCRIPTION:Rukhsati of Saniya Nadeem Sayyed & Hasnain Furqan Saifi.',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
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
 
            <ArtScene id="celebration" z={3} motion="motion-lively" src="/assets/pages/story-celebration.jpg"
              alt="Moments that made our story — Saniya and Hasnain amid sparklers at their Nikkah. From Nikkah to a new chapter... Alhamdulillah." />
 
            <ArtScene id="detail" z={4} motion="motion-slow" src="/assets/pages/story-detail.jpg"
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
                <h2>RAZA HALL</h2>
                <div className="venue-copy">
                  <p>Surey No. 3, P.L., Plot No. 96, PL Lokhande Marg,<br />Gautam Nagar, Govandi West,<br />Mumbai, Maharashtra 400043</p>
                </div>
                <div className="landmark"><span>📍 LANDMARK</span><strong>Gautam Nagar Playground</strong></div>
                <div className="map-card">
                  <iframe title="Map showing Raza Hall, Govandi West, Mumbai" loading="lazy" src="https://www.google.com/maps?q=Raza%20Hall%2C%20Govandi%20West%2C%20Mumbai&output=embed" />
                </div>
                <div className="actions">
                  <a className="action-btn outline" target="_blank" rel="noopener noreferrer" href={mapsUrl}>OPEN IN GOOGLE MAPS ↗</a>
                  <button className="action-btn solid" onClick={addToCalendar}>＋ ADD TO CALENDAR</button>
                </div>
              </div>
            </section>
 
            <ArtScene id="dua" z={8} motion="motion-still" src="/assets/pages/dua-30-21.jpg"
              alt="A dua for their journey — Surah Ar-Rum 30:21: And of His signs is that He created for you from yourselves mates that you may find tranquillity in them, and He placed between you affection and mercy. Indeed, in that are signs for a people who give thought." />
 
            <ArtScene id="closing" z={9} motion="motion-still" src="/assets/pages/closing.jpg"
              alt="Thank you, Saniya &amp; Hasnain, 27.09.2026. With love and duas for our beautiful journey ahead. Jazakallahu khairan for being a part of our story." />
          </>
        )}
      </main>

      {/* First-screen discoverability + always-available manual navigation.
          These render as soon as the invitation is open, independent of
          whether auto-scroll ever starts or works, so a guest can never
          reasonably conclude section 1 is the whole invitation. */}
      {stage === 'in' && (
        <nav className="section-nav" aria-label="Invitation sections">
          <span className="section-nav-count" aria-hidden="true">{activeIndex + 1} / {sectionIds.length}</span>
          <ol>
            {sectionIds.map((id, i) => (
              <li key={id}>
                <button
                  type="button"
                  className={i === activeIndex ? 'active' : ''}
                  aria-label={`Go to section ${i + 1} of ${sectionIds.length}`}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  onClick={() => goToSection(i)}
                />
              </li>
            ))}
          </ol>
        </nav>
      )}

      {stage === 'in' && activeIndex === 0 && (
        <div className="scroll-cue" aria-hidden="true">
          <span className="scroll-cue-count">1 / {sectionIds.length}</span>
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
 